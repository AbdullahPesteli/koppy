const test = require("node:test");
const assert = require("node:assert/strict");
const KoppyBridge = require("../../src/koppy-bridge.js");

const noWindow = { window: null, crypto: null, publish: false };

// Scripted GM_xmlhttpRequest: route -> {status, body} | "error" | "timeout".
function fakeHttp(routes, log) {
    return d => {
        const key = d.method + " " + d.url.replace(/^http:\/\/[^/]+/, "");
        if (log) log.push({ key, headers: d.headers, data: d.data, timeout: d.timeout });
        const r = routes[key];
        queueMicrotask(() => {
            if (r === "error") return d.onerror();
            if (r === "timeout") return d.ontimeout();
            if (!r) return d.onload({ status: 404, responseText: "" });
            d.onload({ status: r.status, responseText: typeof r.body === "string" ? r.body : JSON.stringify(r.body || {}) });
        });
    };
}
const mk = (routes, token, log) => KoppyBridge.create({ ...noWindow, httpRequest: fakeHttp(routes, log), getToken: () => token });

test("describeStatus: çalışıyor (vX) · token yok / token var / kurulu değil", () => {
    assert.equal(KoppyBridge.describeStatus({ reachable: true, version: "0.7.1", hasToken: false }), "çalışıyor (v0.7.1) · token yok");
    assert.equal(KoppyBridge.describeStatus({ reachable: true, version: "v0.7.1", hasToken: true }), "çalışıyor (v0.7.1) · token var");
    assert.equal(KoppyBridge.describeStatus({ reachable: false, reason: "bağlantı reddedildi" }), "köprü kurulu değil (bağlantı reddedildi)");
});

test("details(): health 200 + sürüm + token yok -> no-token metni", async () => {
    const log = [];
    const b = mk({ "GET /v1/health": { status: 200, body: { ok: true, version: "0.7.1" } } }, "", log);
    const d = await b.details();
    assert.equal(d.state, "no-token");
    assert.equal(d.version, "0.7.1");
    assert.equal(d.text, "çalışıyor (v0.7.1) · token yok");
    assert.equal(log[0].timeout, 2000, "health 2 sn timeout");
});

test("details(): ağ hatası sessiz yutulmaz, neden metinde", async () => {
    const d = await mk({ "GET /v1/health": "error" }, "tok").details();
    assert.equal(d.state, "not-installed");
    assert.match(d.text, /köprü kurulu değil \(bağlantı reddedildi\)/);
    const t = await mk({ "GET /v1/health": "timeout" }, "tok").details();
    assert.match(t.text, /2 sn içinde yanıt yok/);
});

test("status() geriye uyumlu: running / no-token / not-installed", async () => {
    const ok = { "GET /v1/health": { status: 200, body: { version: "1" } } };
    assert.equal(await mk(ok, "t").status(), "running");
    assert.equal(await mk(ok, "").status(), "no-token");
    assert.equal(await mk({ "GET /v1/health": "error" }, "t").status(), "not-installed");
});

test("testConnection 200 -> köprü hazır, 2 kare PNG gönderilir, token başlıkta", async () => {
    const log = [];
    const b = mk({ "GET /v1/health": { status: 200, body: { version: "0.7.1" } }, "POST /v1/images": { status: 200, body: { ok: true, count: 2 } } }, "stored-token", log);
    const r = await b.testConnection("");
    assert.equal(r.state, "ready");
    assert.equal(r.ok, true);
    assert.match(r.message, /köprü hazır, çoklu yapıştırma açık/);
    const post = log.find(x => x.key === "POST /v1/images");
    assert.equal(post.headers["X-Koppy-Token"], "stored-token");
    const frame = Buffer.from(await post.data.arrayBuffer());
    const n = frame.readUInt32BE(0);
    assert.equal(frame.subarray(4, 12).toString("hex"), "89504e470d0a1a0a");
    assert.equal(frame.length, 2 * (4 + n), "iki özdeş kare (köprü >=2 ister)");
});

test("testConnection: yazılan token saklı olanın önüne geçer", async () => {
    const log = [];
    const b = mk({ "GET /v1/health": { status: 200, body: {} }, "POST /v1/images": { status: 200, body: { count: 2 } } }, "stored", log);
    await b.testConnection("  typed-token ");
    assert.equal(log.find(x => x.key === "POST /v1/images").headers["X-Koppy-Token"], "typed-token");
});

test("testConnection 401 -> token yanlış", async () => {
    const b = mk({ "GET /v1/health": { status: 200, body: {} }, "POST /v1/images": { status: 401, body: { ok: false } } }, "bad");
    const r = await b.testConnection("");
    assert.deepEqual([r.state, r.ok, r.message], ["token-wrong", false, "token yanlış"]);
});

test("testConnection ağ hatası -> köprü çalışmıyor + kurulum komutu, istek gitmez", async () => {
    const log = [];
    const r = await mk({ "GET /v1/health": "error" }, "tok", log).testConnection("");
    assert.equal(r.state, "unreachable");
    assert.match(r.message, /köprü çalışmıyor/);
    assert.match(r.message, /scripts\/install-bridge\.sh/);
    assert.equal(log.some(x => x.key.startsWith("POST")), false);
});

test("testConnection: token yok -> sunucuya görsel gitmez", async () => {
    const log = [];
    const r = await mk({ "GET /v1/health": { status: 200, body: {} } }, "", log).testConnection("");
    assert.equal(r.state, "no-token");
    assert.match(r.message, /cat ~\/\.koppy\/bridge-token/);
    assert.equal(log.some(x => x.key.startsWith("POST")), false);
});

test("testConnection: POST sırasında bağlantı düşerse unreachable; 429 ayrı", async () => {
    const down = await mk({ "GET /v1/health": { status: 200, body: {} }, "POST /v1/images": "error" }, "t").testConnection("");
    assert.equal(down.state, "unreachable");
    const rl = await mk({ "GET /v1/health": { status: 200, body: {} }, "POST /v1/images": { status: 429, body: {} } }, "t").testConnection("");
    assert.equal(rl.state, "rate-limited");
});

test("classifyTest: bilinmeyen durum error", () => {
    assert.equal(KoppyBridge.classifyTest({ outcome: "http", status: 500 }).state, "error");
});
