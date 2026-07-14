(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KoppyBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    // The native helper deliberately listens only on 127.0.0.1. This module is
    // executed in Tampermonkey's isolated world, so a page never receives the
    // pairing secret or the response body. The helper also sends no CORS header.
    const ORIGIN = "http://127.0.0.1:47651";
    const SCRIPT_VERSION = "0.5.3";
    const TOKEN_KEY = "koppy.bridge.token.v1";
    const MAX_ITEMS = 10;
    const MAX_BYTES = 150 * 1024 * 1024;
    const FRAME_TYPE = "application/vnd.koppy.images+binary";

    function error(message, code) {
        const output = new Error("Koppy Bridge v" + SCRIPT_VERSION + ": " + message);
        output.koppyCode = code || "bridge-failed";
        return output;
    }

    function diagnostic(settings, event, fields) {
        const logger = settings && settings.diagnostics || (typeof globalThis !== "undefined" && globalThis.KoppyDiagnostics);
        if (logger && typeof logger.record === "function") logger.record(event, fields);
    }

    function routeName(url) {
        if (/\/v1\/health(?:$|[?#])/.test(String(url))) return "health";
        if (/\/v1\/token(?:$|[?#])/.test(String(url))) return "token";
        if (/\/v1\/images(?:$|[?#])/.test(String(url))) return "images";
        return "other";
    }

    function transportFailure(cause) {
        const message = String(cause && (cause.message || cause.error || cause.statusText) || "").toLowerCase();
        if (/timeout|timed out/.test(message)) return { code: "bridge-timeout", kind: "timeout", message: "yerel yardımcı zaman aşımına uğradı" };
        if (/abort|cancel/.test(message)) return { code: "bridge-aborted", kind: "aborted", message: "yerel yardımcı isteği iptal edildi" };
        if (/permission|connect|network|refused|cors/.test(message)) return { code: "bridge-unreachable", kind: "network", message: "yerel yardımcıya bağlanılamadı" };
        return { code: "bridge-unreachable", kind: "unknown", message: "yerel yardımcıya bağlanılamadı" };
    }

    function parseJson(response) {
        if (response && response.response && typeof response.response === "object") return response.response;
        const raw = response && (response.responseText || response.response);
        if (typeof raw !== "string") throw error("yanıt okunamadı");
        try { return JSON.parse(raw); } catch (_) { throw error("geçersiz yanıt"); }
    }

    function gmCall(gmRequest, options, settings, context) {
        const route = routeName(options && options.url);
        const flowId = context && context.flowId;
        const attempt = context && context.attempt || 1;
        const startedAt = Date.now();
        const mark = (event, fields) => diagnostic(settings, event, Object.assign({ flowId, route, attempt, durationMs: Date.now() - startedAt }, fields));
        mark("bridge_request_start", { transport: typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function" ? "modern" : "legacy" });
        // Tampermonkey 5.5 on Firefox/Zen has a newer Promise transport. Prefer
        // it here: it keeps the loopback request inside TM's extension context
        // instead of relying on the legacy callback bridge.
        if (typeof GM !== "undefined" && GM && typeof GM.xmlHttpRequest === "function") {
            const request = Object.assign({}, options);
            delete request.onload;
            delete request.onerror;
            delete request.ontimeout;
            delete request.onabort;
            return new Promise((resolve, reject) => {
                try {
                    Promise.resolve(GM.xmlHttpRequest(request)).then(response => {
                        const status = Number(response && response.status) || 0;
                        if (status < 200 || status >= 300) {
                            mark("bridge_request_failed", { transport: "modern", status, errorKind: "http" });
                            reject(error(status ? "yerel yardımcı HTTP " + status + " döndü" : "yerel yardımcı yanıt vermedi", "bridge-http-" + status));
                            return;
                        }
                        mark("bridge_request_ok", { transport: "modern", status });
                        resolve(response);
                    }, cause => {
                        const failure = transportFailure(cause);
                        mark("bridge_request_failed", { transport: "modern", errorKind: failure.kind, errorCode: failure.code });
                        reject(error(failure.message, failure.code));
                    });
                } catch (cause) {
                    const failure = transportFailure(cause);
                    mark("bridge_request_failed", { transport: "modern", errorKind: failure.kind, errorCode: failure.code });
                    reject(error(failure.message, failure.code));
                }
            });
        }
        if (typeof gmRequest !== "function") {
            mark("bridge_request_failed", { transport: "none", errorKind: "permission", errorCode: "tm-network-unavailable" });
            return Promise.reject(error("Tampermonkey ağ izni yok", "tm-network-unavailable"));
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const settle = (fn, value) => {
                if (settled) return;
                settled = true;
                fn(value);
            };
            try {
                gmRequest(Object.assign({}, options, {
                    onload: response => {
                        const status = Number(response && response.status) || 0;
                        if (status < 200 || status >= 300) {
                            mark("bridge_request_failed", { transport: "legacy", status, errorKind: "http" });
                            settle(reject, error(status ? "yerel yardımcı HTTP " + status + " döndü" : "yerel yardımcı yanıt vermedi", "bridge-http-" + status));
                            return;
                        }
                        mark("bridge_request_ok", { transport: "legacy", status });
                        settle(resolve, response);
                    },
                    onerror: () => { mark("bridge_request_failed", { transport: "legacy", errorKind: "network", errorCode: "bridge-unreachable" }); settle(reject, error("yerel yardımcıya bağlanılamadı", "bridge-unreachable")); },
                    ontimeout: () => { mark("bridge_request_failed", { transport: "legacy", errorKind: "timeout", errorCode: "bridge-timeout" }); settle(reject, error("yerel yardımcı zaman aşımına uğradı", "bridge-timeout")); },
                    onabort: () => { mark("bridge_request_failed", { transport: "legacy", errorKind: "aborted", errorCode: "bridge-aborted" }); settle(reject, error("yerel yardımcı isteği iptal edildi", "bridge-aborted")); },
                }));
            } catch (cause) {
                const failure = transportFailure(cause);
                mark("bridge_request_failed", { transport: "legacy", errorKind: failure.kind, errorCode: failure.code });
                settle(reject, error(failure.message, failure.code));
            }
        });
    }

    async function readValue(getValue, key) {
        if (typeof getValue !== "function") return null;
        return await getValue(key, null);
    }

    async function getToken(options, context) {
        const settings = options || {};
        let token = await readValue(settings.getValue, TOKEN_KEY);
        if (typeof token === "string" && token.length >= 32) {
            diagnostic(settings, "bridge_token_cached", { flowId: context && context.flowId });
            return token;
        }
        const response = await gmCall(settings.gmRequest, {
            method: "GET",
            url: ORIGIN + "/v1/token",
            headers: { "X-Koppy-Client": "tampermonkey-v1" },
            timeout: 4000,
        }, settings, context);
        const payload = parseJson(response);
        if (!payload || typeof payload.token !== "string" || payload.token.length < 32) {
            throw error("eşleme anahtarı alınamadı", "bridge-pairing-invalid");
        }
        token = payload.token;
        if (typeof settings.setValue === "function") await settings.setValue(TOKEN_KEY, token);
        return token;
    }

    async function frameImages(items, BlobCtor) {
        if (!Array.isArray(items) || items.length < 2) throw error("en az iki görsel seçilmeli");
        if (items.length > MAX_ITEMS) throw error("en fazla " + MAX_ITEMS + " görsel aktarılabilir");
        if (typeof BlobCtor !== "function") throw error("tarayıcı binary aktarımı desteklemiyor");
        let total = 0;
        const chunks = [];
        for (const item of items) {
            const blob = item && item.blob;
            if (!blob || typeof blob.arrayBuffer !== "function" || blob.type !== "image/png") {
                throw error("yalnız hazırlanmış PNG görseller aktarılabilir");
            }
            const bytes = await blob.arrayBuffer();
            if (!bytes.byteLength) throw error("boş görsel aktarılmadı");
            total += bytes.byteLength;
            if (total > MAX_BYTES) throw error("toplam boyut 150 MB sınırını aşıyor");
            const size = new Uint8Array(4);
            new DataView(size.buffer).setUint32(0, bytes.byteLength, false);
            chunks.push(size, new Uint8Array(bytes));
        }
        return new BlobCtor(chunks, { type: FRAME_TYPE });
    }

    function create(options) {
        const settings = options || {};
        const BlobCtor = settings.Blob || (typeof Blob === "undefined" ? null : Blob);
        let cachedToken = null;
        async function health(context) {
            const response = await gmCall(settings.gmRequest, {
                method: "GET", url: ORIGIN + "/v1/health", timeout: 4000,
            }, settings, context);
            return parseJson(response);
        }
        async function writeImages(items) {
            const flowId = settings.diagnostics && typeof settings.diagnostics.flowId === "function"
                ? settings.diagnostics.flowId()
                : (typeof globalThis !== "undefined" && globalThis.KoppyDiagnostics && globalThis.KoppyDiagnostics.flowId ? globalThis.KoppyDiagnostics.flowId() : "bridge");
            const totalBytes = (items || []).reduce((total, item) => total + Math.max(0, Number(item && item.blob && item.blob.size) || 0), 0);
            diagnostic(settings, "bridge_batch_start", { flowId, imageCount: Array.isArray(items) ? items.length : 0, totalBytes, version: SCRIPT_VERSION });
            const token = cachedToken || await getToken(settings, { flowId, attempt: 1 });
            cachedToken = token;
            const body = await frameImages(items, BlobCtor);
            const request = () => gmCall(settings.gmRequest, {
                    method: "POST", url: ORIGIN + "/v1/images", data: body,
                    headers: { "Authorization": "Bearer " + token, "Content-Type": FRAME_TYPE }, timeout: 30000,
                }, settings, { flowId, attempt: 1 });
            let response;
            try {
                response = await request();
            } catch (cause) {
                // A single, bounded recovery attempt. Health is intentionally
                // unauthenticated and contains only aggregate local state.
                diagnostic(settings, "bridge_recovery_start", { flowId, errorCode: cause && cause.koppyCode || "bridge-failed" });
                try { await health({ flowId, attempt: 2 }); } catch (_) {}
                try {
                    response = await gmCall(settings.gmRequest, {
                        method: "POST", url: ORIGIN + "/v1/images", data: body,
                        headers: { "Authorization": "Bearer " + token, "Content-Type": FRAME_TYPE }, timeout: 30000,
                    }, settings, { flowId, attempt: 2 });
                    diagnostic(settings, "bridge_recovery_ok", { flowId });
                } catch (retryError) {
                    diagnostic(settings, "bridge_recovery_failed", { flowId, errorCode: retryError && retryError.koppyCode || "bridge-failed" });
                    throw retryError;
                }
            }
            const payload = parseJson(response);
            if (!payload || payload.ok !== true || !Number.isInteger(payload.count) || payload.count !== items.length) {
                throw error(payload && payload.error || "pano yazımı doğrulanamadı", "bridge-invalid-response");
            }
            diagnostic(settings, "bridge_batch_complete", { flowId, imageCount: payload.count, totalBytes });
            return { count: payload.count };
        }
        return { writeImages, health, frameImages: items => frameImages(items, BlobCtor) };
    }

    return { FRAME_TYPE, MAX_BYTES, MAX_ITEMS, ORIGIN, SCRIPT_VERSION, TOKEN_KEY, create, frameImages };
});
