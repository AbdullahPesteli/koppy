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
    const SCRIPT_VERSION = "0.5.2";
    const TOKEN_KEY = "koppy.bridge.token.v1";
    const MAX_ITEMS = 10;
    const MAX_BYTES = 150 * 1024 * 1024;
    const FRAME_TYPE = "application/vnd.koppy.images+binary";

    function error(message) { return new Error("Koppy Bridge v" + SCRIPT_VERSION + ": " + message); }

    function parseJson(response) {
        if (response && response.response && typeof response.response === "object") return response.response;
        const raw = response && (response.responseText || response.response);
        if (typeof raw !== "string") throw error("yanıt okunamadı");
        try { return JSON.parse(raw); } catch (_) { throw error("geçersiz yanıt"); }
    }

    function gmCall(gmRequest, options) {
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
                            reject(error(status ? "yerel yardımcı HTTP " + status + " döndü" : "yerel yardımcı yanıt vermedi"));
                            return;
                        }
                        resolve(response);
                    }, () => reject(error("yerel yardımcıya bağlanılamadı")));
                } catch (cause) {
                    reject(error(cause && cause.message || "yerel istek başlatılamadı"));
                }
            });
        }
        if (typeof gmRequest !== "function") return Promise.reject(error("Tampermonkey ağ izni yok"));
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
                            settle(reject, error(status ? "yerel yardımcı HTTP " + status + " döndü" : "yerel yardımcı yanıt vermedi"));
                            return;
                        }
                        settle(resolve, response);
                    },
                    onerror: () => settle(reject, error("yerel yardımcıya bağlanılamadı")),
                    ontimeout: () => settle(reject, error("yerel yardımcı zaman aşımına uğradı")),
                    onabort: () => settle(reject, error("yerel yardımcı isteği iptal edildi")),
                }));
            } catch (cause) {
                settle(reject, error(cause && cause.message || "yerel istek başlatılamadı"));
            }
        });
    }

    async function readValue(getValue, key) {
        if (typeof getValue !== "function") return null;
        return await getValue(key, null);
    }

    async function getToken(options) {
        const settings = options || {};
        let token = await readValue(settings.getValue, TOKEN_KEY);
        if (typeof token === "string" && token.length >= 32) return token;
        const response = await gmCall(settings.gmRequest, {
            method: "GET",
            url: ORIGIN + "/v1/token",
            headers: { "X-Koppy-Client": "tampermonkey-v1" },
            timeout: 4000,
        });
        const payload = parseJson(response);
        if (!payload || typeof payload.token !== "string" || payload.token.length < 32) {
            throw error("eşleme anahtarı alınamadı");
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
        async function writeImages(items) {
            const token = cachedToken || await getToken(settings);
            cachedToken = token;
            const body = await frameImages(items, BlobCtor);
            const response = await gmCall(settings.gmRequest, {
                method: "POST",
                url: ORIGIN + "/v1/images",
                data: body,
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": FRAME_TYPE,
                },
                timeout: 30000,
            });
            const payload = parseJson(response);
            if (!payload || payload.ok !== true || !Number.isInteger(payload.count) || payload.count !== items.length) {
                throw error(payload && payload.error || "pano yazımı doğrulanamadı");
            }
            return { count: payload.count };
        }
        return { writeImages, frameImages: items => frameImages(items, BlobCtor) };
    }

    return { FRAME_TYPE, MAX_BYTES, MAX_ITEMS, ORIGIN, SCRIPT_VERSION, TOKEN_KEY, create, frameImages };
});
