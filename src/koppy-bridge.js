(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KoppyBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    // Transport order: (a) companion/Native Messaging when it armed a trusted
    // pointerdown, (b) authenticated HTTP to the installed Koppy Bridge on
    // 127.0.0.1 (token in X-Koppy-Token, kept in GM storage), (c) a visible
    // "bridge not installed" error. Image bytes and the token are never logged.
    const CHANNEL = "koppy-bridge-v1";
    const SCRIPT_VERSION = "__KOPPY_VERSION__";
    const MAX_ITEMS = 10;
    const MAX_BYTES = 150 * 1024 * 1024;
    const BRIDGE_URL = "http://127.0.0.1:47651";
    const TOKEN_KEY = "koppy.bridgeToken";
    const FRAME_TYPE = "application/vnd.koppy.images+binary";
    const HEALTH_TIMEOUT_MS = 2000;
    const TEST_TIMEOUT_MS = 5000;
    const INSTALL_COMMAND = "scripts/install-bridge.sh";
    const TOKEN_COMMAND = "cat ~/.koppy/bridge-token";
    const ONE_PIXEL_PNG = Uint8Array.from(atobSafe("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));

    function atobSafe(b64) {
        if (typeof atob === "function") return atob(b64);
        return Buffer.from(b64, "base64").toString("binary");
    }

    // Pure state machines (unit-tested): status line text and test-connection verdict.
    function describeStatus(info) {
        if (!info || !info.reachable) return "köprü kurulu değil" + (info && info.reason ? " (" + info.reason + ")" : "");
        return "çalışıyor" + (info.version ? " (v" + String(info.version).replace(/^v/, "") + ")" : "") + " · " + (info.hasToken ? "token var" : "token yok");
    }

    function classifyTest(input) {
        const o = input || {};
        if (o.outcome === "unreachable") return { state: "unreachable", ok: false, message: "köprü çalışmıyor" + (o.reason ? " (" + o.reason + ")" : "") + " — kurulum: " + INSTALL_COMMAND };
        if (o.outcome === "no-token") return { state: "no-token", ok: false, message: "token yok — " + TOKEN_COMMAND + " çıktısını yapıştır" };
        if (o.status === 200) return { state: "ready", ok: true, message: "köprü hazır, çoklu yapıştırma açık (pano 2 test pikseliyle değişti)" };
        if (o.status === 401) return { state: "token-wrong", ok: false, message: "token yanlış" };
        if (o.status === 429) return { state: "rate-limited", ok: false, message: "köprü istek sınırında (dakikada 10); biraz bekle" };
        return { state: "error", ok: false, message: "köprü isteği reddetti (HTTP " + (o.status || "?") + ")" };
    }

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

    function defaultHttp() {
        return typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
    }

    // Frame = repeated [uint32 big-endian length][PNG bytes], as the Swift bridge expects.
    async function buildFrame(blobs) {
        const parts = [];
        for (const blob of blobs) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const head = new Uint8Array(4);
            new DataView(head.buffer).setUint32(0, bytes.length, false);
            parts.push(head, bytes);
        }
        return new Blob(parts, { type: FRAME_TYPE });
    }

    function postFrame(http, url, token, frame, timeout) {
        return new Promise((resolve, reject) => {
            let done = false;
            const fail = (message, code) => { if (!done) { done = true; reject(error(message, code)); } };
            try {
                http({
                    method: "POST", url: url + "/v1/images", data: frame, anonymous: true, timeout: timeout || 30000,
                    headers: { "Content-Type": FRAME_TYPE, "X-Koppy-Token": token },
                    onload(response) {
                        if (done) return;
                        const status = Number(response && response.status);
                        if (status === 200) {
                            let count = NaN;
                            try { count = JSON.parse(response.responseText).count; } catch (_) { /* fall through */ }
                            if (!Number.isInteger(count)) return fail("köprü beklenmeyen yanıt verdi", "bridge-bad-response");
                            done = true; resolve({ count, status });
                        } else if (status === 401) fail("token yanlış veya eski; Kontrol Merkezi'nden yeniden yapıştır", "bridge-token-rejected");
                        else if (status === 429) fail("köprü istek sınırına ulaştı (dakikada 10); biraz bekle", "bridge-rate-limited");
                        else if (status === 413) fail("köprü boyut sınırını aştı", "bridge-too-large");
                        else fail("köprü isteği reddetti (HTTP " + status + ")", "bridge-http-" + status);
                    },
                    onerror() { fail("köprü kurulu değil veya çalışmıyor", "bridge-not-installed"); },
                    ontimeout() { fail("köprü zaman aşımına uğradı", "bridge-http-timeout"); },
                    onabort() { fail("köprü isteği iptal edildi", "bridge-http-aborted"); },
                });
            } catch (_) { fail("köprü isteği başlatılamadı", "bridge-http-unavailable"); }
        });
    }

    function create(options) {
        const settings = options || {};
        const win = settings.window || (typeof window === "undefined" ? null : window);
        const cryptoLike = settings.crypto || (typeof crypto === "undefined" ? null : crypto);
        let armed = null;
        const http = settings.httpRequest !== undefined ? settings.httpRequest : defaultHttp();
        const bridgeUrl = settings.bridgeUrl || BRIDGE_URL;
        async function readToken() {
            if (typeof settings.getToken === "function") return String(await settings.getToken() || "").trim();
            if (typeof GM_getValue === "function") return String(await GM_getValue(TOKEN_KEY, "") || "").trim();
            return "";
        }
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

        async function writeViaHttp(prepared, flowId, companionError) {
            if (typeof http !== "function") throw error("köprü kurulu değil (companion yok, HTTP kullanılamıyor)", "bridge-not-installed");
            const token = await readToken();
            if (!token) {
                diagnostic(settings, "bridge_http_failed", { flowId, errorCode: "bridge-token-missing", transport: "http" });
                throw error("token yok; Kontrol Merkezi > Genel > Köprü bölümüne ~/.koppy/bridge-token içeriğini yapıştır", "bridge-token-missing");
            }
            diagnostic(settings, "bridge_http_start", { flowId, imageCount: prepared.blobs.length, totalBytes: prepared.totalBytes, transport: "http" });
            try {
                const result = await postFrame(http, bridgeUrl, token, await buildFrame(prepared.blobs), settings.timeout);
                diagnostic(settings, "bridge_http_complete", { flowId, imageCount: result.count, totalBytes: prepared.totalBytes, status: result.status, transport: "http" });
                return { count: result.count };
            } catch (cause) {
                diagnostic(settings, "bridge_http_failed", { flowId, errorCode: cause && cause.koppyCode || "bridge-failed", transport: "http" });
                throw cause;
            }
        }

        // health is unauthenticated and read-only. Never throws; the failure reason is kept (not swallowed).
        function health() {
            return new Promise(resolve => {
                if (typeof http !== "function") return resolve({ reachable: false, version: "", reason: "HTTP kullanılamıyor" });
                let settled = false;
                const finish = result => { if (!settled) { settled = true; resolve(result); } };
                try {
                    http({ method: "GET", url: bridgeUrl + "/v1/health", anonymous: true, timeout: HEALTH_TIMEOUT_MS,
                        onload(r) {
                            const code = Number(r && r.status);
                            if (code !== 200) return finish({ reachable: false, version: "", reason: "HTTP " + code });
                            let version = "";
                            try { version = String(JSON.parse(r.responseText).version || ""); } catch (_) { /* old bridge: no body */ }
                            finish({ reachable: true, version, reason: "" });
                        },
                        onerror() { finish({ reachable: false, version: "", reason: "bağlantı reddedildi" }); },
                        ontimeout() { finish({ reachable: false, version: "", reason: "2 sn içinde yanıt yok" }); },
                        onabort() { finish({ reachable: false, version: "", reason: "istek iptal edildi" }); } });
                } catch (_) { finish({ reachable: false, version: "", reason: "istek başlatılamadı" }); }
            });
        }

        // "running" | "no-token" | "not-installed"
        async function status() {
            const h = await health();
            if (!h.reachable) return "not-installed";
            return (await readToken()) ? "running" : "no-token";
        }

        async function details() {
            const h = await health();
            const hasToken = !!(await readToken());
            return { state: !h.reachable ? "not-installed" : (hasToken ? "running" : "no-token"), version: h.version, hasToken, reason: h.reason, text: describeStatus({ reachable: h.reachable, version: h.version, hasToken, reason: h.reason }) };
        }

        // Sends two 1x1 PNGs (the bridge requires >= 2 frames) with the typed token (or the stored one).
        // Side effect: the macOS clipboard now holds those two pixels - the UI says so.
        async function testConnection(tokenOverride) {
            const typed = String(tokenOverride || "").trim();
            const token = typed || await readToken();
            const h = await health();
            if (!h.reachable) return classifyTest({ outcome: "unreachable", reason: h.reason });
            if (!token) return classifyTest({ outcome: "no-token" });
            if (typeof http !== "function") return classifyTest({ outcome: "unreachable", reason: "HTTP kullanılamıyor" });
            try {
                const pixel = new Blob([ONE_PIXEL_PNG], { type: "image/png" });
                const result = await postFrame(http, bridgeUrl, token, await buildFrame([pixel, pixel]), TEST_TIMEOUT_MS);
                return classifyTest({ outcome: "http", status: result.status || 200, count: result.count });
            } catch (cause) {
                const code = cause && cause.koppyCode || "";
                if (code === "bridge-token-rejected") return classifyTest({ outcome: "http", status: 401 });
                if (code === "bridge-not-installed" || code === "bridge-http-timeout" || code === "bridge-http-aborted") return classifyTest({ outcome: "unreachable", reason: cause.message });
                const m = /HTTP (\d+)/.exec(cause && cause.message || "");
                return classifyTest({ outcome: "http", status: m ? Number(m[1]) : (code === "bridge-rate-limited" ? 429 : 0) });
            }
        }

        async function setToken(value) {
            const token = String(value || "").trim();
            if (token.length > 512 || /\s/.test(token)) throw error("token biçimi geçersiz", "bridge-token-invalid");
            if (typeof settings.setToken === "function") return settings.setToken(token);
            if (typeof GM_setValue === "function") return GM_setValue(TOKEN_KEY, token);
            throw error("GM depolaması kullanılamıyor", "bridge-storage-unavailable");
        }

        async function writeImages(items) {
            if (disposed) throw error("Koppy Bridge artık etkin değil", "bridge-disposed");
            if (!win || typeof win.postMessage !== "function") throw error("Koppy Bridge Companion kullanılamıyor", "bridge-window-unavailable");
            const flowId = settings.diagnostics && typeof settings.diagnostics.flowId === "function" ? settings.diagnostics.flowId() : "bridge";
            const prepared = await validateItems(items);
            let arm = null;
            try { arm = await consumeArm(); }
            catch (cause) {
                if (!cause || cause.koppyCode !== "bridge-companion-unavailable") throw cause;
                return writeViaHttp(prepared, flowId, cause);
            }
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

        const api = { writeImages, validateItems, dispose, status, details, testConnection, setToken, SCRIPT_VERSION };
        // Lets the settings panel (a separate module) reach the live instance without
        // build wiring. Only status()/setToken() are used there; the token is never readable.
        if (settings.publish !== false && typeof globalThis !== "undefined") globalThis.KoppyBridgeInstance = api;
        return api;
    }

    return { CHANNEL, MAX_BYTES, MAX_ITEMS, SCRIPT_VERSION, TOKEN_KEY, BRIDGE_URL, FRAME_TYPE, INSTALL_COMMAND, TOKEN_COMMAND, create, validateItems, buildFrame, describeStatus, classifyTest };
});
