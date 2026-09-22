"use strict";

const CHANNEL = "koppy-bridge-v1";
const CHUNK = 192 * 1024;
let arm = null;
let transferring = false;

function token() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function post(type, payload) {
    window.postMessage(Object.assign({ channel: CHANNEL, type }, payload || {}), "*");
}

function armFromTrustedEvent(event) {
    if (!event.isTrusted) return;
    arm = { token: token(), expires: Date.now() + 3000 };
    post("armed", arm);
}

document.addEventListener("pointerdown", armFromTrustedEvent, true);
document.addEventListener("keydown", event => {
    if (event.isTrusted && event.metaKey && event.code === "KeyC") armFromTrustedEvent(event);
}, true);

function base64(bytes) {
    let text = "";
    for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
    return btoa(text);
}

async function relay(message) {
    if (transferring) {
        post("result", { id: message && message.id, ok: false, error: "başka bir çoklu kopya aktarımı sürüyor" });
        return;
    }
    if (!arm || arm.expires < Date.now() || message.token !== arm.token || !Array.isArray(message.images) || message.images.length < 2 || message.images.length > 10) {
        post("result", { id: message.id, ok: false, error: "çoklu kopya kullanıcı hareketiyle başlatılmalı" });
        return;
    }
    transferring = true;
    arm = null;
    let port = null;
    try {
        port = browser.runtime.connect({ name: CHANNEL });
        const done = new Promise(resolve => {
            port.onMessage.addListener(packet => resolve(packet && packet.message));
            port.onDisconnect.addListener(() => resolve({ ok: false, error: "companion bağlantısı kapandı" }));
        });
        port.postMessage({ action: "begin", id: message.id, count: message.images.length });
        for (let index = 0; index < message.images.length; index += 1) {
            const blob = message.images[index];
            if (!(blob instanceof Blob) || blob.type !== "image/png") throw new Error("yalnız PNG görseller aktarılabilir");
            const bytes = new Uint8Array(await blob.arrayBuffer());
            for (let offset = 0; offset < bytes.length; offset += CHUNK) {
                port.postMessage({ action: "chunk", id: message.id, index, data: base64(bytes.subarray(offset, Math.min(bytes.length, offset + CHUNK))) });
            }
        }
        port.postMessage({ action: "end", id: message.id });
        const result = await done;
        post("result", Object.assign({ id: message.id }, result || { ok: false, error: "yardımcı yanıt vermedi" }));
    } catch (error) {
        try { port.postMessage({ action: "cancel", id: message.id }); } catch (_) {}
        post("result", { id: message.id, ok: false, error: error && error.message || "aktarım hazırlanamadı" });
    } finally {
        try { port && port.disconnect(); } catch (_) {}
        transferring = false;
    }
}

window.addEventListener("message", event => {
    if (event.source !== window || !event.data || event.data.channel !== CHANNEL || event.data.type !== "write") return;
    void relay(event.data);
});
