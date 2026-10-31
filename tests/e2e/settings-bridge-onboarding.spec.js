const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const http = require("node:http");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
// dist/ is not owned by this card: build the current sources to a scratch file instead.
const distPath = path.join(process.env.TMPDIR || require("node:os").tmpdir(), "koppy-k14-settings.user.js");
test.beforeAll(() => { execFileSync("node", ["scripts/build.mjs"], { cwd: root, env: { ...process.env, KOPPY_BUILD_OUT: distPath }, stdio: "pipe" }); });
const TOKEN = "k14-good-token";

async function bootBuiltKoppy(page, storedPreferences) {
    await page.route("https://www.google.com/search?**", route => route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><html><head><script nonce='koppy-script-e2e'></script><style nonce='koppy-style-e2e'></style></head><body style='margin:0;background:#202124'><main style='height:100vh'></main></body></html>",
    }));
    await page.goto("https://www.google.com/search?q=koppy&udm=2");
    await page.evaluate(preferences => {
        window.__attackerCapturedShadows = [];
        window.__attackerCapturedFrames = [];
        const nativeAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (init) {
            const root = nativeAttachShadow.call(this, init);
            window.__attackerCapturedShadows.push(root);
            return root;
        };
        const nativeAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function (child) {
            if (child && child.tagName === "IFRAME") window.__attackerCapturedFrames.push(child);
            return nativeAppendChild.call(this, child);
        };
        window.__gmValues = new Map();
        window.__gmValues.set("pv-prefs", JSON.stringify(preferences || { "gallery.aria2Token": "TOP-SECRET" }));
        window.__gmWrites = [];
        window.__failGmWrites = false;
        window.__commands = [];
        window.__openedTabs = [];
        window.GM_getValue = (key, fallback) => window.__gmValues.has(key) ? window.__gmValues.get(key) : fallback;
        window.GM_setValue = (key, value) => {
            if (window.__failGmWrites) throw new Error("simulated storage failure");
            window.__gmValues.set(key, value);
            window.__gmWrites.push({ key, value });
        };
        window.GM_deleteValue = key => window.__gmValues.delete(key);
        window.GM_addStyle = css => {
            const style = document.createElement("style");
            style.textContent = css;
            document.head.appendChild(style);
            return style;
        };
        window.GM_openInTab = (url, options) => {
            window.__openedTabs.push({ url, options });
            return null;
        };
        window.GM_setClipboard = () => {};
        window.GM_registerMenuCommand = (label, callback) => {
            window.__commands.push({ label, callback });
            return window.__commands.length;
        };
        window.GM_notification = () => {};
        window.GM_download = () => {};
        window.GM_xmlhttpRequest = options => {
            const ctl = new AbortController();
            const timer = setTimeout(() => { ctl.abort(); options.ontimeout && options.ontimeout(); }, options.timeout || 5000);
            fetch(options.url, { method: options.method, headers: options.headers, body: options.data, signal: ctl.signal })
                .then(async r => { clearTimeout(timer); options.onload && options.onload({ status: r.status, responseText: await r.text() }); })
                .catch(() => { clearTimeout(timer); options.onerror && options.onerror({ status: 0 }); });
            return { abort() { ctl.abort(); } };
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
    }, storedPreferences);

    const built = fs.readFileSync(distPath, "utf8");
    expect(built).not.toContain("https://hoothin.com/scripts/pvcep/");
    expect(built).not.toContain("https://pv.hoothin.com/first-run");
    expect(built).not.toContain("https://s2.loli.net/2023/02/06/afTMxeASm48z5vE.jpg");
    expect(built).not.toContain("customRules = unsafeWindow.eval");
    const error = await page.evaluate(source => {
        try {
            new Function(source).call(window);
            return null;
        } catch (caught) {
            return String(caught && caught.stack || caught);
        }
    }, built);
    expect(error).toBeNull();
    expect(await page.evaluate(() => window.__commands.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__openedTabs)).toEqual([]);
}

async function openSettings(page) {
    // The Tampermonkey menu is deliberately a single compact Control Centre;
    // exercise the real entry and then its in-panel Settings action.
    await expect.poll(() => page.evaluate(() => window.__commands.map(command => command.label))).toEqual(["Koppy · Kontrol Merkezi"]);
    await page.evaluate(() => window.__commands[0].callback());
    const deck = page.locator("koppy-control-deck");
    await expect(deck.locator(".panel.open")).toBeVisible();
    await deck.locator(".full-settings").click();
    await expect.poll(async () => {
        for (const candidate of page.frames()) {
            if (candidate === page.mainFrame()) continue;
            if (await candidate.locator(".koppy-brand-title").count()) return true;
        }
        return false;
    }).toBe(true);
    const frame = page.frames().find(candidate => candidate !== page.mainFrame());
    await expect(frame.locator(".koppy-brand-title")).toHaveText("Koppy Ayarları");
    return frame;
}

// Fake Koppy Bridge via request interception (the real bridge may already own port 47651).
// mode: "up" = health 200 + images 200/401 by token; "down" = connection refused.
async function startFake(page, mode = "up") {
    const state = { posts: 0, lastToken: null };
    await page.route("http://127.0.0.1:47651/**", async route => {
        const req = route.request();
        const url = new URL(req.url());
        const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-koppy-token", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
        if (mode === "down") return route.abort("connectionrefused");
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        if (url.pathname === "/v1/health") return route.fulfill({ status: 200, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, version: "0.7.1" }) });
        if (url.pathname === "/v1/images") {
            state.posts += 1; state.lastToken = req.headers()["x-koppy-token"];
            const good = state.lastToken === TOKEN;
            return route.fulfill({ status: good ? 200 : 401, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(good ? { ok: true, count: 2 } : { ok: false }) });
        }
        return route.fulfill({ status: 404, headers: cors, body: "" });
    });
    return state;
}

async function bridgeCard(page) {
    const frame = await openSettings(page);
    await frame.locator(".nav-tabs .section_header").nth(4).click();
    const card = frame.locator("[data-bridge-card]");
    await expect(card).toBeVisible();
    return { frame, card };
}

test("Köprü bölümü görünür: durum satırı, token alanı, test düğmesi, token ipucu + kopyala", async ({ page }) => {
    const fake = { state: await startFake(page) };
    {
        await bootBuiltKoppy(page);
        const { card } = await bridgeCard(page);
        await expect(card.locator(".koppy-bridge-status")).toHaveText("çalışıyor (v0.7.1) · token yok");
        await expect(card.locator("#koppy-bridge-token")).toBeVisible();
        await expect(card.locator("#koppy-bridge-test")).toHaveText("Bağlantıyı test et");
        await expect(card.locator("#koppy-bridge-token-hint code")).toHaveText("cat ~/.koppy/bridge-token");
        await expect(card.locator("#koppy-bridge-copy-cmd")).toBeVisible();
        await expect(card.locator("#koppy-bridge-install")).toBeHidden();
    }
});

test("Bağlantıyı test et: 200 -> hazır, 401 -> token yanlış (sahte köprü)", async ({ page }) => {
    const fake = { state: await startFake(page) };
    {
        await bootBuiltKoppy(page);
        const { card } = await bridgeCard(page);
        const result = card.locator("#koppy-bridge-test-result");
        await card.locator("#koppy-bridge-token").fill("wrong-token");
        await card.locator("#koppy-bridge-test").click();
        await expect(result).toHaveText("token yanlış");
        await expect(result).toHaveAttribute("data-test-state", "token-wrong");
        await card.locator("#koppy-bridge-token").fill(TOKEN);
        await card.locator("#koppy-bridge-test").click();
        await expect(result).toContainText("köprü hazır, çoklu yapıştırma açık");
        await expect(result).toHaveAttribute("data-test-state", "ready");
        expect(fake.state.posts).toBe(2);
        expect(fake.state.lastToken).toBe(TOKEN);
    }
});

test("Bağlantıyı test et: köprü yoksa -> köprü çalışmıyor + kurulum komutu", async ({ page }) => {
    await startFake(page, "down");
    await bootBuiltKoppy(page);
    const { card } = await bridgeCard(page);
    await expect(card.locator(".koppy-bridge-status")).toContainText("köprü kurulu değil");
    await expect(card.locator("#koppy-bridge-install")).toBeVisible();
    await card.locator("#koppy-bridge-token").fill("anything");
    await card.locator("#koppy-bridge-test").click();
    const result = card.locator("#koppy-bridge-test-result");
    await expect(result).toContainText("köprü çalışmıyor");
    await expect(result).toContainText("scripts/install-bridge.sh");
    await expect(result).toHaveAttribute("data-test-state", "unreachable");
});
