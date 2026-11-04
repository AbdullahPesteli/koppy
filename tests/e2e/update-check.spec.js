const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const dist = fs.readFileSync(path.resolve(__dirname, '../../dist/Koppy.user.js'), 'utf8');
const updater = dist.slice(dist.indexOf('const koppyOpenUpdate ='), dist.indexOf('const koppyCopyDiagnostics ='));
const wiring = dist.slice(dist.indexOf('            openUpdate: koppyOpenUpdate,'), dist.indexOf('            openGallery: koppyOpenGallery,'));

for (const release of ['0.8.2', '0.8.3', 'error']) {
    test('inline release check: ' + release, async ({ page, context }) => {
        await page.setContent('<body>Original page</body>');
        await page.addScriptTag({ path: path.resolve(__dirname, '../../src/koppy-control-deck.js') });
        await page.evaluate(({ release, updater, wiring }) => {
            window.GM_info = { script: { version: '0.8.2' } };
            window.__tabs = []; window.__copies = []; window.__requests = [];
            window._GM_openInTab = window.GM_openInTab = (...args) => window.__tabs.push(args);
            window._GM_setClipboard = window.GM_setClipboard = (...args) => window.__copies.push(args);
            window.GM_xmlhttpRequest = o => {
                window.__requests.push({ method: o.method, cache: o.cache, timeout: o.timeout, url: o.url });
                if (release === 'error') o.onerror();
                else o.onload({ status: 200, responseText: '// @version ' + release });
            };
            new Function(updater + `
                KoppyControlDeck.install({ document, window, config: {fields:{}},
                    prefs: {floatBar:{globalkeys:{}}}, ${wiring}
                }).show();`)();
        }, { release, updater, wiring });
        const host = page.locator('koppy-control-deck');
        await expect(host).toContainText('Kurulu sürüm: 0.8.2');
        await host.locator('.update').click();
        await expect(host.locator('.status')).toHaveText(release === 'error' ? 'yayın okunamadı' : release === '0.8.2' ? 'Güncel (0.8.2)' : '0.8.3 hazır');
        await host.locator('.copy-update-url').click();
        await expect(host.locator('.status')).toContainText('URL kopyalandı');
        const state = await page.evaluate(() => ({ tabs: __tabs, copies: __copies, requests: __requests }));
        expect(state.tabs).toHaveLength(0);
        expect(state.copies).toEqual([[state.requests[0].url, 'text']]);
        expect(state.requests[0]).toMatchObject({ method: 'GET', cache: false, timeout: 5000 });
        expect(context.pages()).toHaveLength(1);
        expect(page.url()).toBe('about:blank');
        await host.locator('.raw-update').click();
        expect(await page.evaluate(() => __tabs.length)).toBe(1);
    });
}
