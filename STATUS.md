# Koppy — Durum

**Sürüm:** 0.4.5
**Lisans:** MIT
**Dağıtım:** `dist/Koppy.user.js` üzerinden Tampermonkey

## Şu an

- Google Görseller'de Picviewer sonucu, bağlantı/metaveri/lazy-load alanları, `picture`/`srcset` ve büyük yüklenmiş preview adaylarını sıralayarak; diğer sitelerde QuickHover/görünür görsel fallback'iyle `Cmd+C` sonucu `image/png` olarak panoya yazar. Görünür CSS `background-image`, video `poster`, SVG `<image>`, PDF `embed/object/iframe` ve indirilebilir PDF/AI bağlantıları da adaydır.
- Girdi imzasından PNG/JPEG/WebP/GIF/BMP/ICO/AVIF/SVG tanınır. PDF ve PDF-uyumlu AI dosyasının yalnız ilk sayfası yerelde PNG olarak render edilir. Saf PostScript AI/EPS, PSD/RAW gibi browser-decoder dışı formatlarda yanlış bir görüntü yerine açık hata verilir; tam kapsam için opt-in yerel bridge gerekir.
- Kopyalama, mümkünse QuickHover'ın süzülen preview panelinde ince ilerleme çizgisi ve çözünürlüklü başarı bilgisi verir; küçük kaynak görsel yalnız ince hedef çerçevesi taşır. Metin kopyalamayı bozmaz.
- QuickHover önizlemesi boş boyut ayarında ekranı kaplamak yerine yaklaşık ekranın %72'sine sığar; elle girilen sınır korunur.
- Tampermonkey menüsündeki **Koppy Canlı Kontrol**, sık kullanılan modifier, FloatBar konumu ve preview boyutunu küçük bir panelden gerçek davranışa anında uygular. Panel üst sağda açılır, başlığından sürüklenebilir; **sabitle** açıkken sayfada deneme yaparken kapanmaz. Aynı paneldeki **Koppy’yi güncelle** eylemi Tampermonkey güncelleme sayfasını doğrudan açar.
- Ayar arayüzü sandbox'lıdır; 91 mevcut Picviewer ayarının saklama sözleşmesini korur.
- `@updateURL` / `@downloadURL` GitHub'daki sürüm dosyasına bağlıdır. Tampermonkey'de **Automatic installation** açık olmalıdır.

## Doğrulama

- Unit/DOM: 45 test
- Browser E2E: 12 test (gerçek PDF.js render, Turkcell-tipi küçük bağlantı ve yerel Picviewer belge önizlemesi dahil)
- Bağımlılık denetimi: `npm audit --audit-level=high`

## Sıradaki

1. MaxURL'ın Apache-2.0 URL dönüşüm motorundan küçük, fixture'lı ve güvenli bir resolver adaptörü çıkarmak.
2. Koppy Bridge için opt-in Firefox/Zen companion extension izni ve mimarisini karara bağlamak; cookie/ağ gözlemi yalnız bu katmanda kalacak.
3. Zen + Tampermonkey'de üç gerçek Google Görseliyle canlı clipboard kabulünü tamamlamak.

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
- 0.2.8: Tampermonkey açılır menüsüne ve Canlı Kontrol paneline tek tıklamalı **Koppy’yi güncelle** eylemi eklendi. Eylem yalnız Koppy'nin sabit GitHub yayın URL'sini açar; uzaktan kod çalıştırmaz.
- 0.2.9: Canlı Kontrol üst sağda açılacak şekilde düzenlendi; panel sürüklenebilir ve sabitlenebilir oldu. Sabit değilken sayfaya tıklama paneli kapatır, sabitken hover/deneme sırasında açık kalır.
- 0.3.0: Google aday çözümleme, Picviewer'ın eşit `src/imgSrc` sonuçlarını, lazy-load alanlarını, `picture`/`srcset` kaynaklarını ve yüklenmiş büyük preview'i kapsayacak şekilde genişletildi. Küçük Google thumbnail'ı fallback olarak hâlâ engellidir.
- 0.3.1: Açık kaynak taramasıyla MaxURL (Apache-2.0), Image Downloader (lisans yok), KellyC (GPL-3.0) ve Imagus Reborn (lisans yok) değerlendirildi. Koppy'ye bağımsız CSS `background-image`, video `poster` ve SVG `<image>` adayları eklendi; 39 unit + 8 browser E2E test geçti. Ayrıntılı araştırma notu yerel `docs/private/` altında tutulur.
- 0.3.2: Google yalnız encrypted thumbnail veriyorsa hata yerine gerçek thumbnail piksellerini kopyalar; başarı bildirimi bunu açıkça **Önizleme kopyalandı** diye belirtir. Orijinal aday her zaman önce denenir.
- 0.3.3: Doğrudan açık Google thumbnail sekmesi de genel görsel olarak kopyalanabilir; yine **Önizleme kopyalandı** etiketi taşır.
- 0.4.0: Güncel ve denetlenen PDF.js 5.4.530 yalnız PDF/AI-PDF kopyası istendiğinde yerel Blob module olarak yüklenir; PDF/uyumlu-AI ilk sayfası 2× hedef ölçekle, güvenli boyut/piksel sınırları içinde `image/png` olur. Eski PostScript AI/EPS açıkça ayrılır. 43 unit ve 9 browser E2E testi geçti; E2E gerçek PDF render'ını ve çıktı pikselini doğrular.
- 0.4.1: PDF/AI indirme seçeneklerinin sadece kısa metin linki olduğu kartlar artık aday boyut filtresine takılmaz. Turkcell logo sayfasındaki gerçek adres ve MIME'lar doğrulandı: PDF `application/pdf`, AI dosyası PDF-uyumlu `%PDF-` başlığı taşıyor. 44 unit ve 10 browser E2E testi geçti; E2E kısa PDF/AI linkinde gerçek hover + `Cmd+C` akışını doğrular.
- 0.4.2: Picviewer'ın yalnız `<img>` için sunduğu Cmd-basılı QuickHover davranışı, PDF ve PDF-uyumlu AI indirme linklerine de eklendi. Koppy ilk sayfayı küçük "Belge önizlemesi" panelinde gösterir; Cmd bırakılınca panel kapanır ve `Cmd+C` aynı PNG dönüşümünü kullanır.
- 0.4.3: Ayrı Koppy belge paneli kaldırıldı. PDF/AI-PDF önizlemesi artık mevcut Picviewer QuickHover penceresinin aynı sınıflarını, konumlandırmasını ve boyut kurallarını kullanır; böylece JPEG/PNG ile aynı deneyimdedir.
- 0.4.4: Güvenli HTTPS yönlendirmeleri artık tek tek doğrulanarak takip edilir. OpenUSD/Pixar görseli gibi CDN taşınmaları kopyalanır; HTTP, özel ağ/localhost hedefi, eksik `Location` ve beşten fazla yönlendirme yine reddedilir.
- 0.4.5: Sadece yazı olarak sunulan SVG/raster indirme linkleri ve uzantısız ama `download` işaretli imzalı CDN linkleri de kopya adayıdır; dosya içeriği hâlâ indirildikten sonra imza/MIME doğrulamasından geçer.
- Tampermonkey kurulum sayfası Zen'de arka planda açıldı. İlk kurulumdan sonra **Automatic installation** açık olmalıdır.
