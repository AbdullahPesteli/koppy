# Koppy K08 — Gerçek layout kanıtı (dist 0.7.0 @ 92635d8)

Ölçüm tarihi: 2026-10-31. Test: `tests/e2e/real-layout.spec.js` (17 test, 17 geçti; `npx playwright test tests/e2e/real-layout.spec.js`).
Ham ölçümler: `tests/e2e/fixtures/real/results.json` (test her koşuda yeniden yazar).
Harness: `dist/Koppy.user.js` olduğu gibi `new Function` ile yüklenir, Tampermonkey-şekilli `GM_*` stub'ları (google-copy.spec.js'teki yapı); `GM_xmlhttpRequest` **gerçek ağdan** görsel indirir (Playwright request context), pano gerçek Chrome `navigator.clipboard.read()` ile okunur. Sayfa JS'i etkisizleştirilir (`<script type=text/plain>`), DOM/CSS gerçek snapshot'tır.

## 1. Yakalanan gerçek snapshot'lar (`tests/e2e/fixtures/real/`)

| Dosya | Nasıl | Sonuç |
|---|---|---|
| `20261031-google-udm2-kedi-curl-js-shell.html` (94 KB) | curl, masaüstü Chrome UA, `?q=kedi&udm=2` | **JS-kabuğu**: 0 `<img>`, `<noscript>` → `/httpservice/retry/enablejs`. Kullanılamaz; kanıt olarak saklı. |
| (curl `tbm=isch`) | aynı | Aynı JS-kabuğu (94 081 B, 0 `<img>`) — dosya kaydedilmedi (udm2 ile aynı kabuk, `udm=2`'ye yönleniyor). |
| (curl `gbv=1`, Lynx UA) | | 2.6 KB basit sayfa, 0 `<img>`, 0 tbn → kullanılamaz. |
| (Playwright headless Chrome `udm=2` / `tbm=isch`) | | **Engel**: `https://www.google.com/sorry/index?...` (6.7 KB, 0 img). Bot engeli kanıtlandı. |
| `20261031-google-udm2-kedi-rendered.html` (2.0 MB) | gerçek Chrome (headful, `AutomationControlled` kapalı, tr-TR), `?q=kedi&udm=2`, `page.content()` | **Gerçek render**: 229 img, 499 tbn referansı, 217 `data:image` |
| `20261031-google-udm2-kedi-via-tbm-isch-rendered.html` (2.1 MB) | aynı yöntem, `?q=kedi&tbm=isch` | Google `tbm=isch`'i **`udm=2`'ye yönlendirdi** (URL `&udm=2&sei=...`); farklı oturum/sorgu çıktısı, 222 img, 0 tbn-img (hepsi `data:` placeholder) |
| `20261031-bbc-news-front-curl.html` (378 KB) | curl, `https://www.bbc.com/news` | 200, 44 img, 22 `srcSet` |
| `20261031-bbc-news-article-curl.html` (290 KB) | curl, `/news/articles/c3vgxznlx7jzo` | 200, 7 srcset (ölçümde kullanılmadı, yedek) |

Not: `tbm=isch` URL'si gerçek Google'da artık `udm=2`'ye düşüyor; iki "layout" aslında iki ayrı gerçek `udm=2` render'ıdır (farklı oturum/sıra, biri tbn-img'li, biri yalnız `data:` placeholder'lı). Test URL'si yine de `…&tbm=isch` ile açılır (kodun `tbm` dalı çalışır). Ağ engeli yoktu (curl 200); engel yalnız headless Chrome'da geldi.

## 2. Sonuç tablosu — 5 kaynak türü × 2 Google layout + 1 site

Kaynak: ölçüm = `results.json` anahtarı; hepsi pano `image/png`. "Doğal" = snapshot'ın kendi elemanı; "enjekte" = gerçek sayfaya eklenen eleman (gerçek BBC görsel URL'leriyle) — **fixture uydurması değil, ama sayfanın kendi markup'ı da değil**; bu satırlar öyle işaretli.

URL kısaltmaları: `BBC240` = `https://ichef.bbci.co.uk/news/240/cpsprodpb/ea75/live/f93e2820-d4b7-11f1-a701-fddedf244c16.jpg.webp`, `BBC1536` = aynı yol `/news/1536/…`.

| Senaryo | Sayfa | Sonuç | Pano (MIME · bayt · boyut) | Kullanılan URL (indirilen bayt) | Toast |
|---|---|---|---|---|---|
| **d** yalnız preview'lu Google kartı (doğal) | google-udm2 | PASS | image/png · 1 150 543 · 1200×800 | `https://cdn.oggusto.com/uploads/2025/07/kedilerde-agiz-acik-nefes-alma-uyarisi.webp` (123 240 B webp) — tbn değil, jsdata'daki orijinal | Kopyalandı: 1200×800 |
| **d** | google-tbm-isch | N/A | — | snapshot'ta `encrypted-tbn` URL'li img yok (tümü `data:`) | — |
| **e** `data:` URI kart (doğal Google kartı) | google-udm2 | PASS | image/png · 784 568 · 1004×1002 | `https://petgross.com.tr/images/…/image_1080.jpg` (41 892 B) — data: önizleme yerine orijinal | Kopyalandı: 1004×1002 |
| **e** | google-tbm-isch | PASS | image/png · 1 150 543 · 1200×800 | `https://cdn.oggusto.com/…/kedilerde-agiz-acik-nefes-alma-uyarisi.webp` (123 240 B) | Kopyalandı: 1200×800 |
| **a** küçük `<img>` (enjekte, 60×34, BBC240) | google-udm2 | PASS | image/png · 61 241 · 240×135 | BBC240 (6 962 B) | Kopyalandı: 240×135 |
| **a** | google-tbm-isch | PASS | image/png · 61 241 · 240×135 | BBC240 (6 962 B) | Kopyalandı: 240×135 |
| **b** `<picture>/srcset` (enjekte, 240w+1024w) | google-udm2 | PASS (bkz. G3) | image/png · 61 241 · 240×135 | BBC240 | Kopyalandı: 240×135 |
| **b** | google-tbm-isch | PASS (bkz. G3) | image/png · 61 241 · 240×135 | BBC240 | Kopyalandı: 240×135 |
| **c** CSS background (enjekte `<div>` 80×50, BBC1536) | google-udm2 | ~~FAIL~~ → **PASS (K12)** | image/png · 1 869 224 · 1536×864 (önce: pano değişmedi, 0 B) | BBC1536 | Kopyalandı: 1536×864 |
| **c** | google-tbm-isch | ~~FAIL~~ → **PASS (K12)** | aynı (1536×864) | BBC1536 | Kopyalandı: 1536×864 |
| **e** `data:` URI (enjekte tek başına `<img>`, 1×1 PNG) | google-udm2 | ~~FAIL~~ → **PASS (K12, görünür hata)** | pano görsel değil, istek 0 (1×1 kopyalanmaz) | istek yok (kasıtlı) | toast: «Koppy: bu öğe görsel değil» |
| **e** | google-tbm-isch | ~~FAIL~~ → **PASS (K12, görünür hata)** | pano görsel değil, istek 0 (1×1 kopyalanmaz) | istek yok (kasıtlı) | toast: «Koppy: bu öğe görsel değil» |
| **a+b** gerçek BBC `<img srcSet=…>` (doğal) | bbc-news | PASS | image/png · 1 869 224 · 1536×864 | BBC1536 (159 996 B) — srcset'in en büyüğü | Kopyalandı: 1536×864 |
| **a** küçük img (enjekte) | bbc-news | PASS | image/png · 61 241 · 240×135 | BBC240 (6 962 B) | Kopyalandı: 240×135 |
| **b** `<picture>` (enjekte) | bbc-news | PASS (bkz. G3) | image/png · 61 241 · 240×135 | BBC240 | Kopyalandı: 240×135 |
| **c** CSS background (enjekte) | bbc-news | PASS | image/png · 1 869 224 · 1536×864 | BBC1536 (159 996 B) | Kopyalandı: 1536×864 |
| **e** `data:` URI (enjekte 1×1) | bbc-news | PASS | image/png · 88 · 1×1 | `data:image/png;base64,…` (istek yok, satır içi) | Önizleme kopyalandı: 1×1 |

Özet: 18 satırdan 13 PASS, 1 N/A, 4 FAIL. Testin kendisi 17/17 geçer: Google-c/e'de test **ölçümü kaydeder** (FAIL, bu rapora yazıldı), sürüş sırasında hata fırlatmaz.

## 3. Düşen senaryolar — kök neden (düzeltme bu kartın işi değil → Jack)

### G1 — Google sayfasında CSS-background ve tek başına `data:` `<img>` (sonuç-dışı eleman) hiç tetiklenmiyor
Beklenen: Koppy'nin "5 kaynak türü" iddiası Google domain'inde de geçerliyse, Google sonuç kartı dışındaki bir CSS background / data: görseli de kopyalanır. Gerçekte: sıfır istek, sıfır toast.
Kök neden (`src/google-images-copy.js`, dist'te aynı mantık):
- `resolveCandidates` (≈satır 1709–1719): `isGoogleImagesLocation` doğruysa **yalnız** `resolveGoogleImageCandidates` çağrılır; quick-hover/background yolu (`resolveQuickHoverImageCandidates`) Google'da hiç devreye girmez.
- `resolveGoogleImageCandidates` satır **401**: `if (!element || nodeName !== "IMG") return [];` → `<div style="background:url()">` için daima boş.
- `isLikelyResultImage`/`isGoogleResultImage` (≈satır 959–966): `data-docid`/`aw2uhd` içinde olmayan, Google linki ya da tbn'si olmayan `<img>` (örn. enjekte `data:`) → `false`; ayrıca satır **1880**: `!current.isGoogleResult` → `{status:"not-applicable"}` (Cmd+C yerel davranışa bırakılır).
Etki: Gerçek Google kartları (data: placeholder + jsdata orijinali) **çalışıyor** (e-natural PASS). Başarısız olan, Google sayfasında *kart dışı* görsellerdir (ör. Knowledge Panel arka planı, logo, "Benzer" şeritleri). Kullanıcı şikâyetinin ana yolu (sonuç kartı) etkilenmiyor ama kapsam iddiası yalnız non-Google sitelere daraltılmalı ya da bu yol açılmalı.
Not: Bu satırlar "enjekte"dir; gerçek Google markup'ında CSS-background kaynağı bu iki snapshot'ta yoktur (`background-image` stilleri: 0).

### G2 — `tbm=isch` snapshot'ında tbn-only kart yok
Senaryo d'yi bu snapshot'ta ölçemedik (N/A). Eksik kapsam (bkz. §4).

### G3 — `<picture>`/srcset seçimi tutarsız (gözlem, FAIL değil)
Doğal BBC `<img srcSet=240w…1536w>` → **en büyük (1536)** seçildi; fakat enjekte `<picture><source srcset="240w, 1024w">` + `<img src=240>` → **240** seçildi (en büyük 1024 değil). Beklenen: "en yüksek çözünürlüklü kaynak". Olası neden: `<source>` öğeleri değil `img.currentSrc`/img-srcset okunuyor (60px sizes + DPR1 → tarayıcı 240w seçer). Kod satırı: `imageSourceSet(...)` çağrısı ≈satır 479 / `resolveQuickHoverImageCandidates` ≈satır 451–500; `picture>source` taraması doğrulanmadı — kök neden kesinleşmedi, Jack'in incelemesi gerekir.

## 4. Eksik kalan senaryolar
- **tbm=isch farklı layout'ta tbn-only kart (d)** — snapshot'ta yok.
- **Google CSS-background gerçek örneği** — iki gerçek snapshot'ta `background-image` yok; c satırları enjekte.
- **Gerçek `<picture>`** — BBC'nin anasayfasında `<picture>` 0; b enjekte (BBC'nin gerçek img-srcSet'i a+b doğal satırında ölçüldü).
- **Canlı Google'a karşı koşma** yok: snapshot'lar statik, sayfa JS'i kapalı (Google'un kendi hover/jsaction davranışı ve gerçek tıklama-ile-orijinal-yükleme ölçülmedi). Görsel indirmeleri gerçek ağdan, `GM_xmlhttpRequest` yerine Playwright request ile (CORS/GM-izin farkı simüle edilmedi).
- Gerçek Tampermonkey/Safari ortamı yok (Chrome stable + Meta+C).
- curl ile Google yalnız JS-kabuğu döner; gerçek render yalnız headful Chrome ile alınabildi (headless → `/sorry` engeli). Snapshot'lar kişisel olmayan arama (`kedi`) sonuçlarıdır; çerez/consent sayfası görülmedi (tr-TR, AB dışı).

## 5. Hüküm: **PASS-ŞARTLI**
- Asıl şikâyet yolu (gerçek Google Görseller kartı: data: placeholder, yalnız-tbn önizleme, jsdata orijinal URL) iki gerçek layout'ta ölçüldü ve **orijinal görsel PNG olarak panoya geldi** (1004×1002, 1200×800).
- Şart 1: G1 (Google sayfasında kart-dışı CSS-bg / data: görsel) bilinen sınır olarak belgelenmeli veya düzeltme kartı açılmalı.
- Şart 2: G3 (picture/srcset en büyük seçmiyor) incelenmeli; yayın engeli değil.
- Şart 3: eksik senaryolar (§4) kapatılana dek "tüm 5 tür her Google layout'ta kanıtlı" iddiası yapılmamalı.


## K12 — 4 FAIL kapatma (dal koppy/k12-google-nonresult)

Önce (ölçüm, yukarıdaki tablo): c×2 ve e×2 sessiz düşüş (0 istek, 0 toast). Sonra: `real-layout.spec.js` 17/17, `npm test` 67/67.

| Satır | Karar | Davranış |
|---|---|---|
| c · google-udm2 / tbm-isch (CSS background, 80×50) | (a) kopyalanır | Google'da IMG olmayan yüzey ≥ 32 px ise quick-hover/background çözücüsü kullanılır; BBC1536 kopyalanır. |
| e · google-udm2 / tbm-isch (tek `data:` 1×1 PNG) | (b) görünür hata | Toast «Koppy: bu öğe görsel değil»; istek yok, pano değişmez (tracking pixel kopyalanmaz). |

Eşikler: `MIN_NON_RESULT_IMAGE_PX = 32` (CSS px). Google'da IMG olmayan yüzey render boyutu < 32 px ise aday üretilmez; `data:` URI embedded önizleme için mevcut render ≥ 40 px şartına ek olarak doğal (naturalWidth/Height) < 32 px ise reddedilir. Eşik gevşetilmedi; testlere kesin beklentiler (toast/pano/istek) eklendi, artık ölçüm-kaydı değil iddia.
Not: (c) güvenilir şekilde gerçek Google markup'ında yok (enjekte); gerçek sonuç kartı yolu değişmedi (d/e doğal PASS).
