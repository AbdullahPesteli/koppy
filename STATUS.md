# Koppy — Durum

**Sürüm:** 0.2.4
**Lisans:** MIT
**Dağıtım:** `dist/Koppy.user.js` üzerinden Tampermonkey

## Şu an

- Google Görseller'de `Cmd+C` ile gerçek görseli `image/png` olarak panoya yazar.
- Güncel ve eski Google Görseller DOM'larını, normal kopyalama alanlarını ve clipboard çıktısını test eder.
- Ayar arayüzü sandbox'lıdır; 91 mevcut Picviewer ayarının saklama sözleşmesini korur.
- `@updateURL` / `@downloadURL` GitHub'daki sürüm dosyasına bağlıdır. Tampermonkey'de **Automatic installation** açık olmalıdır.

## Doğrulama

- Unit/DOM: 25 test
- Browser E2E: 5 test
- Bağımlılık denetimi: `npm audit --audit-level=high`

## Sıradaki

1. Zen + Tampermonkey'de üç gerçek Google Görseliyle canlı clipboard kabulünü tamamlamak.
2. FloatBar ve preview akışını yenilemek.
3. Galeri deneyimini modernize etmek.

## Proje yapısı

- `src/` — Koppy eklemeleri
- `vendor/` — hash'i kaydedilmiş upstream/build bağımlılık snapshot'ları
- `scripts/` — derleme ve clipboard doğrulama araçları
- `tests/` — fixture, unit ve browser E2E testleri
- `dist/` — Tampermonkey'nin kurduğu, izlenen yayın dosyası

Özel araştırma, çalışma notları ve yerel sonuçlar `docs/private/` veya `.context/` altında tutulur ve git'e girmez.
