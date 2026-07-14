const test = require("node:test");
const assert = require("node:assert/strict");
const KoppyBridge = require("../../src/koppy-bridge.js");

test("Koppy Bridge pairs in the Tampermonkey world and frames independent PNGs", async () => {
    const calls = [];
    let stored = null;
    const bridge = KoppyBridge.create({
        Blob,
        getValue: () => stored,
        setValue: (_key, value) => { stored = value; },
        gmRequest(options) {
            calls.push(options);
            queueMicrotask(async () => {
                if (options.method === "GET") {
                    options.onload({ status: 200, responseText: JSON.stringify({ ok: true, token: "x".repeat(43) }) });
                    return;
                }
                assert.equal(options.url, KoppyBridge.ORIGIN + "/v1/images");
                assert.equal(options.headers.Authorization, "Bearer " + "x".repeat(43));
                assert.equal(options.headers["Content-Type"], KoppyBridge.FRAME_TYPE);
                const frame = new Uint8Array(await options.data.arrayBuffer());
                assert.equal(new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, false), 8);
                assert.equal(new DataView(frame.buffer, frame.byteOffset + 12, frame.byteLength - 12).getUint32(0, false), 8);
                options.onload({ status: 200, responseText: JSON.stringify({ ok: true, count: 2 }) });
            });
            return { abort() {} };
        },
    });
    const pngA = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
    const pngB = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
    assert.deepEqual(await bridge.writeImages([{ blob: pngA }, { blob: pngB }]), { count: 2 });
    assert.equal(calls.length, 2);
    assert.equal(stored, "x".repeat(43));
});

test("Koppy Bridge refuses an invalid or oversized browser-side batch before networking", async () => {
    const bridge = KoppyBridge.create({ Blob, gmRequest() { throw new Error("ağa çıkmamalı"); } });
    await assert.rejects(bridge.frameImages([{ blob: new Blob(["not-png"], { type: "image/jpeg" }) }, { blob: new Blob(["x"], { type: "image/png" }) }]), /yalnız hazırlanmış PNG/);
    await assert.rejects(bridge.frameImages([{ blob: new Blob(["x"], { type: "image/png" }) }]), /en az iki görsel/);
});

test("Koppy Bridge prefers Tampermonkey's modern Firefox transport", async t => {
    const previous = global.GM;
    t.after(() => {
        if (previous === undefined) delete global.GM;
        else global.GM = previous;
    });
    let modernCalls = 0;
    global.GM = {
        xmlHttpRequest(options) {
            modernCalls += 1;
            if (options.method === "GET") return Promise.resolve({ status: 200, responseText: JSON.stringify({ ok: true, token: "m".repeat(43) }) });
            return Promise.resolve({ status: 200, responseText: JSON.stringify({ ok: true, count: 2 }) });
        },
    };
    const bridge = KoppyBridge.create({ Blob, gmRequest() { throw new Error("legacy yol kullanılmamalı"); } });
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
    assert.deepEqual(await bridge.writeImages([{ blob: png }, { blob: png }]), { count: 2 });
    assert.equal(modernCalls, 2);
});
