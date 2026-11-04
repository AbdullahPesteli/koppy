const test = require('node:test');
const assert = require('node:assert/strict');
const Deck = require('../../src/koppy-control-deck.js');
const { JSDOM } = require('jsdom');

for (const result of ['0.8.2', '0.8.3', 'error']) {
    test('inline update status and explicit copy: ' + result, async () => {
        const dom = new JSDOM('<body></body>');
        let tabs = 0;
        const copies = [];
        const url = 'https://example.test/Koppy.user.js';
        const deck = Deck.install({ document: dom.window.document, window: dom.window,
            config: { fields: {} }, prefs: { floatBar: { globalkeys: {} } }, requireTrusted: false,
            installedVersion: '0.8.2', updateUrl: url,
            openUpdate: Deck.createUpdateChecker({ version: '0.8.2', url, request(o) {
                if (result === 'error') o.onerror();
                else o.onload({ status: 200, responseText: '// @version ' + result });
            } }),
            copyUpdateUrl: () => copies.push(url),
            openRawUpdate: () => tabs++,
        });
        deck.show();
        const root = dom.window.document.querySelector('koppy-control-deck').shadowRoot;
        root.querySelector('.update').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.match(root.querySelector('.status').textContent,
            result === 'error' ? /yayın okunamadı/ : result === '0.8.2' ? /Güncel \(0.8.2\)/ : /0.8.3 hazır/);
        assert.match(root.textContent, /Kurulu sürüm: 0.8.2/);
        assert.match(root.textContent, /Tampermonkey → Yardımcı Programlar → URL'den yükle/);
        root.querySelector('.copy-update-url').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(copies, [url]);
        assert.match(root.querySelector('.status').textContent, /URL kopyalandı/);
        assert.equal(tabs, 0);
        root.querySelector('.raw-update').click();
        assert.equal(tabs, 1);
        dom.window.close();
    });
}

for (const failure of ['onerror', 'ontimeout', 'onabort', 'http', 'metadata', 'throw']) {
    test('release read rejects ' + failure, async () => {
        const check = Deck.createUpdateChecker({ version: '0.8.2', request(o) {
            if (failure === 'throw') throw new Error('offline');
            if (failure === 'http') return o.onload({ status: 503, responseText: '// @version 0.8.3' });
            if (failure === 'metadata') return o.onload({ status: 200, responseText: '<html>error</html>' });
            o[failure]();
        } });
        await assert.rejects(check(), /yayın okunamadı/);
    });
}

test('built updater uses GM version and GET checker, not tab navigation', () => {
    const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../dist/Koppy.user.js'), 'utf8');
    assert.match(source, /const koppyOpenUpdate = globalThis.KoppyControlDeck.createUpdateChecker/);
    assert.match(source, /installedVersion: GM_info.script.version/);
    assert.match(source, /copyUpdateUrl: \(\) => _GM_setClipboard/);
});

test('newer release is compared numerically', async () => {
    const check = Deck.createUpdateChecker({ version: '0.8.2', request(o) {
        o.onload({ status: 200, responseText: '// @version 0.8.10' });
    } });
    assert.equal(await check(), '0.8.10 hazır');
});

test('update GET reads the published version without opening a tab', async () => {
    let tabs = 0;
    const check = Deck.createUpdateChecker({
        url: 'https://example.test/Koppy.user.js', version: '0.8.2',
        GM_openInTab() { tabs++; },
        request(options) {
            assert.equal(options.method, 'GET');
            assert.equal(options.cache, false);
            assert.equal(options.timeout, 5000);
            assert.equal(options.url, 'https://example.test/Koppy.user.js');
            options.onload({ status: 200, responseText: '// ==UserScript==\n// @version 0.8.2\n// ==/UserScript==' });
        },
    });
    assert.equal(await check(), 'Güncel (0.8.2)');
    assert.equal(tabs, 0);
});
