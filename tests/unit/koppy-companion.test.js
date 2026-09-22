const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function installCompanion() {
    const documentListeners = new Map();
    const windowListeners = new Map();
    const posted = [];
    let connectionCount = 0;
    const window = {
        postMessage(message) { posted.push(message); },
        addEventListener(type, listener) {
            const listeners = windowListeners.get(type) || new Set();
            listeners.add(listener);
            windowListeners.set(type, listeners);
        },
    };
    const document = {
        addEventListener(type, listener) {
            const listeners = documentListeners.get(type) || new Set();
            listeners.add(listener);
            documentListeners.set(type, listeners);
        },
    };
    const browser = {
        runtime: {
            connect() {
                connectionCount += 1;
                let onMessage = () => {};
                let onDisconnect = () => {};
                return {
                    onMessage: { addListener(listener) { onMessage = listener; } },
                    onDisconnect: { addListener(listener) { onDisconnect = listener; } },
                    postMessage(message) {
                        if (message.action === "end") queueMicrotask(() => onMessage({ message: { ok: true, id: message.id, count: 2 } }));
                    },
                    disconnect() { onDisconnect(); },
                };
            },
        },
    };
    vm.runInNewContext(fs.readFileSync("companion/content.js", "utf8"), {
        window, document, browser, crypto: webcrypto, Blob, Uint8Array, Array, Date, Promise,
        setTimeout, clearTimeout, queueMicrotask, btoa, console,
    });
    const emitDocument = (type, event) => {
        for (const listener of documentListeners.get(type) || []) listener(event);
    };
    const emitWindow = data => {
        for (const listener of windowListeners.get("message") || []) listener({ source: window, data });
    };
    return { posted, emitDocument, emitWindow, connections: () => connectionCount };
}

test("companion serializes overlapping writes so only one Native Messaging host is used", async () => {
    const companion = installCompanion();
    companion.emitDocument("pointerdown", { isTrusted: true });
    const arm = companion.posted.find(message => message.type === "armed");
    const images = [new Blob(["one"], { type: "image/png" }), new Blob(["two"], { type: "image/png" })];
    companion.emitWindow({ channel: "koppy-bridge-v1", type: "write", id: "a".repeat(32), token: arm.token, images });
    companion.emitWindow({ channel: "koppy-bridge-v1", type: "write", id: "b".repeat(32), token: arm.token, images });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(companion.connections(), 1);
    assert.deepEqual(companion.posted.find(message => message.id === "b".repeat(32)).error, "başka bir çoklu kopya aktarımı sürüyor");
    assert.equal(companion.posted.find(message => message.id === "a".repeat(32) && message.ok === true).count, 2);
});
