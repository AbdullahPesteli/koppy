const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const modulePath = path.resolve(__dirname, "../../src/koppy-control-deck.js");

test("live control deck applies a single modifier, repositions an active bar and stays compact", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent("<!doctype html><body style='margin:0;background:#202832'></body>");
    await page.addScriptTag({ path: modulePath });
    await page.evaluate(() => {
        const prefs = window.__deckPrefs = {
            floatBar: {
                position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0,
                globalkeys: { ctrl: true, alt: false, shift: false, command: false },
            },
        };
        const names = [
            "floatBar.position", "floatBar.previewMaxSizeW", "floatBar.previewMaxSizeH",
            "floatBar.globalkeys.ctrl", "floatBar.globalkeys.alt", "floatBar.globalkeys.shift", "floatBar.globalkeys.command",
        ];
        const setPath = (target, path, value) => {
            const keys = path.split("."); const last = keys.pop(); let current = target;
            keys.forEach(key => { current = current[key]; }); current[last] = value;
        };
        const fields = Object.fromEntries(names.map(name => [name, { value: null }]));
        const config = {
            fields, isOpen: false, set(name, value) { fields[name].value = value; },
            save() { Object.entries(fields).forEach(([name, field]) => { if (field.value !== null) setPath(prefs, name, field.value); }); return true; },
        };
        window.__repositions = 0;
        window.__deck = window.KoppyControlDeck.install({
            document, window, config, prefs,
            getFloatBar: () => ({ shown: true, data: {}, setPosition() { window.__repositions += 1; } }),
        });
        window.__deck.show();
    });

    const host = page.locator("koppy-control-deck");
    const panel = host.locator(".panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Canlı Kontrol");
    await expect(panel).toContainText("Tüm ayarları aç");
    await host.locator('button[aria-label="Command ile önizleme"]').click();
    await expect.poll(() => page.evaluate(() => window.__deckPrefs.floatBar.globalkeys.command)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__deckPrefs.floatBar.globalkeys.ctrl)).toBe(false);
    await host.locator('button[aria-label="Sol alt"]').click();
    await expect.poll(() => page.evaluate(() => window.__repositions)).toBe(1);

    const box = await panel.boundingBox();
    expect(box.width).toBeLessThanOrEqual(340);
    expect(box.height).toBeLessThan(620);
    fs.mkdirSync(path.resolve("test-results"), { recursive: true });
    await page.screenshot({ path: "test-results/koppy-control-deck.png" });
});

test("live control deck uses a bottom sheet on narrow viewports", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent("<!doctype html><body></body>");
    await page.addScriptTag({ path: modulePath });
    const box = await page.evaluate(() => {
        const prefs = { floatBar: { position: "top right", previewMaxSizeW: 0, previewMaxSizeH: 0, globalkeys: { ctrl: false, alt: false, shift: false, command: true } } };
        const keys = ["floatBar.position", "floatBar.previewMaxSizeW", "floatBar.previewMaxSizeH", "floatBar.globalkeys.ctrl", "floatBar.globalkeys.alt", "floatBar.globalkeys.shift", "floatBar.globalkeys.command"];
        const config = { fields: Object.fromEntries(keys.map(key => [key, { value: null }])), isOpen: false, set(key, value) { this.fields[key].value = value; }, save() { return true; } };
        const deck = window.KoppyControlDeck.install({ document, window, config, prefs });
        deck.show();
        const rect = document.querySelector("koppy-control-deck").shadowRoot.querySelector(".panel").getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom, viewport: innerWidth };
    });
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.right).toBeLessThanOrEqual(box.viewport - 8);
    expect(box.bottom).toBeLessThanOrEqual(836);
});
