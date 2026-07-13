const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Deck = require("../../src/koppy-control-deck.js");

function setPath(target, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    let cursor = target;
    keys.forEach(key => { cursor = cursor[key]; });
    cursor[last] = value;
}

function makeConfig(prefs) {
    const names = [
        "floatBar.position", "floatBar.previewMaxSizeW", "floatBar.previewMaxSizeH",
        "floatBar.globalkeys.ctrl", "floatBar.globalkeys.alt", "floatBar.globalkeys.shift", "floatBar.globalkeys.command",
    ];
    const fields = Object.fromEntries(names.map(name => [name, { value: null }]));
    return {
        fields,
        isOpen: false,
        saves: 0,
        set(name, value) { fields[name].value = value; },
        save() {
            this.saves += 1;
            Object.entries(fields).forEach(([name, field]) => {
                if (field.value !== null) setPath(prefs, name, field.value);
            });
            return true;
        },
    };
}

test("live control deck keeps a single modifier and persists choices immediately", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const prefs = {
        floatBar: {
            position: "top right",
            previewMaxSizeW: 0,
            previewMaxSizeH: 0,
            globalkeys: { ctrl: true, alt: false, shift: false, command: false },
        },
    };
    const config = makeConfig(prefs);
    let repositioned = 0;
    const deck = Deck.install({
        document: dom.window.document,
        window: dom.window,
        config,
        prefs,
        requireTrusted: false,
        getFloatBar: () => ({ shown: true, data: {}, setPosition() { repositioned += 1; } }),
    });

    assert.equal(deck.show(), true);
    const root = dom.window.document.querySelector("koppy-control-deck").shadowRoot;
    assert.ok(root.querySelector(".panel.open"));

    root.querySelector('button[aria-label="Command ile önizleme"]').click();
    assert.deepEqual(prefs.floatBar.globalkeys, { ctrl: false, alt: false, shift: false, command: true });
    assert.equal(config.saves, 1);

    root.querySelector('button[aria-label="Sol alt"]').click();
    assert.equal(prefs.floatBar.position, "bottom left");
    assert.equal(repositioned, 1);

    root.querySelectorAll(".text-button")[1].click();
    assert.equal(prefs.floatBar.previewMaxSizeW, 720);
    assert.equal(prefs.floatBar.previewMaxSizeH, 540);
    assert.equal(config.saves, 3);
});

test("live control deck toggles and clears the opt-in Stack without using preferences", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const prefs = { floatBar: { position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0, globalkeys: { ctrl: false, alt: false, shift: false, command: true } } };
    const config = makeConfig(prefs);
    let stack = { enabled: false, count: 0, bytes: 0, maxItems: 10, maxBytes: 150 * 1024 * 1024 };
    let listener;
    const deck = Deck.install({
        document: dom.window.document,
        window: dom.window,
        config,
        prefs,
        requireTrusted: false,
        getStackState: () => stack,
        setStackEnabled(enabled) {
            stack = Object.assign({}, stack, { enabled });
            listener(stack);
            return stack;
        },
        clearStack() {
            stack = Object.assign({}, stack, { count: 0, bytes: 0 });
            listener(stack);
            return stack;
        },
        onStackChange(next) { listener = next; },
    });

    deck.show();
    const root = dom.window.document.querySelector("koppy-control-deck").shadowRoot;
    const toggle = root.querySelector(".stack-toggle");
    assert.equal(toggle.textContent, "Stack");
    toggle.click();
    assert.equal(stack.enabled, true);
    assert.equal(root.querySelector(".stack-toggle").textContent, "Stack 0");
    assert.equal(config.saves, 0);

    stack = Object.assign({}, stack, { count: 2, bytes: 5 * 1024 * 1024 });
    listener(stack);
    assert.equal(root.querySelector(".stack-toggle").textContent, "Stack 2");
    root.querySelector(".stack-clear").click();
    assert.equal(stack.count, 0);
    assert.equal(stack.bytes, 0);
    assert.equal(root.querySelector(".stack-clear"), null);
});

test("live control deck defers to the secure full settings dialog when it is already open", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const prefs = { floatBar: { position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0, globalkeys: { ctrl: false, alt: false, shift: false, command: true } } };
    const config = makeConfig(prefs);
    config.isOpen = true;
    let fullSettings = 0;
    const deck = Deck.install({ document: dom.window.document, window: dom.window, config, prefs, requireTrusted: false, openFullSettings() { fullSettings += 1; } });
    assert.equal(deck.show(), false);
    assert.equal(fullSettings, 1);
    assert.equal(dom.window.document.querySelector("koppy-control-deck"), null);
});

test("live control deck exposes the update flow only when an updater is provided", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const prefs = { floatBar: { position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0, globalkeys: { ctrl: false, alt: false, shift: false, command: true } } };
    const config = makeConfig(prefs);
    let updates = 0;
    const deck = Deck.install({
        document: dom.window.document,
        window: dom.window,
        config,
        prefs,
        requireTrusted: false,
        openUpdate() { updates += 1; return true; },
    });
    deck.show();
    const root = dom.window.document.querySelector("koppy-control-deck").shadowRoot;
    root.querySelector(".update").click();
    assert.equal(updates, 1);
    assert.match(root.querySelector(".status").textContent, /Güncelleme sayfası açıldı/);
});

test("a pinned live control deck stays open during page interaction and can be released", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const prefs = { floatBar: { position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0, globalkeys: { ctrl: false, alt: false, shift: false, command: true } } };
    const config = makeConfig(prefs);
    const deck = Deck.install({ document: dom.window.document, window: dom.window, config, prefs, requireTrusted: false });
    deck.show();
    const root = dom.window.document.querySelector("koppy-control-deck").shadowRoot;
    root.querySelector(".pin").click();
    assert.equal(root.querySelector(".pin").getAttribute("aria-pressed"), "true");
    dom.window.document.body.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    assert.ok(root.querySelector(".panel.open"));
    root.querySelector(".pin").click();
    dom.window.document.body.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    assert.ok(!root.querySelector(".panel.open"));
});

test("page-script clicks cannot change live control values", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const prefs = { floatBar: { position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0, globalkeys: { ctrl: true, alt: false, shift: false, command: false } } };
    const config = makeConfig(prefs);
    let updates = 0;
    const deck = Deck.install({ document: dom.window.document, window: dom.window, config, prefs, openUpdate() { updates += 1; } });
    deck.show();
    const root = dom.window.document.querySelector("koppy-control-deck").shadowRoot;
    root.querySelector('button[aria-label="Command ile önizleme"]').click();
    assert.equal(config.saves, 0);
    assert.equal(prefs.floatBar.globalkeys.ctrl, true);
    assert.equal(prefs.floatBar.globalkeys.command, false);
    root.querySelector(".update").click();
    assert.equal(updates, 0);
});
