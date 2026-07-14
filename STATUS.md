# Koppy — Durum

**Sürüm:** 0.4.13
**Lisans:** MIT
**Dağıtım:** `dist/Koppy.user.js` üzerinden Tampermonkey

## Şu an

- Google Görseller'de Picviewer sonucu, bağlantı/metaveri/lazy-load alanları, `picture`/`srcset` ve büyük yüklenmiş preview adaylarını sıralayarak; diğer sitelerde QuickHover/görünür görsel fallback'iyle `Cmd+C` sonucu `image/png` olarak panoya yazar. Görünür CSS `background-image`, video `poster`, SVG `<image>`, PDF `embed/object/iframe` ve indirilebilir PDF/AI bağlantıları da adaydır.
- Girdi imzasından PNG/JPEG/WebP/GIF/BMP/ICO/AVIF/SVG tanınır. PDF ve PDF-uyumlu AI dosyasının yalnız ilk sayfası yerelde PNG olarak render edilir. Saf PostScript AI/EPS, PSD/RAW gibi browser-decoder dışı formatlarda yanlış bir görüntü yerine açık hata verilir; tam kapsam için opt-in yerel bridge gerekir.
- Kopyalama, mümkünse QuickHover'ın süzülen preview panelinde ince ilerleme çizgisi ve çözünürlüklü başarı bilgisi verir; küçük kaynak görsel yalnız ince hedef çerçevesi taşır. Metin kopyalamayı bozmaz.
- QuickHover önizlemesi boş boyut ayarında ekranı kaplamak yerine yaklaşık ekranın %72'sine sığar; elle girilen sınır korunur.
- Tampermonkey menüsündeki **Koppy Canlı Kontrol**, sık kullanılan modifier, FloatBar konumu ve preview boyutunu küçük bir panelden gerçek davranışa anında uygular. Panel üst sağda açılır, başlığından sürüklenebilir; **sabitle** açıkken sayfada deneme yaparken kapanmaz. Aynı paneldeki **Koppy’yi güncelle** eylemi Tampermonkey güncelleme sayfasını doğrudan açar.
- **Son Kopyalar**, normal `Cmd+C` sonucunu değiştirmez: her basış macOS panosuna yalnız son PNG’yi yazar, aynı PNG bu sekmede en fazla 10 görsel / 150 MB sınırında tutulur. İkinci kopyadan sonra mouse yanında `▣ N` rozeti görünür. Mouse ondan uzaklaşınca yumuşak companion takibi yapar; rozete doğru yönelince frenler, sabitlenir ve 44×36 px tıklanabilir hedefe dönüşür. Hover'da daha parlak, %10 büyük halo alır; mouse rozeti bırakır bırakmaz yeni mouse konumunun yanına geri gelir. Tıklandığında liste seçilir; çoklu görüntüyü ayrı native pano öğeleri olarak yazmak için hâlâ opt-in Koppy Bridge gerekir. Canlı Kontrol yalnız erişilebilir yedek olarak `Son N` ve `×` gösterir; `×` sistem panosuna dokunmaz.
- Ayar arayüzü sandbox'lıdır; 91 mevcut Picviewer ayarının saklama sözleşmesini korur.
- `@updateURL` / `@downloadURL` GitHub'daki sürüm dosyasına bağlıdır. Tampermonkey'de **Automatic installation** açık olmalıdır.

## Doğrulama

- Unit/DOM: 47 test
- Browser E2E: 13 test (gerçek PDF.js render, Turkcell-tipi küçük bağlantı ve yerel Picviewer belge önizlemesi dahil)
- Bağımlılık denetimi: `npm audit --audit-level=high`

## Sıradaki

1. Koppy Bridge için opt-in Firefox/Zen companion extension + yerel macOS helper mimarisini karara bağlamak. Bu katman, rozette seçilen birden fazla PNG'yi macOS panosuna ayrı ayrı yazabilir; cookie/ağ gözlemi yalnız bu katmanda kalacak.
2. MaxURL'ın Apache-2.0 URL dönüşüm motorundan küçük, fixture'lı ve güvenli bir resolver adaptörü çıkarmak.
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
- 0.4.6: Varsayılan kapalı Görsel Stack eklendi. Normal `Cmd+C` her seferinde tek güncel PNG clipboard öğesi olarak korundu; Stack açıkken aynı PNG geçici belleğe de ekleniyor. Canlı Kontrol’den aç/kapat, sayaç ve yalnız Koppy belleğini temizleyen `× Temizle` sunuluyor. 10 öğe / 150 MB üst sınırı sessiz bellek birikimini engelliyor. Unit + browser E2E, iki Stack kopyasında sistem panosunun tek PNG kaldığını ve Stack temizliğinin panoyu değiştirmediğini doğruluyor.
- 0.4.7: Stack’in görünür geri bildirimi güçlendirildi. Kopya çizgisi yanında animasyonlu `+1 Stack · N görsel` çipi, toast’ta açık “Stack’e eklendi” metni ve Canlı Kontrol başlığında noktalı aktif sayaç var. Stack, teknik olarak açık olsa da görünmez kalan bir mod olmaktan çıktı; browser E2E bu görünür sayacı doğruluyor.
- 0.4.8: Hızlı collector hareketi eklendi. `⌘⌥C` ilk görseli normal panoya da kopyalayarak Stack’i etkinleştirir; kart 380ms’de kaynaktan imleç-yanı `▣ N` sayacına uçar. Sayaç Stack açıkken imleci takip eder. Browser E2E, gerçek `Meta+Alt+C` tuş olayını, ikinci normal `Meta+C` kopyasını, tek PNG clipboard sonucunu ve rozetin fare koordinatını takip ettiğini doğrular.
- 0.4.9: `⌘⌥C` collector kısayolu Türkçe macOS klavye düzeninde `⌥C → ç` karakter dönüşümünden etkilenmez; fiziksel `KeyC` de kabul edilir. Unit testi hem `c` hem `ç`/`KeyC` olayını doğrular.
- 0.4.10: Cursor collector’ın arkasına üç öğelik gecikmeli kart/dot kuyruğu eklendi. Browser E2E, rozetin imleci takip ettiğini, üç kuyruk öğesinin görünür olduğunu ve farklı geçmiş koordinatlarında kaldığını doğrular.
- 0.4.11: Zen’le çakışan `⌘⌥C` kaldırıldı. İki hızlı normal `⌘C`, ilk kopyayı da geriye dönük Stack’e alan burst akışını başlatır; her ekleme 2,4 saniyelik soğuma çizgisini yeniler. Soğuyunca `Hazır N` park durumu olur ve kuyruk kapanır. Aktif burst’te `Esc` Stack’i temizler, pano korunur. Browser E2E burst başlangıcını, cooldown parkını, rozet/kuyruk görünümünü ve tek PNG pano sonucunu doğrular.
- 0.4.12: Zaman baskılı Stack burst/cooldown kaldırıldı. Her normal `Cmd+C` sessiz Son Kopyalar listesine girer. İkinci öğeden sonra `▣ N` rozeti uzaklaşan imleci yumuşak takip eder; imleç rozete yönelince frenleyip sabitlenen, tek tıklanabilir hedefe dönüşür. Unit ve browser E2E normal tek-PNG panoyu, iki öğeli listeyi, magnetic rozetin tıklanmasını ve temizliğin panoya dokunmamasını doğrular.
- 0.4.13: Yakalanan rozet hover'da daha belirgin hale gelir. Rozetten çıkış, eski konumda kalmak yerine pointerleave anında takip moduna geri döner; E2E bu geri dönüşü doğrular. Hata ve geçici bilgi toast'ları daraltılıp uzun URL/mesajlarda satır kırar.
- 2026-07-14 araştırması: macOS `NSPasteboard` birden fazla bağımsız öğe yazabilir; ancak web Clipboard API spesifikasyonu `write()` çağrısında son `ClipboardItem`'ı seçer, Firefox extension API'sinde de `additionalItems` yoktur. Bu nedenle sonradan karar verilen çoklu-görsel yapıştırma, Tampermonkey tek başına değil opt-in yerel Koppy Bridge ile gerçekçi ve doğrulanabilir bir yoldur.
- Tampermonkey kurulum sayfası Zen'de arka planda açıldı. İlk kurulumdan sonra **Automatic installation** açık olmalıdır.
