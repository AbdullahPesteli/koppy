# Picviewer CE+ — Yeniden İmplementasyon Vizyonu

**Proje**: Koppy (Picviewer replasmanı)
**Tarih**: 2026-07-13

---

## Kullanıcının İstekleri (verbatim özet)

1. **Google Görseller'de Cmd+C → en kaliteli resmi panoya kopyala**
   - Şu an Cmd+C yapınca resmin binary'si yerine URL kopyalanıyor (çoğu durumda)
   - Hedef: Google Images sonuçlarında bir görselin üstüne gelip Cmd+C yapınca, o görselin en yüksek çözünürlüklü halini binary olarak panoya kopyalamak
   - Panoyu şişirmeden çalışmalı (her Cmd+C'de tek resim)

2. **Daha iyi galeri**
   - Mevcut galeri "iyi değil"
   - Daha modern, daha kullanışlı bir galeri UX'i

3. **Mevcut özellikleri koru**
   - Ctrl/Cmd ile önizleme (hover preview)
   - FloatBar butonları
   - Zoom/rotate/pan
   - Site-specific kurallar (2000+ site için URL çözümleme)
   - Batch download (ZIP/PDF)

---

## Teknik Notlar

### Mevcut Sistemin Güçlü Yönleri (korumalı)
- `pvcep_rules.js` — 2000+ site için özel resim URL çözümleme kuralları (EN DEĞERLİ parça)
- `MatchedRuleC` — regex tabanlı kural eşleştirme motoru
- `findPic()` — çok katmanlı resim URL çözümleme (rules → tpRules → scale → force)
- Site-specific getImage() fonksiyonları (Google, DeviantArt, Twitter, Reddit, vs.)
- `ImageSizeFetcher` — cross-origin resim boyutu tespiti

### İyileştirilecek Alanlar
- **GalleryC** (6400 satır) — çok büyük, inline HTML template, Bricks.js eski
- **Clipboard** — Google Images için özel akış yok
- **FloatBarC** — UI eski tip, modernize edilebilir
- **Config/ayarlar** — GM_config'e bağımlı, daha modern bir config UI olabilir
- **Kod organizasyonu** — tek dosyada 29K satır, modüler değil

---

## Mimari Hedef

**Modern web extension** (Manifest V3) olarak yeniden yaz:
- Content script + background service worker
- React/Svelte/Vanilla JS ile modern UI
- pvcep_rules.js aynen taşı (veya TypeScript'e çevir)
- Google Images için özel Cmd+C handler
- Modern gallery (CSS Grid/Flexbox, Bricks.js yok)
- Extension storage API (GM_getValue yerine)
- Service worker ile cross-origin fetch (GM_xmlhttpRequest yerine)

---

## Bilinen Şeyler

1. **Lisans**: MIT — re-implementasyon ve modifikasyon serbest
2. **Zen browser'da Tampermonkey ile çalışıyor** — kullanıcı script olarak yüklü
3. **Kullanıcının Zen profili**: `xpnsh2ye.Default (release)`
4. **Mevcut eklentinin depolama yeri**: 
   - `storage/default/https+++pv.hoothin.com^userContextId=6/`
   - `storage/default/https+++pagetual.hoothin.com^userContextId=6/`
5. **Tampermonkey scripts storage**: IndexedDB (sqlite), direkt dosya olarak okunamaz

---

## Yapılacaklar (öncelik sıralı)

### Faz 1 — Core + Google Images Cmd+C
- [ ] Manifest V3 extension scaffold
- [ ] Content script ile resim intercept mekanizması
- [ ] Google Images sayfasını tespit et
- [ ] Thumbnail'a hover → en kaliteli URL'yi çıkar
- [ ] Cmd+C handler: binary blob'u ClipboardItem API ile panoya kopyala
- [ ] Service worker ile cross-origin fetch

### Faz 2 — FloatBar + Preview
- [ ] Resim üzerine gelince FloatBar göster
- [ ] Ctrl basılı tutunca preview pop-up
- [ ] Zoom/rotate/pan
- [ ] Butonlar: actual/search/gallery/current/magnifier/download

### Faz 3 — Gallery
- [ ] Sayfadaki tüm resimleri topla
- [ ] Modern grid layout (CSS Grid, sanal scroll)
- [ ] Batch download (ZIP)
- [ ] Slideshow
- [ ] Filtreleme/sıralama

### Faz 4 — Site Rules
- [ ] pvcep_rules.js kurallarını taşı/adapte et
- [ ] Custom rules desteği

### Faz 5 — PDF/Toplu İşlemler
- [ ] PDF export
- [ ] Aria2 entegrasyonu
- [ ] Multi-platform delivery
