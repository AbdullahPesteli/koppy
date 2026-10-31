const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const bridgeSource = fs.readFileSync(path.resolve(__dirname, "../../src/koppy-bridge.js"), "utf8");
const TOKEN = "e2e-secret-token";

// Fake Koppy Bridge: same contract as bridge/KoppyBridge.swift (token header, frame parsing, 401/429/413).
function startFake(options = {}) {
    const state = { writes: [], requests: 0, tokensSeenInBodies: 0 };
    const server = http.createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "content-type, x-koppy-token");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
        if (req.url === "/blank") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<!doctype html><title>x</title>"); }
        if (req.url === "/v1/health") { res.writeHead(200); return res.end(JSON.stringify({ ok: true })); }
        if (req.url !== "/v1/images") { res.writeHead(404); return res.end(); }
        state.requests += 1;
        const chunks = [];
        req.on("data", c => chunks.push(c));
        req.on("end", () => {
            const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
            if (options.rateLimitAfter && state.requests > options.rateLimitAfter) return send(429, { ok: false });
            if (req.headers["x-koppy-token"] !== TOKEN) return send(401, { ok: false, error: "yetkilendirme reddedildi" });
            const body = Buffer.concat(chunks);
            const images = []; let offset = 0;
            while (offset + 4 <= body.length) { const n = body.readUInt32BE(offset); offset += 4; images.push(body.subarray(offset, offset + n)); offset += n; }
            if (offset !== body.length || images.length < 2) return send(400, { ok: false });
            state.writes.push(images.map(i => i.length));
            send(200, { ok: true, count: images.length });
        });
    });
    return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve({ server, state, url: "http://127.0.0.1:" + server.address().port })));
}

async function setup(page, url, token) {
    await page.goto(url + "/blank");
    await page.addScriptTag({ content: bridgeSource.replace('"__KOPPY_VERSION__"', '"test"') });
    await page.evaluate(({ url, token }) => {
        // GM_xmlhttpRequest stand-in over fetch (the real one is sandbox-only).
        const gm = d => {
            fetch(d.url, { method: d.method, headers: d.headers, body: d.data }).then(async r => d.onload({ status: r.status, responseText: await r.text() }), () => d.onerror());
        };
        window.__bridge = KoppyBridge.create({ window, crypto, httpRequest: gm, bridgeUrl: url, getToken: () => token, publish: false });
        window.__png = (n) => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new Array(n).fill(1)])], { type: "image/png" });
    }, { url, token });
}

const write = (page, count) => page.evaluate(async count => {
    try { return { ok: true, result: await window.__bridge.writeImages(Array.from({ length: count }, (_, i) => ({ blob: window.__png(i) }))) }; }
    catch (e) { return { ok: false, message: e.message, code: e.koppyCode }; }
}, count);

test("3 images are written as 3 frames with the right token", async ({ page }) => {
    const fake = await startFake();
    try {
        await setup(page, fake.url, TOKEN);
        const out = await write(page, 3);
        expect(out).toEqual({ ok: true, result: { count: 3 } });
        expect(fake.state.writes).toEqual([[8, 9, 10]]);
    } finally { fake.server.close(); }
});

test("missing token never reaches the server and shows a visible error", async ({ page }) => {
    const fake = await startFake();
    try {
        await setup(page, fake.url, "");
        const out = await write(page, 2);
        expect(out.ok).toBe(false);
        expect(out.code).toBe("bridge-token-missing");
        expect(fake.state.requests).toBe(0);
    } finally { fake.server.close(); }
});

test("wrong token → 401 → visible error, nothing written, token not in message", async ({ page }) => {
    const fake = await startFake();
    try {
        await setup(page, fake.url, "wrong-token-xyz");
        const out = await write(page, 2);
        expect(out.ok).toBe(false);
        expect(out.code).toBe("bridge-token-rejected");
        expect(out.message).not.toContain("wrong-token-xyz");
        expect(fake.state.writes).toEqual([]);
    } finally { fake.server.close(); }
});

test("bridge down → 'köprü kurulu değil'; status reports not-installed", async ({ page }) => {
    const fake = await startFake();
    const dead = fake.url;
    await setup(page, dead, TOKEN);
    fake.server.close();
    await new Promise(r => setTimeout(r, 100));
    const out = await write(page, 2);
    expect(out.code).toBe("bridge-not-installed");
    expect(out.message).toContain("köprü kurulu değil");
    expect(await page.evaluate(() => window.__bridge.status())).toBe("not-installed");
});

test("rate limit → 429 surfaces as a specific error; status running/no-token", async ({ page }) => {
    const fake = await startFake({ rateLimitAfter: 1 });
    try {
        await setup(page, fake.url, TOKEN);
        expect((await write(page, 2)).ok).toBe(true);
        const limited = await write(page, 2);
        expect(limited.code).toBe("bridge-rate-limited");
        expect(await page.evaluate(() => window.__bridge.status())).toBe("running");
    } finally { fake.server.close(); }
});

test("too many images are refused client-side", async ({ page }) => {
    const fake = await startFake();
    try {
        await setup(page, fake.url, TOKEN);
        const out = await write(page, 11);
        expect(out.code).toBe("bridge-too-many-images");
        expect(fake.state.requests).toBe(0);
    } finally { fake.server.close(); }
});
