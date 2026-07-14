const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Koppy = require("../../src/google-images-copy.js");

const fixtures = path.join(__dirname, "../fixtures");

function domFrom(name, url) {
    return new JSDOM(fs.readFileSync(path.join(fixtures, name), "utf8"), { url });
}

function makeVisible(image, width = 120, height = 80) {
    Object.defineProperties(image, {
        clientWidth: { value: width, configurable: true },
        clientHeight: { value: height, configurable: true },
        isConnected: { value: true, configurable: true },
    });
    image.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: height });
    return image;
}

test("Google Images URL variants are detected", () => {
    assert.equal(Koppy.isGoogleImagesLocation(new URL("https://www.google.com/search?q=cat&tbm=isch")), true);
    assert.equal(Koppy.isGoogleImagesLocation(new URL("https://www.google.com.tr/search?q=cat&udm=2")), true);
    assert.equal(Koppy.isGoogleImagesLocation(new URL("https://www.google.com/search?q=cat")), false);
    assert.equal(Koppy.isGoogleImagesLocation(new URL("https://images.example.com/search?udm=2")), false);
    assert.equal(Koppy.isGoogleImagesLocation(new URL("https://google.evil.com/search?udm=2")), false);
    assert.equal(Koppy.isGoogleImagesLocation(new URL("https://www.google.com.evil/search?udm=2")), false);
});

test("unsafe and thumbnail URLs are rejected", () => {
    assert.equal(Koppy.normalizeCandidateUrl("http://images.example.test/a.jpg"), null);
    assert.equal(Koppy.normalizeCandidateUrl("https://127.0.0.1/a.jpg"), null);
    assert.equal(Koppy.normalizeCandidateUrl("https://192.168.1.5/a.jpg"), null);
    assert.equal(Koppy.normalizeCandidateUrl("https://[::1]/a.jpg"), null);
    assert.equal(Koppy.normalizeCandidateUrl("https://[::ffff:7f00:1]/a.jpg"), null);
    assert.equal(Koppy.normalizeCandidateUrl("https://[fd00::1]/a.jpg"), null);
    assert.equal(Koppy.isKnownGoogleThumbnail("https://encrypted-tbn0.gstatic.com/images?q=tbn:x"), true);
    assert.equal(Koppy.isKnownGoogleThumbnail("https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQsckauWC3J3vgYp9-y7E3EWa3sJUCEeLayA6wUBlHJaKGVbmEtf8MTvxUvLRBoQzQF9irrXSflHFpPxIyo8iCjTTWM7w0vCOoywLotlXbl&s=10"), true);
    assert.equal(Koppy.normalizeCandidateUrl("https://images.example.test/a.jpg"), "https://images.example.test/a.jpg");
});

test("legacy imgurl fixture resolves the original", () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const image = makeVisible(dom.window.document.getElementById("legacy-image"));
    assert.deepEqual(Koppy.resolveGoogleImage(image, { baseUrl: dom.window.location.href }), {
        url: "https://images.example.test/original-legacy.jpg",
        element: image,
        source: "imgurl",
    });
});

test("Picviewer result wins, then udm=2 data and highest srcset are used", () => {
    const dom = domFrom("google-udm2.html", "https://www.google.com/search?q=cat&udm=2");
    const udm = makeVisible(dom.window.document.getElementById("udm2-image"));
    const viaPicviewer = Koppy.resolveGoogleImage(udm, {
        baseUrl: dom.window.location.href,
        resolvePic: () => ({ src: "https://cdn.example.test/picviewer.jpg", imgSrc: udm.src, type: "rule" }),
    });
    assert.equal(viaPicviewer.url, "https://cdn.example.test/picviewer.jpg");
    assert.equal(viaPicviewer.source, "picviewer:rule");

    const viaData = Koppy.resolveGoogleImage(udm, { baseUrl: dom.window.location.href });
    assert.equal(viaData.url, "https://images.example.test/original-udm2.webp");
    assert.equal(viaData.source, "data-ou");

    const srcset = makeVisible(dom.window.document.getElementById("srcset-image"));
    const viaSrcset = Koppy.resolveGoogleImage(srcset, { baseUrl: dom.window.location.href });
    assert.equal(viaSrcset.url, "https://images.example.test/original.jpg");
    assert.equal(viaSrcset.source, "srcset");
});

test("Google keeps Picviewer originals even when src and imgSrc are equal, and accepts a loaded non-thumbnail preview", () => {
    const dom = new JSDOM(`<!doctype html><body>
        <img id="thumb" width="120" height="80" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:only-thumb">
        <img id="preview" width="640" height="400" src="https://cdn.example.test/loaded-preview.webp">
        <picture><source srcset="https://cdn.example.test/preview-2x.webp 2x"><img id="picture" width="640" height="400" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:picture"></picture>
    </body>`, { url: "https://www.google.com/search?q=preview&udm=2" });
    const thumb = makeVisible(dom.window.document.getElementById("thumb"));
    const viaEqualPicviewer = Koppy.resolveGoogleImage(thumb, {
        baseUrl: dom.window.location.href,
        resolvePic: () => ({ src: "https://images.example.test/picviewer-original.png", imgSrc: "https://images.example.test/picviewer-original.png", type: "preview" }),
    });
    assert.equal(viaEqualPicviewer.url, "https://images.example.test/picviewer-original.png");
    assert.equal(viaEqualPicviewer.source, "picviewer:preview");

    const preview = makeVisible(dom.window.document.getElementById("preview"), 640, 400);
    assert.deepEqual(Koppy.resolveGoogleImage(preview, { baseUrl: dom.window.location.href }), {
        url: "https://cdn.example.test/loaded-preview.webp",
        element: preview,
        source: "src",
    });

    const picture = makeVisible(dom.window.document.getElementById("picture"), 640, 400);
    assert.equal(Koppy.resolveGoogleImage(picture, { baseUrl: dom.window.location.href }).url, "https://cdn.example.test/preview-2x.webp");
});

test("a direct image document remains a generic binary-copy candidate", () => {
    const url = "https://www.solveigmm.com/content/files/00/04/dd/oK3Do7ONI7w0.png";
    const dom = new JSDOM(`<!doctype html><img id="direct" width="402" height="316" src="${url}">`, { url });
    const image = makeVisible(dom.window.document.getElementById("direct"), 402, 316);
    const candidate = Koppy.resolveQuickHoverImageCandidates(image, { baseUrl: dom.window.location.href })[0];
    assert.equal(candidate.url, url);
    assert.equal(candidate.source, "src");
});

test("a directly opened Google thumbnail remains a generic binary-copy candidate", () => {
    const url = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTw1xnvE-VFLix4oS6pdxpV4KwC2LhuT1Cl8Yk2Hfx2zw&s=10";
    const dom = new JSDOM(`<!doctype html><img id="direct-thumb" width="447" height="447" src="${url}">`, { url });
    const image = makeVisible(dom.window.document.getElementById("direct-thumb"), 447, 447);
    const candidate = Koppy.resolveQuickHoverImageCandidates(image, { baseUrl: dom.window.location.href })[0];
    assert.equal(candidate.url, url);
    assert.equal(candidate.source, "src");
    assert.equal(candidate.isThumbnailFallback, true);
});

test("generic candidates include CSS backgrounds, video posters and SVG image sources", () => {
    const dom = new JSDOM(`<!doctype html><body>
        <button id="card" style="width: 320px; height: 200px; background-image: url('https://cdn.example.test/card-original.webp')"></button>
        <video id="video" width="320" height="180" poster="https://cdn.example.test/poster.jpg"></video>
        <svg><image id="svg-image" width="320" height="180" href="https://cdn.example.test/vector-preview.png"></image></svg>
    </body>`, { url: "https://example.test/gallery" });
    const { document } = dom.window;
    const card = makeVisible(document.getElementById("card"), 320, 200);
    const video = makeVisible(document.getElementById("video"), 320, 180);
    const svgImage = makeVisible(document.getElementById("svg-image"), 320, 180);
    assert.deepEqual(Koppy.resolveQuickHoverImageCandidates(card, { baseUrl: dom.window.location.href })[0], {
        url: "https://cdn.example.test/card-original.webp", element: card, source: "background-image",
    });
    assert.equal(Koppy.resolveQuickHoverImageCandidates(video, { baseUrl: dom.window.location.href })[0].url, "https://cdn.example.test/poster.jpg");
    assert.equal(Koppy.resolveQuickHoverImageCandidates(svgImage, { baseUrl: dom.window.location.href })[0].url, "https://cdn.example.test/vector-preview.png");
});

test("controller copies a visible CSS background surface instead of requiring an img element", async () => {
    const dom = new JSDOM(`<!doctype html><body><div id="card" style="width: 320px; height: 200px; background-image: url('https://cdn.example.test/card.png')"></div></body>`, {
        url: "https://example.test/gallery",
    });
    const document = dom.window.document;
    const card = makeVisible(document.getElementById("card"), 320, 200);
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        feedback: { start() {}, progress() {}, decoding() {}, complete() {}, fail() {} },
        requestImage: url => ({ promise: Promise.resolve({ blob: new Blob([url], { type: "image/png" }) }), abort() {} }),
        normalizeImage: async blob => ({ blob, width: 1600, height: 1000 }),
    });
    assert.equal(controller.start(), true);
    const hover = new dom.window.Event("pointermove", { bubbles: true, composed: true });
    Object.defineProperties(hover, { clientX: { value: 100 }, clientY: { value: 80 } });
    card.dispatchEvent(hover);
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: document.body, preventDefault() {}, stopImmediatePropagation() {},
    });
    assert.equal(result.status, "copied");
    assert.equal(result.source, "background-image");
});

test("QuickHover resolves any site's original first and falls back to the visible image", () => {
    const dom = new JSDOM(`<!doctype html><img id="wiki-image" width="320" height="200" src="https://upload.wikimedia.org/thumb.jpg">`, {
        url: "https://en.wikipedia.org/wiki/Example",
    });
    const image = makeVisible(dom.window.document.getElementById("wiki-image"), 320, 200);
    const resolved = Koppy.resolveQuickHoverImageCandidates(image, {
        baseUrl: dom.window.location.href,
        resolvePic: () => ({ src: "https://upload.wikimedia.org/original.png", imgSrc: image.src, type: "rule" }),
    });
    assert.equal(resolved[0].url, "https://upload.wikimedia.org/original.png");
    assert.equal(resolved[0].source, "quickhover:rule");
    assert.equal(Koppy.resolveQuickHoverImageCandidates(image, { baseUrl: dom.window.location.href })[0].url, image.src);
});

test("copy feedback moves from the source thumbnail to the visible QuickHover preview", () => {
    const dom = new JSDOM(`<!doctype html><body>
        <img id="source" src="https://images.example.test/thumb.jpg">
        <span class="pv-pic-window-container preview"><span class="pv-pic-window-imgbox"><img class="pv-pic-window-pic"></span></span>
    </body>`, { url: "https://en.wikipedia.org/wiki/Example" });
    const document = dom.window.document;
    const source = document.getElementById("source");
    const previewBox = document.querySelector(".pv-pic-window-imgbox");
    source.getBoundingClientRect = () => ({ left: 24, top: 32, right: 144, bottom: 112, width: 120, height: 80 });
    previewBox.getBoundingClientRect = () => ({ left: 300, top: 100, right: 900, bottom: 550, width: 600, height: 450 });

    const feedback = Koppy.createCopyFeedback(document, dom.window);
    feedback.start(source);

    const indicator = document.getElementById("koppy-copy-feedback");
    const sourceOutline = document.querySelector(".koppy-copy-source-outline");
    assert.equal(indicator.style.left, "300px");
    assert.equal(indicator.style.top, "546px");
    assert.equal(indicator.style.width, "600px");
    assert.equal(sourceOutline.style.display, "block");
    assert.equal(sourceOutline.style.left, "22px");
    assert.equal(sourceOutline.style.top, "30px");
});

test("Cmd+C copies a QuickHover image on a non-Google site and reports on-image progress", async () => {
    const dom = new JSDOM(`<!doctype html><img id="wiki-image" width="320" height="200" src="https://upload.wikimedia.org/thumb.jpg">`, {
        url: "https://en.wikipedia.org/wiki/Example",
    });
    const document = dom.window.document;
    const image = makeVisible(document.getElementById("wiki-image"), 320, 200);
    const feedback = [];
    const requested = [];
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        feedback: {
            start: element => feedback.push(["start", element]),
            progress: () => feedback.push(["progress"]),
            decoding: () => feedback.push(["decoding"]),
            complete: (_element, width, height) => feedback.push(["complete", width, height]),
            fail: () => feedback.push(["fail"]),
        },
        resolvePic: () => ({ src: "https://upload.wikimedia.org/original.png", type: "rule" }),
        requestImage: url => {
            requested.push(url);
            return { promise: Promise.resolve({ blob: new Blob(["image"], { type: "image/png" }) }), abort() {} };
        },
        normalizeImage: async blob => ({ blob, width: 2048, height: 1365 }),
    });
    assert.equal(controller.start(), true);
    controller.setHoveredImage(image);
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: document.body,
        preventDefault() {}, stopImmediatePropagation() {},
    });
    assert.equal(result.status, "copied");
    assert.deepEqual(requested, ["https://upload.wikimedia.org/original.png"]);
    assert.deepEqual(feedback.map(entry => entry[0]), ["start", "decoding", "complete"]);
    assert.deepEqual(feedback.at(-1), ["complete", 2048, 1365]);
});

test("Recent Copies retains normal Cmd+C results and accepts a later explicit batch decision", async () => {
    const dom = new JSDOM(`<!doctype html><img id="image" width="320" height="200" src="https://images.example.test/source.jpg">`, {
        url: "https://en.wikipedia.org/wiki/Example",
    });
    const image = makeVisible(dom.window.document.getElementById("image"), 320, 200);
    const clipboardWrites = [];
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const accepted = [];
    const controller = Koppy.createController({
        document: dom.window.document,
        window: dom.window,
        location: dom.window.location,
        navigator: {
            clipboard: {
                async write(items) {
                    clipboardWrites.push(await items[0].data["image/png"]);
                },
            },
        },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        resolvePic: () => ({ src: "https://images.example.test/original.png", type: "rule" }),
        requestImage: () => ({ promise: Promise.resolve({ blob: new Blob(["input"], { type: "image/jpeg" }) }), abort() {} }),
        normalizeImage: async () => ({ blob: new Blob(["stack-png"], { type: "image/png" }), width: 2048, height: 1365 }),
        onRecentCopiesAccepted(items, state) { accepted.push({ items, state }); },
    });
    const stackEvents = [];
    controller.onStackChange(state => stackEvents.push(state));
    assert.deepEqual(controller.getStackState(), { enabled: false, parked: false, count: 0, bytes: 0, ready: false, accepted: false, delivering: false, maxItems: 10, maxBytes: 150 * 1024 * 1024 });
    controller.setHoveredImage(image);
    const copy = await controller.copyHoveredImage({ key: "c", metaKey: true, target: dom.window.document.body, preventDefault() {}, stopImmediatePropagation() {} });
    const secondCopy = await controller.copyHoveredImage({ key: "c", metaKey: true, target: dom.window.document.body, preventDefault() {}, stopImmediatePropagation() {} });

    assert.equal(copy.status, "copied");
    assert.equal(copy.stacked, true);
    assert.equal(copy.stack.count, 1);
    assert.equal(secondCopy.stack.count, 2);
    assert.equal(secondCopy.stack.ready, true);
    assert.equal(clipboardWrites.length, 2);
    assert.equal(clipboardWrites[0].type, "image/png");
    assert.equal(clipboardWrites[0].size, 9);

    const selected = controller.acceptRecentCopies();
    assert.equal(selected.accepted, true);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].items.length, 2);
    assert.equal(accepted[0].state.count, 2);
    controller.clearStack();
    assert.equal(controller.getStackState().count, 0);
    assert.equal(clipboardWrites.length, 2, "clearing Recent Copies must not write or clear the system clipboard");
    assert.equal(stackEvents.at(-1).count, 0);
});

test("current udm=2 docid metadata resolves original URL, then labels thumbnail fallback if metadata disappears", () => {
    const dom = domFrom("google-udm2-current.html", "https://www.google.com/search?q=vmaf&udm=2");
    const image = makeVisible(dom.window.document.getElementById("current-udm2-image"));
    const resolved = Koppy.resolveGoogleImage(image, { baseUrl: dom.window.location.href });
    assert.equal(resolved.url, "https://user-images.githubusercontent.com/example/vmaf-original.png");
    assert.equal(resolved.source, "google-metadata");
    assert.deepEqual([resolved.width, resolved.height], [1318, 1901]);

    dom.window.document.querySelector("script").remove();
    const fallback = Koppy.resolveGoogleImage(image, { baseUrl: dom.window.location.href });
    assert.equal(fallback.url, "https://encrypted-tbn0.gstatic.com/images?q=tbn:fixture&s=10");
    assert.equal(fallback.source, "google-thumbnail");
    assert.equal(fallback.isThumbnailFallback, true);
});

test("a negative metadata lookup is retried when Google fills the same script node later", () => {
    const dom = new JSDOM(`<!doctype html><div data-docid="late-doc"><div jscontroller="aw2uhd"><img id="late" width="120" height="80" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:late"></div></div><script></script>`, {
        url: "https://www.google.com/search?q=late&udm=2",
    });
    const image = makeVisible(dom.window.document.getElementById("late"));
    assert.equal(Koppy.resolveGoogleImage(image, { baseUrl: dom.window.location.href }).source, "google-thumbnail");
    dom.window.document.querySelector("script").textContent = `window.__late={"x":[0,"late-doc",["https://encrypted-tbn0.gstatic.com/images?q\\u003dtbn:late",120,80],["https://images.example.test/late-original.jpg",1600,900]]};`;
    assert.equal(Koppy.resolveGoogleImage(image, { baseUrl: dom.window.location.href }).url, "https://images.example.test/late-original.jpg");
});

test("GM request validates status, MIME, size and redirect target", async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    let successOptions;
    const success = Koppy.requestImageWithGM("https://images.example.test/a.png", options => {
        successOptions = options;
        queueMicrotask(() => options.onload({
            status: 200,
            response: png,
            finalUrl: options.url,
            responseHeaders: "Content-Type: image/png\r\nContent-Length: 4",
        }));
        return { abort() {} };
    });
    assert.equal((await success.promise).blob, png);
    assert.equal(successOptions.redirect, "manual");

    const redirectedUrls = [];
    const redirected = Koppy.requestImageWithGM("https://graphics.pixar.com/usd/images/USDPipeline2016_video.png", options => {
        redirectedUrls.push(options.url);
        queueMicrotask(() => {
            if (redirectedUrls.length === 1) {
                options.onload({ status: 301, responseHeaders: "Location: https://www.openusd.org/images/USDPipeline2016_video.png" });
            } else {
                options.onload({ status: 200, response: png, finalUrl: options.url, responseHeaders: "Content-Type: image/png" });
            }
        });
        return { abort() {} };
    });
    assert.equal((await redirected.promise).blob, png);
    assert.deepEqual(redirectedUrls, [
        "https://graphics.pixar.com/usd/images/USDPipeline2016_video.png",
        "https://www.openusd.org/images/USDPipeline2016_video.png",
    ]);

    let called = false;
    const unsafe = Koppy.requestImageWithGM("https://127.0.0.1/a.png", () => { called = true; });
    await assert.rejects(unsafe.promise, /Güvenli olmayan/);
    assert.equal(called, false);

    const nonImage = Koppy.requestImageWithGM("https://images.example.test/file", options => {
        queueMicrotask(() => options.onload({ status: 200, response: new Blob(["x"], { type: "text/html" }), finalUrl: options.url }));
        return { abort() {} };
    });
    await assert.rejects(nonImage.promise, /görsel veya belge değil/);

    const oversized = Koppy.requestImageWithGM("https://images.example.test/huge.png", options => {
        queueMicrotask(() => options.onload({
            status: 200,
            response: png,
            finalUrl: options.url,
            responseHeaders: "Content-Type: image/png\r\nContent-Length: 1000",
        }));
        return { abort() {} };
    }, { maxBytes: 10 });
    await assert.rejects(oversized.promise, /güvenlik sınırını/);

    const forbidden = Koppy.requestImageWithGM("https://images.example.test/403.png", options => {
        queueMicrotask(() => options.onload({ status: 403, response: png, finalUrl: options.url }));
        return { abort() {} };
    });
    await assert.rejects(forbidden.promise, /HTTP 403/);

    const privateRedirect = Koppy.requestImageWithGM("https://images.example.test/redirect.png", options => {
        queueMicrotask(() => options.onload({ status: 200, response: png, finalUrl: "https://[::ffff:7f00:1]/secret" }));
        return { abort() {} };
    });
    await assert.rejects(privateRedirect.promise, /güvenli olmayan bir adrese/);

    const blockedLocation = Koppy.requestImageWithGM("https://images.example.test/redirect-location.png", options => {
        queueMicrotask(() => options.onload({ status: 302, responseHeaders: "Location: https://127.0.0.1/secret" }));
        return { abort() {} };
    });
    await assert.rejects(blockedLocation.promise, /güvenli olmayan bir adrese/);

    let progressAborted = false;
    const progressLimited = Koppy.requestImageWithGM("https://images.example.test/stream.png", options => {
        const handle = { abort() { progressAborted = true; options.onabort(); } };
        queueMicrotask(() => options.onprogress({ loaded: 11, total: 20, lengthComputable: true }));
        return handle;
    }, { maxBytes: 10 });
    await assert.rejects(progressLimited.promise, /güvenlik sınırını/);
    assert.equal(progressAborted, true);
});

test("PNG is preserved, JPEG/WebP are converted, and pixel bombs are rejected", async () => {
    let closed = 0;
    const bitmap = { width: 320, height: 180, close() { closed += 1; } };
    const png = new Blob(["png"], { type: "image/png" });
    const pngResult = await Koppy.normalizeImageToPng(png, {
        probeDimensions: async () => ({ width: 320, height: 180 }),
        createImageBitmap: async () => bitmap,
    });
    assert.equal(pngResult.blob, png);
    assert.deepEqual([pngResult.width, pngResult.height], [320, 180]);

    class FakeCanvas {
        getContext() { return { drawImage() {} }; }
        async convertToBlob() { return new Blob(["converted"], { type: "image/png" }); }
    }
    const jpegResult = await Koppy.normalizeImageToPng(new Blob(["jpeg"], { type: "image/jpeg" }), {
        createImageBitmap: async () => bitmap,
        OffscreenCanvas: FakeCanvas,
        probeDimensions: async () => ({ width: 320, height: 180 }),
    });
    assert.equal(jpegResult.blob.type, "image/png");
    assert.deepEqual([jpegResult.width, jpegResult.height], [320, 180]);
    const webpResult = await Koppy.normalizeImageToPng(new Blob(["webp"], { type: "image/webp" }), {
        createImageBitmap: async () => bitmap,
        OffscreenCanvas: FakeCanvas,
        probeDimensions: async () => ({ width: 320, height: 180 }),
    });
    assert.equal(webpResult.blob.type, "image/png");
    assert.equal(closed, 3);

    let hugeDecodeStarted = false;
    await assert.rejects(Koppy.normalizeImageToPng(new Blob(["tiny"], { type: "image/jpeg" }), {
        probeDimensions: async () => ({ width: 50000, height: 50000 }),
        createImageBitmap: async () => { hugeDecodeStarted = true; return bitmap; },
        OffscreenCanvas: FakeCanvas,
    }), /piksel sınırını/);
    assert.equal(hugeDecodeStarted, false);
});

test("SVG falls back from Firefox createImageBitmap to a blob-backed image canvas", async () => {
    class FakeCanvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { drawImage() {} }; }
        async convertToBlob() { return new Blob(["svg-png"], { type: "image/png" }); }
    }
    let revoked = null;
    class FakeImage {
        constructor() { this.naturalWidth = 960; this.naturalHeight = 540; }
        set src(value) { this.value = value; queueMicrotask(() => this.onload()); }
    }
    const result = await Koppy.normalizeImageToPng(new Blob([
        '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%"/></svg>',
    ], { type: "image/svg+xml" }), {
        createImageBitmap: async () => { throw new Error("Firefox SVG bitmap unsupported"); },
        Image: FakeImage,
        URL: {
            createObjectURL() { return "blob:koppy-svg"; },
            revokeObjectURL(value) { revoked = value; },
        },
        OffscreenCanvas: FakeCanvas,
    });
    assert.deepEqual([result.width, result.height, result.blob.type], [960, 540, "image/png"]);
    assert.equal(revoked, "blob:koppy-svg");
});

test("file signatures recognize browser images, PDF-compatible AI and legacy AI/EPS separately", async () => {
    const gif = new Uint8Array(10);
    gif.set(Buffer.from("GIF89a"));
    new DataView(gif.buffer).setUint16(6, 640, true);
    new DataView(gif.buffer).setUint16(8, 360, true);
    assert.deepEqual(await Koppy.detectClipboardAsset(new Blob([gif], { type: "application/octet-stream" })), {
        kind: "raster", mime: "image/gif", label: "image/gif",
    });
    assert.equal((await Koppy.detectClipboardAsset(new Blob(["%PDF-1.7\n"], { type: "application/illustrator" }))).kind, "pdf");
    const oldAi = await Koppy.detectClipboardAsset(new Blob(["%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator\n"], { type: "application/illustrator" }));
    assert.equal(oldAi.kind, "postscript");
    assert.equal(oldAi.label, "AI/PostScript");
    assert.equal((await Koppy.detectClipboardAsset(new Blob(["not a media file"], { type: "application/octet-stream" }))).kind, "unknown");
    assert.deepEqual(await Koppy.probeRasterDimensions(new Blob([gif], { type: "image/gif" })), { width: 640, height: 360 });
});

test("PDF embeds and document links are Cmd+C candidates", () => {
    const dom = new JSDOM(`<!doctype html><body>
        <embed id="pdf" src="https://cdn.example.test/layout.pdf">
        <a id="ai" href="https://cdn.example.test/logo.ai" download>logo.ai</a>
    </body>`, { url: "https://example.test/work" });
    const pdf = makeVisible(dom.window.document.getElementById("pdf"), 480, 640);
    const ai = makeVisible(dom.window.document.getElementById("ai"), 160, 80);
    assert.equal(Koppy.resolveQuickHoverImageCandidates(pdf, { baseUrl: dom.window.location.href })[0].url, "https://cdn.example.test/layout.pdf");
    assert.equal(Koppy.resolveQuickHoverImageCandidates(ai, { baseUrl: dom.window.location.href })[0].url, "https://cdn.example.test/logo.ai");
});

test("text download links accept SVG/image extensions and extensionless download URLs", () => {
    const dom = new JSDOM(`<!doctype html><body>
        <a id="svg" href="https://cdn.example.test/brand.svg">Brand assets (SVG)</a>
        <a id="signed" href="https://storage.example.test/download?id=brand" download>Brand download</a>
    </body>`, { url: "https://example.test/assets" });
    const svg = makeVisible(dom.window.document.getElementById("svg"), 140, 22);
    const signed = makeVisible(dom.window.document.getElementById("signed"), 140, 22);
    assert.equal(Koppy.resolveQuickHoverImageCandidates(svg, { baseUrl: dom.window.location.href })[0].url, "https://cdn.example.test/brand.svg");
    assert.equal(Koppy.resolveQuickHoverImageCandidates(signed, { baseUrl: dom.window.location.href })[0].url, "https://storage.example.test/download?id=brand");
});

test("text-sized PDF and AI download links remain Cmd+C copy surfaces", async () => {
    // The Turkcell logo page presents these choices as short text anchors, rather
    // than as preview images. They must not be rejected by the 60×60 image filter.
    const dom = new JSDOM(`<!doctype html><body>
        <a id="pdf" href="https://cdn.example.test/TURKCELL_LOGO.pdf">Yatay Logo (PDF)</a>
        <a id="ai" href="https://cdn.example.test/TURKCELL_LOGO.ai">Yatay Logo (AI)</a>
    </body>`, { url: "https://www.turkcell.com.tr/hakkimizda/genel-bakis/turkcell-logo/detay" });
    const document = dom.window.document;
    const pdf = makeVisible(document.getElementById("pdf"), 166, 24);
    const ai = makeVisible(document.getElementById("ai"), 154, 24);
    const requested = [];
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        feedback: { start() {}, progress() {}, decoding() {}, complete() {}, fail() {} },
        requestImage: url => {
            requested.push(url);
            return { promise: Promise.resolve({ blob: new Blob(["png"], { type: "image/png" }) }), abort() {} };
        },
        normalizeImage: async blob => ({ blob, width: 1080, height: 360 }),
    });
    assert.equal(controller.start(), true);
    controller.setHoveredImage(pdf);
    assert.equal((await controller.copyHoveredImage({ key: "c", metaKey: true, target: document.body, preventDefault() {}, stopImmediatePropagation() {} })).status, "copied");
    controller.setHoveredImage(ai);
    assert.equal((await controller.copyHoveredImage({ key: "c", metaKey: true, target: document.body, preventDefault() {}, stopImmediatePropagation() {} })).status, "copied");
    assert.deepEqual(requested, [
        "https://cdn.example.test/TURKCELL_LOGO.pdf",
        "https://cdn.example.test/TURKCELL_LOGO.ai",
    ]);
});

test("PDF first page is rendered to a bounded PNG without fetching a document URL", async () => {
    let options;
    let rendered = false;
    class FakeCanvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return { fillRect() {} }; }
        async convertToBlob() { return new Blob(["png"], { type: "image/png" }); }
    }
    const pdfjsLib = {
        GlobalWorkerOptions: { workerPort: null },
        getDocument(value) {
            options = value;
            return {
                promise: Promise.resolve({
                    async getPage() {
                        return {
                            getViewport({ scale }) { return { width: 300 * scale, height: 200 * scale }; },
                            render() { rendered = true; return { promise: Promise.resolve() }; },
                        };
                    },
                    async destroy() {},
                }),
                async destroy() {},
            };
        },
    };
    const output = await Koppy.renderPdfToPng(new Blob(["%PDF-1.7\n"], { type: "application/pdf" }), {
        pdfjsLib,
        OffscreenCanvas: FakeCanvas,
        URL: { createObjectURL() { return "blob:koppy-pdf-worker"; }, revokeObjectURL() {} },
        Blob,
        pdfWorkerSource: "self.postMessage('ready')",
        maxPixels: 1000000,
        maxDimension: 2000,
    });
    assert.equal(pdfjsLib.GlobalWorkerOptions.workerSrc, "blob:koppy-pdf-worker");
    assert.equal(rendered, true);
    assert.equal(options.disableRange, true);
    assert.equal(options.disableAutoFetch, true);
    assert.equal(options.isEvalSupported, false);
    assert.deepEqual([output.width, output.height, output.blob.type], [600, 400, "image/png"]);
});

test("PNG, JPEG and WebP dimensions are validated from headers before decode", async () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    new DataView(png.buffer).setUint32(16, 320);
    new DataView(png.buffer).setUint32(20, 180);
    assert.deepEqual(await Koppy.probeRasterDimensions(new Blob([png], { type: "image/png" })), { width: 320, height: 180 });

    const jpeg = new Uint8Array(21);
    jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xb4, 0x01, 0x40, 0x03, 0x01, 0x11, 0x00]);
    assert.deepEqual(await Koppy.probeRasterDimensions(new Blob([jpeg], { type: "image/jpeg" })), { width: 320, height: 180 });

    const webp = new Uint8Array(30);
    webp.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
    webp[24] = 319 & 255; webp[25] = 319 >> 8;
    webp[27] = 179 & 255; webp[28] = 179 >> 8;
    assert.deepEqual(await Koppy.probeRasterDimensions(new Blob([webp], { type: "image/webp" })), { width: 320, height: 180 });
});

test("controller performs no hover fetch, refreshes stale candidate, and writes one PNG item", async () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const document = dom.window.document;
    const first = makeVisible(document.getElementById("legacy-image"));
    const secondLink = document.createElement("a");
    secondLink.href = "/imgres?imgurl=https%3A%2F%2Fimages.example.test%2Fsecond.jpg";
    const second = makeVisible(document.createElement("img"));
    secondLink.appendChild(second);
    document.body.appendChild(secondLink);

    const requests = [];
    const writes = [];
    const notices = [];
    class ClipboardItemMock {
        constructor(data) { this.data = data; }
    }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { writes.push(items); } } },
        ClipboardItem: ClipboardItemMock,
        notify: (message, kind) => notices.push({ message, kind }),
        requestImage: url => {
            const request = {
                url,
                aborted: false,
                abort() { this.aborted = true; },
                promise: Promise.resolve({ blob: new Blob(["jpeg"], { type: "image/jpeg" }) }),
            };
            requests.push(request);
            return request;
        },
        normalizeImage: async () => ({ blob: new Blob(["png"], { type: "image/png" }), width: 2400, height: 1600 }),
    });

    assert.equal(controller.start(), true);
    controller.setHoveredImage(first);
    controller.setHoveredImage(second);
    assert.equal(requests.length, 0);

    let prevented = false;
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false,
        target: document.body,
        preventDefault() { prevented = true; },
        stopPropagation() {},
    });
    assert.equal(result.status, "copied");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://images.example.test/second.jpg");
    assert.equal(prevented, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].length, 1);
    assert.equal((await writes[0][0].data["image/png"]).type, "image/png");
    assert.match(notices.at(-1).message, /2400×1600/);
    controller.destroy();
});

test("normal copy is preserved for editable fields and text selection", async () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const document = dom.window.document;
    const image = makeVisible(document.getElementById("legacy-image"));
    const input = document.createElement("input");
    document.body.appendChild(input);
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        requestImage: () => ({ promise: Promise.resolve({ blob: new Blob(["x"], { type: "image/png" }) }), abort() {} }),
        normalizeImage: async blob => ({ blob, width: 1, height: 1 }),
    });
    controller.setHoveredImage(image);
    let prevented = false;
    const editable = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: input,
        preventDefault() { prevented = true; }, stopPropagation() {},
    });
    assert.equal(editable.status, "not-applicable");
    assert.equal(prevented, false);

    dom.window.getSelection = () => ({ toString: () => "selected text" });
    const selected = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: document.body,
        preventDefault() { prevented = true; }, stopPropagation() {},
    });
    assert.equal(selected.status, "not-applicable");
    assert.equal(prevented, false);
});

test("same image node is re-resolved at Cmd+C and failed candidates fall through", async () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const document = dom.window.document;
    const image = makeVisible(document.getElementById("legacy-image"));
    const anchor = image.closest("a");
    const requested = [];
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        requestImage: url => {
            requested.push(url);
            if (url.endsWith("broken.jpg")) return { promise: Promise.reject(new Error("HTTP 404")), abort() {} };
            return { promise: Promise.resolve({ blob: new Blob(["ok"], { type: "image/jpeg" }) }), abort() {} };
        },
        normalizeImage: async () => ({ blob: new Blob(["png"], { type: "image/png" }), width: 800, height: 600 }),
    });
    controller.setHoveredImage(image);
    anchor.href = "/imgres?imgurl=https%3A%2F%2Fimages.example.test%2Fbroken.jpg";
    image.setAttribute("data-ou", "https://images.example.test/fallback.jpg");
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: document.body,
        preventDefault() {}, stopImmediatePropagation() {},
    });
    assert.equal(result.status, "copied");
    assert.deepEqual(requested, [
        "https://images.example.test/broken.jpg",
        "https://images.example.test/fallback.jpg",
    ]);
    assert.equal(result.source, "data-ou");
});

test("copy guards cover textarea, contenteditable, repeat/modifiers, macOS Ctrl+C and no candidate", async () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const document = dom.window.document;
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(textarea, editable);
    const base = { key: "c", metaKey: true, target: document.body };
    for (const event of [
        { ...base, target: textarea },
        { ...base, target: editable },
        { ...base, repeat: true },
        { ...base, shiftKey: true },
        { ...base, altKey: true },
    ]) assert.equal(Koppy.isCopyGesture(event, dom.window), false);
    assert.equal(Koppy.isCopyGesture({ ...base, altKey: true }, dom.window, { allowAlt: true }), true);
    assert.equal(Koppy.isCopyGesture({ ...base, key: "ç", code: "KeyC", altKey: true }, dom.window, { allowAlt: true }), true);

    const macWindow = { navigator: { platform: "MacIntel" }, getSelection: () => null };
    assert.equal(Koppy.isCopyGesture({ key: "c", ctrlKey: true, target: document.body }, macWindow), false);

    const bare = makeVisible(document.createElement("img"));
    bare.src = "https://cdn.example.com/thumb-120.jpg";
    document.body.appendChild(bare);
    const controller = Koppy.createController({ document, window: dom.window, location: dom.window.location, notify() {} });
    controller.setHoveredImage(bare);
    let prevented = false;
    const noCandidate = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: document.body,
        preventDefault() { prevented = true; }, stopImmediatePropagation() {},
    });
    assert.equal(noCandidate.status, "not-applicable");
    assert.equal(prevented, false);
});

test("a Google thumbnail without an original candidate is copied as clearly labelled preview pixels", async () => {
    const dom = new JSDOM(`<!doctype html><img id="thumb" width="120" height="80" src="https://encrypted-tbn0.gstatic.com/images?q=tbn:only-thumb&s=10">`, {
        url: "https://www.google.com/search?q=thumb&udm=2",
    });
    const document = dom.window.document;
    const thumb = makeVisible(document.getElementById("thumb"));
    const notices = [];
    const requested = [];
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify(message, kind) { notices.push({ message, kind }); },
        requestImage(url) { requested.push(url); return { promise: Promise.resolve({ blob: new Blob(["preview"], { type: "image/jpeg" }) }), abort() {} }; },
        normalizeImage: async blob => ({ blob: new Blob([blob], { type: "image/png" }), width: 447, height: 447 }),
    });
    controller.setHoveredImage(thumb);
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: document.body,
        preventDefault() {}, stopImmediatePropagation() {},
    });
    assert.equal(result.status, "copied");
    assert.equal(result.source, "google-thumbnail");
    assert.equal(result.isThumbnailFallback, true);
    assert.deepEqual(requested, [thumb.src]);
    assert.match(notices.at(-1).message, /Önizleme kopyalandı: 447×447/);
});

test("controller clears its hover candidate on SPA route changes", () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const image = makeVisible(dom.window.document.getElementById("legacy-image"));
    const location = { hostname: "www.google.com", pathname: "/search", search: "?q=cat", href: "https://www.google.com/search?q=cat" };
    const controller = Koppy.createController({ document: dom.window.document, window: dom.window, location, notify() {} });
    assert.equal(controller.start(), true);
    controller.setHoveredImage(image);
    assert.ok(controller.getState());
    location.search = "?q=cat&udm=2";
    location.href += "&udm=2";
    controller.setHoveredImage(image);
    assert.ok(controller.getState());
    controller.refreshRoute();
    assert.equal(controller.getState(), null);
    controller.destroy();
});

test("copy is controller-wide single-flight and survives hover selection changes", async () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const document = dom.window.document;
    const first = makeVisible(document.getElementById("legacy-image"));
    const secondAnchor = document.createElement("a");
    secondAnchor.href = "/imgres?imgurl=https%3A%2F%2Fimages.example.test%2Fsecond.jpg";
    const second = makeVisible(document.createElement("img"));
    secondAnchor.appendChild(second);
    document.body.appendChild(secondAnchor);
    let resolveDownload;
    let rejectDownload;
    let aborted = false;
    let requestCount = 0;
    let writeCount = 0;
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { writeCount += 1; await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        requestImage: () => {
            requestCount += 1;
            if (requestCount > 1) return { promise: Promise.resolve({ blob: new Blob(["second"], { type: "image/png" }) }), abort() {} };
            return {
                promise: new Promise((resolve, reject) => { resolveDownload = resolve; rejectDownload = reject; }),
                abort() { aborted = true; rejectDownload(new Error("aborted")); },
            };
        },
        normalizeImage: async blob => ({ blob, width: 640, height: 360 }),
    });
    controller.setHoveredImage(first);
    const event = { key: "c", metaKey: true, target: document.body, preventDefault() {}, stopImmediatePropagation() {} };
    const firstCopy = controller.copyHoveredImage(event);
    const repeated = await controller.copyHoveredImage(event);
    assert.deepEqual(repeated, { status: "failed", reason: "copy-in-progress" });
    controller.setHoveredImage(second);
    assert.equal(aborted, false);
    assert.equal(requestCount, 1);
    resolveDownload({ blob: new Blob(["first"], { type: "image/png" }) });
    assert.equal((await firstCopy).status, "copied");
    assert.equal(writeCount, 1);
    const secondCopy = await controller.copyHoveredImage(event);
    assert.equal(secondCopy.status, "copied");
    assert.equal(requestCount, 2);
    assert.equal(writeCount, 2);
});

test("clipboard permission rejection aborts the active download immediately", async () => {
    const dom = domFrom("google-tbm.html", "https://www.google.com/search?q=cat&tbm=isch");
    const image = makeVisible(dom.window.document.getElementById("legacy-image"));
    let rejectDownload;
    let aborted = false;
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document: dom.window.document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { write: () => Promise.reject(new Error("NotAllowedError")) } },
        ClipboardItem: ClipboardItemMock,
        notify() {},
        requestImage: () => ({
            promise: new Promise((_, reject) => { rejectDownload = reject; }),
            abort() { aborted = true; rejectDownload(new Error("aborted")); },
        }),
        normalizeImage: async blob => ({ blob, width: 1, height: 1 }),
    });
    controller.setHoveredImage(image);
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: dom.window.document.body,
        preventDefault() {}, stopImmediatePropagation() {},
    });
    assert.equal(result.status, "failed");
    assert.equal(result.reason, "NotAllowedError");
    assert.equal(aborted, true);
});

test("a real Google result with only a thumbnail offers labelled preview fallback", async () => {
    const dom = domFrom("google-udm2-current.html", "https://www.google.com/search?q=vmaf&udm=2");
    dom.window.document.querySelector("script").remove();
    const image = makeVisible(dom.window.document.getElementById("current-udm2-image"));
    const notices = [];
    class ClipboardItemMock { constructor(data) { this.data = data; } }
    const controller = Koppy.createController({
        document: dom.window.document,
        window: dom.window,
        location: dom.window.location,
        navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
        ClipboardItem: ClipboardItemMock,
        notify: (message, kind) => notices.push({ message, kind }),
        requestImage: () => ({ promise: Promise.resolve({ blob: new Blob(["preview"], { type: "image/jpeg" }) }), abort() {} }),
        normalizeImage: async blob => ({ blob: new Blob([blob], { type: "image/png" }), width: 160, height: 100 }),
    });
    controller.setHoveredImage(image);
    const result = await controller.copyHoveredImage({
        key: "c", metaKey: true, target: dom.window.document.body,
        preventDefault() {}, stopImmediatePropagation() {},
    });
    assert.equal(result.status, "copied");
    assert.equal(result.isThumbnailFallback, true);
    assert.match(notices.at(-1).message, /Önizleme kopyalandı: 160×100/);
});
