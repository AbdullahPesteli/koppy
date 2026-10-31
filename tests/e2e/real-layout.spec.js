// K08: gerçek Google/BBC snapshot'ları üzerinde dist/Koppy.user.js ile 5 kaynak türü ölçümü.
// Snapshot'lar tests/e2e/fixtures/real/ altındadır (curl / gerçek Chrome ile alındı). Ürün kodu değiştirilmez.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const realDir = path.join(__dirname, "fixtures", "real");
const distPath = path.resolve(__dirname, "../../dist/Koppy.user.js");
const built = fs.readFileSync(distPath, "utf8");
const find = suffix => fs.readdirSync(realDir).filter(f => f.endsWith(suffix)).sort().pop();
const resultsFile = path.join(realDir, "results.json");
const results = {};

const SNAPSHOTS = [
    { id: "google-udm2", file: find("google-udm2-kedi-rendered.html"), url: "https://www.google.com/search?q=kedi&udm=2", google: true },
    { id: "google-tbm-isch", file: find("google-udm2-kedi-via-tbm-isch-rendered.html"), url: "https://www.google.com/search?q=kedi&tbm=isch", google: true },
    { id: "bbc-news", file: find("bbc-news-front-curl.html"), url: "https://www.bbc.com/news", google: false },
];
// Gerçek BBC görseli (snapshot içindeki srcSet'ten); injekte senaryolar bunu kullanır.
const bbcHtml = fs.readFileSync(path.join(realDir, find("bbc-news-front-curl.html")), "utf8");
const bbcSet = (bbcHtml.match(/srcSet="([^"]+)"/) || [])[1] || "";
const bbcUrls = bbcSet.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
const BBC_SMALL = bbcUrls[0], BBC_LARGE = bbcUrls[bbcUrls.length - 1];

function neutralize(html) { // sayfa JS'i çalışmasın (gerçek DOM kalsın)
    return html.replace(/<script\b([^>]*)>/g, (m, a) => '<script type="text/plain"' + a.replace(/\btype="[^"]*"/, "") + ">");
}

async function boot(page, snap) {
    const html = neutralize(fs.readFileSync(path.join(realDir, snap.file), "utf8"));
    const origin = snap.url.split("?")[0];
    await page.route("**/*", r => {
        const q = r.request();
        if (q.resourceType() === "document" && q.url().startsWith(origin)) return r.fulfill({ status: 200, contentType: "text/html", body: html });
        return r.continue();
    });
    await page.exposeFunction("__nodeFetch", async url => {
        try {
            const res = await page.context().request.get(url, { timeout: 20000, headers: { Referer: snap.url } });
            const body = await res.body();
            return { status: res.status(), ctype: res.headers()["content-type"] || "", b64: body.toString("base64") };
        } catch (e) { return { status: 0, error: String(e).slice(0, 120) }; }
    });
    await page.goto(snap.url, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
        const values = new Map();
        window.__reqs = [];
        window.GM_getValue = (k, f) => values.has(k) ? values.get(k) : f;
        window.GM_setValue = (k, v) => values.set(k, v);
        window.GM_deleteValue = k => values.delete(k);
        window.GM_addStyle = css => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); return s; };
        window.GM_openInTab = () => null; window.GM_setClipboard = () => {}; window.GM_registerMenuCommand = () => {};
        window.GM_notification = () => {}; window.GM_download = () => {};
        window.GM_xmlhttpRequest = options => {
            const rec = { url: String(options.url).slice(0, 160) };
            window.__reqs.push(rec);
            let aborted = false;
            window.__nodeFetch(options.url).then(r => {
                rec.status = r.status; rec.ctype = r.ctype; rec.error = r.error;
                if (aborted) return;
                if (r.status >= 200 && r.status < 300) {
                    const bin = atob(r.b64); const u8 = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                    rec.bytes = u8.length;
                    options.onload({ status: r.status, response: new Blob([u8], { type: r.ctype }), finalUrl: options.url, responseHeaders: "Content-Type: " + r.ctype });
                } else (options.onerror || options.onload)({ status: r.status, finalUrl: options.url, error: r.error || "HTTP " + r.status });
            });
            return { abort() { aborted = true; if (options.onabort) options.onabort(); } };
        };
        window.GM = {
            getValue: async (k, f) => window.GM_getValue(k, f), setValue: async (k, v) => window.GM_setValue(k, v), deleteValue: async k => window.GM_deleteValue(k),
            addStyle: window.GM_addStyle, openInTab: window.GM_openInTab, setClipboard: window.GM_setClipboard,
            registerMenuCommand: window.GM_registerMenuCommand, notification: window.GM_notification, xmlHttpRequest: window.GM_xmlhttpRequest,
        };
        window.unsafeWindow = window;
    });
    const err = await page.evaluate(src => { try { new Function(src).call(window); return null; } catch (e) { return String(e && e.stack || e); } }, built);
    expect(err).toBeNull();
}

async function clip(page) {
    return page.evaluate(async () => {
        try {
            const items = await Promise.race([navigator.clipboard.read(), new Promise((_, rej) => setTimeout(() => rej(new Error("clipboard.read timeout 5s")), 5000))]);
            const types = items.length ? items[0].types : [];
            const t = types.find(x => x.startsWith("image/"));
            if (!t) return { types, bytes: 0 };
            const blob = await items[0].getType(t);
            const bmp = await createImageBitmap(blob); const dim = bmp.width + "x" + bmp.height; bmp.close();
            return { types, mime: blob.type, bytes: blob.size, dim };
        } catch (e) { return { error: String(e).slice(0, 100), types: [], bytes: 0 }; }
    });
}

async function copyOn(page, selector) {
    await page.evaluate(() => { window.__reqs.length = 0; return navigator.clipboard.writeText("SENTINEL"); });
    const loc = page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded();
    await loc.hover({ force: true });
    await page.waitForTimeout(400);
    await page.keyboard.press("Meta+C");
    await page.waitForFunction(() => !!document.querySelector("#koppy-copy-toast"), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const toast = await page.locator("#koppy-copy-toast").innerText({ timeout: 500 }).catch(() => "");
    const feedback = await page.locator("#koppy-copy-feedback").innerText({ timeout: 500 }).catch(() => "");
    const requests = await page.evaluate(() => window.__reqs.map(r => Object.assign({}, r)));
    // Koppy hiç tetiklenmediyse (istek yok, toast yok) clipboard.read() sayfayı kilitleyebiliyor: yalnız metin sentinel'i okunur.
    const fired = requests.length > 0 || !!toast;
    const cl = fired ? await clip(page) : { types: ["text/plain"], bytes: 0, note: "Koppy tetiklenmedi; pano hâlâ SENTINEL=" + (await page.evaluate(() => navigator.clipboard.readText())) };
    return { clip: cl, requests, toast, feedback };
}

// Gerçek DOM'a enjekte edilen (ve "enjekte" diye etiketlenen) kaynak türleri; gerçek BBC görsel URL'leriyle.
const INJECT = {
    a: `<img id="k08-inj" src="${BBC_SMALL}" width="60" height="34" style="position:fixed;left:20px;top:20px;z-index:2147483000">`,
    b: `<picture><source type="image/webp" srcset="${BBC_SMALL} 240w, ${BBC_LARGE} 1024w" sizes="60px"><img id="k08-inj" src="${BBC_SMALL}" width="60" height="34" style="position:fixed;left:20px;top:20px;z-index:2147483000"></picture>`,
    c: `<div id="k08-inj" style="position:fixed;left:20px;top:20px;width:80px;height:50px;z-index:2147483000;background:url('${BBC_LARGE}') center/cover no-repeat"></div>`,
};
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
INJECT.e = `<img id="k08-inj" src="${TINY_PNG}" width="40" height="40" style="position:fixed;left:20px;top:20px;z-index:2147483000;image-rendering:pixelated">`;

for (const snap of SNAPSHOTS) {
    const record = (key, r) => { results[snap.id + "/" + key] = r; fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2)); console.log("RESULT " + snap.id + "/" + key + " " + JSON.stringify(r).slice(0, 700)); };

    // Doğal senaryolar (snapshot'ın kendi markup'ı)
    if (snap.google) {
        test(`${snap.id} · e doğal: data: URI kart (gerçek Google)`, async ({ page }) => {
            await boot(page, snap);
            await page.evaluate(() => { const i = [...document.images].find(x => x.src.startsWith("data:image") && x.closest("[data-docid]") && x.getBoundingClientRect().width > 100); if (i) i.id = "k08-nat"; });
            expect(await page.locator("#k08-nat").count()).toBe(1);
            record("e-natural-data-uri-card", await copyOn(page, "#k08-nat"));
        });
        test(`${snap.id} · d doğal: yalnız preview (tbn) kartı (gerçek Google)`, async ({ page }) => {
            await boot(page, snap);
            await page.evaluate(() => { const i = [...document.images].find(x => /^https:\/\/encrypted-tbn/.test(x.src) && x.closest("[data-docid]") && x.getBoundingClientRect().width > 100); if (i) i.id = "k08-nat"; });
            if (await page.locator("#k08-nat").count() === 0) {
                const n = await page.evaluate(() => [...document.images].filter(x => x.closest("[data-docid]")).length);
                record("d-natural-preview-only-card", { na: true, note: "snapshot'ta tbn: URL'li kart yok (hepsi data: placeholder); docid'li img=" + n, clip: { types: [], bytes: 0 }, requests: [], toast: "" });
                return;
            }
            record("d-natural-preview-only-card", await copyOn(page, "#k08-nat"));
        });
    } else {
        test(`${snap.id} · a doğal: gerçek <img> (BBC)`, async ({ page }) => {
            await boot(page, snap);
            await page.evaluate(() => { const i = [...document.images].find(x => /ichef\.bbci/.test(x.currentSrc || x.src) && x.getBoundingClientRect().width > 100); if (i) i.id = "k08-nat"; });
            expect(await page.locator("#k08-nat").count()).toBe(1);
            record("ab-natural-img-srcset", Object.assign({ srcset: await page.evaluate(() => !!document.querySelector("#k08-nat").srcset) }, await copyOn(page, "#k08-nat")));
        });
    }
    // Enjekte senaryolar (gerçek sayfa DOM'unda, gerçek BBC görsel URL'leriyle)
    for (const k of ["a", "b", "c", "e"]) {
        test(`${snap.id} · ${k} enjekte`, async ({ page }) => {
            await boot(page, snap);
            await page.evaluate(h => document.body.insertAdjacentHTML("beforeend", h), INJECT[k]);
            const r = await copyOn(page, "#k08-inj");
            record(k + "-injected", r);
            // K12: sessiz düşüş yasak. c: kopyalanır (BBC1536); e: 1x1 data: -> görünür "görsel değil" hatası, pano görsel olmaz.
            if (k === "c") {
                expect(r.clip.types).toContain("image/png");
                expect(r.requests.length).toBeGreaterThan(0);
                expect(r.toast).toMatch(/Kopyaland/);
            }
            if (k === "e") {
                expect(r.toast).toContain(snap.google ? "bu öğe görsel değil" : "kopyalanamadı"); // BBC: mevcut görünür hata
                expect(r.requests.length).toBe(0);
                expect(r.clip.types).not.toContain("image/png");
            }
        });
    }
}

test.afterAll(() => { fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2)); });
