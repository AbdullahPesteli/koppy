# Koppy — Durum

**Sürüm:** 0.2.7
**Lisans:** MIT
**Dağıtım:** `dist/Koppy.user.js` üzerinden Tampermonkey

## Şu an

- Google Görseller'de gerçek adayla, diğer sitelerde QuickHover/görünür görsel fallback'iyle `Cmd+C` sonucu `image/png` olarak panoya yazar.
- Kopyalama, mümkünse QuickHover'ın süzülen preview panelinde ince ilerleme çizgisi ve çözünürlüklü başarı bilgisi verir; küçük kaynak görsel yalnız ince hedef çerçevesi taşır. Metin kopyalamayı bozmaz.
- QuickHover önizlemesi boş boyut ayarında ekranı kaplamak yerine yaklaşık ekranın %72'sine sığar; elle girilen sınır korunur.
- Tampermonkey menüsündeki **Koppy Canlı Kontrol**, sık kullanılan modifier, FloatBar konumu ve preview boyutunu küçük bir panelden gerçek davranışa anında uygular; tüm ayrıntılar tam ayarlar ekranında kalır.
- Ayar arayüzü sandbox'lıdır; 91 mevcut Picviewer ayarının saklama sözleşmesini korur.
- `@updateURL` / `@downloadURL` GitHub'daki sürüm dosyasına bağlıdır. Tampermonkey'de **Automatic installation** açık olmalıdır.

## Doğrulama

- Unit/DOM: 33 test
- Browser E2E: 8 test
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
- 0.2.6: Kopyalama geri bildirimi küçük thumbnail yerine varsa süzülen QuickHover preview'sine taşındı; kaynakta yalnız ince çerçeve kaldı.
- 0.2.7: Tampermonkey menüsünden açılan, gerçek FloatBar/preview'e canlı bağlı kompakt kontrol paneli eklendi. Programatik sayfa tıklamaları ayar değiştiremez.
- Tampermonkey kurulum sayfası Zen'de arka planda açıldı. İlk kurulumdan sonra **Automatic installation** açık olmalıdır.
