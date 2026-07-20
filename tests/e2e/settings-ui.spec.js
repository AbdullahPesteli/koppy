const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const distPath = path.resolve(__dirname, "../../dist/Koppy.user.js");

async function bootBuiltKoppy(page, storedPreferences) {
    await page.route("https://www.google.com/search?**", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: {
            "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; frame-src data:; img-src data:",
        },
        body: "<!doctype html><html><head><script nonce='koppy-script-e2e'></script><style nonce='koppy-style-e2e'></style></head><body style='margin:0;background:#202124'><main style='height:100vh'></main></body></html>",
    }));
    await page.goto("https://www.google.com/search?q=koppy&udm=2");
    await page.evaluate(preferences => {
        window.__attackerCapturedShadows = [];
        window.__attackerCapturedFrames = [];
        const nativeAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (init) {
            const root = nativeAttachShadow.call(this, init);
            window.__attackerCapturedShadows.push(root);
            return root;
        };
        const nativeAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function (child) {
            if (child && child.tagName === "IFRAME") window.__attackerCapturedFrames.push(child);
            return nativeAppendChild.call(this, child);
        };
        window.__gmValues = new Map();
        window.__gmValues.set("pv-prefs", JSON.stringify(preferences || { "gallery.aria2Token": "TOP-SECRET" }));
        window.__gmWrites = [];
        window.__failGmWrites = false;
        window.__commands = [];
        window.__openedTabs = [];
        window.GM_getValue = (key, fallback) => window.__gmValues.has(key) ? window.__gmValues.get(key) : fallback;
        window.GM_setValue = (key, value) => {
            if (window.__failGmWrites) throw new Error("simulated storage failure");
            window.__gmValues.set(key, value);
            window.__gmWrites.push({ key, value });
        };
        window.GM_deleteValue = key => window.__gmValues.delete(key);
        window.GM_addStyle = css => {
            const style = document.createElement("style");
            style.textContent = css;
            document.head.appendChild(style);
            return style;
        };
        window.GM_openInTab = (url, options) => {
            window.__openedTabs.push({ url, options });
            return null;
        };
        window.GM_setClipboard = () => {};
        window.GM_registerMenuCommand = (label, callback) => {
            window.__commands.push({ label, callback });
            return window.__commands.length;
        };
        window.GM_notification = () => {};
        window.GM_download = () => {};
        window.GM_xmlhttpRequest = options => {
            queueMicrotask(() => options.onerror && options.onerror({ status: 0 }));
            return { abort() { if (options.onabort) options.onabort(); } };
        };
        window.GM = {
            getValue: async (key, fallback) => window.GM_getValue(key, fallback),
            setValue: async (key, value) => window.GM_setValue(key, value),
            deleteValue: async key => window.GM_deleteValue(key),
            addStyle: window.GM_addStyle,
            openInTab: window.GM_openInTab,
            setClipboard: window.GM_setClipboard,
            registerMenuCommand: window.GM_registerMenuCommand,
            notification: window.GM_notification,
            xmlHttpRequest: window.GM_xmlhttpRequest,
        };
        window.unsafeWindow = window;
    }, storedPreferences);

    const built = fs.readFileSync(distPath, "utf8");
    expect(built).not.toContain("https://hoothin.com/scripts/pvcep/");
    expect(built).not.toContain("https://pv.hoothin.com/first-run");
    expect(built).not.toContain("https://s2.loli.net/2023/02/06/afTMxeASm48z5vE.jpg");
    expect(built).not.toContain("customRules = unsafeWindow.eval");
    const error = await page.evaluate(source => {
        try {
            new Function(source).call(window);
            return null;
        } catch (caught) {
            return String(caught && caught.stack || caught);
        }
    }, built);
    expect(error).toBeNull();
    expect(await page.evaluate(() => window.__commands.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__openedTabs)).toEqual([]);
}

async function openSettings(page) {
    // The Tampermonkey menu is deliberately a single compact Control Centre;
    // exercise the real entry and then its in-panel Settings action.
    await expect.poll(() => page.evaluate(() => window.__commands.map(command => command.label))).toEqual(["Koppy · Kontrol Merkezi"]);
    await page.evaluate(() => window.__commands[0].callback());
    const deck = page.locator("koppy-control-deck");
    await expect(deck.locator(".panel.open")).toBeVisible();
    await deck.locator(".full-settings").click();
    await expect.poll(async () => {
        for (const candidate of page.frames()) {
            if (candidate === page.mainFrame()) continue;
            if (await candidate.locator(".koppy-brand-title").count()) return true;
        }
        return false;
    }).toBe(true);
    const frame = page.frames().find(candidate => candidate !== page.mainFrame());
    await expect(frame.locator(".koppy-brand-title")).toHaveText("Koppy Ayarları");
    return frame;
}

async function expectSettingsClosed(page) {
    await expect.poll(() => page.frames().length).toBe(1);
}

test("real dist settings are readable, searchable, persistent and responsive", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
        if (message.type() === "error") {
            const location = message.location();
            consoleErrors.push(message.text() + (location.url ? " @ " + location.url : ""));
        }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await bootBuiltKoppy(page);
    const externalRequests = [];
    page.on("request", request => {
        const url = new URL(request.url());
        if (/^https?:$/.test(url.protocol) && url.hostname !== "www.google.com") externalRequests.push(request.url());
    });
    let frame = await openSettings(page);
    await page.waitForTimeout(100);
    expect(externalRequests).toEqual([]);

    await expect(frame.locator(".nav-tabs .section_header")).toHaveCount(5);
    await expect(frame.locator(".koppy-card")).toHaveCount(15);
    await expect(frame.locator("[id^='pv-prefs_field_']")).toHaveCount(91);
    await expect(frame.locator("#pv-prefs_saveBtn")).toBeDisabled();
    await expect(frame.locator("#pv-prefs_wrapper")).toHaveAttribute("role", "dialog");
    await expect(frame.locator(".nav-tabs")).toHaveAttribute("role", "tablist");
    await expect(frame.locator(".koppy-dirty-status")).toHaveAttribute("aria-live", "polite");
    await expect.poll(() => frame.evaluate(() => document.activeElement && document.activeElement.id)).toBe("koppy-settings-search");
    expect(await frame.evaluate(() => {
        const event = new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true, cancelable: true });
        return !document.dispatchEvent(event);
    })).toBe(true);
    const visualState = await frame.locator("body").evaluate(body => {
        const label = body.querySelector(".field_label");
        const nav = body.querySelector(".nav-tabs");
        const footer = body.querySelector("#pv-prefs_buttons_holder");
        return {
            bodyBackground: getComputedStyle(body).backgroundColor,
            bodyColor: getComputedStyle(body).color,
            labelColor: getComputedStyle(label).color,
            navDirection: getComputedStyle(nav).flexDirection,
            footerBottom: footer.getBoundingClientRect().bottom,
            viewportHeight: innerHeight,
        };
    });
    expect(visualState).toEqual({
        bodyBackground: "rgb(11, 14, 19)",
        bodyColor: "rgb(244, 247, 251)",
        labelColor: "rgb(170, 180, 194)",
        navDirection: "column",
        footerBottom: visualState.viewportHeight,
        viewportHeight: visualState.viewportHeight,
    });

    const outerSize = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    expect(outerSize.width).toBeLessThanOrEqual(1040);
    expect(outerSize.height).toBeLessThanOrEqual(780);
    expect(await page.evaluate(() => {
        let frameDocumentReadable = false;
        try {
            frameDocumentReadable = Boolean(window.frames[0].document.querySelector("#pv-prefs_wrapper"));
        } catch (_error) {}
        const capturedFrame = window.__attackerCapturedFrames[0];
        let capturedFrameDocumentReadable = false;
        try {
            capturedFrameDocumentReadable = Boolean(capturedFrame.contentWindow.document.querySelector("#pv-prefs_wrapper"));
        } catch (_error) {}
        return {
            hostCount: document.querySelectorAll("koppy-settings-root").length,
            closedShadow: document.querySelector("koppy-settings-root").shadowRoot === null,
            leakedFrame: Boolean(document.querySelector("iframe#pv-prefs")),
            leakedTokenField: Boolean(document.querySelector("#pv-prefs_field_gallery\\.aria2Token")),
            frameDocumentReadable,
            capturedShadowCount: window.__attackerCapturedShadows.length,
            capturedFrameCount: window.__attackerCapturedFrames.length,
            capturedFrameDocumentReadable,
            capturedSourceLeaksToken: capturedFrame.src.includes("TOP-SECRET"),
            capturedSourceHasSeparateNonces: (() => {
                const html = decodeURIComponent(capturedFrame.src.slice(capturedFrame.src.indexOf(",") + 1));
                return html.includes('script nonce="koppy-script-e2e"') && html.includes('style nonce="koppy-style-e2e"');
            })(),
        };
    })).toEqual({
        hostCount: 1,
        closedShadow: true,
        leakedFrame: false,
        leakedTokenField: false,
        frameDocumentReadable: false,
        // Kontrol Merkezi'nin görsel kökü ile kapalı ayar kökü ayrı tutulur.
        // Gizli alanları barındıran ayar kökü host.shadowRoot üzerinden okunamaz.
        capturedShadowCount: 2,
        capturedFrameCount: 1,
        capturedFrameDocumentReadable: false,
        capturedSourceLeaksToken: false,
        capturedSourceHasSeparateNonces: true,
    });

    await page.mouse.click(20, 20);
    await expectSettingsClosed(page);
    frame = await openSettings(page);

    for (let index = 0; index < 5; index += 1) {
        await frame.locator(`#pv-prefs_section_header_${index}`).click();
        await expect(frame.locator(`#pv-prefs_section_${index}`)).toBeVisible();
        const overflow = await frame.locator("#koppy-settings-content").evaluate(node => node.scrollWidth - node.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    }

    await frame.locator("#pv-prefs_section_header_2").click();
    const token = frame.locator("#pv-prefs_field_gallery\\.aria2Token");
    await expect(token).toHaveAttribute("type", "password");
    await expect(token).toHaveValue("");
    await expect(token).toHaveAttribute("placeholder", "Kayıtlı — değiştirmek için yaz");

    fs.mkdirSync(path.resolve("test-results"), { recursive: true });
    await page.screenshot({ path: "test-results/koppy-settings-desktop.png", fullPage: true });

    const search = frame.locator("#koppy-settings-search");
    await search.fill("image");
    await expect(frame.locator(".koppy-search-status")).toContainText("ayar bulundu");
    await search.fill("debug");
    await expect(frame.locator(".koppy-search-status")).toContainText("1 ayar bulundu");
    await expect(frame.locator("#pv-prefs_debug_var")).toBeVisible();
    await search.fill("");

    await frame.locator("#pv-prefs_section_header_4").click();
    const debug = frame.locator("#pv-prefs_field_debug");
    await debug.check();
    await expect(frame.locator(".koppy-dirty-status")).toContainText("1 kaydedilmemiş değişiklik");
    await expect(frame.locator("#pv-prefs_saveBtn")).toBeEnabled();

    const writesBeforeSyntheticSave = await page.evaluate(() => window.__gmWrites.length);
    await frame.evaluate(() => document.getElementById("pv-prefs_saveBtn").click());
    expect(page.frames().length).toBe(2);
    await expect(frame.locator(".koppy-dirty-status")).toContainText("Güvenilmeyen kayıt girişimi engellendi");
    expect(await page.evaluate(() => window.__gmWrites.length)).toBe(writesBeforeSyntheticSave);

    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);
    expect(await page.evaluate(() => window.__gmValues.has("pv-prefs"))).toBe(true);
    expect(await page.evaluate(() => JSON.parse(window.__gmValues.get("pv-prefs"))["gallery.aria2Token"])).toBe("TOP-SECRET");

    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_2").click();
    await frame.locator("#pv-prefs_resetLink").click();
    await frame.locator("#pv-prefs_resetLink").click();
    await frame.locator("#pv-prefs_field_gallery\\.aria2Token").fill("NEW-SECRET");
    await frame.locator("#pv-prefs_section_header_4").click();
    await frame.locator("#pv-prefs_field_debug").check();
    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);
    expect(await page.evaluate(() => JSON.parse(window.__gmValues.get("pv-prefs"))["gallery.aria2Token"])).toBe("NEW-SECRET");

    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_4").click();
    await expect(frame.locator("#pv-prefs_field_debug")).toBeChecked();
    const customRules = frame.locator("#pv-prefs_field_customRules");
    await customRules.fill("{");
    await frame.locator("#pv-prefs_saveBtn").click();
    expect(page.frames().length).toBe(2);
    await expect(frame.locator(".koppy-dirty-status")).toContainText("Ayarlar kaydedilemedi");
    await frame.evaluate(() => document.getElementById("pv-prefs_closeBtn").click());
    expect(page.frames().length).toBe(2);
    await frame.evaluate(() => document.getElementById("pv-prefs_closeBtn").click());
    await expectSettingsClosed(page);

    await page.setViewportSize({ width: 560, height: 760 });
    frame = await openSettings(page);
    const narrowState = await frame.locator("body").evaluate(body => ({
        navDirection: getComputedStyle(body.querySelector(".nav-tabs")).flexDirection,
        footerBottom: body.querySelector("#pv-prefs_buttons_holder").getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
    }));
    expect(narrowState.navDirection).toBe("row");
    expect(narrowState.footerBottom).toBe(narrowState.viewportHeight);
    await page.screenshot({ path: "test-results/koppy-settings-narrow.png", fullPage: true });

    // Firefox can discard and immediately recreate the sandboxed iframe's painted
    // tab node after a viewport resize. Dispatch through its live DOM node here:
    // this still exercises Koppy's tab handler, without coupling this layout test
    // to that browser paint-lifecycle race.
    await frame.locator("#pv-prefs_section_header_4").evaluate(node => node.click());
    const narrowDebug = frame.locator("#pv-prefs_field_debug");
    await narrowDebug.uncheck();
    await page.evaluate(() => { window.__failGmWrites = true; });
    await frame.locator("#pv-prefs_saveBtn").click();
    expect(page.frames().length).toBe(2);
    await expect(frame.locator(".koppy-dirty-status")).toContainText("kaydedilemedi");
    await page.evaluate(() => { window.__failGmWrites = false; });
    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);

    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_4").click();
    await expect(frame.locator("#pv-prefs_field_debug")).not.toBeChecked();
    await frame.locator("#pv-prefs_field_debug").check();
    await frame.evaluate(() => document.getElementById("pv-prefs_closeBtn").click());
    await frame.evaluate(() => document.getElementById("pv-prefs_closeBtn").click());
    await expectSettingsClosed(page);
    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_4").click();
    await expect(frame.locator("#pv-prefs_field_debug")).not.toBeChecked();
    await frame.evaluate(() => document.getElementById("pv-prefs_closeBtn").click());
    await expectSettingsClosed(page);

    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_4").click();
    const language = frame.locator("#pv-prefs_field_customLang");
    const alternateLanguage = await language.locator("option").evaluateAll(options => {
        const option = options.find(item => item.value !== "auto");
        return option && option.value;
    });
    await language.selectOption(alternateLanguage);
    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);

    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_4").click();
    await expect(frame.locator("#pv-prefs_field_customLang")).toHaveValue(alternateLanguage);
    await frame.locator("#pv-prefs_resetLink").click();
    await expect(frame.locator("#pv-prefs_field_customLang")).toHaveValue(alternateLanguage);
    await frame.locator("#pv-prefs_resetLink").click();
    await expect(frame.locator("#pv-prefs_field_customLang")).toHaveValue("auto");
    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);

    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_4").click();
    await expect(frame.locator("#pv-prefs_field_customLang")).toHaveValue("auto");
    await frame.evaluate(() => document.getElementById("pv-prefs_closeBtn").click());
    await expectSettingsClosed(page);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test("related settings are compacted and preview modifier stays single-select", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await bootBuiltKoppy(page);
    let frame = await openSettings(page);

    await expect(frame.locator("[data-compact-group='floatbar-location']")).toHaveCount(1);
    await expect(frame.locator("[data-compact-group='floatbar-location'] .koppy-inline-control")).toHaveCount(4);
    await expect(frame.locator("[data-compact-group='floatbar-delays']")).toHaveCount(1);
    await expect(frame.locator("[data-compact-group='floatbar-thresholds']")).toHaveCount(1);
    await expect(frame.locator("[data-compact-group='floatbar-global-modifier']")).toHaveAttribute("data-exclusive", "true");
    await expect(frame.locator("[data-compact-group='floatbar-global-modifier']")).toHaveAttribute("role", "radiogroup");
    await expect(frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.ctrl")).toHaveCount(1);
    await expect(frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.command")).toHaveAttribute("type", "radio");

    await frame.locator("#pv-prefs_section_header_0").click();
    const outside = frame.locator("#pv-prefs_field_floatBar\\.stayOut");
    const locationTuning = frame.locator("[data-compact-group='floatbar-location'] .koppy-advanced");
    await expect(locationTuning).toBeHidden();
    await outside.check();
    await expect(locationTuning).toBeVisible();
    await expect(frame.locator("[data-compact-group='floatbar-location'] .koppy-behavior-summary")).toContainText("Görselin dışında");
    await frame.locator("#pv-prefs_section_0").screenshot({ path: "test-results/koppy-floatbar-behavior.png" });
    const ctrl = frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.ctrl");
    const command = frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.command");
    await command.check();
    await expect(command).toBeChecked();
    await expect(ctrl).not.toBeChecked();
    await ctrl.check();
    await expect(ctrl).toBeChecked();
    await expect(command).not.toBeChecked();
    await command.check();
    await expect(command).toBeChecked();
    await expect(ctrl).not.toBeChecked();
    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);

    frame = await openSettings(page);
    await expect(frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.ctrl")).not.toBeChecked();
    await expect(frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.command")).toBeChecked();
});

test("legacy multi-select modifier is visibly migrated and persists only after save", async ({ page }) => {
    await bootBuiltKoppy(page, {
        "floatBar.globalkeys.ctrl": true,
        "floatBar.globalkeys.command": true,
    });
    let frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_0").click();
    await expect(frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.command")).toBeChecked();
    await expect(frame.locator("#pv-prefs_field_floatBar\\.globalkeys\\.ctrl")).not.toBeChecked();
    await expect(frame.locator(".koppy-dirty-status")).toContainText("tek seçime geçirildi");
    await expect(frame.locator("#pv-prefs_saveBtn")).toBeEnabled();
    await frame.locator("#pv-prefs_saveBtn").click();
    await expectSettingsClosed(page);

    const saved = await page.evaluate(() => JSON.parse(window.__gmValues.get("pv-prefs")));
    expect(saved["floatBar.globalkeys.ctrl"]).toBe(false);
    expect(saved["floatBar.globalkeys.command"]).toBe(true);
    frame = await openSettings(page);
    await frame.locator("#pv-prefs_section_header_0").click();
    await expect(frame.locator("#pv-prefs_saveBtn")).toBeDisabled();
});
