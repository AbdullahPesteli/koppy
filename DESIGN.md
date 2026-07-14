# Koppy arayüz sözleşmesi

Koppy, görsel işi sırasında arka planda güvenilir kalan kişisel bir araçtır. Arayüzü “eski userscript formu” gibi değil, yoğun ayarları sakin ve anlaşılır biçimde yöneten küçük bir masaüstü uygulaması gibi davranır.

## Görsel dil

- Koyu, nötr yüzeyler; okunaklı açık metin; tek vurgu rengi.
- Gradient, glow, dekoratif ikon ve gereksiz animasyon kullanılmaz.
- Sistem fontu kullanılır: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Temel ölçüler: 14px gövde, 13px alan etiketi, 20px panel başlığı.
- Boşluk ölçeği: 4 / 8 / 12 / 16 / 20 / 24 / 32px.
- Radius: alan ve düğmeler 8px, kartlar 11px, modal 14px.

## Renk tokenları

- Arka plan: `#0b0e13`
- Yüzey: `#11151c`
- Yükseltilmiş yüzey: `#171c25`
- Alan: `#0e1218`
- Kenarlık: `#2a3340`
- Ana metin: `#f4f7fb`
- İkincil metin: `#aab4c2`
- Soluk metin: `#778393`
- Vurgu: `#7c9cff`
- Tehlike: `#ff7185`

## Ayar paneli yerleşimi

- Başlık, arama ve kapatma eylemi üstte sabittir.
- Geniş görünümde kategori navigasyonu solda, yalnız içerik alanı scroll olur.
- Dar görünümde kategoriler yatay kaydırılır; alanlar tek kolona iner.
- Alt eylem çubuğu sabittir; reset, dirty-state, vazgeç ve kaydet her zaman görünür.
- Ayarlar kullanıcı niyeti etrafında gruplanır. FloatBar için varsayılan ekran üç kararı sorar: nerede duracak,
  ne zaman görünecek, hangi görsellerde görünecek. X/Y ve düşük sıklıklı eşikler İnce ayar'da kalır; mevcut
  storage anahtarları korunur.

## Etkileşim kuralları

- `⌘K` aramayı açar, `⌘S` değişiklik varsa kaydeder.
- Temiz formda `Escape` paneli kapatır; dirty formda veri kaybını engeller.
- Vazgeç ve global reset, değişiklik kaybı yaratacaksa ikinci basışla onaylanır.
- Boolean alanlar switch görünümündedir; metin, sayı, seçim ve kod alanları aynı focus sistemini kullanır.
- Önizleme etkinleştirme tuşu tek seçimlidir; `⌘ Cmd` seçildiğinde `Ctrl` otomatik kapanır. Bu ayar,
  gerçek görsel kopyalayan `⌘C` kısayolundan ayrıdır. Ölçü boşsa QuickHover önizlemesi ekranın yaklaşık
  %72'sine sığar; kullanıcı ölçü girerse bu sınır aynen uygulanır.
- `⌘C` sırasında görselin alt kenarında ince, sakin bir ilerleme çizgisi görünür; başarıda kısa süre
  `Kopyalandı · genişlik×yükseklik` metnine dönüşür. Sayfa altındaki toast hata ve erişilebilirlik yedeğidir.
- Görsel Stack açıksa aynı başarı geri bildiriminin sağında kısa bir `+1 Stack · N görsel` çipi yukarı
  oturarak görünür; bu, normal panoya kopyalamanın yanında geçici listeye de eklendiğini açıkça ayırır.
  Canlı Kontrol başlığındaki **Topla** düğmesi açıkken noktalı `Stack N` durumuna döner; N sıfırdan büyükse
  yanındaki mini `×` yalnız Stack belleğini temizler. Hareketler reduced-motion tercihinde kapalıdır.
- Görsel üzerinde `⌘⌥C`, normal PNG kopyasını yaptıktan sonra Stack’i de başlatan hızlı collector
  kısayoludur. Başarılı kart, kaynağın merkezinden imlecin yaklaşık 12px sağ-altında beliren `▣ N`
  rozetine 380ms’de küçülerek gider; rozet Stack açık ve boş değilken imleci takip eder. Bu gerçek OS
  cursor’unu değiştirmez; sayfa üstündeki pointer-events kapalı bir eşlikçi katmandır.
- Collector rozeti görünürken imlecin konum geçmişinden gelen üç küçük, gittikçe solan kart/dot arkada
  gecikmeli bir kuyruk oluşturur. Kuyruk hızlı hareketle uzar, imleç durunca yaklaşır; bu işlevsel Stack
  durumunun tatlı ama sakin hareketidir, reduced-motion tercihinde hiç çizilmez.
- Tampermonkey menüsünden açılan **Canlı Kontrol**, tam ayar penceresinin yerine geçen ikinci bir form değildir:
  yalnız önizleme tuşu, FloatBar konumu ve preview boyutu için küçük, sayfaya ilişen bir kontrol yüzeyidir.
  Seçim gerçek `prefs` değerine kullanıcı tıklamasıyla anında yazılır; açık FloatBar/preview varsa değişiklik
  hemen uygulanır, yoksa sonraki hover'da görünür. Daha seyrek veya sayısal kararlar “Tüm ayarları aç” altında kalır.
- Arama bütün kategorileri tarar; sonuç sayısı veya açık boş-sonuç mesajı gösterilir.
- Arama, kapalı bir İnce ayar içindeki eşleşmeyi bulursa ilgili bölümü açar.
- Hareketler `prefers-reduced-motion` altında kapatılır.

## Korunan teknik sözleşme

- `pv-prefs` içindeki 91 mevcut ayar anahtarı yeniden adlandırılmaz.
- Ayar belgesi `allow-same-origin` içermeyen sandbox iframe'da çalışır; ziyaret edilen site yalnız şema
  doğrulamalı özel `MessageChannel` üzerinden kullanıcı hareketiyle başlatılan kayıt isteğini iletebilir.
- Save yazması read-back ile doğrulanmadan panel kapanmaz. `customRules` yalnız deklaratif JSON dizisidir;
  çalıştırılabilir JavaScript kuralları kabul edilmez.
- Vendor snapshot değiştirilmez; Koppy sunum katmanı `src/koppy-settings-ui.js` içinde tutulur.
