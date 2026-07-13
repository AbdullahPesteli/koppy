const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const SettingsUI = require("../../src/koppy-settings-ui.js");

function makeFixture() {
    const dom = new JSDOM("<!doctype html><html><head></head><body id='pv-prefs'></body></html>", {
        url: "https://www.google.com/search?q=koppy&udm=2",
    });
    const doc = dom.window.document;
    const wrapper = doc.createElement("div");
    wrapper.id = "pv-prefs_wrapper";
    wrapper.innerHTML = `
      <div id="pv-prefs_header"></div>
      <div class="nav-tabs">
        <div class="section_header active" id="pv-prefs_section_header_0">Toolbar</div>
        <div class="section_header" id="pv-prefs_section_header_1">Zoom</div>
        <div class="section_header" id="pv-prefs_section_header_2">Gallery</div>
        <div class="section_header" id="pv-prefs_section_header_3">Window</div>
        <div class="section_header" id="pv-prefs_section_header_4">Other</div>
      </div>
      <div class="section_header_holder" id="pv-prefs_section_0"></div>
      <div class="section_header_holder" id="pv-prefs_section_1"></div>
      <div class="section_header_holder" id="pv-prefs_section_2"></div>
      <div class="section_header_holder" id="pv-prefs_section_3"></div>
      <div class="section_header_holder" id="pv-prefs_section_4"></div>
      <div id="pv-prefs_buttons_holder">
        <button id="pv-prefs_saveBtn">Save</button>
        <button id="pv-prefs_closeBtn">Close</button>
        <div class="reset_holder"><a id="pv-prefs_resetLink" href="#">Reset</a></div>
      </div>`;
    doc.body.appendChild(wrapper);

    const definitions = [
        ["floatBar.position", "Araç çubuğu konumu", "select", "top right"],
        ["magnifier.radius", "Büyüteç yarıçapı", "text", "180"],
        ["gallery.downloadWithZip", "ZIP ile indir", "checkbox", true],
        ["imgWindow.backgroundColor", "Arka plan rengi", "text", "#111"],
        ["debug", "Debug günlüklerini aç", "checkbox", false],
    ];
    const fields = {};
    definitions.forEach(([key, labelText, type, value], index) => {
        const row = doc.createElement("div");
        row.className = "config_var";
        row.id = `pv-prefs_${key}_var`;
        row.title = key === "debug" ? "Sorun giderme ayrıntılarını göster" : "";
        const label = doc.createElement("label");
        label.className = "field_label";
        label.textContent = labelText;
        const input = doc.createElement(type === "select" ? "select" : "input");
        input.id = `pv-prefs_field_${key}`;
        if (type === "checkbox") {
            input.type = "checkbox";
            input.checked = value;
        } else if (type === "select") {
            const first = doc.createElement("option");
            first.textContent = "Sağ üst";
            first.value = "top right";
            const second = doc.createElement("option");
            second.textContent = "Sol alt";
            second.value = "bottom left";
            input.append(first, second);
            input.value = value;
        } else {
            input.type = "text";
            input.value = value;
        }
        row.append(label, input);
        doc.getElementById(`pv-prefs_section_${index}`).appendChild(row);
        fields[key] = {
            node: input,
            toValue: () => type === "checkbox" ? input.checked : input.value,
            reset: () => {
                if (type === "checkbox") input.checked = value;
                else input.value = value;
            },
        };
    });

    const frame = doc.createElement("iframe");
    return {
        dom,
        doc,
        config: { id: "pv-prefs", fields, frame },
    };
}

test("Koppy settings shell rebuilds all panels without replacing field nodes", () => {
    const { doc, config } = makeFixture();
    const originalNode = config.fields.debug.node;
    assert.equal(SettingsUI.enhance(config, { document: doc, hostDocument: doc, hostWindow: doc.defaultView }), true);

    assert.equal(doc.querySelector(".koppy-brand-title").textContent, "Koppy Ayarları");
    assert.deepEqual(Array.from(doc.querySelectorAll(".nav-tabs .section_header")).map(node => node.textContent), [
        "Araç Çubuğu", "Yakınlaştırma", "Galeri", "Resim Penceresi", "Genel",
    ]);
    assert.equal(doc.querySelectorAll(".koppy-card").length, 5);
    assert.equal(config.fields.debug.node, originalNode);
    assert.equal(doc.querySelectorAll("#koppy-settings-style").length, 1);
    assert.equal(doc.querySelectorAll("koppy-settings-root").length, 1);
    assert.equal(doc.querySelector("koppy-settings-root").shadowRoot, null);
});

test("global search finds settings across panels and reports an empty state", () => {
    const { doc, config } = makeFixture();
    SettingsUI.enhance(config, { document: doc, hostDocument: doc, hostWindow: doc.defaultView });
    const search = doc.getElementById("koppy-settings-search");

    search.value = "debug";
    search.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    assert.match(doc.querySelector(".koppy-search-status").textContent, /1 ayar bulundu/);
    assert.equal(doc.getElementById("pv-prefs_section_4").classList.contains("koppy-search-match"), true);

    search.value = "böyle-bir-ayar-yok";
    search.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    assert.match(doc.querySelector(".koppy-search-status").textContent, /eşleşen ayar bulunamadı/);
});

test("dirty state, destructive-action confirmation and save state are explicit", async () => {
    const { doc, config } = makeFixture();
    let closed = 0;
    let reset = 0;
    doc.getElementById("pv-prefs_closeBtn").addEventListener("click", () => { closed += 1; });
    doc.getElementById("pv-prefs_resetLink").addEventListener("click", event => {
        event.preventDefault();
        reset += 1;
        Object.values(config.fields).forEach(field => field.reset());
    });
    SettingsUI.enhance(config, { document: doc, hostDocument: doc, hostWindow: doc.defaultView });

    const save = doc.getElementById("pv-prefs_saveBtn");
    const close = doc.getElementById("pv-prefs_closeBtn");
    const resetLink = doc.getElementById("pv-prefs_resetLink");
    const debug = config.fields.debug.node;
    assert.equal(save.disabled, true);

    debug.checked = true;
    debug.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    assert.equal(save.disabled, false);
    assert.match(doc.querySelector(".koppy-dirty-status").textContent, /1 kaydedilmemiş/);

    close.click();
    assert.equal(closed, 0);
    assert.match(doc.querySelector(".koppy-dirty-status").textContent, /tekrar bas/);
    close.click();
    assert.equal(closed, 1);

    resetLink.click();
    assert.equal(reset, 0);
    resetLink.click();
    assert.equal(reset, 1);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(debug.checked, false);
});

test("secure settings payload validates types, select values and declarative custom rules", () => {
    const config = {
        fields: {
            debug: { save: true, settings: { type: "checkbox" }, value: false },
            "gallery.editSite": {
                save: true,
                settings: { type: "select", options: { Photopea: "Photopea", Lunapic: "Lunapic" } },
                value: "Photopea",
            },
            customRules: { save: true, settings: { type: "textarea" }, value: "[]" },
        },
    };
    assert.deepEqual(SettingsUI.validateAndNormalizeValues(config, {
        debug: true,
        "gallery.editSite": "Lunapic",
        customRules: '[{"name":"Example","url":"example.com"}]',
    }), {
        debug: true,
        "gallery.editSite": "Lunapic",
        customRules: '[\n    {\n        "name": "Example",\n        "url": "example.com"\n    }\n]',
    });
    assert.throws(() => SettingsUI.validateAndNormalizeValues(config, {
        debug: true,
        "gallery.editSite": "Unknown",
        customRules: "[]",
    }), /Geçersiz seçim/);
    assert.throws(() => SettingsUI.validateAndNormalizeValues(config, {
        debug: true,
        "gallery.editSite": "Photopea",
        customRules: '[{"__proto__":{"polluted":true}}]',
    }), /Güvenli olmayan/);
    assert.throws(() => SettingsUI.validateAndNormalizeValues(config, {
        debug: true,
        "gallery.editSite": "Photopea",
        customRules: '[{ name: "Executable" }]',
    }), /JSON/);
});

test("secure schema keeps all fields and normalizes invalid select defaults", () => {
    const config = {
        fields: {
            "gallery.editSite": {
                save: true,
                settings: { type: "select", label: "Edit", options: { Lunapic: "Lunapic", Photopea: "Photopea" } },
                value: "",
                default: "",
            },
        },
    };
    const [field] = SettingsUI.serializeSchema(config);
    assert.equal(field.sectionIndex, 2);
    assert.equal(field.value, "Lunapic");
    assert.equal(field.defaultValue, "Lunapic");
});

test("secure schema masks aria2 token and validation preserves or explicitly clears it", () => {
    const config = {
        fields: {
            "gallery.aria2Token": {
                save: true,
                settings: { type: "text", label: "Token" },
                value: "TOP-SECRET",
                default: "",
            },
        },
    };
    const [field] = SettingsUI.serializeSchema(config);
    assert.equal(field.secret, true);
    assert.equal(field.hasStoredValue, true);
    assert.equal(field.value, "");
    assert.equal(field.defaultValue, "");
    assert.equal(JSON.stringify(field).includes("TOP-SECRET"), false);
    assert.equal(SettingsUI.validateAndNormalizeValues(config, {
        "gallery.aria2Token": "",
    })["gallery.aria2Token"], "TOP-SECRET");
    assert.equal(SettingsUI.validateAndNormalizeValues(config, {
        "gallery.aria2Token": "__KOPPY_CLEAR_SECRET__",
    })["gallery.aria2Token"], "");
    assert.equal(SettingsUI.validateAndNormalizeValues(config, {
        "gallery.aria2Token": "NEW-SECRET",
    })["gallery.aria2Token"], "NEW-SECRET");
});

test("page script and style CSP nonces are discovered independently", () => {
    const dom = new JSDOM("<!doctype html><script nonce='google-script-nonce'></script><style nonce='google-style-nonce'></style>");
    assert.deepEqual(SettingsUI.pageCspNonces(dom.window.document), {
        script: "google-script-nonce",
        style: "google-style-nonce",
    });
    assert.deepEqual(SettingsUI.pageCspNonces(null), { script: "", style: "" });
});
