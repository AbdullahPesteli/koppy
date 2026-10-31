(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KoppyBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    // The companion extension uses Firefox Native Messaging, so this bridge
    // never opens a loopback socket and receives a final result only after the
    // native host has written the macOS pasteboard.
    const CHANNEL = "koppy-bridge-v1";
    const SCRIPT_VERSION = "__KOPPY_VERSION__";
    const MAX_ITEMS = 10;
    const MAX_BYTES = 150 * 1024 * 1024;
    const instances = typeof WeakMap === "function" ? new WeakMap() : null;

    function error(message, code) {
        const output = new Error("Koppy Bridge: " + message);
        output.koppyCode = code || "bridge-failed";
        return output;
    }

    function diagnostic(settings, event, fields) {
        const logger = settings && settings.diagnostics || (typeof globalThis !== "undefined" && globalThis.KoppyDiagnostics);
        if (logger && typeof logger.record === "function") logger.record(event, fields);
    }

    function randomId(cryptoLike) {
        const bytes = new Uint8Array(16);
        if (!cryptoLike || typeof cryptoLike.getRandomValues !== "function") throw error("güvenli rastgelelik kullanılamıyor", "bridge-crypto-unavailable");
        cryptoLike.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    }

    async function validateItems(items) {
        if (!Array.isArray(items) || items.length < 2) throw error("en az iki görsel seçilmeli", "bridge-not-enough-images");
        if (items.length > MAX_ITEMS) throw error("en fazla " + MAX_ITEMS + " görsel aktarılabilir", "bridge-too-many-images");
        let totalBytes = 0;
        const blobs = [];
        for (const item of items) {
            const blob = item && item.blob;
            if (!blob || typeof blob.arrayBuffer !== "function" || blob.type !== "image/png") throw error("yalnız hazırlanmış PNG görseller aktarılabilir", "bridge-invalid-image");
            const size = Number(blob.size);
            if (!Number.isSafeInteger(size) || size <= 0) throw error("boş görsel aktarılmadı", "bridge-empty-image");
            totalBytes += size;
            if (totalBytes > MAX_BYTES) throw error("toplam boyut 150 MB sınırını aşıyor", "bridge-too-large");
            blobs.push(blob);
        }
        return { blobs, totalBytes };
    }

    function create(options) {
        const settings = options || {};
        const win = settings.window || (typeof window === "undefined" ? null : window);
        const cryptoLike = settings.crypto || (typeof crypto === "undefined" ? null : crypto);
        let armed = null;
        const pending = new Map();
        let disposed = false;

        function onMessage(event) {
            if (!event || event.source !== win || !event.data || event.data.channel !== CHANNEL) return;
            const data = event.data;
            if (data.type === "armed" && typeof data.token === "string" && data.token.length === 32 && Number(data.expires) > Date.now()) {
                armed = { token: data.token, expires: Number(data.expires) };
                return;
            }
            if (data.type !== "result" || typeof data.id !== "string") return;
            const request = pending.get(data.id);
            if (!request) return;
            pending.delete(data.id);
            if (data.ok === true && Number.isInteger(data.count)) request.resolve({ count: data.count });
            else request.reject(error(typeof data.error === "string" ? data.error : "yerel yardımcı işlemi tamamlamadı", "bridge-native-failed"));
        }
        if (win && typeof win.addEventListener === "function") win.addEventListener("message", onMessage, false);

        function dispose() {
            if (disposed) return;
            disposed = true;
            if (win && typeof win.removeEventListener === "function") win.removeEventListener("message", onMessage, false);
            for (const request of pending.values()) request.reject(error("Koppy Bridge yeniden başlatıldı", "bridge-disposed"));
            pending.clear();
            armed = null;
            if (instances && win) instances.delete(win);
        }
        // Build code creates one bridge per document. If an integration creates
        // another, remove the old listener first instead of leaking consumers.
        if (instances && win) {
            const previous = instances.get(win);
            if (previous) previous.dispose();
            instances.set(win, { dispose });
        }

        function consumeArm() {
            if (armed && armed.expires > Date.now()) {
                const output = armed;
                armed = null;
                return Promise.resolve(output);
            }
            // The companion sees the trusted pointerdown before Koppy's click;
            // a tiny bounded wait covers event ordering without accepting stale
            // or page-script-created capability messages.
            return new Promise((resolve, reject) => {
                const deadline = Date.now() + 120;
                const timer = setInterval(() => {
                    if (armed && armed.expires > Date.now()) {
                        clearInterval(timer);
                        const output = armed;
                        armed = null;
                        resolve(output);
                    } else if (Date.now() >= deadline) {
                        clearInterval(timer);
                        reject(error("Koppy Bridge Companion kurulu veya etkin değil", "bridge-companion-unavailable"));
                    }
                }, 12);
            });
        }

        async function writeImages(items) {
            if (disposed) throw error("Koppy Bridge artık etkin değil", "bridge-disposed");
            if (!win || typeof win.postMessage !== "function") throw error("Koppy Bridge Companion kullanılamıyor", "bridge-window-unavailable");
            const flowId = settings.diagnostics && typeof settings.diagnostics.flowId === "function" ? settings.diagnostics.flowId() : "bridge";
            const prepared = await validateItems(items);
            const arm = await consumeArm();
            const id = randomId(cryptoLike);
            diagnostic(settings, "bridge_native_start", { flowId, imageCount: prepared.blobs.length, totalBytes: prepared.totalBytes, transport: "native-messaging" });
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    pending.delete(id);
                    diagnostic(settings, "bridge_native_failed", { flowId, errorCode: "bridge-native-timeout", transport: "native-messaging" });
                    reject(error("yerel yardımcı zaman aşımına uğradı", "bridge-native-timeout"));
                }, 35000);
                pending.set(id, {
                    resolve: result => {
                        clearTimeout(timeout);
                        diagnostic(settings, "bridge_native_complete", { flowId, imageCount: result.count, totalBytes: prepared.totalBytes, transport: "native-messaging" });
                        resolve(result);
                    },
                    reject: cause => {
                        clearTimeout(timeout);
                        diagnostic(settings, "bridge_native_failed", { flowId, errorCode: cause && cause.koppyCode || "bridge-native-failed", transport: "native-messaging" });
                        reject(cause);
                    },
                });
                win.postMessage({ channel: CHANNEL, type: "write", id, token: arm.token, images: prepared.blobs }, "*");
            });
        }

        return { writeImages, validateItems, dispose, SCRIPT_VERSION };
    }

    return { CHANNEL, MAX_BYTES, MAX_ITEMS, SCRIPT_VERSION, create, validateItems };
});
