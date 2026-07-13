# Koppy

Koppy, MIT lisanslı Picviewer CE+ kullanıcı betiğinin kişisel fork'udur. Mevcut Picviewer
özelliklerini korur; QuickHover'ın bulduğu veya ekranda görünen görseli `Cmd+C` ile URL yerine gerçek
PNG olarak panoya kopyalar. Ayar paneli Koppy'ye özel, aranabilir ve responsive'tir.

## Kurulum

1. Zen'de [Koppy.user.js](https://raw.githubusercontent.com/AbdullahPesteli/koppy/master/dist/Koppy.user.js)
   bağlantısını aç ve Tampermonkey'nin **Install / Kur** düğmesine bas.
2. Tampermonkey Dashboard'da orijinal **Picviewer CE+** betiğini kapat.
3. Tampermonkey Settings'te **Automatic installation / Otomatik kurulum** seçeneğini aç.

Orijinal ile Koppy aynı anda açık tutulmamalıdır; iki betik aynı Picviewer event'lerini kaydeder.

Koppy'nin `@updateURL` ve `@downloadURL` alanları aynı yayın adresine bağlıdır. İlk kurulumdan sonra
**Automatic installation** açık olduğunda yeni sürüm için yeniden dosya yüklemek gerekmez. Acil bir sürüm
gerekirse Tampermonkey'nin pinlenmiş menüsündeki **Koppy · Güncellemeyi aç** ya da Canlı Kontrol panelindeki
**Koppy’yi güncelle** düğmesi, doğru kurulum sayfasını doğrudan açar.

## Geliştirme

```sh
npm ci --ignore-scripts
npm run check
```

`npm run build`, kurulum ve güncelleme için izlenen `dist/Koppy.user.js` dosyasını üretir. Bu dosya
bilerek git'te tutulur: Tampermonkey her sürümde buradan güncelleme alır.

## Kullanım

Wikipedia dahil desteklenen herhangi bir sitede görselin üzerinde bekleyip `Cmd+C` yap. Koppy önce
QuickHover/Picviewer'ın çözdüğü daha iyi URL'yi, yoksa ekranda görünen görselin URL'sini kullanır;
çıktıyı standart `image/png` clipboard biçimine dönüştürür. Kopyalama sırasında görselin üzerinde ince
bir ilerleme çizgisi, sonunda da çözünürlüklü kısa “Kopyalandı” bilgisi görünür. Metin seçiliyken veya
input/textarea/contenteditable alanındayken normal kopyalama davranışı korunur.

Hover yalnız URL adayını çözer; ağ/decode işlemi `Cmd+C` öncesinde başlamaz. Koppy yalnız `https:`
görselleri kabul eder; localhost/private ağ hedeflerini, yönlendirmeleri, raster olmayan yanıtları, 80 MB
üzerindeki indirmeleri ve güvenli piksel/dimension sınırını aşan görselleri reddeder. İstekler anonim ve
20 saniye timeout ile yapılır. Google Görseller'de gstatic thumbnail'ı hiçbir zaman “orijinal” diye
kopyalanmaz; gerçek aday yoksa açık hata gösterilir. PNG, JPEG ve WebP desteklenir; GIF/AVIF kaynakları
“desteklenmeyen tür” hatasıyla reddedilir.

Tampermonkey menüsündeki **Koppy Canlı Kontrol**, en sık üç kararı küçük bir panelden verir: önizleme tuşu,
FloatBar konumu ve süzülen preview boyutu. Panel üst sağda açılır; başlığından sürüklenebilir. Başlıktaki
**sabitle** simgesi açıkken sayfada görselleri denerken panel kapanmaz; kapalıyken sayfaya tıklama paneli
kapatır. Seçimler anında gerçek davranışa yazılır; açık bir FloatBar veya preview varsa mümkün olduğunda o anda yeniden konumlanır/ölçülür. Ayrıntılı ayarlar için aynı paneldeki
**Tüm ayarları aç** eylemi kullanılır. Tam ayarlar ekranı; beş kategori, global ayar araması, sabit kaydetme çubuğu ve
dar pencerede yatay kategori navigasyonu kullanır. Mevcut 91 Picviewer ayarı ve kayıtlı değerleri aynı
`pv-prefs` saklama sözleşmesiyle korunur. Ayar belgesi ziyaret edilen siteden sandbox'lı opaque origin ile
ayrılır; kayıt paketleri özel MessageChannel'da alan tipi/seçenek/uzunluk açısından doğrulanır ve storage
read-back başarılı olmadan panel kapanmaz. Aria2 token renderer şemasına düz metin olarak gönderilmez;
boş bırakılırsa kayıtlı değer korunur, yalnız açık sıfırlama veya yeni değer girişiyle değişir.
Google'ın CSP nonce'u sandbox renderer'ına taşınır; panel dışındaki karartılmış alana tıklamak, kaydedilmemiş
değişiklik yoksa ayarları kapatır. **Önizleme boyutu** alanları boşsa QuickHover önizlemesi ekranı kaplamaz;
yaklaşık ekranın %72'sine sığar. Alanlara elle ölçü yazılırsa o ölçüler önceliklidir.

Güvenlik nedeniyle özel site kuralları artık yalnız geçerli bir JSON dizisi olabilir. Eski JavaScript/eval
biçimli custom rule'lar çalıştırılmaz; gerekiyorsa deklaratif JSON biçimine dönüştürülmelidir.

## Doğrulama

```sh
npm run build
npm test
npm run test:e2e
npm run clipboard:inspect
```

- `vendor/picviewer-ce-plus/`: değiştirilmemiş upstream snapshot
- `src/google-images-copy.js`: Koppy'nin test edilebilir Cmd+C çekirdeği
- `src/koppy-control-deck.js`: küçük, canlı FloatBar/preview kontrol paneli
- `src/koppy-settings-ui.js`: Koppy ayar sunum katmanı
- `DESIGN.md`: arayüz tokenları, layout ve etkileşim sözleşmesi
- `dist/Koppy.user.js`: Tampermonkey'e kurulacak, yeniden üretilebilir çıktı
- `tests/`: eski/yeni/gerçek-güncel Google DOM fixture'ları, unit ve browser clipboard E2E testleri
- `vendor/runtime/`: uzaktan kod çalıştırmayan, SHA-256 kayıtlı bağımlılık snapshot'ları

`clipboard:inspect` panoyu değiştirmeden öğe sayısı, MIME/UTI, piksel boyutu, byte boyutu ve SHA-256
özetini JSON olarak verir; gerçek Zen kabul testinin mekanik kanıtıdır.

Upstream atfı ve commit bilgisi `THIRD_PARTY_NOTICES.md` dosyasındadır.
