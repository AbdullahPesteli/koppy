"use strict";

const HOST = "com.pestly.koppy.bridge.native";

browser.runtime.onConnect.addListener(pagePort => {
    if (pagePort.name !== "koppy-bridge-v1") return;
    let nativePort;
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        try { nativePort && nativePort.disconnect(); } catch (_) {}
    };
    try {
        nativePort = browser.runtime.connectNative(HOST);
        nativePort.onMessage.addListener(message => pagePort.postMessage({ type: "result", message }));
        nativePort.onDisconnect.addListener(() => {
            const detail = browser.runtime.lastError && browser.runtime.lastError.message;
            if (!closed) pagePort.postMessage({ type: "result", message: { ok: false, error: detail || "yerel yardımcı kapandı" } });
            close();
        });
        pagePort.onMessage.addListener(message => {
            if (!message || !["begin", "chunk", "end", "cancel"].includes(message.action)) return;
            try { nativePort.postMessage(message); }
            catch (_) { pagePort.postMessage({ type: "result", message: { ok: false, error: "yerel yardımcıya yazılamadı" } }); close(); }
        });
    } catch (_) {
        pagePort.postMessage({ type: "result", message: { ok: false, error: "yerel yardımcı bulunamadı" } });
        close();
    }
    pagePort.onDisconnect.addListener(close);
});
