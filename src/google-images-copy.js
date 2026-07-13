(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.KoppyGoogleCopy = api;
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
    const MAX_IMAGE_PIXELS = 40 * 1024 * 1024;
    const MAX_IMAGE_DIMENSION = 16384;
    const REQUEST_TIMEOUT_MS = 20000;
    const GOOGLE_HOSTNAMES = new Set(["google.com", "google.com.tr"]);
    const GOOGLE_METADATA_CACHE = new WeakMap();
    const ALLOWED_IMAGE_TYPES = new Set([
        "image/png",
        "image/jpeg",
        "image/webp",
    ]);

    function isGoogleHostname(hostnameLike) {
        const hostname = String(hostnameLike || "").toLowerCase();
        const registrable = hostname.replace(/^www\./, "");
        return GOOGLE_HOSTNAMES.has(registrable);
    }

    function isGoogleImagesLocation(locationLike) {
        if (!locationLike || !isGoogleHostname(locationLike.hostname)) return false;
        if (String(locationLike.pathname || "") !== "/search") return false;
        const params = new URLSearchParams(String(locationLike.search || ""));
        return params.get("tbm") === "isch" || params.get("udm") === "2";
    }

    function isPrivateIpv4(hostname) {
        const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (!match) return false;
        const octets = match.slice(1).map(Number);
        if (octets.some(value => value > 255)) return true;
        const [a, b] = octets;
        return a === 0 || a === 10 || a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && (b === 0 || b === 168)) ||
            (a === 198 && (b === 18 || b === 19 || b === 51)) ||
            (a === 203 && b === 0) ||
            a >= 224;
    }

    function mappedIpv4FromIpv6(host) {
        const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
        if (dotted) return dotted[1];
        const hexadecimal = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
        if (!hexadecimal) return null;
        const high = parseInt(hexadecimal[1], 16);
        const low = parseInt(hexadecimal[2], 16);
        return [high >> 8, high & 255, low >> 8, low & 255].join(".");
    }

    function isPrivateHost(hostname) {
        const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
        if (!host) return true;
        if (host === "localhost" || /\.(?:localhost|local|localdomain|lan|home|internal)$/.test(host) || host.endsWith(".home.arpa")) return true;
        if (isPrivateIpv4(host)) return true;
        const mappedIpv4 = mappedIpv4FromIpv6(host);
        if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) return true;
        if (!host.includes(".") && !host.includes(":")) return true;
        if (host === "::" || host === "::1" || /^f[ef][0-9a-f]{2}:/i.test(host) || /^(?:fc|fd)[0-9a-f]{2}:/i.test(host)) return true;
        if (/^2001:(?:db8|0?1[0-9a-f]|0?2[0-9a-f]):/i.test(host) || /^64:ff9b:1:/i.test(host)) return true;
        return false;
    }

    function isKnownGoogleThumbnail(url) {
        try {
            const parsed = new URL(url);
            return /^encrypted-tbn\d*\.gstatic\.com$/i.test(parsed.hostname) ||
                (/\.gstatic\.com$/i.test(parsed.hostname) && /\/images\?q=tbn:/i.test(parsed.pathname + parsed.search));
        } catch (_) {
            return true;
        }
    }

    function normalizeCandidateUrl(rawUrl, baseUrl) {
        if (typeof rawUrl !== "string") return null;
        let value = rawUrl.trim().replace(/&amp;/g, "&");
        if (!value || /^data:|^blob:/i.test(value)) return null;
        try {
            if (/^https?%3A/i.test(value)) value = decodeURIComponent(value);
        } catch (_) {}
        let parsed;
        try {
            parsed = new URL(value, baseUrl || "https://www.google.com/");
        } catch (_) {
            return null;
        }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || isPrivateHost(parsed.hostname)) return null;
        parsed.hash = "";
        return parsed.href;
    }

    function parseGoogleImageUrl(rawHref, baseUrl) {
        if (!rawHref) return null;
        let link;
        try {
            link = new URL(rawHref, baseUrl || "https://www.google.com/");
        } catch (_) {
            return null;
        }
        for (const key of ["imgurl", "mediaurl"]) {
            const value = link.searchParams.get(key);
            const normalized = normalizeCandidateUrl(value, baseUrl);
            if (normalized && !isKnownGoogleThumbnail(normalized)) return normalized;
        }
        return null;
    }

    function parseSrcset(srcset, baseUrl) {
        if (!srcset) return [];
        return String(srcset).split(",").map(item => {
            const match = item.trim().match(/^(\S+)\s*(?:(\d+(?:\.\d+)?)(w|x))?$/);
            if (!match) return null;
            const url = normalizeCandidateUrl(match[1], baseUrl);
            if (!url || isKnownGoogleThumbnail(url)) return null;
            const score = match[2] ? Number(match[2]) * (match[3] === "x" ? 10000 : 1) : 1;
            return { url, score };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
    }

    function elementAndAncestors(element, limit) {
        const nodes = [];
        let current = element;
        while (current && current.nodeType === 1 && nodes.length < (limit || 6)) {
            nodes.push(current);
            current = current.parentElement;
        }
        return nodes;
    }

    function imageUrlFromAttributes(element, baseUrl) {
        const preferred = ["data-ou", "data-iurl", "data-original", "data-original-src", "data-full", "data-full-src"];
        for (const node of elementAndAncestors(element, 6)) {
            for (const name of preferred) {
                const value = node.getAttribute && node.getAttribute(name);
                const normalized = normalizeCandidateUrl(value, baseUrl);
                if (normalized && !isKnownGoogleThumbnail(normalized)) return { url: normalized, source: name };
            }
        }
        return null;
    }

    function decodeGoogleJsonString(value) {
        try {
            return JSON.parse('"' + value + '"');
        } catch (_) {
            return value.replace(/\\u003d/gi, "=").replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
        }
    }

    function googleDocIdForElement(element) {
        const result = element && element.closest && element.closest("[data-docid]");
        if (result && result.getAttribute("data-docid")) return result.getAttribute("data-docid");
        for (const node of elementAndAncestors(element, 8)) {
            const jsdata = node.getAttribute && node.getAttribute("jsdata");
            const match = jsdata && jsdata.match(/(?:^|\s)XZxcdf;([^;\s]+);/);
            if (match) return match[1];
        }
        return null;
    }

    function imageUrlFromGoogleMetadata(element, documentLike, baseUrl) {
        const docId = googleDocIdForElement(element);
        if (!docId || !documentLike || !documentLike.scripts) return null;
        const scripts = Array.from(documentLike.scripts);
        let cache = GOOGLE_METADATA_CACHE.get(documentLike);
        if (!cache || cache.scriptCount !== scripts.length) {
            cache = { scriptCount: scripts.length, candidates: new Map() };
            GOOGLE_METADATA_CACHE.set(documentLike, cache);
        }
        if (cache.candidates.has(docId)) return cache.candidates.get(docId);

        const marker = '"' + docId + '",';
        let candidate = null;
        for (const script of scripts) {
            const text = script.textContent || "";
            const offset = text.indexOf(marker);
            if (offset === -1) continue;
            const tail = text.slice(offset + marker.length, offset + marker.length + 4096);
            const record = tail.match(/^\s*\[\s*"((?:\\.|[^"\\])*)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\]\s*,\s*\[\s*"((?:\\.|[^"\\])*)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/);
            if (!record) continue;
            const thumbnail = normalizeCandidateUrl(decodeGoogleJsonString(record[1]), baseUrl);
            const original = normalizeCandidateUrl(decodeGoogleJsonString(record[4]), baseUrl);
            if (!thumbnail || !isKnownGoogleThumbnail(thumbnail) || !original || isKnownGoogleThumbnail(original)) continue;
            candidate = {
                url: original,
                source: "google-metadata",
                width: Number(record[5]),
                height: Number(record[6]),
            };
            break;
        }
        if (candidate) cache.candidates.set(docId, candidate);
        return candidate;
    }

    function resolveGoogleImageCandidates(element, options) {
        const settings = options || {};
        if (!element || String(element.nodeName).toUpperCase() !== "IMG") return [];
        const baseUrl = settings.baseUrl || "https://www.google.com/search?udm=2";
        const candidates = [];
        const seen = new Set();
        const add = (url, source, extra) => {
            const normalized = normalizeCandidateUrl(url, baseUrl);
            if (!normalized || isKnownGoogleThumbnail(normalized) || seen.has(normalized)) return;
            seen.add(normalized);
            candidates.push(Object.assign({ url: normalized, element, source }, extra || {}));
        };
        if (typeof settings.resolvePic === "function") {
            try {
                const resolved = settings.resolvePic(element);
                const current = normalizeCandidateUrl(resolved && resolved.imgSrc, baseUrl);
                const actual = normalizeCandidateUrl(resolved && resolved.src, baseUrl);
                if (actual && actual !== current && !isKnownGoogleThumbnail(actual)) {
                    add(actual, "picviewer:" + (resolved.type || "unknown"));
                }
            } catch (_) {}
        }

        const anchor = element.closest && element.closest("a[href]");
        const fromLink = parseGoogleImageUrl(anchor && anchor.href, baseUrl);
        add(fromLink, "imgurl");

        const fromMetadata = imageUrlFromGoogleMetadata(element, settings.document || element.ownerDocument, baseUrl);
        if (fromMetadata) add(fromMetadata.url, fromMetadata.source, { width: fromMetadata.width, height: fromMetadata.height });

        const fromAttributes = imageUrlFromAttributes(element, baseUrl);
        if (fromAttributes) add(fromAttributes.url, fromAttributes.source);

        const srcset = parseSrcset(element.getAttribute && element.getAttribute("srcset"), baseUrl);
        if (srcset.length) add(srcset[0].url, "srcset");
        return candidates;
    }

    function resolveGoogleImage(element, options) {
        return resolveGoogleImageCandidates(element, options)[0] || null;
    }

    function parseResponseHeaders(rawHeaders) {
        const headers = Object.create(null);
        String(rawHeaders || "").split(/\r?\n/).forEach(line => {
            const separator = line.indexOf(":");
            if (separator <= 0) return;
            headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
        });
        return headers;
    }

    function requestImageWithGM(url, gmRequest, options) {
        const settings = options || {};
        const maxBytes = settings.maxBytes || MAX_IMAGE_BYTES;
        const timeout = settings.timeout || REQUEST_TIMEOUT_MS;
        const safeUrl = normalizeCandidateUrl(url, "https://www.google.com/");
        if (!safeUrl) {
            return {
                promise: Promise.reject(new Error("Güvenli olmayan görsel adresi reddedildi")),
                abort() {},
            };
        }
        let requestHandle;
        let settled = false;
        const promise = new Promise((resolve, reject) => {
            if (typeof gmRequest !== "function") return reject(new Error("GM_xmlhttpRequest kullanılamıyor"));
            const fail = error => {
                if (settled) return;
                settled = true;
                reject(error);
            };
            requestHandle = gmRequest({
                method: "GET",
                url: safeUrl,
                responseType: "blob",
                anonymous: true,
                redirect: "error",
                timeout,
                onprogress(progress) {
                    if (Number(progress.loaded || 0) <= maxBytes && (!progress.lengthComputable || Number(progress.total || 0) <= maxBytes)) return;
                    fail(new Error("Görsel " + Math.round(maxBytes / 1024 / 1024) + " MB güvenlik sınırını aşıyor"));
                    if (requestHandle && typeof requestHandle.abort === "function") requestHandle.abort();
                },
                onload(response) {
                    if (settled) return;
                    try {
                        if (response.status < 200 || response.status >= 300) throw new Error("Görsel isteği HTTP " + response.status + " döndürdü");
                        const finalUrl = normalizeCandidateUrl(response.finalUrl || safeUrl, safeUrl);
                        if (!finalUrl) throw new Error("Görsel güvenli olmayan bir adrese yönlendirildi");
                        const headers = parseResponseHeaders(response.responseHeaders);
                        const declaredLength = Number(headers["content-length"] || 0);
                        if (declaredLength > maxBytes) throw new Error("Görsel " + Math.round(maxBytes / 1024 / 1024) + " MB güvenlik sınırını aşıyor");
                        const blob = response.response;
                        if (!blob || typeof blob.size !== "number" || blob.size === 0) throw new Error("Görsel yanıtı boş");
                        if (blob.size > maxBytes) throw new Error("Görsel " + Math.round(maxBytes / 1024 / 1024) + " MB güvenlik sınırını aşıyor");
                        const mime = String(blob.type || headers["content-type"] || "").split(";", 1)[0].toLowerCase();
                        if (!ALLOWED_IMAGE_TYPES.has(mime)) throw new Error("Desteklenmeyen görsel türü: " + (mime || "bilinmiyor"));
                        settled = true;
                        resolve({ blob: blob.type === mime ? blob : new Blob([blob], { type: mime }), finalUrl });
                    } catch (error) {
                        fail(error);
                    }
                },
                onerror() { fail(new Error("Görsel indirilemedi")); },
                ontimeout() { fail(new Error("Görsel indirme zaman aşımına uğradı")); },
                onabort() { fail(new Error("Görsel indirme iptal edildi")); },
            });
        });
        return {
            promise,
            abort() {
                if (requestHandle && typeof requestHandle.abort === "function") requestHandle.abort();
            },
        };
    }

    async function probeRasterDimensions(blob) {
        const headerBudget = blob.type === "image/jpeg" ? 4 * 1024 * 1024 : 256 * 1024;
        const bytes = new Uint8Array(await blob.slice(0, headerBudget).arrayBuffer());
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const mime = String(blob.type || "").toLowerCase();
        if (mime === "image/png" && bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
            return { width: view.getUint32(16), height: view.getUint32(20) };
        }
        if (mime === "image/jpeg" && bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
            let offset = 2;
            while (offset + 8 < bytes.length) {
                if (bytes[offset] !== 0xff) { offset += 1; continue; }
                while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
                const marker = bytes[offset++];
                if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
                if (offset + 2 > bytes.length) break;
                const length = view.getUint16(offset);
                if (length < 2 || offset + length > bytes.length) break;
                if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
                    return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
                }
                offset += length;
            }
        }
        if (mime === "image/webp" && bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
            const chunk = String.fromCharCode(...bytes.slice(12, 16));
            if (chunk === "VP8X") {
                const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
                const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
                return { width, height };
            }
            if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
                return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
            }
            if (chunk === "VP8L" && bytes[20] === 0x2f) {
                const bits = view.getUint32(21, true);
                return { width: 1 + (bits & 0x3fff), height: 1 + (bits >>> 14 & 0x3fff) };
            }
        }
        throw new Error("Görsel başlığı güvenli biçimde doğrulanamadı");
    }

    function validateImageDimensions(width, height, environment) {
        const maxDimension = Number(environment.maxDimension || MAX_IMAGE_DIMENSION);
        const maxPixels = Number(environment.maxPixels || MAX_IMAGE_PIXELS);
        if (!width || !height) throw new Error("Görsel boyutu okunamadı");
        if (width > maxDimension || height > maxDimension || width * height > maxPixels) {
            throw new Error("Görsel güvenli piksel sınırını aşıyor: " + width + "×" + height);
        }
    }

    async function imageBitmapToPng(bitmap, environment) {
        const width = bitmap.width;
        const height = bitmap.height;
        validateImageDimensions(width, height, environment);
        let canvas;
        if (environment.OffscreenCanvas) {
            canvas = new environment.OffscreenCanvas(width, height);
        } else if (environment.document && environment.document.createElement) {
            canvas = environment.document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
        } else {
            throw new Error("PNG dönüştürme yüzeyi kullanılamıyor");
        }
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PNG dönüştürme yüzeyi açılamadı");
        context.drawImage(bitmap, 0, 0);
        let png;
        if (typeof canvas.convertToBlob === "function") {
            png = await canvas.convertToBlob({ type: "image/png" });
        } else {
            png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG üretilemedi")), "image/png"));
        }
        if (!png || png.size > Number(environment.maxBytes || MAX_IMAGE_BYTES)) {
            throw new Error("Üretilen PNG güvenli boyut sınırını aşıyor");
        }
        return { blob: png, width, height };
    }

    async function normalizeImageToPng(blob, environment) {
        const env = environment || {};
        const probeDimensions = env.probeDimensions || probeRasterDimensions;
        const headerDimensions = await probeDimensions(blob);
        validateImageDimensions(headerDimensions.width, headerDimensions.height, env);
        const createBitmap = env.createImageBitmap || (typeof createImageBitmap === "function" ? createImageBitmap : null);
        if (!createBitmap) throw new Error("Tarayıcı görsel çözücüsü kullanılamıyor");
        const bitmap = await createBitmap(blob);
        try {
            validateImageDimensions(bitmap.width, bitmap.height, env);
            if (blob.type === "image/png") return { blob, width: bitmap.width, height: bitmap.height };
            return await imageBitmapToPng(bitmap, env);
        } finally {
            if (bitmap && typeof bitmap.close === "function") bitmap.close();
        }
    }

    function isEditableTarget(target) {
        if (!target || target.nodeType !== 1) return false;
        const name = String(target.localName || target.nodeName || "").toLowerCase();
        if (name === "input" || name === "textarea" || name === "select") return true;
        if (target.isContentEditable || target.getAttribute && target.getAttribute("contenteditable") === "true") return true;
        return Boolean(target.closest && target.closest("[contenteditable='true'], input, textarea, select"));
    }

    function isCopyGesture(event, windowLike) {
        if (!event || event.repeat || event.altKey || event.shiftKey) return false;
        const platform = windowLike && windowLike.navigator && (windowLike.navigator.userAgentData && windowLike.navigator.userAgentData.platform || windowLike.navigator.platform || "");
        const modifier = /mac/i.test(String(platform)) ? event.metaKey : (event.metaKey || event.ctrlKey);
        if (!modifier || String(event.key || "").toLowerCase() !== "c") return false;
        if (isEditableTarget(event.target)) return false;
        const selection = windowLike && typeof windowLike.getSelection === "function" ? windowLike.getSelection() : null;
        return !(selection && String(selection).trim());
    }

    function isLikelyResultImage(image) {
        if (!image || String(image.nodeName).toUpperCase() !== "IMG" || image.isConnected === false) return false;
        const rect = typeof image.getBoundingClientRect === "function" ? image.getBoundingClientRect() : null;
        const width = Number(image.clientWidth || image.width || (rect && rect.width) || 0);
        const height = Number(image.clientHeight || image.height || (rect && rect.height) || 0);
        return width >= 60 && height >= 60;
    }

    function isGoogleResultImage(image) {
        if (!image || !image.closest) return false;
        if (image.closest("[data-docid], [jscontroller='aw2uhd']")) return true;
        const anchor = image.closest("a[href]");
        if (anchor && parseGoogleImageUrl(anchor.href, image.ownerDocument && image.ownerDocument.baseURI)) return true;
        if (imageUrlFromAttributes(image, image.ownerDocument && image.ownerDocument.baseURI)) return true;
        const rawSrc = image.currentSrc || image.src || "";
        return Boolean(rawSrc && isKnownGoogleThumbnail(rawSrc));
    }

    function createToast(documentLike) {
        let timer;
        return function notify(message, kind) {
            if (!documentLike || !documentLike.documentElement) return;
            let toast = documentLike.getElementById("koppy-copy-toast");
            if (!toast) {
                toast = documentLike.createElement("div");
                toast.id = "koppy-copy-toast";
                toast.setAttribute("aria-live", "polite");
                toast.setAttribute("aria-atomic", "true");
                Object.assign(toast.style, {
                    position: "fixed",
                    left: "50%",
                    bottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
                    transform: "translateX(-50%)",
                    zIndex: "2147483647",
                    padding: "9px 14px",
                    borderRadius: "10px",
                    color: "#fff",
                    font: "600 13px/1.35 -apple-system, BlinkMacSystemFont, sans-serif",
                    boxShadow: "0 8px 30px rgba(0,0,0,.28)",
                    pointerEvents: "none",
                    maxWidth: "min(86vw, 560px)",
                    textAlign: "center",
                });
                documentLike.documentElement.appendChild(toast);
            }
            toast.textContent = String(message);
            toast.setAttribute("role", kind === "error" ? "alert" : "status");
            toast.style.background = kind === "error" ? "rgba(176, 38, 38, .94)" : kind === "progress" ? "rgba(36, 76, 130, .95)" : "rgba(22, 111, 62, .94)";
            toast.style.display = "block";
            clearTimeout(timer);
            if (kind !== "progress") timer = setTimeout(() => { toast.style.display = "none"; }, kind === "error" ? 3000 : 1800);
        };
    }

    async function prepareClipboardImage(candidate, options) {
        const settings = options || {};
        if (!candidate || !candidate.url) throw new Error("Orijinal görsel adresi bulunamadı");
        if (typeof settings.requestImage !== "function" || typeof settings.normalizeImage !== "function") {
            throw new Error("Görsel hazırlama bağımlılıkları eksik");
        }
        const request = settings.requestImage(candidate.url);
        if (typeof settings.onRequest === "function") settings.onRequest(request);
        const downloaded = await request.promise;
        const prepared = await settings.normalizeImage(downloaded.blob);
        return prepared.blob;
    }

    function createController(dependencies) {
        const deps = dependencies || {};
        const documentLike = deps.document;
        const windowLike = deps.window || (documentLike && documentLike.defaultView);
        const locationLike = deps.location || (windowLike && windowLike.location);
        const navigatorLike = deps.navigator || (windowLike && windowLike.navigator);
        const ClipboardItemCtor = deps.ClipboardItem || (windowLike && windowLike.ClipboardItem);
        const notify = deps.notify || createToast(documentLike);
        const normalizeImage = deps.normalizeImage || (blob => normalizeImageToPng(blob, {
            createImageBitmap: windowLike && windowLike.createImageBitmap && windowLike.createImageBitmap.bind(windowLike),
            OffscreenCanvas: windowLike && windowLike.OffscreenCanvas,
            document: documentLike,
            maxBytes: deps.maxBytes || MAX_IMAGE_BYTES,
            maxPixels: deps.maxPixels || MAX_IMAGE_PIXELS,
            maxDimension: deps.maxDimension || MAX_IMAGE_DIMENSION,
        }));
        const requestImage = deps.requestImage || (url => requestImageWithGM(url, deps.gmRequest, {
            maxBytes: deps.maxBytes || MAX_IMAGE_BYTES,
            timeout: deps.timeout || REQUEST_TIMEOUT_MS,
        }));
        let current = null;
        let activeCopy = null;
        let lastPointer = null;
        let started = false;

        function cancelState(state) {
            if (!state) return;
            state.cancelled = true;
            if (state.activeRequest && typeof state.activeRequest.abort === "function") state.activeRequest.abort();
            state.activeRequest = null;
        }

        function cancelCurrent() {
            cancelState(current);
            current = null;
        }

        function cancelAll() {
            cancelCurrent();
            cancelState(activeCopy);
            activeCopy = null;
        }

        function resolveCandidates(image) {
            return resolveGoogleImageCandidates(image, {
                resolvePic: deps.resolvePic,
                baseUrl: locationLike && locationLike.href,
                document: documentLike,
            });
        }

        function setHoveredImage(image, force) {
            if (!isGoogleImagesLocation(locationLike) || !isLikelyResultImage(image)) {
                cancelCurrent();
                return;
            }
            if (!force && current && current.element === image) return;
            const candidates = resolveCandidates(image);
            const signature = candidates.map(candidate => candidate.url).join("\n");
            if (current && current.element === image && current.signature === signature) return;
            cancelCurrent();
            current = {
                element: image,
                candidates,
                candidate: candidates[0] || null,
                signature,
                activeRequest: null,
                cancelled: false,
                copying: false,
                isGoogleResult: isGoogleResultImage(image),
            };
        }

        function pointerInsideCurrent() {
            if (!current || !current.element || !lastPointer || typeof current.element.getBoundingClientRect !== "function") return Boolean(current);
            const rect = current.element.getBoundingClientRect();
            return lastPointer.x >= rect.left && lastPointer.x <= rect.right && lastPointer.y >= rect.top && lastPointer.y <= rect.bottom;
        }

        function imageAtPointer(event) {
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            let image = path.find(node => node && String(node.nodeName).toUpperCase() === "IMG");
            if (!image && event.target && String(event.target.nodeName).toUpperCase() === "IMG") image = event.target;
            if (!image && event.target && event.target.closest) {
                const result = event.target.closest("[data-docid], [jscontroller='aw2uhd']");
                const possible = result && result.querySelector && result.querySelector("img");
                if (possible && typeof possible.getBoundingClientRect === "function") {
                    const rect = possible.getBoundingClientRect();
                    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) image = possible;
                }
            }
            return image || null;
        }

        function imageAtLastPointer() {
            if (!lastPointer || !documentLike || typeof documentLike.elementFromPoint !== "function") return null;
            const target = documentLike.elementFromPoint(lastPointer.x, lastPointer.y);
            return imageAtPointer({
                target,
                clientX: lastPointer.x,
                clientY: lastPointer.y,
                composedPath() { return target ? [target] : []; },
            });
        }

        function refreshRoute() {
            if (!isGoogleImagesLocation(locationLike)) cancelAll();
        }

        function onPointerMove(event) {
            lastPointer = { x: event.clientX, y: event.clientY };
            if (!isGoogleImagesLocation(locationLike)) {
                cancelCurrent();
                return;
            }
            const image = imageAtPointer(event);
            if (image) setHoveredImage(image, false);
            else if (!pointerInsideCurrent()) cancelCurrent();
        }

        async function prepareFromCandidates(state) {
            let lastError = null;
            for (const candidate of state.candidates) {
                if (state.cancelled) throw new Error("Görsel hazırlama iptal edildi");
                try {
                    const request = requestImage(candidate.url);
                    state.activeRequest = request;
                    const downloaded = await request.promise;
                    state.activeRequest = null;
                    if (state.cancelled) throw new Error("Görsel hazırlama iptal edildi");
                    const prepared = await normalizeImage(downloaded.blob);
                    if (state.cancelled) throw new Error("Görsel hazırlama iptal edildi");
                    return Object.assign({ source: candidate.source }, prepared);
                } catch (error) {
                    state.activeRequest = null;
                    if (state.cancelled) throw error;
                    lastError = error;
                }
            }
            throw lastError || new Error("Orijinal görsel adresi bulunamadı");
        }

        async function copyHoveredImage(event) {
            if (!isGoogleImagesLocation(locationLike) || !isCopyGesture(event, windowLike)) {
                return { status: "not-applicable" };
            }
            // Google can replace or move a result without another pointer event. Re-read the
            // element below the pointer at the instant of Cmd+C, so a stale hover never falls
            // through to a browser/upstream URL copy.
            const liveImage = imageAtLastPointer();
            if (liveImage) setHoveredImage(liveImage, true);
            if (!pointerInsideCurrent()) return { status: "not-applicable" };
            if (activeCopy) {
                event.preventDefault();
                if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
                else if (typeof event.stopPropagation === "function") event.stopPropagation();
                notify("Koppy: Görsel zaten hazırlanıyor…", "progress");
                return { status: "failed", reason: "copy-in-progress" };
            }
            setHoveredImage(current.element, true);
            if (!current || !current.candidates.length) {
                if (!current || !current.isGoogleResult) return { status: "not-applicable" };
                event.preventDefault();
                if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
                else if (typeof event.stopPropagation === "function") event.stopPropagation();
                notify("Koppy: Orijinal görsel adresi bulunamadı", "error");
                return { status: "failed", reason: "candidate-not-found" };
            }

            event.preventDefault();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            else if (typeof event.stopPropagation === "function") event.stopPropagation();

            if (!navigatorLike || !navigatorLike.clipboard || typeof navigatorLike.clipboard.write !== "function" || !ClipboardItemCtor) {
                notify("Koppy: Tarayıcı resim panosunu desteklemiyor", "error");
                return { status: "failed", reason: "clipboard-unavailable" };
            }
            const stateAtCopy = current;
            const copyState = {
                element: stateAtCopy.element,
                candidates: stateAtCopy.candidates.slice(),
                candidate: stateAtCopy.candidate,
                activeRequest: null,
                cancelled: false,
            };
            activeCopy = copyState;
            notify("Koppy: Görsel hazırlanıyor…", "progress");
            const preparedPromise = prepareFromCandidates(copyState);
            try {
                const clipboardBlobPromise = preparedPromise.then(result => result.blob);
                clipboardBlobPromise.catch(() => {});
                const writePromise = Promise.resolve(navigatorLike.clipboard.write([
                    new ClipboardItemCtor({ "image/png": clipboardBlobPromise }),
                ]));
                const [prepared] = await Promise.all([preparedPromise, writePromise]);
                notify("Kopyalandı: " + prepared.width + "×" + prepared.height, "success");
                return { status: "copied", width: prepared.width, height: prepared.height, source: prepared.source };
            } catch (error) {
                cancelState(copyState);
                const message = error && error.message ? error.message : "Bilinmeyen hata";
                notify("Koppy: " + message, "error");
                return { status: "failed", reason: message };
            } finally {
                copyState.activeRequest = null;
                if (activeCopy === copyState) activeCopy = null;
            }
        }

        function onKeyDown(event) {
            void copyHoveredImage(event);
        }

        return {
            start() {
                if (started || !documentLike || !isGoogleHostname(locationLike && locationLike.hostname)) return false;
                if (windowLike && windowLike.top && windowLike.self && windowLike.top !== windowLike.self) return false;
                documentLike.addEventListener("pointermove", onPointerMove, true);
                documentLike.addEventListener("keydown", onKeyDown, true);
                if (windowLike && windowLike.addEventListener) {
                    windowLike.addEventListener("popstate", refreshRoute);
                    windowLike.addEventListener("hashchange", refreshRoute);
                }
                if (windowLike && windowLike.navigation && windowLike.navigation.addEventListener) {
                    windowLike.navigation.addEventListener("currententrychange", refreshRoute);
                }
                started = true;
                refreshRoute();
                return true;
            },
            destroy() {
                if (!started) return;
                documentLike.removeEventListener("pointermove", onPointerMove, true);
                documentLike.removeEventListener("keydown", onKeyDown, true);
                if (windowLike && windowLike.removeEventListener) {
                    windowLike.removeEventListener("popstate", refreshRoute);
                    windowLike.removeEventListener("hashchange", refreshRoute);
                }
                if (windowLike && windowLike.navigation && windowLike.navigation.removeEventListener) {
                    windowLike.navigation.removeEventListener("currententrychange", refreshRoute);
                }
                cancelAll();
                started = false;
            },
            setHoveredImage,
            copyHoveredImage,
            refreshRoute,
            getState() { return current; },
        };
    }

    return {
        ALLOWED_IMAGE_TYPES,
        MAX_IMAGE_BYTES,
        MAX_IMAGE_DIMENSION,
        MAX_IMAGE_PIXELS,
        createController,
        createToast,
        isCopyGesture,
        isGoogleImagesLocation,
        isKnownGoogleThumbnail,
        isPrivateHost,
        normalizeCandidateUrl,
        normalizeImageToPng,
        parseGoogleImageUrl,
        parseSrcset,
        prepareClipboardImage,
        probeRasterDimensions,
        requestImageWithGM,
        resolveGoogleImage,
        resolveGoogleImageCandidates,
    };
});
