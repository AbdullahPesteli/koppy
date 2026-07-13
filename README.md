# Koppy

Koppy, MIT lisanslı Picviewer CE+ kullanıcı betiğinin kişisel fork'udur. Mevcut Picviewer
özelliklerini korur; Google Görseller'de hover edilen orijinal resmi `Cmd+C` ile URL yerine gerçek
PNG olarak panoya kopyalar. Ayar paneli Koppy'ye özel, aranabilir ve responsive'tir.

## Kurulum

1. Zen'de [Koppy.user.js](https://raw.githubusercontent.com/AbdullahPesteli/koppy/master/dist/Koppy.user.js)
   bağlantısını aç ve Tampermonkey'nin **Install / Kur** düğmesine bas.
2. Tampermonkey Dashboard'da orijinal **Picviewer CE+** betiğini kapat.
3. Tampermonkey Settings'te **Automatic installation / Otomatik kurulum** seçeneğini aç.

Orijinal ile Koppy aynı anda açık tutulmamalıdır; iki betik aynı Picviewer event'lerini kaydeder.

Koppy'nin `@updateURL` ve `@downloadURL` alanları aynı yayın adresine bağlıdır. İlk kurulumdan sonra
**Automatic installation** açık olduğunda yeni sürüm için yeniden dosya yüklemek gerekmez.

## Geliştirme

```sh
npm ci --ignore-scripts
npm run check
```

`npm run build`, kurulum ve güncelleme için izlenen `dist/Koppy.user.js` dosyasını üretir. Bu dosya
bilerek git'te tutulur: Tampermonkey her sürümde buradan güncelleme alır.

## Kullanım

Google Görseller (`tbm=isch` veya `udm=2`) sonucunun üzerinde bekleyip `Cmd+C` yap. Koppy ulaşılabilen
orijinal URL'yi indirir, resmi standart `image/png` clipboard biçimine dönüştürür ve çözünürlüğü kısa
bir bildirimde gösterir. Metin seçiliyken veya input/textarea/contenteditable alanındayken normal
kopyalama davranışı korunur.

Hover yalnız URL adayını çözer; gizlilik, SSRF ve bellek riski nedeniyle ağ/decode işlemi `Cmd+C` öncesinde
başlatılmaz. Koppy yalnız `https:` görselleri kabul eder; literal localhost/private ağ hedeflerini,
yönlendirmeleri, raster olmayan yanıtları, 80 MB üzerindeki indirmeleri ve güvenli piksel/dimension sınırını
aşan görselleri reddeder. İstekler anonim ve 20 saniye timeout ile yapılır. Tampermonkey katmanında DNS
çözümünü güvenilir biçimde pinlemek mümkün olmadığından DNS-rebinding riski bütünüyle sıfırlanamaz; ağın
yalnız gerçek kullanıcı `Cmd+C` hareketinde başlaması bu yüzeyi daraltır. Faz 1 raster kapsamı PNG, JPEG
ve WebP'dir; GIF/AVIF kaynakları açık “desteklenmeyen tür” hatasıyla reddedilir. Google hostname kapsamı
kişisel hedefe göre `google.com` ve `google.com.tr` ile sınırlıdır.

Tampermonkey menüsündeki Koppy ayarları; beş kategori, global ayar araması, sabit kaydetme çubuğu ve
dar pencerede yatay kategori navigasyonu kullanır. Mevcut 91 Picviewer ayarı ve kayıtlı değerleri aynı
`pv-prefs` saklama sözleşmesiyle korunur. Ayar belgesi ziyaret edilen siteden sandbox'lı opaque origin ile
ayrılır; kayıt paketleri özel MessageChannel'da alan tipi/seçenek/uzunluk açısından doğrulanır ve storage
read-back başarılı olmadan panel kapanmaz. Aria2 token renderer şemasına düz metin olarak gönderilmez;
boş bırakılırsa kayıtlı değer korunur, yalnız açık sıfırlama veya yeni değer girişiyle değişir.
Google'ın CSP nonce'u sandbox renderer'ına taşınır; panel dışındaki karartılmış alana tıklamak, kaydedilmemiş
değişiklik yoksa ayarları kapatır.

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
- `src/koppy-settings-ui.js`: Koppy ayar sunum katmanı
- `DESIGN.md`: arayüz tokenları, layout ve etkileşim sözleşmesi
- `dist/Koppy.user.js`: Tampermonkey'e kurulacak, yeniden üretilebilir çıktı
- `tests/`: eski/yeni/gerçek-güncel Google DOM fixture'ları, unit ve browser clipboard E2E testleri
- `vendor/runtime/`: uzaktan kod çalıştırmayan, SHA-256 kayıtlı bağımlılık snapshot'ları

`clipboard:inspect` panoyu değiştirmeden öğe sayısı, MIME/UTI, piksel boyutu, byte boyutu ve SHA-256
özetini JSON olarak verir; gerçek Zen kabul testinin mekanik kanıtıdır.

Upstream atfı ve commit bilgisi `THIRD_PARTY_NOTICES.md` dosyasındadır.
