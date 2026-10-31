const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const modulePath = path.resolve(__dirname, "../../src/google-images-copy.js");
const fx = name => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

async function boot(page, file, url) {
    await page.route(url.split("?")[0] + "**", r => r.fulfill({ status: 200, contentType: "text/html", body: fx(file) }));
    await page.route("**/search?**", r => r.fulfill({ status: 200, contentType: "text/html", body: fx(file) }));
    await page.goto(url);
    await page.addScriptTag({ path: modulePath });
    await page.evaluate(() => {
        window.__requests = [];
        const requestImage = url => {
            window.__requests.push(url);
            const canvas = document.createElement("canvas");
            canvas.width = 300; canvas.height = 200;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#3366cc"; ctx.fillRect(0, 0, 300, 200);
            return { abort() {}, promise: new Promise(res => canvas.toBlob(blob => res({ blob, finalUrl: url }), "image/png")) };
        };
        window.__ctl = window.KoppyGoogleCopy.createController({ document, window, location, navigator, ClipboardItem, requestImage });
        window.__started = window.__ctl.start();
    });
    expect(await page.evaluate(() => window.__started)).toBe(true);
}

async function clip(page) {
    return page.evaluate(async () => {
        try {
            const items = await navigator.clipboard.read();
            const types = items.length ? items[0].types : [];
            if (!types.includes("image/png")) return { types, bytes: 0 };
            const blob = await items[0].getType("image/png");
            return { types, bytes: blob.size, mime: blob.type };
        } catch (e) { return { error: String(e), types: [], bytes: 0 }; }
    });
}

async function copyOver(page) {
    await page.evaluate(() => navigator.clipboard.writeText("SENTINEL"));
    await page.hover("#t");
    await page.waitForTimeout(150);
    await page.keyboard.press("Meta+C");
    await page.waitForTimeout(700);
    return { clip: await clip(page), requests: await page.evaluate(() => window.__requests.slice()), toast: await page.locator("#koppy-copy-toast").innerText().catch(() => "") };
}

const SHOP = "https://shop.example.test/p";
const cases = [
    { id: "a-img", file: "a-img.html", url: SHOP, want: "https://shop.example.test/img/small.jpg" },
    { id: "b-srcset-picture", file: "b-srcset-picture.html", url: SHOP, want: "https://shop.example.test/img/pic-1600.webp" },
    { id: "c-background", file: "c-background.html", url: SHOP, want: "https://shop.example.test/img/bg-hero.jpg" },
    { id: "d-google-preview-only", file: "d-google-preview-only.html", url: "https://www.google.com/search?q=koppy&udm=2", want: "tbn:ONLYPREVIEW" },
    { id: "e-data-uri", file: "e-data-uri.html", url: SHOP, want: "data:image/png" },
];

for (const c of cases) {
    test("copy coverage " + c.id, async ({ page }) => {
        await boot(page, c.file, c.url);
        const r = await copyOver(page);
        console.log("RESULT " + c.id + " " + JSON.stringify(r).slice(0, 400));
        expect(r.requests.length).toBeGreaterThan(0);
        expect(r.requests[0]).toContain(c.want);
        expect(r.clip.types).toEqual(["image/png"]);
        expect(r.clip.bytes).toBeGreaterThan(0);
    });
}

test("text selection keeps native Cmd+C", async ({ page }) => {
    await boot(page, "a-img.html", SHOP);
    await page.locator("#inp").selectText();
    await page.keyboard.press("Meta+C");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("plain text");
    expect(await page.evaluate(() => window.__requests.length)).toBe(0);
});

test("unresolvable source shows honest visible error (no silent drop)", async ({ page }) => {
    await boot(page, "f-unresolvable.html", SHOP);
    const r = await copyOver(page);
    expect(r.requests.length).toBe(0);
    expect(r.toast).toContain("kopyalanamadı: kaynak çözülemedi");
    expect(r.clip.types).toEqual(["text/plain"]);
});
