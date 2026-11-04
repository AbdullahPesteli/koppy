# FIX-K25 — controller korunarak eski FloatBar sunumunun kaldırılması

## Önceki FAIL → düzeltme
R-K25 bağımsız kabulü, b1f024a8d9914ceecce26fe65cddcc4bad38fb0e adayını haklı olarak reddetti: üç constructor null olmuş, start çağrıları TypeError üretmiş ve explicit preview ölmüştü. Önceki yalnız-marker PASS davranış kanıtı değildi; bu rapor onun yerine geçer.

Yeni dar build patch yalnız `FloatBarC.init` içindeki container append satırını kaldırır. Gerçek constructor, state, event listener, start/data/show/shown/open akışı değişmez. Butonların dahili detached DOM ağacı korunur fakat belgeye hiç bağlanmaz; görünmez opacity hitbox veya no-op controller değildir. `show()` özellikle korunur çünkü `open()` shown/data koşulunu kullanır. Vendor dosyasına yazılmadı. Üç constructor geri geldi. Build marker tam bir mount eşleşmesi gerektirir.

## LAB yöntemi ve sınırlar
Reviewer rig.cjs mantığı `tests/e2e/legacy-toolbar.spec.js` içine uyarlandı; başka projenin absolute Playwright importu yerine yerel @playwright/test kullanılır. Tam userscript IIFE içinde enjekte edilir. Ayrı otomasyon Chrome context'i; kurulu Zen/Tampermonkey kabulü değildir.

Aynı fixture taban 7c0ea2dedae82ae56cac13f8aa829bef42bd8e07, kırık b1f024a ve yeni dist'e uygulanır. Gerçek canvas üretimi 640×480 PNG, yerel route üzerinden sunulur; DOM img, srcset, CSS-bg, küçük 20px img ve 160×120 menü ikonu bulunur. Menü ikonunun (88,108) noktası tabanda eski şeritle gerçekten örtüşür. Saved GM_config `pv-prefs` içinde `floatBar.butonOrder` dolu virgüllü string, `floatBar.keys.enable=true`; explicit mevcut shortcut `a` ile gerçek `.pv-pic-window-container` açılır.

Pano sınırında test sink'i gerçek ClipboardItem image/png Blob baytlarını okur; host panosuna yazmaz. Seçili metnin gerçek Cmd+C copy olayı, uygulama tarafından defaultPrevented olmadığı ölçüldükten sonra test sink'inde iptal edilir. Bu, OS panosundan geri-okuma veya kurulu ürün kabulü değildir. Tüm pageerror ve console olayları filtrelenmeden JSON'a yazılır.

## Kabul ölçümleri
| Madde | Taban | Kırık aday | Düzeltme |
|---|---|---|---|
| (a) Büyük/küçük/CSS-bg/menü hover, toolbar DOM | bağlı container 1 | 0 | 0; belgeye bağlı buton/hitbox yok |
| (b) Örtüşen menüye tek fiziksel click | 0 | 1 | 1 |
| (c) Acquisition pageerror/TypeError | 0 | 4 null/start | 0 |
| (d) Cmd+C PNG; seçili metin copy | 14585 bayt; engellenmedi | 14585 bayt; engellenmedi ama pageerror var | 14585 bayt; engellenmedi |
| (e) Explicit preview | gerçek pencere 1 | 0 | gerçek pencere 1 |
| (f) Vendor/native/bridge/src stack/badge/HUD diff | — | — | tabana göre boş |

Kırık sürümün dört testinin tümü FAIL (her test pageerror=0 da arar). Taban 3 PASS/1 beklenen toolbar FAIL. Yeni aday 4 PASS/0 FAIL. Ek in-memory mutant gerçek `open()` yolunu return ile öldürür: explicit preview testi FAIL, windows=0, pageerror=0. Böylece test sadece exception yokluğunu değil gerçek preview davranışını korur.

## Gerçek komut receipt'leri
- `bun install --ignore-scripts --no-save`: rc0; package-lock: pdfjs-dist 5.4.530, playwright 1.61.1, jsdom 26.1.0. Yeni bağımlılık sürümü yok.
- `LEGACY_VARIANT=broken bun test tests/unit/legacy-toolbar.test.js`: rc1 (constructor kontratı RED).
- `LEGACY_VARIANT=broken bunx playwright test tests/e2e/legacy-toolbar.spec.js`: rc1; null/start ve preview RED önce gözlendi.
- `bun scripts/build.mjs`: rc0; generated dist 6194610 bayt.
- `bun test tests/unit`: rc0, 79 pass / 0 fail.
- `bunx playwright test`: rc0, 62 passed (3.0m).
- `LEGACY_VARIANT=fixed bunx playwright test tests/e2e/legacy-toolbar.spec.js`: rc0, 4 passed; son fixture düzenlemesi sonrası yeniden çalıştırıldı.
- `LEGACY_VARIANT=mutant bunx playwright test tests/e2e/legacy-toolbar.spec.js --grep explicit`: rc1, beklenen preview FAIL.
- `git diff --check`: rc0. `git diff 7c0ea2d -- vendor src bridge native`: boş.

Kanıtlar: `tests/e2e/legacy-toolbar-artifacts/` altında base/broken/fixed/mutant JSON, console dahil loglar, LAB hover/preview kareleri ve test receipt'leri. İlk fixture dizin eksikliği, IIFE eksikliği, prefs veri biçimi ve yanlış selector başarısızlıkları ürün RED sayılmadı; fixture düzeltilip aynı girdiler tekrar çalıştırıldı. İlk 5dk commit hedefi kaçtı; doğrulanmış RED elde edilmeden üretim commit'i yapılmadı. Çağrı bütçesi aşıldı; canlı fiyat bilinmediği için maliyet uydurulmadı.

## Teslim sınırı
Yalnız yerel aday implementation handoff; tekrar bağımsız kabul bekliyor. Push/merge/tag/sürüm/kurulum yapılmadı. Main checkout, başka worktree, host uygulamaları ve NAS'a yazılmadı. Model/provider: codex/gpt-6-astra / hp-omniroute. K→T→R: önceki kabul FAIL → regression RED → dar patch ve GREEN → bağımsız review bekliyor. Nihai ürün/UI hükmü değildir.
