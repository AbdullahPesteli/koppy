const test = require("node:test");
const assert = require("node:assert/strict");
const KoppyBridge = require("../../src/koppy-bridge.js");

function png(extra = 0) { return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(extra).fill(7)])], { type: "image/png" }); }
const noWindow = { addEventListener() {}, removeEventListener() {}, postMessage() {} };
const crypto = { getRandomValues(bytes) { bytes.fill(3); } };

// GM_xmlhttpRequest stand-in that mimics the bridge contract: token check first, then frame parse.
function fakeHttp(expectedToken, calls) {
    return details => {
        calls.push(details);
        setTimeout(() => {
            if (details.method === "GET") return details.onload({ status: 200, responseText: "{\"ok\":true}" });
            if (details.headers["X-Koppy-Token"] !== expectedToken) return details.onload({ status: 401, responseText: "{\"ok\":false}" });
            details.onload({ status: 200, responseText: JSON.stringify({ ok: true, count: 2 }) });
        }, 0);
    };
}

function make(overrides) {
    const calls = [];
    const bridge = KoppyBridge.create(Object.assign({ window: noWindow, crypto, httpRequest: fakeHttp("good-token", calls), getToken: () => "good-token" }, overrides));
    return { bridge, calls };
}

test("HTTP transport without a stored token fails visibly and sends nothing", async () => {
    const { bridge, calls } = make({ getToken: () => "" });
    await assert.rejects(bridge.writeImages([{ blob: png() }, { blob: png() }]), /token yok/);
    assert.equal(calls.length, 0);
});

test("HTTP transport with a wrong token surfaces the 401 as a visible error", async () => {
    const { bridge, calls } = make({ getToken: () => "bad-token" });
    await assert.rejects(bridge.writeImages([{ blob: png() }, { blob: png() }]), err => err.koppyCode === "bridge-token-rejected" && /token yanlış/.test(err.message) && !/bad-token/.test(err.message));
    assert.equal(calls.length, 1);
});

test("HTTP transport with the right token posts a length-prefixed frame with X-Koppy-Token", async () => {
    const { bridge, calls } = make();
    assert.deepEqual(await bridge.writeImages([{ blob: png() }, { blob: png(2) }]), { count: 2 });
    const call = calls[0];
    assert.equal(call.method, "POST");
    assert.equal(call.url, "http://127.0.0.1:47651/v1/images");
    assert.equal(call.headers["X-Koppy-Token"], "good-token");
    assert.equal(call.headers["Content-Type"], KoppyBridge.FRAME_TYPE);
    assert.equal(call.headers.Authorization, undefined);
    const bytes = new Uint8Array(await call.data.arrayBuffer());
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(0, false), 8);
    assert.equal(view.getUint32(12, false), 10);
    assert.equal(bytes.length, 4 + 8 + 4 + 10);
});

test("no companion and no HTTP transport reports the bridge as not installed", async () => {
    const { bridge } = make({ httpRequest: null });
    await assert.rejects(bridge.writeImages([{ blob: png() }, { blob: png() }]), err => err.koppyCode === "bridge-not-installed" && /köprü kurulu değil/.test(err.message));
});

test("connection failure maps to not installed; 429 and 413 map to specific errors", async () => {
    const failing = (status) => details => setTimeout(() => status ? details.onload({ status, responseText: "" }) : details.onerror(), 0);
    for (const [status, code] of [[0, "bridge-not-installed"], [429, "bridge-rate-limited"], [413, "bridge-too-large"]]) {
        const { bridge } = make({ httpRequest: failing(status) });
        await assert.rejects(bridge.writeImages([{ blob: png() }, { blob: png() }]), err => err.koppyCode === code);
    }
});

test("batch limits still apply before any HTTP request", async () => {
    const { bridge, calls } = make();
    await assert.rejects(bridge.writeImages(new Array(11).fill({ blob: png() })), /en fazla 10/);
    await assert.rejects(bridge.writeImages([{ blob: png() }]), /en az iki/);
    assert.equal(calls.length, 0);
});

test("status reports running, no-token and not-installed", async () => {
    assert.equal(await make().bridge.status(), "running");
    assert.equal(await make({ getToken: () => "" }).bridge.status(), "no-token");
    assert.equal(await make({ httpRequest: details => setTimeout(() => details.onerror(), 0) }).bridge.status(), "not-installed");
    assert.equal(await make({ httpRequest: null }).bridge.status(), "not-installed");
});

test("setToken stores a trimmed token and rejects whitespace-containing values", async () => {
    let stored = null;
    const { bridge } = make({ setToken: value => { stored = value; } });
    await bridge.setToken("  abc_DEF-123  ");
    assert.equal(stored, "abc_DEF-123");
    await assert.rejects(bridge.setToken("a b"), /token biçimi/);
});

test("diagnostics never contain the token or image bytes", async () => {
    const events = [];
    const { bridge } = make({ diagnostics: { record: (event, fields) => events.push(JSON.stringify({ event, fields })) } });
    await bridge.writeImages([{ blob: png() }, { blob: png() }]);
    assert.ok(events.length >= 2);
    assert.ok(events.every(line => !line.includes("good-token")));
});

test("companion path is preferred when armed", async () => {
    const listeners = new Set();
    const win = {
        addEventListener(t, fn) { listeners.add(fn); }, removeEventListener(t, fn) { listeners.delete(fn); },
        postMessage(data) { if (data.type === "write") queueMicrotask(() => listeners.forEach(fn => fn({ source: win, data: { channel: KoppyBridge.CHANNEL, type: "result", id: data.id, ok: true, count: 2 } }))); },
    };
    const calls = [];
    const bridge = KoppyBridge.create({ window: win, crypto, httpRequest: fakeHttp("good-token", calls), getToken: () => "good-token" });
    listeners.forEach(fn => fn({ source: win, data: { channel: KoppyBridge.CHANNEL, type: "armed", token: "a".repeat(32), expires: Date.now() + 3000 } }));
    assert.deepEqual(await bridge.writeImages([{ blob: png() }, { blob: png() }]), { count: 2 });
    assert.equal(calls.length, 0);
});
