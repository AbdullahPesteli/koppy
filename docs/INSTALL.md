# Koppy kurulum rehberi

İki kademe var. Kademe A tek başına yeterlidir (tek görsel `Cmd+C`). Kademe B, **tek `Cmd+V` ile N görsel**
yapıştırmayı açar. Ekran görüntüsü yok: her adımda komut ve beklenen çıktı verilir.

## Kademe A — Temel (3 adım)

1. **Tampermonkey** uzantısını tarayıcıya kur (Zen/Firefox/Chrome).
2. [`dist/Koppy.user.js`](https://raw.githubusercontent.com/AbdullahPesteli/koppy/master/dist/Koppy.user.js)
   bağlantısını aç → Tampermonkey'nin **Install / Kur** düğmesine bas.
   Beklenen: Dashboard'da `Koppy` betiği, **Enabled**.
3. Dashboard'da orijinal **Picviewer CE+** betiğini kapat (ikisi birlikte açık kalmamalı) ve
   Settings → **Automatic installation**'ı aç.

Doğrulama: bir görselin üzerinde bekleyip `Cmd+C` → başka yere `Cmd+V` → PNG yapışır.

## Kademe B — Çoklu yapıştırma (köprü + token + test)

Gereksinim: macOS, Xcode Command Line Tools (`xcode-select --install`), bu repo klonu.

### 1. Köprüyü kur

```sh
cd /yol/koppy
npm run bridge:install
```

Beklenen son satır:

```
Koppy Bridge çalışıyor: http://127.0.0.1:47651/v1/health
```

### 2. Köprünün ayakta olduğunu doğrula

```sh
curl -s http://127.0.0.1:47651/v1/health
```

Beklenen (alan sırası değişebilir): `{"ok":true,"version":"0.7.1",...}`
Yanıt yoksa kurulum 1. adımda yarım kalmıştır; hata satırıyla birlikte yeniden çalıştır.

### 3. Token'ı al

```sh
cat ~/.koppy/bridge-token
```

Beklenen: tek satır, 43 karakter (ör. `Xk3…`). Bu değeri kimseyle paylaşma; yalnız bu Mac'te saklanır.

### 4. Token'ı Koppy'ye yapıştır

Tampermonkey menüsü → **Koppy · Kontrol Merkezi** → **Tüm ayarlar** → son sekme → **Koppy Köprüsü**.
Token alanına yapıştır → **Token'ı kaydet**. Durum satırı şunu göstermelidir:

```
çalışıyor (v0.7.1) · token var
```

(Token'ın altındaki ipucu satırındaki **Kopyala** düğmesi `cat ~/.koppy/bridge-token` komutunu panoya yazar.)

### 5. Bağlantıyı test et

**Bağlantıyı test et** düğmesine bas. Düğme köprüye iki adet 1×1 PNG gönderir. (Alan doluysa yazılan token,
boşsa kayıtlı token kullanılır.) Sonuç:

| Görünen metin | Anlamı | Ne yapılır |
|---|---|---|
| `köprü hazır, çoklu yapıştırma açık` | 200 — her şey tamam | — (pano 2 test pikseliyle değişti) |
| `token yanlış` | 401 | 3. adımı tekrarla, yeniden yapıştır |
| `köprü çalışmıyor … scripts/install-bridge.sh` | bağlantı yok | 1. adımı çalıştır, 2. adımla doğrula |
| `token yok — cat ~/.koppy/bridge-token …` | token kaydedilmemiş | 4. adım |
| `köprü istek sınırında` | 429 (dakikada 10) | bir dakika bekle |

### 6. Kullan

İki veya daha fazla görseli `Cmd+C` ile kopyala → imleç yanındaki `▣ N` rozetine tıkla → hedef alana tek `Cmd+V`.

## Sorun giderme

- Durum satırı `köprü kurulu değil (bağlantı reddedildi)`: köprü çalışmıyor. `launchctl print gui/$(id -u)/com.pestly.koppy.bridge`
- `(2 sn içinde yanıt yok)`: port 47651'i başka bir süreç tutuyor olabilir: `lsof -i :47651`
- Köprü yalnız `127.0.0.1` dinler ve panoya **yazar**; panoyu okumaz.
