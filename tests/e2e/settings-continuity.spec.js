const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

async function openDetails(page, tab = 'control') {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('https://koppy.test/continuity', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="background:#202832;color:white"><div style="position:fixed;bottom:12px;left:12px;z-index:2147483647">LAB · örnek veri</div></body>' }));
    await page.goto('https://koppy.test/continuity');
    await page.evaluate(() => {
        const store = {};
        window.GM_getValue = (key, fallback) => store[key] ?? fallback;
        window.GM_setValue = (key, value) => { store[key] = value; };
        window.GM_addStyle = css => { const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style); };
        window.GM_registerMenuCommand = (label, callback) => { if (label === 'Koppy · Kontrol Merkezi') window.openDeck = callback; };
        window.GM_getResourceText = () => ''; window.GM_getResourceURL = () => '';
        window.GM_info = { script: { version: '0.8.2' } };
        window.GM_openInTab = () => {}; window.GM_xmlhttpRequest = () => {};
        window.GM_deleteValue = key => { delete store[key]; };
        window.GM_setClipboard = () => {}; window.GM_notification = () => {}; window.GM_download = () => {};
        window.unsafeWindow = window;
        window.GM = { getValue: async (key, fallback) => window.GM_getValue(key, fallback), setValue: async (key, value) => window.GM_setValue(key, value), addStyle: window.GM_addStyle, registerMenuCommand: window.GM_registerMenuCommand, xmlHttpRequest: window.GM_xmlhttpRequest };
    });
    await page.evaluate(source => new Function(source).call(window), fs.readFileSync(path.resolve(__dirname, '../../dist/Koppy.user.js'), 'utf8'));
    await expect.poll(() => page.evaluate(() => typeof window.openDeck)).toBe('function');
    await page.evaluate(() => window.openDeck());
    await page.locator('koppy-control-deck .tab').filter({ hasText: { control: 'Kontrol', behavior: 'Davranış', tools: 'Araçlar' }[tab] }).click();
    await page.locator('koppy-control-deck .full-settings').click();
    await expect.poll(() => page.frames().length).toBe(2);
    const frame = page.frames().find(candidate => candidate !== page.mainFrame());
    await expect(frame.locator('#pv-prefs_wrapper')).toBeVisible();
    return frame;
}

test('toolbar details land on the toolbar category', async ({ page }) => {
    const frame = await openDetails(page);
    fs.mkdirSync(path.resolve(__dirname, '../../reports/k28'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, `../../reports/k28/${process.env.K28_BEFORE ? 'before' : 'after'}.png`) });
    await expect(frame.locator('#pv-prefs_section_header_0')).toHaveAttribute('aria-selected', 'true');
});

test('details use a consistent toolbar heading and offer a return link', async ({ page }) => {
    const frame = await openDetails(page);
    await expect(frame.getByRole('button', { name: "Kontrol Merkezi’ne dön" })).toBeVisible();
    await expect(frame.locator('#pv-prefs_section_header_0')).toHaveText('Araç çubuğu');
    await frame.getByRole('button', { name: "Kontrol Merkezi’ne dön" }).click();
    await expect(page.locator('koppy-control-deck .panel.open .tab[aria-pressed="true"]')).toHaveText('Kontrol');
});

for (const action of ['escape', 'cancel', 'save']) {
    test(`details ${action} returns to tools after the General fallback`, async ({ page }) => {
        const frame = await openDetails(page, 'tools');
        await expect(frame.locator('#pv-prefs_section_header_4')).toHaveAttribute('aria-selected', 'true');
        if (action === 'escape') await frame.locator('#koppy-settings-search').press('Escape');
        else {
            if (action === 'save') await frame.locator('#pv-prefs_field_debug').check();
            const button = frame.locator(action === 'save' ? '#pv-prefs_saveBtn' : '#pv-prefs_closeBtn');
            await button.focus();
            await page.keyboard.press('Enter');
        }
        await expect(page.locator('koppy-control-deck .panel.open .tab[aria-pressed="true"]')).toHaveText('Araçlar');
    });
}

test('closing details returns to the same control center section', async ({ page }) => {
    const frame = await openDetails(page, 'behavior');
    await frame.locator('#koppy-settings-close').click();
    await expect(page.locator('koppy-control-deck .panel.open .tab[aria-pressed="true"]')).toHaveText('Davranış');
});
