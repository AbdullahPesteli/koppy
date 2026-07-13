const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const modulePath = path.resolve(__dirname, "../../src/google-images-copy.js");
const distPath = path.resolve(__dirname, "../../dist/Koppy.user.js");

function onePagePdfBase64() {
    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << >> >>\nendobj\n",
        "4 0 obj\n<< /Length 28 >>\nstream\n0.9 0 0 rg\n0 0 200 100 re f\nendstream\nendobj\n",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const object of objects) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += object;
    }
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf).toString("base64");
}

test("hover + Cmd+C writes one 320×180 PNG and preserves input copy", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await page.route(/https:\/\/(?:encrypted-tbn0\.gstatic\.com|cdn\.example\.test)\//, route => route.fulfill({
        status: 200,
        contentType: "image/png",
        body: pixel,
    }));

    await page.route("https://www.google.com/search?**", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body>
          <div data-docid="koppy-current-result"><div jscontroller="aw2uhd" jsdata="XZxcdf;koppy-current-result;fixture">
            <img id="result" width="120" height="80" alt="Result"
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:koppy-fixture&amp;s=10">
          </div></div>
          <script>window.__data={"fixture":[0,"koppy-current-result",["https://encrypted-tbn0.gstatic.com/images?q\\u003dtbn:koppy-fixture\\u0026s\\u003d10",120,80],["https://images.example.test/original.jpg",320,180]]};</script>
          <input id="normal-copy" value="normal text">
          <textarea id="textarea-copy">textarea text</textarea>
          <div id="editable-copy" contenteditable="true">editable text</div>
          <img id="bare-thumbnail" width="120" height="80" src="https://cdn.example.test/thumbnail.jpg">
        </body></html>`,
    }));
    await page.goto("https://www.google.com/search?q=koppy&udm=2");
    await page.addScriptTag({ path: modulePath });
    await page.evaluate(() => {
        window.__requestCount = 0;
        const requestImage = () => {
            window.__requestCount += 1;
            const canvas = document.createElement("canvas");
            canvas.width = 320;
            canvas.height = 180;
            const context = canvas.getContext("2d");
            context.fillStyle = "#d94b38";
            context.fillRect(0, 0, 320, 180);
            context.fillStyle = "#fff";
            context.font = "28px sans-serif";
            context.fillText("Koppy", 110, 100);
            return {
                abort() {},
                promise: new Promise((resolve, reject) => canvas.toBlob(
                    blob => blob ? resolve({ blob }) : reject(new Error("fixture blob failed")),
                    "image/jpeg",
                    0.9,
                )),
            };
        };
        window.__koppyController = window.KoppyGoogleCopy.createController({
            document,
            window,
            location,
            navigator,
            ClipboardItem,
            requestImage,
        });
        window.__koppyStarted = window.__koppyController.start();
    });

    expect(await page.evaluate(() => window.__koppyStarted)).toBe(true);
    await page.hover("#result");
    await expect.poll(() => page.evaluate(() => {
        const state = window.__koppyController.getState();
        return state && state.candidate && state.candidate.url;
    })).toBe("https://images.example.test/original.jpg");
    expect(await page.evaluate(() => window.__requestCount)).toBe(0);
    await page.keyboard.press("Meta+C");
    await expect(page.locator("#koppy-copy-feedback")).toContainText("Kopyalandı · 320×180");
    await expect(page.locator("#koppy-copy-toast")).toContainText("Kopyalandı: 320×180");

    const clipboard = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const blob = await items[0].getType("image/png");
        const bitmap = await createImageBitmap(blob);
        const result = { itemCount: items.length, types: items[0].types, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
    });
    expect(clipboard.itemCount).toBe(1);
    expect(clipboard.types).toEqual(["image/png"]);
    expect([clipboard.width, clipboard.height]).toEqual([320, 180]);
    expect(await page.evaluate(() => window.__requestCount)).toBe(1);

    await page.locator("#normal-copy").selectText();
    await page.keyboard.press("Meta+C");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("normal text");

    await page.locator("#textarea-copy").selectText();
    await page.keyboard.press("Meta+C");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("textarea text");
    await page.locator("#editable-copy").selectText();
    await page.keyboard.press("Meta+C");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("editable text");

    await page.hover("#bare-thumbnail");
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.keyboard.press("Meta+C");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("editable text");
    expect(await page.evaluate(() => window.__requestCount)).toBe(1);

    fs.mkdirSync(path.resolve("test-results"), { recursive: true });
    await page.screenshot({ path: "test-results/koppy-e2e.png", fullPage: true });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test("built Koppy userscript boots with Tampermonkey-shaped grants and resolves current udm=2 metadata", async ({ page }) => {
    await page.route("https://www.google.com/search?**", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head></head><body>
          <div data-docid="dist-current-result"><div jscontroller="aw2uhd" jsdata="XZxcdf;dist-current-result;fixture">
            <img id="dist-result" width="120" height="80" alt="Built result"
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:dist-fixture&amp;s=10">
          </div></div>
          <script>window.__data={"fixture":[0,"dist-current-result",["https://encrypted-tbn0.gstatic.com/images?q\\u003dtbn:dist-fixture\\u0026s\\u003d10",120,80],["https://images.example.test/dist-original.jpg",640,360]]};</script>
        </body></html>`,
    }));
    await page.goto("https://www.google.com/search?q=koppy&udm=2");
    await page.evaluate(() => {
        const values = new Map();
        window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
        window.GM_setValue = (key, value) => values.set(key, value);
        window.GM_deleteValue = key => values.delete(key);
        window.GM_addStyle = css => { const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style); return style; };
        window.GM_openInTab = () => null;
        window.GM_setClipboard = () => {};
        window.GM_registerMenuCommand = () => {};
        window.GM_notification = () => {};
        window.GM_download = () => {};
        window.GM_xmlhttpRequest = options => {
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = 360;
            canvas.getContext("2d").fillRect(0, 0, 640, 360);
            let aborted = false;
            canvas.toBlob(blob => {
                if (!aborted) options.onload({ status: 200, response: blob, finalUrl: options.url, responseHeaders: "Content-Type: image/png" });
            }, "image/png");
            return { abort() { aborted = true; if (options.onabort) options.onabort(); } };
        };
        window.GM = {
            getValue: async (key, fallback) => window.GM_getValue(key, fallback),
            setValue: async (key, value) => window.GM_setValue(key, value),
            deleteValue: async key => window.GM_deleteValue(key),
            addStyle: window.GM_addStyle,
            openInTab: window.GM_openInTab,
            setClipboard: window.GM_setClipboard,
            registerMenuCommand: window.GM_registerMenuCommand,
            notification: window.GM_notification,
            xmlHttpRequest: window.GM_xmlhttpRequest,
        };
        window.unsafeWindow = window;
    });
    const built = fs.readFileSync(distPath, "utf8");
    const bootError = await page.evaluate(source => {
        try {
            new Function(source).call(window);
            return null;
        } catch (error) {
            return String(error && error.stack || error);
        }
    }, built);
    expect(bootError).toBeNull();
    expect(await page.evaluate(() => Boolean(window.KoppyGoogleCopy))).toBe(true);
    await page.hover("#dist-result");
    await page.keyboard.press("Meta+C");
    await expect(page.locator("#koppy-copy-toast")).toContainText("Kopyalandı: 640×360");
    const clipboard = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const blob = await items[0].getType("image/png");
        const bitmap = await createImageBitmap(blob);
        const result = { count: items.length, types: items[0].types, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
    });
    expect(clipboard).toEqual({ count: 1, types: ["image/png"], width: 640, height: 360 });
});

test("built Koppy userscript copies a visible QuickHover image on Wikipedia", async ({ page }) => {
    await page.route("https://en.wikipedia.org/wiki/Example", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><body><img id="wiki-image" width="360" height="240" alt="Example" src="https://upload.wikimedia.org/wikipedia/en/a/a9/Example.jpg"></body></html>`,
    }));
    await page.goto("https://en.wikipedia.org/wiki/Example");
    await page.evaluate(() => {
        const values = new Map();
        window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
        window.GM_setValue = (key, value) => values.set(key, value);
        window.GM_deleteValue = key => values.delete(key);
        window.GM_addStyle = css => { const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style); return style; };
        window.GM_openInTab = () => null;
        window.GM_setClipboard = () => {};
        window.GM_registerMenuCommand = () => {};
        window.GM_notification = () => {};
        window.GM_download = () => {};
        window.GM_xmlhttpRequest = options => {
            const canvas = document.createElement("canvas");
            canvas.width = 360;
            canvas.height = 240;
            canvas.getContext("2d").fillRect(0, 0, 360, 240);
            canvas.toBlob(blob => options.onload({ status: 200, response: blob, finalUrl: options.url, responseHeaders: "Content-Type: image/png" }), "image/png");
            return { abort() {} };
        };
        window.GM = {
            getValue: async (key, fallback) => window.GM_getValue(key, fallback),
            setValue: async (key, value) => window.GM_setValue(key, value),
            deleteValue: async key => window.GM_deleteValue(key),
            addStyle: window.GM_addStyle,
            openInTab: window.GM_openInTab,
            setClipboard: window.GM_setClipboard,
            registerMenuCommand: window.GM_registerMenuCommand,
            notification: window.GM_notification,
            xmlHttpRequest: window.GM_xmlhttpRequest,
        };
        window.unsafeWindow = window;
    });
    const built = fs.readFileSync(distPath, "utf8");
    expect(await page.evaluate(source => {
        try { new Function(source).call(window); return null; } catch (error) { return String(error && error.stack || error); }
    }, built)).toBeNull();
    await page.hover("#wiki-image");
    await page.keyboard.press("Meta+C");
    await expect(page.locator("#koppy-copy-feedback")).toContainText("Kopyalandı · 360×240");
    const clipboard = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const blob = await items[0].getType("image/png");
        const bitmap = await createImageBitmap(blob);
        const result = { count: items.length, types: items[0].types, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
    });
    expect(clipboard).toEqual({ count: 1, types: ["image/png"], width: 360, height: 240 });
});

test("built Koppy renders a PDF first page locally to PNG", async ({ page }) => {
    await page.route("https://example.test/pdf-copy", route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body>PDF test</body>" }));
    await page.goto("https://example.test/pdf-copy");
    await page.evaluate(() => {
        const values = new Map();
        window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
        window.GM_setValue = (key, value) => values.set(key, value);
        window.GM_deleteValue = key => values.delete(key);
        window.GM_addStyle = () => null;
        window.GM_openInTab = () => null;
        window.GM_setClipboard = () => {};
        window.GM_registerMenuCommand = () => {};
        window.GM_notification = () => {};
        window.GM_download = () => {};
        window.GM_xmlhttpRequest = () => ({ abort() {} });
        window.GM = { getValue: async (_key, fallback) => fallback, setValue: async () => {}, deleteValue: async () => {}, addStyle: window.GM_addStyle, openInTab: window.GM_openInTab, setClipboard: window.GM_setClipboard, registerMenuCommand: window.GM_registerMenuCommand, notification: window.GM_notification, xmlHttpRequest: window.GM_xmlhttpRequest };
        window.unsafeWindow = window;
    });
    const built = fs.readFileSync(distPath, "utf8");
    expect(await page.evaluate(source => {
        try { new Function(source).call(window); return null; } catch (error) { return String(error && error.stack || error); }
    }, built)).toBeNull();
    const result = await page.evaluate(async base64 => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const rendered = await window.KoppyGoogleCopy.normalizeClipboardAssetToPng(new Blob([bytes], { type: "application/pdf" }), {
            document,
            OffscreenCanvas,
            URL,
            Blob,
            maxBytes: 80 * 1024 * 1024,
            maxPixels: 40 * 1024 * 1024,
            maxDimension: 16384,
        });
        const bitmap = await createImageBitmap(rendered.blob);
        const dimensions = [bitmap.width, bitmap.height];
        bitmap.close();
        return { type: rendered.blob.type, dimensions };
    }, onePagePdfBase64());
    expect(result).toEqual({ type: "image/png", dimensions: [400, 200] });
});

test("text-sized Turkcell-style PDF and AI links accept hover + Cmd+C", async ({ page }) => {
    await page.route("https://www.turkcell.com.tr/hakkimizda/genel-bakis/turkcell-logo/detay", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><body>
            <a id="pdf" href="https://cdn.example.test/TURKCELL_YATAY_ERKEK_LOGO.pdf">Yatay Erkek Logo (PDF)</a>
            <a id="ai" href="https://cdn.example.test/TURKCELL_YATAY_ERKEK_LOGO.ai">Yatay Erkek Logo (AI)</a>
        </body>`,
    }));
    await page.goto("https://www.turkcell.com.tr/hakkimizda/genel-bakis/turkcell-logo/detay");
    await page.addScriptTag({ path: modulePath });
    await page.evaluate(() => {
        window.__requestedLinks = [];
        class ClipboardItemMock { constructor(data) { this.data = data; } }
        window.__turkcellController = window.KoppyGoogleCopy.createController({
            document,
            window,
            location,
            navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
            ClipboardItem: ClipboardItemMock,
            requestImage(url) {
                window.__requestedLinks.push(url);
                return { abort() {}, promise: Promise.resolve({ blob: new Blob(["png"], { type: "image/png" }) }) };
            },
            normalizeImage: async blob => ({ blob, width: 1080, height: 360 }),
        });
        window.__turkcellController.start();
    });
    await page.hover("#pdf");
    await page.keyboard.press("Meta+C");
    await expect(page.locator("#koppy-copy-toast")).toContainText("Kopyalandı: 1080×360");
    await page.hover("#ai");
    await page.keyboard.press("Meta+C");
    await expect.poll(() => page.evaluate(() => window.__requestedLinks)).toEqual(expect.arrayContaining([
        "https://cdn.example.test/TURKCELL_YATAY_ERKEK_LOGO.pdf",
        "https://cdn.example.test/TURKCELL_YATAY_ERKEK_LOGO.ai",
    ]));
});

test("holding Cmd previews a text-sized PDF link before copy", async ({ page }) => {
    await page.route("https://example.test/document-preview", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><body><a id="pdf" href="https://cdn.example.test/logo.pdf">Logo (PDF)</a></body>',
    }));
    await page.goto("https://example.test/document-preview");
    await page.addScriptTag({ path: modulePath });
    await page.evaluate(() => {
        class ClipboardItemMock { constructor(data) { this.data = data; } }
        window.__documentPreviewController = window.KoppyGoogleCopy.createController({
            document,
            window,
            location,
            navigator: { clipboard: { async write(items) { await items[0].data["image/png"]; } } },
            ClipboardItem: ClipboardItemMock,
            isPreviewGesture: event => event.metaKey || event.key === "Meta",
            requestImage: () => {
                const canvas = document.createElement("canvas");
                canvas.width = 200;
                canvas.height = 100;
                canvas.getContext("2d").fillRect(0, 0, 200, 100);
                return { abort() {}, promise: new Promise(resolve => canvas.toBlob(blob => resolve({ blob }), "image/png")) };
            },
            normalizeImage: async blob => ({ blob, width: 200, height: 100 }),
        });
        window.__documentPreviewController.start();
    });
    await page.hover("#pdf");
    await page.keyboard.down("Meta");
    await expect(page.locator("#koppy-document-preview")).toContainText("Belge önizlemesi · ⌘C ile kopyala");
    await expect(page.locator("#koppy-document-preview img")).toBeVisible();
    await page.keyboard.up("Meta");
    await expect(page.locator("#koppy-document-preview")).toBeHidden();
});

test("built Koppy uses the native Picviewer preview shell for a document link", async ({ page }) => {
    await page.route("https://example.test/native-document-preview", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><body><a id="pdf" href="https://cdn.example.test/logo.pdf">Logo (PDF)</a></body>',
    }));
    await page.goto("https://example.test/native-document-preview");
    await page.evaluate(() => {
        window.GM_getValue = (_key, fallback) => fallback;
        window.GM_setValue = () => {};
        window.GM_deleteValue = () => {};
        window.GM_addStyle = css => { const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style); return style; };
        window.GM_openInTab = () => null;
        window.GM_setClipboard = () => {};
        window.GM_registerMenuCommand = () => {};
        window.GM_notification = () => {};
        window.GM_download = () => {};
        window.GM_xmlhttpRequest = options => {
            const canvas = document.createElement("canvas");
            canvas.width = 200;
            canvas.height = 100;
            canvas.getContext("2d").fillRect(0, 0, 200, 100);
            canvas.toBlob(blob => options.onload({ status: 200, response: blob, finalUrl: options.url, responseHeaders: "Content-Type: image/png" }), "image/png");
            return { abort() {} };
        };
        window.GM = { getValue: async (_key, fallback) => fallback, setValue: async () => {}, deleteValue: async () => {}, addStyle: window.GM_addStyle, openInTab: window.GM_openInTab, setClipboard: window.GM_setClipboard, registerMenuCommand: window.GM_registerMenuCommand, notification: window.GM_notification, xmlHttpRequest: window.GM_xmlhttpRequest };
        window.unsafeWindow = window;
    });
    const built = fs.readFileSync(distPath, "utf8");
    expect(await page.evaluate(source => {
        try { new Function(source).call(window); return null; } catch (error) { return String(error && error.stack || error); }
    }, built)).toBeNull();
    await page.hover("#pdf");
    await page.keyboard.down("Control");
    const nativePreview = page.locator(".pv-pic-window-container.preview[data-koppy-document-preview='true']");
    await expect(nativePreview).toBeVisible();
    await expect(nativePreview.locator(".pv-pic-window-imgbox img")).toBeVisible();
    await expect(page.locator("#koppy-document-preview")).toHaveCount(0);
    await page.keyboard.up("Control");
    await expect(nativePreview).toBeHidden();
});
