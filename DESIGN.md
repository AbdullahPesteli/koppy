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
- Son Kopyalar görünmez varsayılandır: normal başarı çizgisi/mesajı liste bilgisi taşımaz. İkinci başarılı
  kopyadan sonra imleç yanında yalnız `▣ N` rozeti görünür. Rozet, imleç uzaklaşırken hafif gecikmeli takip eder;
  imleç ona doğru yönelince frenleyip dünya koordinatında sabitlenir, 44×36 px hedefe ve hafif bir halo'ya dönüşür.
  Gerçek hover'da %10 büyür ve parlaklaşır; pointerleave anında eski noktada beklemeden yeni imleç konumuna companion olarak döner.
  Böylece hem companion hissi verir hem de kaçan buton olmaz. Tıklama, sonraki Bridge katmanına teslim edilmek
  üzere listeyi seçer. Reduced-motion'da rozet doğrudan konum değiştirir.
- Canlı Kontrol yalnız açık olduğunda `Son N` ve `×` gösterir; bu alternatif bir karar paneli değil, aynı
  rozetin erişilebilir yedeğidir. `×` yalnız geçici belleği temizler ve sistem panosunu değiştirmez.
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
