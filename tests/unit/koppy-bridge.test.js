const test = require("node:test");
const assert = require("node:assert/strict");
const KoppyBridge = require("../../src/koppy-bridge.js");

function png() { return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }); }

function fakeWindow() {
    const listeners = new Set();
    return {
        addEventListener(type, fn) { if (type === "message") listeners.add(fn); },
        removeEventListener(type, fn) { if (type === "message") listeners.delete(fn); },
        postMessage(data) {
            if (data.type === "write") queueMicrotask(() => {
                for (const fn of listeners) fn({ source: this, data: { channel: KoppyBridge.CHANNEL, type: "result", id: data.id, ok: true, count: data.images.length } });
            });
        },
        arm(token = "a".repeat(32)) {
            for (const fn of listeners) fn({ source: this, data: { channel: KoppyBridge.CHANNEL, type: "armed", token, expires: Date.now() + 3000 } });
        },
        listenerCount() { return listeners.size; },
    };
}

test("Koppy Bridge waits for a Native Messaging completion before resolving", async () => {
    const win = fakeWindow();
    const bridge = KoppyBridge.create({ window: win, crypto: { getRandomValues(bytes) { bytes.fill(12); } } });
    win.arm();
    assert.deepEqual(await bridge.writeImages([{ blob: png() }, { blob: png() }]), { count: 2 });
});

test("Koppy Bridge refuses invalid batches before contacting the companion", async () => {
    const win = fakeWindow();
    const bridge = KoppyBridge.create({ window: win, crypto: { getRandomValues(bytes) { bytes.fill(1); } } });
    await assert.rejects(bridge.writeImages([{ blob: png() }]), /en az iki görsel/);
    await assert.rejects(bridge.writeImages([{ blob: new Blob(["x"], { type: "image/jpeg" }) }, { blob: png() }]), /yalnız hazırlanmış PNG/);
    await assert.rejects(bridge.writeImages([{ blob: new Blob([], { type: "image/png" }) }, { blob: png() }]), /boş görsel/);
});

test("Koppy Bridge replaces a previous page listener instead of leaking it", async () => {
    const win = fakeWindow();
    const first = KoppyBridge.create({ window: win, crypto: { getRandomValues(bytes) { bytes.fill(3); } } });
    const second = KoppyBridge.create({ window: win, crypto: { getRandomValues(bytes) { bytes.fill(4); } } });
    assert.equal(win.listenerCount(), 1);
    await assert.rejects(first.writeImages([{ blob: png() }, { blob: png() }]), /artık etkin değil/);
    win.arm();
    assert.deepEqual(await second.writeImages([{ blob: png() }, { blob: png() }]), { count: 2 });
    second.dispose();
    assert.equal(win.listenerCount(), 0);
});

test("Koppy Bridge requires a recent trusted companion arm", async () => {
    const win = fakeWindow();
    const bridge = KoppyBridge.create({ window: win, httpRequest: null, crypto: { getRandomValues(bytes) { bytes.fill(1); } } });
    await assert.rejects(bridge.writeImages([{ blob: png() }, { blob: png() }]), /köprü kurulu değil/);
});

test("Koppy Bridge turns an explicit Native Messaging failure into a visible error", async () => {
    const win = fakeWindow();
    win.postMessage = function (data) {
        if (data.type !== "write") return;
        queueMicrotask(() => {
            for (const fn of listeners) fn({ source: this, data: { channel: KoppyBridge.CHANNEL, type: "result", id: data.id, ok: false, error: "yerel yardımcı bulunamadı" } });
        });
    };
    // Keep this small custom event target separate from the success fake.
    const listeners = new Set();
    win.addEventListener = (_type, fn) => listeners.add(fn);
    win.arm = token => { for (const fn of listeners) fn({ source: win, data: { channel: KoppyBridge.CHANNEL, type: "armed", token: token || "b".repeat(32), expires: Date.now() + 3000 } }); };
    const bridge = KoppyBridge.create({ window: win, crypto: { getRandomValues(bytes) { bytes.fill(2); } } });
    win.arm();
    await assert.rejects(bridge.writeImages([{ blob: png() }, { blob: png() }]), /yerel yardımcı bulunamadı/);
});
