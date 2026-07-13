# Koppy — Durum

**Sürüm:** 0.2.5
**Lisans:** MIT
**Dağıtım:** `dist/Koppy.user.js` üzerinden Tampermonkey

## Şu an

- Google Görseller'de gerçek adayla, diğer sitelerde QuickHover/görünür görsel fallback'iyle `Cmd+C` sonucu `image/png` olarak panoya yazar.
- Kopyalama görsel üzerinde ince ilerleme çizgisi ve çözünürlüklü başarı bilgisi verir; metin kopyalamayı bozmaz.
- QuickHover önizlemesi boş boyut ayarında ekranı kaplamak yerine yaklaşık ekranın %72'sine sığar; elle girilen sınır korunur.
- Ayar arayüzü sandbox'lıdır; 91 mevcut Picviewer ayarının saklama sözleşmesini korur.
- `@updateURL` / `@downloadURL` GitHub'daki sürüm dosyasına bağlıdır. Tampermonkey'de **Automatic installation** açık olmalıdır.

## Doğrulama

- Unit/DOM: 29 test
- Browser E2E: 6 test
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

## Son oturum

- Public kaynak ağacı tek temiz commit olarak yayımlandı; reverse-engineering/plan notları yerelde `docs/private/` altında korundu.
- GitHub raw yayın dosyası yerel `dist/Koppy.user.js` ile SHA-256 olarak bire bir doğrulandı.
- 0.2.5: Wikipedia QuickHover binary copy E2E'si, görsel-üstü kopya ilerlemesi ve sınırlı QuickHover preview eklendi.
- Tampermonkey kurulum sayfası Zen'de arka planda açıldı. İlk kurulumdan sonra **Automatic installation** açık olmalıdır.
