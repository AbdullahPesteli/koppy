# Picviewer CE+ — Mimari RE Raporu

**Tarih**: 2026-07-13
**Kaynak repo**: https://github.com/hoothin/UserScripts (MIT Lisans)
**Versiyon**: 2026.2.6.1
**Yazarlar**: NLF && ywzhaiqi && hoothin
**Ana sayfa**: https://pv.hoothin.com/

---

## Lisans Durumu

| Bileşen | Lisans |
|---------|--------|
| Ana repo (hoothin/UserScripts) | **MIT** |
| FileSaver.js (Eli Grey) | MIT |
| JSZip v3.7.1 (Stuk) | MIT or GPLv3 dual |
| Pako (zlib port) | MIT |
| Bricks.js | MIT |
| pvcep_rules.js | MIT |
| GM_config CN.js | LGPL 3 |

**Re-implementasyon serbest.** Tüm embed kütüphaneler MIT.

---

## Dosya Yapısı

```
28961 satır — Picviewer CE+.user.js (ana dosya)

 L1-L62      : UserScript metadata (@name, @grant, @require, @match...)
 L64-L72     : iframe boyutu kontrolü (<250px iframe'lerde çalışmaz)
 L74-L11634  : FILE SAVER + JSZip + Pako (embed, UMD wrapped) ~11.560 satır
 L11635      : --- ANA UYGULAMA BAŞLANGICI ---
 L11636-11921: Bricks.js (masonry layout) ~285 satır
 L11922      : var floatBar; (global)
 L11923-28961: ANA IIFE (topObject,window,document,unsafeWindow) ~17.040 satır
```

### Ana IIFE İç Yapısı

| Bölüm | Satır | Açıklama |
|-------|------|----------|
| Core utils & GM API wrapper | L11923-12260 | _GM_* wrapper'lar, GM_fetch, i18n, ImageSizeFetcher |
| HTML parsing | L12261-12941 | TrustedTypes, parseHTMLToFragment, setHTML |
| Download helpers | L12284-12383 | getRightSaveName, canonicalUri, urlToBlobWithFetch |
| Video.js loader | L12432-12797 | CDN'den video.js yükleme |
| **prefs objesi (default config)** | **L12944-14275** | ~1330 satır dev config |
| **Gallery HTML template** | **L14276-14519** | pv-gallery-* DOM şablonu |
| **GalleryC class** | **L14278-20705** | ~6400 satır — en büyük sınıf |
| MagnifierC class | L20708-21009 | ~300 satır |
| ImgWindowC class | L21010-23780 | ~2600 satır |
| LoadingAnimC class | L23783-24668 | ~900 satır |
| FloatBarC class | L24955-25490 | ~535 satır |
| XHR parser engine | L25491-25658 | parsePage, downloadPage, findNodes |
| Image URL resolution | L25661-26904 | pretreatment, findPic, MatchedRuleC |
| Event system | L27086-27500 | mouseover/keydown/keyup handler'lar |
| Photo editors | L27505-27555 | Lunapic/Pixlr/Photopea entegrasyonu |
| GM_config init | L27569-28652 | Ayar paneli tanımı ~1080 satır |
| Boot & start | L28698-28961 | init2, envir, storage, searchImgByImg |

---

## 7 Ana Sınıf

### 1. GalleryC (L14278-20705 — ~6400 satır)
- Sayfadaki tüm resimleri toplar, masonry grid'de gösterir
- Slideshow, batch download (ZIP/PDF), toplu rotate, copy URLs
- Infinite scroll / sayfa numarası ile "sonraki sayfayı yükle"
- Command menüsü: enterCollection, psImage, downloadImage, post2Aria2, exportImages, copyImages, scrollIntoView, openInNewWindow, urlFilter, addImageUrls, fullScreen vb.
- **Sidebar pozisyonu**: top/right/bottom/left
- 3 görünüm modu: normal, collection, viewMore (maximize)
- Bricks.js ile masonry layout
- Custom scrollbar implementasyonu

### 2. ImgWindowC (L21010-23780 — ~2600 satır)
- Pop-up resim penceresi
- Zoom (mouse wheel, Z tuşu), rotate (R), pan (H el aracı)
- Kısayollar: oklar=resim değiştir, C=kopyala (URL), Esc=kapat
- fitToScreen, fullScreen modları
- Shift+wheel = fine zoom
- Video/audio desteği

### 3. FloatBarC (L24955-25490 — ~535 satır)
- Resim üzerine gelince çıkan buton çubuğu
- 7 buton: Actual, Search, Gallery, Current, Magnifier, Download, Stitch
- Pozisyon: top-left / top-right / bottom-left / bottom-right
- Alt tuşuyla ikincil action
- Keyboard shortcut desteği (a/s/g/c/m/d)

### 4. LoadingAnimC (L23783-24668 — ~900 satır)
- Resim yüklenirken progress circle animasyonu
- ImgWindowC ve GalleryC tarafından kullanılır

### 5. MagnifierC (L20708-21009 — ~300 satır)
- Dairesel zoom büyüteç
- Radius/wheelZoom/crosshair ayarları

### 6. MatchedRuleC (L25897-26904)
- siteInfo dizisini tarar (20'şerli chunk)
- URL regex eşleşmesi, getImage, xhr, r/s replace
- customRules ve unsafeWindow.pvcepRules ile extensible

### 7. ImageSizeFetcher (L12058)
- HEAD istekleri + Performance API ile resim boyutu tespiti
- Same-origin / cross-origin farklı stratejiler

---

## Global Değişkenler

| Değişken | Amaç |
|----------|------|
| `floatBar` | Aktif FloatBarC instance'ı |
| `gallery` | Aktif GalleryC instance'ı |
| `uniqueImgWin` | Preview modunda geçici ImgWindowC |
| `galleryMode` | Gallery tam ekran flag'i |
| `prefs` | Tüm ayarların tutulduğu ana obje |
| `siteInfo` | Harici site kuralları dizisi (pvcep_rules.js) |
| `langData` | Dil paketleri (pvcep_lang.js) |
| `storage` | GM_getValue/localStorage soyutlaması |
| `canvas` | Paylaşımlı canvas (image manip.) |
| `keypressing` | Global tuş basılı durumu |

---

## Harici Bağımlılıklar

### @require (Tampermonkey/Greasemonkey ile yüklenen)
```
GM_config CN.js  — Ayar paneli framework'ü (LGPL 3)
pvcep_rules.js   — 2041 satır site-specific kurallar (MIT)
pvcep_lang.js    — 2760 satır 10 dil çeviri
```

### Embed (dosya içine gömülü)
```
FileSaver.js v2.0.4 — saveAs() blob download
JSZip v3.7.1        — ZIP packaging (Browserify bundle)
Pako                 — zlib compression (JSZip bağımlılığı)
Bricks.js            — Masonry grid layout
```

### Runtime CDN
```
Video.js 8.23.3 — video oynatıcı (vjs.zencdn.net/unpkg.com/jsdelivr fallback)
```

### @connect (GM_xmlhttpRequest için)
```
google.com, google.com.hk, google.co.jp, ipv4.google.com,
image.baidu.com, tineye.com, hoothin.com, *
```

---

## Google Images İşleme (KRİTİK)

**Konum**: `pvcep_rules.js:32-74`

```js
{
    name: "google 图片搜索",
    url: /https?:\/\/www.google(\.\w{1,3}){1,3}\/search\?.*&(tbm=isch|udm=2)/,
    getImage: function(a) {
        // a = resmin parent A elementi
        // 1. href'teki imgurl= parametresinden gerçek URL'yi çıkar
        if (a.href.match(/imgurl=(.*?)&/i)) {
            return decodeURIComponent(RegExp.$1);
        }
        // 2. Yeni Google layout'u: TouchEvent fake'le, lazy-load'u tetikle
        else if (jsaction && jsaction.indexOf('touchstart') !== -1) {
            // fake TouchEvent dispatch
            // sonra yine imgurl= çıkar
        }
    }
}
```

**Eksik**: Sadece URL çıkarır, binary kopyalama yok. Kullanıcının istediği Cmd+C ile en kaliteli resmi binary panoya kopyalama özelliği implemente edilmemiş.

---

## Panoya Kopyalama (Clipboard)

| Konum | Ne kopyalanır | Yöntem |
|-------|---------------|--------|
| FloatBar download | Resim URL'si | `_GM_setClipboard(url)` |
| ImgWindow C tuşu (L23318) | Açık resmin URL'si | `_GM_setClipboard(self.src)` |
| Gallery copy images (L19004) | Tüm resim URL'leri (join \n) | `_GM_setClipboard(copyData)` |
| copyData() (L24936) | PNG blob'u (binary) | `ClipboardItem` API |
| FloatBar copyImg (L24922) | Resim binary'si | `copyData(url)` |

**GM_setClipboard wrapper** (L11972):
```js
_GM_setClipboard = GM_setClipboard || GM.setClipboard || (() => {});
// 3 kademeli: GM4 → GM3 → noop
```

---

## Event Flow

```
Sayfa yükleme
  → init2()
    → storage + canvas + envir
    → loadPrefs() — GM_config'ten ayarları yükle
    → initLang() + i18n
    → GM_config.init()
    → Event listener'lar:
        - mouseenter/mousemove → globalMouseoverHandler (50ms debounce)
        - keydown → keydown
        - keyup → keyup
    → updateKeydownListener()
    → addPageScript()
    → auto-open gallery kontrolü

Kullanıcı resim üstüne gelince:
  mouseenter → 50ms debounce
    → checkFloatBar(target)
      → findPic(target)  // URL çözümleme
        → MatchedRuleC.getImage() / tpRules / scale/force
      → FloatBarC.start(result)  // toolbar göster
        → pozisyon hesapla, opacity transition

Butona tıklayınca (FloatBar):
  FloatBarC.open(event, action)
    → LoadingAnimC
      → buttonType'e göre:
          'actual'    → ImgWindowC (orijinal resim pop-up)
          'current'   → ImgWindowC (mevcut resim)
          'gallery'   → GalleryC (tüm resimleri topla)
          'magnifier' → MagnifierC
          'download'  → _GM_download
          'search'    → searchImgByImg
          'copy'      → URL'yi panoya kopyala
          'copyImg'   → Binary'i panoya kopyala
```

---

## Batch Download Flow

```
Gallery'de "Download All"
  → prefs.gallery.downloadWithZip true ise:
    → Önce pack addon kontrolü:
      - unsafeWindow.pvcepPackAddon varsa → onunla
      - unsafeWindow.pvcepimg2pdf varsa → PDF
      - Yoksa → JSZip ile ZIP
    → Resimleri fetch et:
      - Same-origin → urlToBlobWithFetch (canvas format dönüşümü)
      - Cross-origin → urlToBlob (GM_xmlhttpRequest)
    → Throttling: downloadGap'e göre 1-10 thread
    → saveAs(content, packName)
```

---

## Ters Resim Arama (Search by Image)

```
searchImgByImg() → Google → Baidu → Tineye sıralı
  defaultSearchData:
    Google: https://www.google.com/searchbyimage?safe=off&sbisrc=1&image_url=#t#
    Baidu:  https://image.baidu.com/n/pc_search?queryImageUrl=#t#
    Tineye: https://www.tineye.com/search?url=#t#
```

---

## Kısayollar

### Global (preview toggle)
- Ctrl basılı tut → resim preview aç
- Ctrl bırak → preview kapat

### FloatBar (resim üzerindeyken)
- a → orijinal (actual)
- s → ara (search)
- g → galeri
- c → mevcut (current)
- m → büyüteç
- d → indir

### ImgWindow içinde
- Ok tuşları → resimler arası geçiş
- R → rotate 90° (Shift+R = -90°)
- Z → zoom
- H → el aracı (pan)
- C → URL'yi kopyala
- Esc → kapat
- Mouse wheel → zoom

### Gallery içinde
- Ok tuşları → gezinme
- Space → sayfa scroll
- Ctrl+G → gallery aç

---

## Dil Desteği
EN, AR, CN, TW, PT-BR, PT-PT, RU, TR, JA, UK (10 dil)
Türkçe çeviri: PUFF1N tarafından (pvcep_lang.js ~L2027)
