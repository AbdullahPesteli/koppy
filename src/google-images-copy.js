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
    // Recent copies are retained only inside this tab. Every Cmd+C still writes
    // exactly one portable PNG to the system clipboard; the optional native
    // Bridge will later turn an explicitly accepted list into multi-item paste.
    // These limits prevent a long picking session from holding unbounded image
    // data in memory.
    const MAX_STACK_ITEMS = 10;
    const MAX_STACK_BYTES = 150 * 1024 * 1024;
    const REQUEST_TIMEOUT_MS = 20000;
    const GOOGLE_HOSTNAMES = new Set(["google.com", "google.com.tr"]);
    const GOOGLE_METADATA_CACHE = new WeakMap();
    // The clipboard itself gets one portable type (PNG), but the input is detected
    // from its bytes rather than trusting a server's Content-Type/extension.
    const ALLOWED_IMAGE_TYPES = new Set([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/x-icon",
        "image/vnd.microsoft.icon",
        "image/avif",
        "image/svg+xml",
    ]);
    const DOCUMENT_TYPES = new Set([
        "application/pdf",
        "application/illustrator",
        "application/postscript",
        "application/eps",
        "application/x-eps",
    ]);
    // A number of asset libraries use text-only download links rather than an
    // <img>. Include ordinary image-file links too; the response is still
    // signature-checked before it ever reaches the clipboard.
    const COPYABLE_FILE_URL_PATTERN = /\.(?:pdf|ai|eps|ps|svg|png|apng|jpe?g|webp|gif|bmp|ico|avif|heic)(?:$|[?#])/i;

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

    function imageUrlsFromAttributes(element, baseUrl) {
        // Google, galleries and lazy loaders do not agree on a single original-image
        // attribute. Keep every safe candidate so a stale/broken first URL can fall
        // through to the next one during the actual Cmd+C request.
        const preferred = [
            "data-ou", "data-iurl", "data-original", "data-original-src", "data-original-url",
            "data-full", "data-full-src", "data-full-url", "data-image-url", "data-zoom-image",
            "data-src", "data-lazy-src", "data-lzy-src", "data-url",
        ];
        const results = [];
        const seen = new Set();
        for (const node of elementAndAncestors(element, 6)) {
            for (const name of preferred) {
                const value = node.getAttribute && node.getAttribute(name);
                const normalized = normalizeCandidateUrl(value, baseUrl);
                if (normalized && !isKnownGoogleThumbnail(normalized) && !seen.has(normalized)) {
                    seen.add(normalized);
                    results.push({ url: normalized, source: name });
                }
            }
        }
        return results;
    }

    function imageUrlFromAttributes(element, baseUrl) {
        return imageUrlsFromAttributes(element, baseUrl)[0] || null;
    }

    function imageSourceSet(element, baseUrl, includeDirectSource, excludeKnownGoogleThumbnails) {
        const sources = [];
        const seen = new Set();
        const shouldExcludeThumbnail = excludeKnownGoogleThumbnails !== false;
        const add = (raw, source) => {
            const normalized = normalizeCandidateUrl(raw, baseUrl);
            const isThumbnail = normalized && isKnownGoogleThumbnail(normalized);
            if (!normalized || (shouldExcludeThumbnail && isThumbnail) || seen.has(normalized)) return;
            seen.add(normalized);
            sources.push({ url: normalized, source, isThumbnailFallback: !shouldExcludeThumbnail && isThumbnail });
        };
        parseSrcset(element && element.getAttribute && element.getAttribute("srcset"), baseUrl)
            .forEach(candidate => add(candidate.url, "srcset"));
        const picture = element && element.closest && element.closest("picture");
        if (picture && picture.querySelectorAll) {
            picture.querySelectorAll("source[srcset]").forEach(node => {
                parseSrcset(node.getAttribute("srcset"), baseUrl).forEach(candidate => add(candidate.url, "picture-srcset"));
            });
        }
        if (includeDirectSource !== false) {
            add(element && element.currentSrc, "currentSrc");
            add(element && (element.src || (element.getAttribute && element.getAttribute("src"))), "src");
        }
        return sources;
    }

    function imageUrlsFromBackground(element, baseUrl) {
        if (!element) return [];
        const windowLike = element.ownerDocument && element.ownerDocument.defaultView;
        let value = "";
        try {
            value = windowLike && typeof windowLike.getComputedStyle === "function"
                ? windowLike.getComputedStyle(element).backgroundImage
                : element.style && element.style.backgroundImage;
        } catch (_) {}
        if (!value || value === "none") return [];
        const matches = String(value).matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi);
        const candidates = [];
        const seen = new Set();
        for (const match of matches) {
            const normalized = normalizeCandidateUrl(match[2], baseUrl);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            candidates.push({ url: normalized, source: "background-image" });
        }
        return candidates;
    }

    function imageUrlsFromMediaElement(element, baseUrl) {
        if (!element || !element.getAttribute) return [];
        const tagName = String(element.nodeName || "").toUpperCase();
        const entries = [];
        const add = (raw, source) => {
            const url = normalizeCandidateUrl(raw, baseUrl);
            if (url && !entries.some(candidate => candidate.url === url)) entries.push({ url, source });
        };
        if (tagName === "VIDEO") add(element.poster || element.getAttribute("poster"), "poster");
        if (tagName === "IMAGE") {
            add(element.href && element.href.baseVal, "svg-href");
            add(element.getAttribute("href"), "svg-href");
            add(element.getAttribute("xlink:href"), "svg-xlink-href");
        }
        return entries;
    }

    function documentUrlsFromElement(element, baseUrl) {
        if (!element || !element.getAttribute) return [];
        const tagName = String(element.nodeName || "").toUpperCase();
        const entries = [];
        const add = (raw, source, explicitDownload) => {
            const url = normalizeCandidateUrl(raw, baseUrl);
            if (url && (COPYABLE_FILE_URL_PATTERN.test(url) || explicitDownload || tagName === "OBJECT" || tagName === "EMBED" || tagName === "IFRAME") && !entries.some(candidate => candidate.url === url)) {
                entries.push({ url, source, documentCandidate: true });
            }
        };
        if (tagName === "OBJECT") add(element.data || element.getAttribute("data"), "object-data");
        if (tagName === "EMBED" || tagName === "IFRAME") add(element.src || element.getAttribute("src"), tagName.toLowerCase() + "-src");
        if (tagName === "A") add(element.href || element.getAttribute("href"), "document-link", element.hasAttribute("download"));
        const anchor = element.closest && element.closest("a[href]");
        if (anchor && anchor !== element) add(anchor.href, "document-link", anchor.hasAttribute("download"));
        return entries;
    }

    function isDocumentSurface(element) {
        if (!element || element.nodeType !== 1 || element.isConnected === false) return false;
        const tagName = String(element.nodeName || "").toUpperCase();
        if (tagName === "OBJECT" || tagName === "EMBED" || tagName === "IFRAME") return documentUrlsFromElement(element, element.ownerDocument && element.ownerDocument.baseURI).length > 0;
        if (tagName === "A" && element.hasAttribute("download")) return true;
        return documentUrlsFromElement(element, element.ownerDocument && element.ownerDocument.baseURI).length > 0;
    }

    function isCopySurface(element) {
        return isImageSurface(element) || isDocumentSurface(element);
    }

    function isImageSurface(element) {
        if (!element || element.nodeType !== 1 || element.isConnected === false) return false;
        const tagName = String(element.nodeName || "").toUpperCase();
        if (tagName === "IMG") return true;
        if (tagName === "VIDEO" && (element.poster || (element.getAttribute && element.getAttribute("poster")))) return true;
        if (tagName === "IMAGE" && element.getAttribute && (element.getAttribute("href") || element.getAttribute("xlink:href"))) return true;
        return imageUrlsFromBackground(element, element.ownerDocument && element.ownerDocument.baseURI).length > 0;
    }

    function isLikelyLoadedPreview(element) {
        if (!element) return false;
        const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
        const width = Number(element.clientWidth || element.width || (rect && rect.width) || 0);
        const height = Number(element.clientHeight || element.height || (rect && rect.height) || 0);
        // Google thumbnails are commonly external CDN URLs too. Only its visibly
        // expanded preview can safely act as a direct-source fallback.
        return width >= 320 || height >= 240;
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
                const resolved = settings.resolvePic(element) || {};
                const source = "picviewer:" + (resolved.type || "unknown");
                // Some Picviewer rules intentionally set src and imgSrc to the same
                // original URL. The old equality guard discarded that valid answer.
                add(resolved.src, source);
                if (Array.isArray(resolved.srcs)) resolved.srcs.forEach(url => add(url, source + "-srcs"));
                add(resolved.imgSrc, "picviewer-visible");
            } catch (_) {}
        }

        const anchor = element.closest && element.closest("a[href]");
        const fromLink = parseGoogleImageUrl(anchor && anchor.href, baseUrl);
        add(fromLink, "imgurl");

        const fromMetadata = imageUrlFromGoogleMetadata(element, settings.document || element.ownerDocument, baseUrl);
        if (fromMetadata) add(fromMetadata.url, fromMetadata.source, { width: fromMetadata.width, height: fromMetadata.height });

        imageUrlsFromAttributes(element, baseUrl).forEach(candidate => add(candidate.url, candidate.source));

        // A Google result can turn into a loaded, non-gstatic preview while its
        // metadata is still late. That visible source is safe to try; known Google
        // thumbnails remain explicitly excluded in imageSourceSet/add above.
        imageSourceSet(element, baseUrl, isLikelyLoadedPreview(element), true).forEach(candidate => add(candidate.url, candidate.source));
        // A Google result sometimes exposes only its encrypted thumbnail. It is not an
        // original, but it is still a real image the user can explicitly choose to copy.
        // Keep it strictly last and label it, so we never pretend it is high resolution.
        if (!candidates.length) {
            const thumbnail = normalizeCandidateUrl(element.currentSrc || element.src || (element.getAttribute && element.getAttribute("src")), baseUrl);
            if (thumbnail && isKnownGoogleThumbnail(thumbnail)) {
                candidates.push({ url: thumbnail, element, source: "google-thumbnail", isThumbnailFallback: true });
            }
        }
        return candidates;
    }

    function resolveGoogleImage(element, options) {
        return resolveGoogleImageCandidates(element, options)[0] || null;
    }

    function resolveQuickHoverImageCandidates(element, options) {
        const settings = options || {};
        if (!isCopySurface(element)) return [];
        const baseUrl = settings.baseUrl || (element.ownerDocument && element.ownerDocument.baseURI) || "https://example.invalid/";
        const candidates = [];
        const seen = new Set();
        const add = (url, source, extra) => {
            const normalized = normalizeCandidateUrl(url, baseUrl);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            candidates.push(Object.assign({ url: normalized, element, source }, extra || {}));
        };

        // Picviewer already knows how to resolve many site-specific previews. Prefer that
        // answer, but do not require a site rule: the visible image remains a safe fallback.
        if (String(element.nodeName).toUpperCase() === "IMG" && typeof settings.resolvePic === "function") {
            try {
                const resolved = settings.resolvePic(element) || {};
                add(resolved.src, "quickhover:" + (resolved.type || "resolved"));
                if (Array.isArray(resolved.srcs)) resolved.srcs.forEach(url => add(url, "quickhover-srcs"));
                add(resolved.imgSrc, "quickhover-visible");
            } catch (_) {}
        }

        imageUrlsFromAttributes(element, baseUrl).forEach(candidate => add(candidate.url, candidate.source));
        imageUrlsFromMediaElement(element, baseUrl).forEach(candidate => add(candidate.url, candidate.source));
        imageUrlsFromBackground(element, baseUrl).forEach(candidate => add(candidate.url, candidate.source));
        if (String(element.nodeName).toUpperCase() === "IMG") imageSourceSet(element, baseUrl, true, false).forEach(candidate => add(candidate.url, candidate.source, candidate));
        documentUrlsFromElement(element, baseUrl).forEach(candidate => add(candidate.url, candidate.source, candidate));
        return candidates;
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

    function isCopyableDeclaredType(mime) {
        if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") return true;
        return ALLOWED_IMAGE_TYPES.has(mime) || DOCUMENT_TYPES.has(mime) || mime.startsWith("image/");
    }

    function requestImageWithGM(url, gmRequest, options) {
        const settings = options || {};
        const maxBytes = settings.maxBytes || MAX_IMAGE_BYTES;
        const timeout = settings.timeout || REQUEST_TIMEOUT_MS;
        const maxRedirects = Number.isInteger(settings.maxRedirects) ? settings.maxRedirects : 5;
        const onProgress = typeof settings.onProgress === "function" ? settings.onProgress : null;
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
            const request = (requestUrl, redirectCount) => {
                requestHandle = gmRequest({
                    method: "GET",
                    url: requestUrl,
                    responseType: "blob",
                    anonymous: true,
                    // Do not let the privileged userscript fetch an unchecked redirect.
                    // Each Location is normalized (HTTPS + no private host) before its
                    // next request, which permits normal CDN migrations like Pixar → OpenUSD.
                    redirect: "manual",
                    timeout,
                    onprogress(progress) {
                        if (onProgress) onProgress(progress);
                        if (Number(progress.loaded || 0) <= maxBytes && (!progress.lengthComputable || Number(progress.total || 0) <= maxBytes)) return;
                        fail(new Error("Görsel " + Math.round(maxBytes / 1024 / 1024) + " MB güvenlik sınırını aşıyor"));
                        if (requestHandle && typeof requestHandle.abort === "function") requestHandle.abort();
                    },
                    onload(response) {
                        if (settled) return;
                        try {
                            const headers = parseResponseHeaders(response.responseHeaders);
                            if (response.status >= 300 && response.status < 400) {
                                if (redirectCount >= maxRedirects) throw new Error("Görsel çok fazla yönlendirme yaptı");
                                const nextUrl = normalizeCandidateUrl(headers.location, requestUrl);
                                if (!nextUrl) throw new Error("Görsel güvenli olmayan bir adrese yönlendirildi");
                                request(nextUrl, redirectCount + 1);
                                return;
                            }
                            if (response.status < 200 || response.status >= 300) throw new Error("Görsel isteği HTTP " + response.status + " döndürdü");
                            const finalUrl = normalizeCandidateUrl(response.finalUrl || requestUrl, requestUrl);
                            if (!finalUrl) throw new Error("Görsel güvenli olmayan bir adrese yönlendirildi");
                            const declaredLength = Number(headers["content-length"] || 0);
                            if (declaredLength > maxBytes) throw new Error("Görsel " + Math.round(maxBytes / 1024 / 1024) + " MB güvenlik sınırını aşıyor");
                            const blob = response.response;
                            if (!blob || typeof blob.size !== "number" || blob.size === 0) throw new Error("Görsel yanıtı boş");
                            if (blob.size > maxBytes) throw new Error("Görsel " + Math.round(maxBytes / 1024 / 1024) + " MB güvenlik sınırını aşıyor");
                            const mime = String(blob.type || headers["content-type"] || "").split(";", 1)[0].toLowerCase();
                            // Servers frequently label AI/PDF and newer image formats as
                            // octet-stream. Accept only potential media here; byte-signature
                            // validation happens before decoding below.
                            if (!isCopyableDeclaredType(mime)) throw new Error("Bu yanıt bir görsel veya belge değil: " + (mime || "bilinmiyor"));
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
            };
            request(safeUrl, 0);
        });
        return {
            promise,
            abort() {
                if (requestHandle && typeof requestHandle.abort === "function") requestHandle.abort();
            },
        };
    }

    function ascii(bytes, start, length) {
        return String.fromCharCode(...bytes.slice(start, start + length));
    }

    function hasPdfSignature(bytes) {
        // Illustrator files saved with PDF compatibility have a normal PDF header.
        return ascii(bytes, 0, 5) === "%PDF-";
    }

    function hasPostscriptSignature(bytes) {
        return ascii(bytes, 0, 2) === "%!" && /^(?:%!PS|%!Adobe)/.test(ascii(bytes, 0, 32));
    }

    async function detectClipboardAsset(blob) {
        const bytes = new Uint8Array(await blob.slice(0, 8192).arrayBuffer());
        const declared = String(blob.type || "").split(";", 1)[0].toLowerCase();
        const startsText = ascii(bytes, 0, Math.min(bytes.length, 512)).replace(/^\uFEFF/, "").trimStart();
        const raster = mime => ({ kind: "raster", mime, label: mime });
        if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return raster("image/png");
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return raster("image/jpeg");
        if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return raster("image/webp");
        if (bytes.length >= 10 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return raster("image/gif");
        if (bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) return raster("image/bmp");
        if (bytes.length >= 8 && bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2) && bytes[3] === 0) return raster("image/x-icon");
        if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
            const brand = ascii(bytes, 8, 4).toLowerCase();
            if (/^(?:avif|avis|mif1|msf1)$/.test(brand)) return raster("image/avif");
            if (/^(?:heic|heix|hevc|hevx)$/.test(brand)) return raster("image/heic");
        }
        if (/^<svg(?:\s|>)/i.test(startsText) || /^<\?xml[\s\S]{0,256}<svg(?:\s|>)/i.test(startsText)) return raster("image/svg+xml");
        if (hasPdfSignature(bytes)) return { kind: "pdf", mime: "application/pdf", label: declared === "application/illustrator" ? "AI (PDF uyumlu)" : "PDF" };
        if (hasPostscriptSignature(bytes)) return { kind: "postscript", mime: declared || "application/postscript", label: declared === "application/illustrator" || /illustrator/i.test(startsText) ? "AI/PostScript" : "PostScript/EPS" };
        if (ALLOWED_IMAGE_TYPES.has(declared)) return raster(declared);
        if (DOCUMENT_TYPES.has(declared)) return { kind: declared === "application/pdf" ? "pdf" : "postscript", mime: declared, label: declared };
        return { kind: "unknown", mime: declared || "bilinmiyor", label: declared || "bilinmeyen veri" };
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
        if (mime === "image/gif" && bytes.length >= 10 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
            return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
        }
        if (mime === "image/bmp" && bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
            const dibSize = view.getUint32(14, true);
            if (dibSize >= 40 && bytes.length >= 26) return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
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

    function createOutputCanvas(width, height, environment) {
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
        return { canvas, context };
    }

    async function canvasToPng(canvas, environment) {
        let png;
        if (typeof canvas.convertToBlob === "function") {
            png = await canvas.convertToBlob({ type: "image/png" });
        } else {
            png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG üretilemedi")), "image/png"));
        }
        if (!png || png.size > Number(environment.maxBytes || MAX_IMAGE_BYTES)) {
            throw new Error("Üretilen PNG güvenli boyut sınırını aşıyor");
        }
        return png;
    }

    async function imageBitmapToPng(bitmap, environment) {
        const width = bitmap.width;
        const height = bitmap.height;
        validateImageDimensions(width, height, environment);
        const output = createOutputCanvas(width, height, environment);
        output.context.drawImage(bitmap, 0, 0);
        return { blob: await canvasToPng(output.canvas, environment), width, height };
    }

    async function svgImageToPng(blob, environment) {
        const env = environment || {};
        const documentLike = env.document;
        const ImageCtor = env.Image || (documentLike && documentLike.defaultView && documentLike.defaultView.Image);
        const UrlCtor = env.URL || (typeof URL === "function" ? URL : null);
        if (!ImageCtor || !UrlCtor || typeof UrlCtor.createObjectURL !== "function" || typeof UrlCtor.revokeObjectURL !== "function") {
            throw new Error("Tarayıcı SVG dönüştürme yüzeyini desteklemiyor");
        }
        const objectUrl = UrlCtor.createObjectURL(blob);
        let image;
        try {
            image = await new Promise((resolve, reject) => {
                const candidate = new ImageCtor();
                candidate.onload = () => resolve(candidate);
                candidate.onerror = () => reject(new Error("SVG görsel olarak yüklenemedi"));
                candidate.src = objectUrl;
            });
            const width = Number(image.naturalWidth || image.width || 0);
            const height = Number(image.naturalHeight || image.height || 0);
            validateImageDimensions(width, height, env);
            const output = createOutputCanvas(width, height, env);
            output.context.drawImage(image, 0, 0, width, height);
            return { blob: await canvasToPng(output.canvas, env), width, height };
        } finally {
            UrlCtor.revokeObjectURL(objectUrl);
        }
    }

    async function normalizeImageToPng(blob, environment) {
        const env = environment || {};
        const probeDimensions = env.probeDimensions || probeRasterDimensions;
        const detected = env.detectAsset ? await env.detectAsset(blob) : await detectClipboardAsset(blob);
        if (!detected || detected.kind !== "raster") {
            throw new Error("Bu veri tarayıcıda çözülebilen bir görsel değil: " + (detected && detected.label || "bilinmiyor"));
        }
        const normalizedInput = blob.type === detected.mime ? blob : new Blob([blob], { type: detected.mime });
        try {
            const headerDimensions = await probeDimensions(normalizedInput);
            validateImageDimensions(headerDimensions.width, headerDimensions.height, env);
        } catch (error) {
            if (!["image/avif", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/heic"].includes(detected.mime)) throw error;
        }
        const createBitmap = env.createImageBitmap || (typeof createImageBitmap === "function" ? createImageBitmap : null);
        // Firefox/Zen can fetch an SVG but rejects it in createImageBitmap().
        // A blob URL loaded in an <img> is still same-origin to this isolated
        // userscript and lets the canvas produce the clipboard's PNG format.
        if (detected.mime === "image/svg+xml") {
            if (createBitmap) {
                try {
                    const bitmap = await createBitmap(normalizedInput);
                    try { return await imageBitmapToPng(bitmap, env); }
                    finally { if (typeof bitmap.close === "function") bitmap.close(); }
                } catch (_) {}
            }
            return svgImageToPng(normalizedInput, env);
        }
        if (!createBitmap) throw new Error("Tarayıcı görsel çözücüsü kullanılamıyor");
        let bitmap;
        try {
            bitmap = await createBitmap(normalizedInput);
        } catch (_) {
            throw new Error("Tarayıcı bu görsel biçimini çözemiyor: " + detected.mime);
        }
        try {
            validateImageDimensions(bitmap.width, bitmap.height, env);
            if (detected.mime === "image/png") return { blob: normalizedInput, width: bitmap.width, height: bitmap.height };
            return await imageBitmapToPng(bitmap, env);
        } finally {
            if (bitmap && typeof bitmap.close === "function") bitmap.close();
        }
    }

    let pdfModulePromise = null;
    let pdfWorkerUrl = null;

    function decodeBundledModule(base64) {
        if (typeof base64 !== "string" || !base64) return null;
        if (typeof atob !== "function" || typeof TextDecoder !== "function") throw new Error("PDF çözücü kodu okunamadı");
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new TextDecoder().decode(bytes);
    }

    async function loadBundledPdfJs(environment) {
        if (typeof globalThis !== "undefined" && globalThis.KoppyPdfjs) return globalThis.KoppyPdfjs;
        if (pdfModulePromise) return pdfModulePromise;
        const UrlCtor = environment.URL || (typeof URL === "function" ? URL : null);
        const BlobCtor = environment.Blob || (typeof Blob === "function" ? Blob : null);
        const source = environment.pdfModuleSource || decodeBundledModule(environment.pdfModuleBase64 || (typeof globalThis !== "undefined" && globalThis.KoppyPdfModuleBase64));
        if (!UrlCtor || !BlobCtor || !source) throw new Error("PDF çözücüsü yüklenemedi");
        const moduleUrl = UrlCtor.createObjectURL(new BlobCtor([source], { type: "text/javascript" }));
        pdfModulePromise = import(moduleUrl).then(pdfjsLib => {
            if (typeof globalThis !== "undefined") globalThis.KoppyPdfjs = pdfjsLib;
            return pdfjsLib;
        }).catch(error => {
            pdfModulePromise = null;
            throw error;
        }).finally(() => UrlCtor.revokeObjectURL(moduleUrl));
        return pdfModulePromise;
    }

    function ensurePdfWorker(environment, pdfjsLib) {
        if (!pdfjsLib.GlobalWorkerOptions) throw new Error("PDF çözücü worker ayarı kullanılamıyor");
        if (pdfWorkerUrl) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
            return;
        }
        const UrlCtor = environment.URL || (typeof URL === "function" ? URL : null);
        const BlobCtor = environment.Blob || (typeof Blob === "function" ? Blob : null);
        const source = environment.pdfWorkerSource || decodeBundledModule(environment.pdfWorkerBase64 || (typeof globalThis !== "undefined" && globalThis.KoppyPdfWorkerBase64));
        if (!UrlCtor || !BlobCtor || !source) throw new Error("PDF çözücü worker'ı başlatılamıyor");
        pdfWorkerUrl = UrlCtor.createObjectURL(new BlobCtor([source], { type: "text/javascript" }));
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    }

    async function renderPdfToPng(blob, environment) {
        const env = environment || {};
        const pdfjsLib = env.pdfjsLib || await loadBundledPdfJs(env);
        if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") throw new Error("PDF çözücüsü yüklenemedi");
        ensurePdfWorker(env, pdfjsLib);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let loadingTask;
        let documentProxy;
        try {
            loadingTask = pdfjsLib.getDocument({
                data: bytes,
                disableRange: true,
                disableStream: true,
                disableAutoFetch: true,
                isEvalSupported: false,
                useWorkerFetch: false,
                enableXfa: false,
                stopAtErrors: true,
            });
            documentProxy = await loadingTask.promise;
            const page = await documentProxy.getPage(1);
            const naturalViewport = page.getViewport({ scale: 1 });
            const naturalWidth = Number(naturalViewport.width);
            const naturalHeight = Number(naturalViewport.height);
            if (!naturalWidth || !naturalHeight) throw new Error("PDF ilk sayfa boyutu okunamadı");
            const maxDimension = Number(env.maxDimension || MAX_IMAGE_DIMENSION);
            const maxPixels = Number(env.maxPixels || MAX_IMAGE_PIXELS);
            const scale = Math.min(2, maxDimension / Math.max(naturalWidth, naturalHeight), Math.sqrt(maxPixels / (naturalWidth * naturalHeight)));
            if (!Number.isFinite(scale) || scale <= 0) throw new Error("PDF ilk sayfası güvenli piksel sınırını aşıyor");
            const viewport = page.getViewport({ scale });
            const width = Math.max(1, Math.ceil(viewport.width));
            const height = Math.max(1, Math.ceil(viewport.height));
            validateImageDimensions(width, height, env);
            const output = createOutputCanvas(width, height, env);
            await page.render({ canvasContext: output.context, viewport }).promise;
            return { blob: await canvasToPng(output.canvas, env), width, height, documentType: "pdf" };
        } catch (error) {
            const message = error && error.message ? error.message : "PDF çözülemedi";
            throw new Error("PDF ilk sayfası kopyalanamadı: " + message);
        } finally {
            if (documentProxy && typeof documentProxy.destroy === "function") await documentProxy.destroy();
            else if (loadingTask && typeof loadingTask.destroy === "function") await loadingTask.destroy();
        }
    }

    async function normalizeClipboardAssetToPng(blob, environment) {
        const detected = await detectClipboardAsset(blob);
        if (detected.kind === "raster") return normalizeImageToPng(blob, Object.assign({}, environment, { detectAsset: async () => detected }));
        if (detected.kind === "pdf") return renderPdfToPng(blob, environment);
        if (detected.kind === "postscript") {
            throw new Error(detected.label + " dosyası PDF uyumlu değil. Bu AI/EPS çeşidi tarayıcıda güvenli biçimde render edilemiyor");
        }
        throw new Error("Bilinmeyen dosya biçimi: " + detected.label);
    }

    function isEditableTarget(target) {
        if (!target || target.nodeType !== 1) return false;
        const name = String(target.localName || target.nodeName || "").toLowerCase();
        if (name === "input" || name === "textarea" || name === "select") return true;
        if (target.isContentEditable || target.getAttribute && target.getAttribute("contenteditable") === "true") return true;
        return Boolean(target.closest && target.closest("[contenteditable='true'], input, textarea, select"));
    }

    function isCopyGesture(event, windowLike, options) {
        const allowAlt = Boolean(options && options.allowAlt);
        if (!event || event.repeat || (!allowAlt && event.altKey) || event.shiftKey) return false;
        const platform = windowLike && windowLike.navigator && (windowLike.navigator.userAgentData && windowLike.navigator.userAgentData.platform || windowLike.navigator.platform || "");
        const modifier = /mac/i.test(String(platform)) ? event.metaKey : (event.metaKey || event.ctrlKey);
        // On a Turkish macOS layout ⌥C can report `key: "ç"`; the physical
        // key stays KeyC. Accept both so the collector shortcut is layout-safe.
        const isC = String(event.key || "").toLowerCase() === "c" || String(event.code || "") === "KeyC";
        if (!modifier || !isC) return false;
        if (isEditableTarget(event.target)) return false;
        const selection = windowLike && typeof windowLike.getSelection === "function" ? windowLike.getSelection() : null;
        return !(selection && String(selection).trim());
    }

    function isModifierRelease(event) {
        const key = String(event && event.key || "").toLowerCase();
        return key === "control" || key === "meta" || key === "alt" || key === "shift";
    }

    function isLikelyResultImage(image) {
        if (!isCopySurface(image)) return false;
        const rect = typeof image.getBoundingClientRect === "function" ? image.getBoundingClientRect() : null;
        const width = Number(image.clientWidth || image.width || (rect && rect.width) || 0);
        const height = Number(image.clientHeight || image.height || (rect && rect.height) || 0);
        // Keep ordinary UI chrome out, but a real visible image can be small
        // (logos, diagrams and inline SVG assets often are). Downloadable PDF/AI
        // links are intentionally text-sized too.
        if (isDocumentSurface(image)) return width >= 12 && height >= 12;
        return width >= 18 && height >= 18;
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
                    boxSizing: "border-box",
                    maxWidth: "min(86vw, 440px)",
                    textAlign: "center",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
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

    function createCopyFeedback(documentLike, windowLike) {
        let timer;
        let indicator;
        const doc = documentLike;
        const win = windowLike || (doc && doc.defaultView);

        function visibleRect(element) {
            if (!element || typeof element.getBoundingClientRect !== "function") return null;
            const rect = element.getBoundingClientRect();
            if (!rect || rect.width < 1 || rect.height < 1) return null;
            return rect;
        }

        function preferredTarget(source) {
            if (!doc || !source) return source;
            // Only a preview which literally contains the source can claim the
            // feedback. A global “latest preview” can belong to an earlier hover
            // and caused the bar/outline to jump across unrelated page graphics.
            const ownPreview = source.closest && source.closest(".pv-pic-window-container.preview");
            if (ownPreview) {
                const ownBox = ownPreview.querySelector(".pv-pic-window-imgbox");
                if (visibleRect(ownBox)) return ownBox;
            }
            return source;
        }

        function ensure() {
            if (!doc || !doc.documentElement) return null;
            if (indicator) return indicator;
            const root = doc.createElement("div");
            root.id = "koppy-copy-feedback";
            root.setAttribute("aria-live", "polite");
            root.setAttribute("aria-atomic", "true");
            Object.assign(root.style, {
                position: "fixed", display: "none", pointerEvents: "none", zIndex: "2147483647",
                height: "3px", borderRadius: "999px", overflow: "visible",
                background: "rgba(8, 14, 23, .64)", boxShadow: "0 1px 8px rgba(0,0,0,.28)",
            });
            const fill = doc.createElement("div");
            fill.className = "koppy-copy-feedback-fill";
            Object.assign(fill.style, {
                width: "0%", height: "100%", borderRadius: "inherit", background: "#7c9cff",
                transition: "width 160ms ease, background-color 160ms ease",
            });
            const label = doc.createElement("span");
            label.className = "koppy-copy-feedback-label";
            Object.assign(label.style, {
                position: "absolute", left: "0", bottom: "8px", whiteSpace: "nowrap",
                padding: "4px 7px", borderRadius: "6px", color: "#f4f7fb",
                background: "rgba(11, 14, 19, .86)", font: "600 11px/1.2 -apple-system, BlinkMacSystemFont, sans-serif",
                letterSpacing: ".01em", boxShadow: "0 3px 12px rgba(0,0,0,.22)",
            });
            const stackChip = doc.createElement("span");
            stackChip.className = "koppy-copy-feedback-stack";
            stackChip.setAttribute("aria-hidden", "true");
            Object.assign(stackChip.style, {
                position: "absolute", right: "0", bottom: "8px", display: "none", whiteSpace: "nowrap",
                padding: "4px 7px", borderRadius: "6px", color: "#dbe5ff", background: "rgba(38, 53, 87, .94)",
                border: "1px solid rgba(124,156,255,.55)", font: "700 11px/1.2 -apple-system, BlinkMacSystemFont, sans-serif",
                letterSpacing: ".01em", boxShadow: "0 3px 12px rgba(0,0,0,.22)", opacity: "0", transform: "translateY(4px)",
                transition: "opacity 180ms ease, transform 180ms ease",
            });
            root.append(fill, label, stackChip);
            doc.documentElement.appendChild(root);
            const sourceOutline = doc.createElement("div");
            sourceOutline.className = "koppy-copy-source-outline";
            Object.assign(sourceOutline.style, {
                position: "fixed", display: "none", pointerEvents: "none", zIndex: "2147483646",
                boxSizing: "border-box", border: "1.5px solid #7c9cff", borderRadius: "5px",
                boxShadow: "0 0 0 2px rgba(124,156,255,.17)", transition: "border-color 160ms ease, box-shadow 160ms ease",
            });
            doc.documentElement.appendChild(sourceOutline);
            indicator = { root, fill, label, stackChip, sourceOutline, element: null, source: null };
            return indicator;
        }

        function place(element, kind) {
            const item = ensure();
            if (!item || !element) return null;
            const target = preferredTarget(element);
            const rect = visibleRect(target);
            if (!rect) return null;
            const viewportWidth = Number(win && win.innerWidth || 0);
            const left = Math.max(4, Math.min(rect.left, Math.max(4, viewportWidth - 12)));
            const width = Math.max(20, Math.min(rect.width, Math.max(20, viewportWidth - left - 4)));
            Object.assign(item.root.style, {
                left: Math.round(left) + "px",
                top: Math.round(Math.max(4, rect.bottom - 4)) + "px",
                width: Math.round(width) + "px",
            });
            item.element = target;
            item.source = element;

            const sourceRect = visibleRect(element);
            if (sourceRect && target !== element) {
                const color = kind === "error" ? "#ff7185" : kind === "success" ? "#62cf91" : "#7c9cff";
                Object.assign(item.sourceOutline.style, {
                    display: "block",
                    left: Math.round(sourceRect.left - 2) + "px",
                    top: Math.round(sourceRect.top - 2) + "px",
                    width: Math.round(sourceRect.width + 4) + "px",
                    height: Math.round(sourceRect.height + 4) + "px",
                    borderColor: color,
                    boxShadow: "0 0 0 2px " + (kind === "error" ? "rgba(255,113,133,.16)" : kind === "success" ? "rgba(98,207,145,.16)" : "rgba(124,156,255,.17)"),
                });
            } else {
                item.sourceOutline.style.display = "none";
            }
            return item;
        }

        function show(element, label, percent, kind) {
            const item = place(element, kind);
            if (!item) return;
            clearTimeout(timer);
            item.label.textContent = label;
            item.stackChip.style.display = "none";
            item.stackChip.style.opacity = "0";
            item.stackChip.style.transform = "translateY(4px)";
            item.root.style.display = "block";
            item.fill.style.background = kind === "error" ? "#ff7185" : kind === "success" ? "#62cf91" : "#7c9cff";
            item.fill.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + "%";
        }

        return {
            start(element) { show(element, "Kopyalanıyor", 12, "progress"); },
            progress(element, fraction) { show(element, "Kopyalanıyor", 12 + Math.max(0, Math.min(1, Number(fraction) || 0)) * 76, "progress"); },
            decoding(element) { show(element, "Panoya hazırlanıyor", 92, "progress"); },
            complete(element, width, height, isThumbnailFallback, stackResult) {
                const stackCount = stackResult && stackResult.added && stackResult.state && Number(stackResult.state.count);
                const copiedLabel = (isThumbnailFallback ? "Önizleme kopyalandı · " : "Kopyalandı · ") + width + "×" + height;
                show(element, copiedLabel, 100, "success");
                if (stackCount && indicator) {
                    indicator.stackChip.textContent = "+1 Stack · " + stackCount + " görsel";
                    indicator.stackChip.style.display = "block";
                    const reducedMotion = win && typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    if (reducedMotion) {
                        indicator.stackChip.style.opacity = "1";
                        indicator.stackChip.style.transform = "none";
                    } else {
                        const reveal = () => {
                            if (!indicator) return;
                            indicator.stackChip.style.opacity = "1";
                            indicator.stackChip.style.transform = "translateY(0)";
                        };
                        if (win && typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(reveal);
                        else setTimeout(reveal, 0);
                    }
                }
                timer = setTimeout(() => {
                    if (!indicator) return;
                    indicator.root.style.display = "none";
                    indicator.stackChip.style.display = "none";
                    indicator.sourceOutline.style.display = "none";
                }, 1500);
            },
            fail(element, message) {
                show(element, message || "Kopyalanamadı", 100, "error");
                timer = setTimeout(() => {
                    if (!indicator) return;
                    indicator.root.style.display = "none";
                    indicator.stackChip.style.display = "none";
                    indicator.sourceOutline.style.display = "none";
                }, 2400);
            },
        };
    }

    function createStackCursorCollector(documentLike, windowLike, options) {
        const doc = documentLike;
        const win = windowLike || (doc && doc.defaultView);
        const onAccept = options && options.onAccept;
        let root;
        let label;
        let companion = null;
        let lastPointer = null;
        let mode = "follow";
        let visibleCount = 0;
        let pointerOver = false;
        let hoverTimer;
        let selectionTimer;

        function reducedMotion() {
            return Boolean(win && typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
        }

        function ensure() {
            if (root || !doc || !doc.documentElement) return root;
            root = doc.createElement("button");
            root.type = "button";
            root.id = "koppy-stack-cursor";
            root.setAttribute("aria-label", "Son kopyaları hazırla");
            root.title = "Yaklaşınca sabitlenir · tıkla: son kopyaları seç";
            Object.assign(root.style, {
                position: "fixed", display: "none", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none",
                minWidth: "44px", minHeight: "36px", padding: "0 10px", borderRadius: "999px", border: "1px solid rgba(124,156,255,.72)",
                color: "#eff3ff", background: "rgba(38,53,87,.94)", boxShadow: "0 5px 16px rgba(0,0,0,.25)",
                font: "700 11px/1 -apple-system, BlinkMacSystemFont, sans-serif", whiteSpace: "nowrap", cursor: "default",
                transform: "translate(-50%, -50%) scale(.92)", opacity: "0", transition: "left 105ms cubic-bezier(.2,.8,.2,1), top 105ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease, transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
            });
            label = doc.createElement("span");
            root.appendChild(label);
            root.addEventListener("pointerenter", () => {
                pointerOver = true;
                beginCaptureIntent();
            });
            root.addEventListener("pointerleave", event => {
                pointerOver = false;
                clearTimeout(hoverTimer);
                hoverTimer = null;
                // A candidate or captured badge must never strand itself at its
                // old world position. Leaving it immediately resumes follow.
                releaseToFollow({ x: event.clientX, y: event.clientY });
            });
            root.addEventListener("click", event => {
                if (mode !== "capture" || !visibleCount || typeof onAccept !== "function") return;
                event.preventDefault();
                onAccept(visibleCount);
                acknowledgeSelection();
            });
            doc.documentElement.appendChild(root);
            return root;
        }

        function place(point) {
            const item = ensure();
            if (!item || !point) return null;
            item.style.left = Math.round(point.x) + "px";
            item.style.top = Math.round(point.y) + "px";
            return item;
        }

        function updateVisual() {
            if (!root) return;
            const captured = mode === "capture";
            const approaching = mode === "approach";
            root.style.pointerEvents = captured || approaching ? "auto" : "none";
            root.style.cursor = captured ? "pointer" : "default";
            root.style.transform = "translate(-50%, -50%) scale(" + (captured ? (pointerOver ? "1.1" : "1") : approaching ? ".96" : ".92") + ")";
            root.style.borderColor = captured ? (pointerOver ? "rgba(221,229,255,1)" : "rgba(173,194,255,.98)") : approaching ? "rgba(147,174,255,.9)" : "rgba(124,156,255,.72)";
            root.style.background = captured && pointerOver ? "rgba(66,91,149,.98)" : "rgba(38,53,87,.94)";
            root.style.boxShadow = captured ? "0 0 0 " + (pointerOver ? "7" : "5") + "px rgba(124,156,255,.17), 0 7px 20px rgba(0,0,0,.30)" : approaching ? "0 0 0 3px rgba(124,156,255,.11), 0 5px 16px rgba(0,0,0,.25)" : "0 5px 16px rgba(0,0,0,.25)";
        }

        function show(pointer, count) {
            if (!pointer || Number(count) < 2) return hide();
            const item = ensure();
            if (!item) return;
            visibleCount = Number(count) || 0;
            if (!selectionTimer) label.textContent = "▣ " + visibleCount;
            item.setAttribute("aria-label", visibleCount + " son kopyayı seç");
            if (!companion) companion = { x: Number(pointer.x) + 34, y: Number(pointer.y) + 28 };
            place(companion);
            item.style.display = "block";
            item.style.opacity = "1";
            updateVisual();
        }

        function hide() {
            if (!root) return;
            root.style.display = "none";
            root.style.opacity = "0";
            companion = null;
            lastPointer = null;
            visibleCount = 0;
            mode = "follow";
            pointerOver = false;
            clearTimeout(hoverTimer);
            hoverTimer = null;
            clearTimeout(selectionTimer);
            selectionTimer = null;
        }

        function movingToward(pointer) {
            if (!lastPointer || !companion) return false;
            const velocityX = Number(pointer.x) - Number(lastPointer.x);
            const velocityY = Number(pointer.y) - Number(lastPointer.y);
            const toBadgeX = companion.x - Number(pointer.x);
            const toBadgeY = companion.y - Number(pointer.y);
            const speed = Math.hypot(velocityX, velocityY);
            const distance = Math.hypot(toBadgeX, toBadgeY);
            const previousDistance = Math.hypot(companion.x - Number(lastPointer.x), companion.y - Number(lastPointer.y));
            // The user may land directly on the badge, where the direction vector
            // becomes zero. A closing distance is still an intentional catch.
            if (distance < 54 && previousDistance > distance + .5) return true;
            if (speed < 1.5 || distance > 150) return false;
            return velocityX * toBadgeX + velocityY * toBadgeY > speed * distance * .32;
        }

        function movingAway(pointer) {
            if (!lastPointer || !companion) return false;
            const velocityX = Number(pointer.x) - Number(lastPointer.x);
            const velocityY = Number(pointer.y) - Number(lastPointer.y);
            const toBadgeX = companion.x - Number(pointer.x);
            const toBadgeY = companion.y - Number(pointer.y);
            const speed = Math.hypot(velocityX, velocityY);
            const distance = Math.hypot(toBadgeX, toBadgeY);
            return speed > 1.5 && distance > 58 && velocityX * toBadgeX + velocityY * toBadgeY < 0;
        }

        function beginCaptureIntent() {
            if (mode !== "approach" || !pointerOver || hoverTimer) return;
            hoverTimer = setTimeout(() => {
                hoverTimer = null;
                if (mode !== "approach" || !pointerOver) return;
                mode = "capture";
                updateVisual();
            }, reducedMotion() ? 0 : 110);
        }

        function releaseToFollow(pointer) {
            if (!companion || !pointer) return;
            mode = "follow";
            pointerOver = false;
            clearTimeout(hoverTimer);
            hoverTimer = null;
            const nextPointer = { x: Number(pointer.x) || 0, y: Number(pointer.y) || 0 };
            // Snap the virtual spring near the exit point. The next document
            // pointermove continues the companion motion without a dead zone.
            companion.x = nextPointer.x + 34;
            companion.y = nextPointer.y + 28;
            lastPointer = nextPointer;
            place(companion);
            updateVisual();
        }

        function acknowledgeSelection() {
            if (!root || !label) return;
            clearTimeout(selectionTimer);
            label.textContent = "✓ " + visibleCount;
            root.style.background = "rgba(31,112,73,.98)";
            selectionTimer = setTimeout(() => {
                selectionTimer = null;
                if (!label) return;
                label.textContent = "▣ " + visibleCount;
                updateVisual();
            }, reducedMotion() ? 0 : 850);
        }

        function move(pointer, state) {
            if (!state || Number(state.count) < 2) return hide();
            show(pointer, state.count);
            if (!root || !companion) return;
            const nextPointer = { x: Number(pointer.x) || 0, y: Number(pointer.y) || 0 };
            const distance = Math.hypot(companion.x - nextPointer.x, companion.y - nextPointer.y);
            if (mode === "follow" && movingToward(nextPointer)) mode = "approach";
            else if (mode === "approach" && !pointerOver && (distance > 118 || movingAway(nextPointer))) releaseToFollow(nextPointer);
            if (mode === "follow") {
                const target = { x: nextPointer.x + 34, y: nextPointer.y + 28 };
                const strength = reducedMotion() ? 1 : .42;
                companion.x += (target.x - companion.x) * strength;
                companion.y += (target.y - companion.y) * strength;
            }
            place(companion);
            updateVisual();
            lastPointer = nextPointer;
        }

        return {
            show,
            hide,
            move,
            capture() {
                mode = "capture";
                updateVisual();
            },
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
        const diagnostics = deps.diagnostics || (typeof globalThis !== "undefined" && globalThis.KoppyDiagnostics);
        function diagnostic(event, fields) {
            if (diagnostics && typeof diagnostics.record === "function") diagnostics.record(event, fields);
        }
        function errorKind(cause) {
            const message = String(cause && cause.message || "").toLowerCase();
            if (/iptal|abort|cancel/.test(message)) return "cancelled";
            if (/zaman|timeout/.test(message)) return "timeout";
            if (/http|403|404|yanıt/.test(message)) return "response";
            if (/görsel|png|decode|format|mime|belge/.test(message)) return "decode";
            return "unknown";
        }
        const documentLike = deps.document;
        const windowLike = deps.window || (documentLike && documentLike.defaultView);
        const locationLike = deps.location || (windowLike && windowLike.location);
        const navigatorLike = deps.navigator || (windowLike && windowLike.navigator);
        const ClipboardItemCtor = deps.ClipboardItem || (windowLike && windowLike.ClipboardItem);
        const notify = deps.notify || createToast(documentLike);
        const feedback = deps.feedback || createCopyFeedback(documentLike, windowLike);
        const normalizeImage = deps.normalizeImage || (blob => normalizeClipboardAssetToPng(blob, {
            createImageBitmap: windowLike && windowLike.createImageBitmap && windowLike.createImageBitmap.bind(windowLike),
            OffscreenCanvas: windowLike && windowLike.OffscreenCanvas,
            document: documentLike,
            Worker: windowLike && windowLike.Worker,
            URL: windowLike && windowLike.URL,
            Image: windowLike && windowLike.Image,
            Blob: windowLike && windowLike.Blob,
            pdfjsLib: deps.pdfjsLib,
            pdfModuleSource: deps.pdfModuleSource,
            pdfModuleBase64: deps.pdfModuleBase64,
            pdfWorkerSource: deps.pdfWorkerSource,
            pdfWorkerBase64: deps.pdfWorkerBase64,
            maxBytes: deps.maxBytes || MAX_IMAGE_BYTES,
            maxPixels: deps.maxPixels || MAX_IMAGE_PIXELS,
            maxDimension: deps.maxDimension || MAX_IMAGE_DIMENSION,
        }));
        const requestImage = deps.requestImage || ((url, onProgress) => requestImageWithGM(url, deps.gmRequest, {
            maxBytes: deps.maxBytes || MAX_IMAGE_BYTES,
            timeout: deps.timeout || REQUEST_TIMEOUT_MS,
            onProgress,
        }));
        let current = null;
        let activeCopy = null;
        let activePreview = null;
        let documentPreview = null;
        let lastPointer = null;
        let started = false;
        const stack = {
            items: [],
            bytes: 0,
            accepted: false,
            delivering: false,
            listeners: new Set(),
        };
        const stackCursor = createStackCursorCollector(documentLike, windowLike, { onAccept: acceptStack });

        function stackState() {
            return {
                // Kept for older integrations. Recent Copies has no armed mode,
                // cooldown or automatic clipboard action.
                enabled: false,
                parked: false,
                count: stack.items.length,
                bytes: stack.bytes,
                ready: stack.items.length >= 2,
                accepted: stack.accepted,
                delivering: stack.delivering,
                maxItems: MAX_STACK_ITEMS,
                maxBytes: MAX_STACK_BYTES,
            };
        }

        function emitStackChange() {
            const state = stackState();
            stack.listeners.forEach(listener => {
                try { listener(state); } catch (_) {}
            });
            return state;
        }

        function clearStack() {
            // Blob references are the only retained resources. Dropping the array
            // releases them for garbage collection and deliberately leaves macOS'
            // existing clipboard untouched.
            stack.items = [];
            stack.bytes = 0;
            stack.accepted = false;
            stack.delivering = false;
            stackCursor.hide();
            diagnostic("stack_cleared", { imageCount: 0, totalBytes: 0 });
            return emitStackChange();
        }

        function addToStack(prepared) {
            const blob = prepared && prepared.blob;
            const bytes = Math.max(0, Number(blob && blob.size) || 0);
            if (!blob || bytes > MAX_STACK_BYTES) {
                return { added: false, reason: "byte-limit", state: stackState() };
            }
            // Normal Cmd+C still refreshes the macOS clipboard every time. Recent
            // Copies is a later, opt-in batch decision, so retrying the same source
            // must not silently inflate it with duplicate cards.
            const fingerprint = String(prepared && prepared.candidateUrl || "") + "|" + Number(prepared && prepared.width || 0) + "x" + Number(prepared && prepared.height || 0);
            if (fingerprint && stack.items.some(item => item.fingerprint === fingerprint)) {
                return { added: false, reason: "duplicate", state: stackState() };
            }
            let evicted = 0;
            while (stack.items.length && (stack.items.length >= MAX_STACK_ITEMS || stack.bytes + bytes > MAX_STACK_BYTES)) {
                const oldest = stack.items.shift();
                stack.bytes -= Number(oldest && oldest.bytes) || 0;
                evicted += 1;
            }
            stack.items.push({
                blob,
                bytes,
                width: prepared.width,
                height: prepared.height,
                source: prepared.source,
                fingerprint,
                isThumbnailFallback: Boolean(prepared.isThumbnailFallback),
            });
            stack.bytes += bytes;
            stack.accepted = false;
            stack.delivering = false;
            diagnostic("stack_added", { imageCount: stack.items.length, totalBytes: stack.bytes, width: prepared.width, height: prepared.height, candidateSource: prepared.source || "unknown" });
            return { added: true, evicted, state: emitStackChange() };
        }

        function acceptStack() {
            if (stack.items.length < 2) return stackState();
            diagnostic("stack_delivery_start", { imageCount: stack.items.length, totalBytes: stack.bytes });
            stackCursor.capture();
            if (typeof deps.onRecentCopiesAccepted !== "function") {
                diagnostic("stack_delivery_failed", { imageCount: stack.items.length, errorKind: "bridge-missing", errorCode: "bridge-unavailable" });
                notify("Koppy Bridge: yerel pano yardımcısı kurulu değil", "error");
                return stackState();
            }
            let output;
            try {
                output = deps.onRecentCopiesAccepted(stack.items.slice(), stackState());
            } catch (cause) {
                diagnostic("stack_delivery_failed", { imageCount: stack.items.length, errorKind: errorKind(cause) });
                const message = cause && cause.message || "çoklu pano yazımı başlatılamadı";
                notify("Koppy: " + message, "error");
                return stackState();
            }
            if (!output || typeof output.then !== "function") {
                stack.accepted = true;
                stack.delivering = false;
                const state = emitStackChange();
                notify(state.count + " görsel panoda · tek ⌘V ile yapıştır", "success");
                diagnostic("stack_delivery_complete", { imageCount: state.count, totalBytes: stack.bytes });
                return state;
            }
            stack.accepted = false;
            stack.delivering = true;
            const pending = emitStackChange();
            notify(pending.count + " görsel gerçek panoya aktarılıyor…", "progress");
            return output.then(result => {
                stack.delivering = false;
                stack.accepted = true;
                const state = emitStackChange();
                const count = Number(result && result.count) || state.count;
                notify(count + " görsel panoda · tek ⌘V ile yapıştır", "success");
                diagnostic("stack_delivery_complete", { imageCount: count, totalBytes: stack.bytes });
                return state;
            }).catch(cause => {
                stack.delivering = false;
                stack.accepted = false;
                const state = emitStackChange();
                const message = cause && cause.message || "çoklu pano yazılamadı";
                notify("Koppy: " + message, "error");
                diagnostic("stack_delivery_failed", { imageCount: stack.items.length, totalBytes: stack.bytes, errorKind: errorKind(cause) });
                return Object.assign({ failed: true, error: message }, state);
            });
        }

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
            closeDocumentPreview();
        }

        function isDocumentPreviewGesture(event) {
            if (typeof deps.isPreviewGesture === "function") {
                try { return Boolean(deps.isPreviewGesture(event)); } catch (_) { return false; }
            }
            const platform = windowLike && windowLike.navigator && (windowLike.navigator.userAgentData && windowLike.navigator.userAgentData.platform || windowLike.navigator.platform || "");
            return /mac/i.test(String(platform)) ? Boolean(event && event.metaKey) : Boolean(event && event.ctrlKey);
        }

        function ensureDocumentPreview() {
            if (!documentLike || !documentLike.documentElement) return null;
            if (documentPreview) return documentPreview;
            const root = documentLike.createElement("div");
            root.id = "koppy-document-preview";
            root.setAttribute("aria-live", "polite");
            Object.assign(root.style, {
                position: "fixed", display: "none", pointerEvents: "none", zIndex: "2147483645",
                boxSizing: "border-box", padding: "8px", borderRadius: "10px", overflow: "hidden",
                background: "rgba(11, 14, 19, .94)", border: "1px solid rgba(124,156,255,.58)",
                boxShadow: "0 12px 34px rgba(0,0,0,.38)", color: "#f4f7fb",
                font: "600 11px/1.25 -apple-system, BlinkMacSystemFont, sans-serif",
            });
            const image = documentLike.createElement("img");
            image.alt = "";
            Object.assign(image.style, { display: "none", maxWidth: "440px", maxHeight: "330px", objectFit: "contain", background: "#fff", borderRadius: "5px" });
            const label = documentLike.createElement("div");
            Object.assign(label.style, { marginTop: "7px", whiteSpace: "nowrap" });
            root.append(image, label);
            documentLike.documentElement.appendChild(root);
            documentPreview = { root, image, label, objectUrl: null };
            return documentPreview;
        }

        function placeDocumentPreview(item) {
            if (!item || !item.root || !lastPointer) return;
            const viewportWidth = Number(windowLike && windowLike.innerWidth || 0);
            const viewportHeight = Number(windowLike && windowLike.innerHeight || 0);
            const width = Math.max(180, Math.min(456, Number(item.root.offsetWidth || 260)));
            const height = Math.max(38, Math.min(Math.max(38, viewportHeight - 12), Number(item.root.offsetHeight || 44)));
            const preferRight = lastPointer.x + 18 + width <= viewportWidth - 8;
            const left = preferRight ? lastPointer.x + 18 : Math.max(8, lastPointer.x - width - 18);
            const top = Math.max(8, Math.min(lastPointer.y + 16, Math.max(8, viewportHeight - height - 8)));
            item.root.style.left = Math.round(left) + "px";
            item.root.style.top = Math.round(top) + "px";
        }

        function closeDocumentPreview() {
            if (activePreview) cancelState(activePreview);
            activePreview = null;
            if (typeof deps.hideDocumentPreview === "function") {
                try { deps.hideDocumentPreview(); } catch (_) {}
            }
            if (!documentPreview) return;
            if (documentPreview.objectUrl && windowLike && windowLike.URL && typeof windowLike.URL.revokeObjectURL === "function") {
                windowLike.URL.revokeObjectURL(documentPreview.objectUrl);
            }
            documentPreview.objectUrl = null;
            documentPreview.image.removeAttribute("src");
            documentPreview.image.style.display = "none";
            documentPreview.root.style.display = "none";
        }

        async function previewHoveredDocument() {
            if (!current || !current.candidates.length || !isDocumentSurface(current.element) || activePreview) return;
            const state = {
                element: current.element,
                candidates: current.candidates.slice(),
                activeRequest: null,
                cancelled: false,
            };
            activePreview = state;
            const nativePreview = typeof deps.showDocumentPreview === "function";
            const preview = nativePreview ? null : ensureDocumentPreview();
            if (preview) {
                preview.image.style.display = "none";
                preview.label.textContent = "Belge önizlemesi hazırlanıyor…";
                preview.root.style.display = "block";
                placeDocumentPreview(preview);
            }
            let lastError = null;
            try {
                for (const candidate of state.candidates) {
                    if (state.cancelled) return;
                    try {
                        const request = requestImage(candidate.url);
                        state.activeRequest = request;
                        const downloaded = await request.promise;
                        state.activeRequest = null;
                        if (state.cancelled) return;
                        const prepared = await normalizeImage(downloaded.blob);
                        if (state.cancelled) return;
                        if (nativePreview) {
                            try {
                                if (deps.showDocumentPreview({ blob: prepared.blob, element: state.element, pointer: lastPointer })) return;
                            } catch (_) {}
                        }
                        if (!preview) throw new Error("Tarayıcı belge önizlemesini desteklemiyor");
                        const objectUrl = windowLike && windowLike.URL && typeof windowLike.URL.createObjectURL === "function"
                            ? windowLike.URL.createObjectURL(prepared.blob) : null;
                        if (!objectUrl) throw new Error("Tarayıcı belge önizlemesini desteklemiyor");
                        if (preview.objectUrl) windowLike.URL.revokeObjectURL(preview.objectUrl);
                        preview.objectUrl = objectUrl;
                        preview.image.src = objectUrl;
                        preview.image.style.display = "block";
                        preview.label.textContent = "Belge önizlemesi · ⌘C ile kopyala";
                        placeDocumentPreview(preview);
                        return;
                    } catch (error) {
                        state.activeRequest = null;
                        if (state.cancelled) return;
                        lastError = error;
                    }
                }
                if (!state.cancelled) {
                    preview.label.textContent = "Belge önizlenemedi";
                    placeDocumentPreview(preview);
                    if (lastError) notify("Koppy: " + (lastError.message || "Belge önizlenemedi"), "error");
                }
            } finally {
                if (activePreview === state) activePreview = null;
            }
        }

        function resolveCandidates(image) {
            if (!isGoogleImagesLocation(locationLike)) {
                return resolveQuickHoverImageCandidates(image, {
                    resolvePic: deps.resolvePic,
                    baseUrl: locationLike && locationLike.href,
                });
            }
            return resolveGoogleImageCandidates(image, {
                resolvePic: deps.resolvePic,
                baseUrl: locationLike && locationLike.href,
                document: documentLike,
            });
        }

        function setHoveredImage(image, force) {
            if (!isLikelyResultImage(image)) {
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
                isGoogleResult: isGoogleImagesLocation(locationLike) && isGoogleResultImage(image),
            };
            diagnostic("candidate_resolved", { imageCount: candidates.length, candidateSource: candidates[0] && candidates[0].source || "none", candidateKind: current.isGoogleResult ? "google" : "page" });
        }

        function pointerInsideCurrent() {
            if (!current || !current.element || !lastPointer || typeof current.element.getBoundingClientRect !== "function") return Boolean(current);
            const rect = current.element.getBoundingClientRect();
            return lastPointer.x >= rect.left && lastPointer.x <= rect.right && lastPointer.y >= rect.top && lastPointer.y <= rect.bottom;
        }

        function surfaceFromNodes(nodes) {
            for (const node of nodes || []) {
                if (isCopySurface(node)) return node;
            }
            return null;
        }

        function nearestImageSurface(node) {
            let current = node;
            let remaining = 8;
            while (current && remaining-- > 0) {
                if (isCopySurface(current)) return current;
                current = current.parentElement || (current.getRootNode && current.getRootNode().host) || null;
            }
            return null;
        }

        function deepElementFromPoint(rootNode, x, y) {
            if (!rootNode || typeof rootNode.elementFromPoint !== "function") return null;
            let target = rootNode.elementFromPoint(x, y);
            while (target && target.shadowRoot && typeof target.shadowRoot.elementFromPoint === "function") {
                const nested = target.shadowRoot.elementFromPoint(x, y);
                if (!nested || nested === target) break;
                target = nested;
            }
            return target;
        }

        function imageAtPointer(event) {
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            let image = surfaceFromNodes(path);
            if (!image) image = nearestImageSurface(event.target);
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
            const target = deepElementFromPoint(documentLike, lastPointer.x, lastPointer.y);
            return imageAtPointer({
                target,
                clientX: lastPointer.x,
                clientY: lastPointer.y,
                composedPath() {
                    const path = [];
                    let current = target;
                    while (current) {
                        path.push(current);
                        current = current.parentElement || (current.getRootNode && current.getRootNode().host) || null;
                    }
                    return path;
                },
            });
        }

        function refreshRoute() { cancelAll(); }

        function onPointerMove(event) {
            lastPointer = { x: event.clientX, y: event.clientY };
            stackCursor.move(lastPointer, stackState());
            const image = imageAtPointer(event);
            if (image) {
                setHoveredImage(image, false);
                if (isDocumentPreviewGesture(event)) void previewHoveredDocument();
            }
            else if (!pointerInsideCurrent()) cancelCurrent();
        }

        async function prepareFromCandidates(state) {
            let lastError = null;
            for (const candidate of state.candidates) {
                if (state.cancelled) throw new Error("Görsel hazırlama iptal edildi");
                try {
                    diagnostic("candidate_attempt", { candidateSource: candidate.source || "unknown", candidateKind: candidate.isThumbnailFallback ? "thumbnail" : "primary" });
                    const request = requestImage(candidate.url, progress => {
                        if (!progress || !progress.lengthComputable || !progress.total) return;
                        feedback.progress(state.element, Number(progress.loaded || 0) / Number(progress.total));
                    });
                    state.activeRequest = request;
                    const downloaded = await request.promise;
                    state.activeRequest = null;
                    if (state.cancelled) throw new Error("Görsel hazırlama iptal edildi");
                    feedback.decoding(state.element);
                    const prepared = await normalizeImage(downloaded.blob);
                    if (state.cancelled) throw new Error("Görsel hazırlama iptal edildi");
                    diagnostic("candidate_prepared", { candidateSource: candidate.source || "unknown", mime: downloaded.blob && downloaded.blob.type || "unknown", width: prepared.width, height: prepared.height, totalBytes: prepared.blob && prepared.blob.size || 0 });
                    return Object.assign({ source: candidate.source, candidateUrl: candidate.url, isThumbnailFallback: Boolean(candidate.isThumbnailFallback) }, prepared);
                } catch (error) {
                    state.activeRequest = null;
                    if (state.cancelled) throw error;
                    diagnostic("candidate_failed", { candidateSource: candidate.source || "unknown", errorKind: errorKind(error) });
                    lastError = error;
                }
            }
            throw lastError || new Error("Orijinal görsel adresi bulunamadı");
        }

        async function copyHoveredImage(event) {
            if (!isCopyGesture(event, windowLike)) {
                return { status: "not-applicable" };
            }
            const copyFlowId = diagnostics && typeof diagnostics.flowId === "function" ? diagnostics.flowId() : "copy";
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
                diagnostic("copy_failed", { flowId: copyFlowId, errorKind: "busy", errorCode: "copy-in-progress" });
                return { status: "failed", reason: "copy-in-progress" };
            }
            setHoveredImage(current.element, true);
            if (!current || !current.candidates.length) {
                if (!current || !current.isGoogleResult) return { status: "not-applicable" };
                event.preventDefault();
                if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
                else if (typeof event.stopPropagation === "function") event.stopPropagation();
                notify("Koppy: Orijinal görsel adresi bulunamadı", "error");
                diagnostic("copy_failed", { flowId: copyFlowId, errorKind: "candidate", errorCode: "candidate-not-found" });
                return { status: "failed", reason: "candidate-not-found" };
            }

            event.preventDefault();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            else if (typeof event.stopPropagation === "function") event.stopPropagation();

            if (!navigatorLike || !navigatorLike.clipboard || typeof navigatorLike.clipboard.write !== "function" || !ClipboardItemCtor) {
                notify("Koppy: Tarayıcı resim panosunu desteklemiyor", "error");
                diagnostic("copy_failed", { flowId: copyFlowId, errorKind: "clipboard", errorCode: "clipboard-unavailable" });
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
            diagnostic("copy_start", { flowId: copyFlowId, imageCount: copyState.candidates.length, candidateSource: copyState.candidate && copyState.candidate.source || "unknown" });
            feedback.start(copyState.element);
            notify("Koppy: Görsel hazırlanıyor…", "progress");
            const preparedPromise = prepareFromCandidates(copyState);
            try {
                const clipboardBlobPromise = preparedPromise.then(result => result.blob);
                clipboardBlobPromise.catch(() => {});
                const writePromise = Promise.resolve(navigatorLike.clipboard.write([
                    new ClipboardItemCtor({ "image/png": clipboardBlobPromise }),
                ]));
                const [prepared] = await Promise.all([preparedPromise, writePromise]);
                const stacked = addToStack(prepared);
                // Normal Cmd+C remains visually and behaviorally a normal copy.
                // The only passive affordance is the calm two-or-more Copies badge.
                feedback.complete(copyState.element, prepared.width, prepared.height, prepared.isThumbnailFallback, null);
                if (stacked.added && stacked.state.count >= 2) stackCursor.show(lastPointer, stacked.state.count);
                let message = (prepared.isThumbnailFallback ? "Önizleme kopyalandı: " : "Kopyalandı: ") + prepared.width + "×" + prepared.height;
                if (stacked.reason === "byte-limit") message += " · Son Kopyalar'a sığmadı";
                if (stacked.reason === "duplicate") message += " · Son Kopyalar'da zaten var";
                notify(message, stacked.reason ? "progress" : "success");
                diagnostic("copy_complete", { flowId: copyFlowId, width: prepared.width, height: prepared.height, totalBytes: prepared.blob && prepared.blob.size || 0, candidateSource: prepared.source || "unknown" });
                return {
                    status: "copied",
                    width: prepared.width,
                    height: prepared.height,
                    source: prepared.source,
                    isThumbnailFallback: prepared.isThumbnailFallback,
                    stacked: stacked.added,
                    stackStarted: stacked.added && stacked.state.count === 2,
                    stack: stacked.state,
                };
            } catch (error) {
                cancelState(copyState);
                const message = error && error.message ? error.message : "Bilinmeyen hata";
                feedback.fail(copyState.element, "Kopyalanamadı");
                notify("Koppy: " + message, "error");
                diagnostic("copy_failed", { flowId: copyFlowId, errorKind: errorKind(error) });
                return { status: "failed", reason: message };
            } finally {
                copyState.activeRequest = null;
                if (activeCopy === copyState) activeCopy = null;
            }
        }

        function onKeyDown(event) {
            if (isDocumentPreviewGesture(event)) void previewHoveredDocument();
            void copyHoveredImage(event);
        }

        function onKeyUp(event) {
            if (isModifierRelease(event)) closeDocumentPreview();
        }

        const controller = {
            start() {
                if (started || !documentLike) return false;
                if (windowLike && windowLike.top && windowLike.self && windowLike.top !== windowLike.self) return false;
                documentLike.addEventListener("pointermove", onPointerMove, true);
                documentLike.addEventListener("keydown", onKeyDown, true);
                documentLike.addEventListener("keyup", onKeyUp, true);
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
                documentLike.removeEventListener("keyup", onKeyUp, true);
                if (windowLike && windowLike.removeEventListener) {
                    windowLike.removeEventListener("popstate", refreshRoute);
                    windowLike.removeEventListener("hashchange", refreshRoute);
                }
                if (windowLike && windowLike.navigation && windowLike.navigation.removeEventListener) {
                    windowLike.navigation.removeEventListener("currententrychange", refreshRoute);
                }
                cancelAll();
                clearStack();
                started = false;
            },
            setHoveredImage,
            copyHoveredImage,
            refreshRoute,
            getState() { return current; },
            getStackState: stackState,
            clearStack,
            acceptRecentCopies: acceptStack,
            getDiagnostics() { return diagnostics && typeof diagnostics.snapshot === "function" ? diagnostics.snapshot() : null; },
            onStackChange(listener) {
                if (typeof listener !== "function") return () => {};
                stack.listeners.add(listener);
                return () => stack.listeners.delete(listener);
            },
        };
        // The build integration uses this one controller instance to wire the
        // compact Control Deck. Keep it read-only by convention: callers get
        // methods, not the retained Blob array itself.
        if (typeof globalThis !== "undefined") globalThis.KoppyCopyController = controller;
        return controller;
    }

    return {
        ALLOWED_IMAGE_TYPES,
        MAX_IMAGE_BYTES,
        MAX_IMAGE_DIMENSION,
        MAX_IMAGE_PIXELS,
        MAX_STACK_BYTES,
        MAX_STACK_ITEMS,
        createController,
        createCopyFeedback,
        createToast,
        detectClipboardAsset,
        isCopyGesture,
        isGoogleImagesLocation,
        isKnownGoogleThumbnail,
        isPrivateHost,
        normalizeCandidateUrl,
        normalizeClipboardAssetToPng,
        normalizeImageToPng,
        parseGoogleImageUrl,
        parseSrcset,
        prepareClipboardImage,
        probeRasterDimensions,
        requestImageWithGM,
        renderPdfToPng,
        resolveGoogleImage,
        resolveGoogleImageCandidates,
        resolveQuickHoverImageCandidates,
    };
});
