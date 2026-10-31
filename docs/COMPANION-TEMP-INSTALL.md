# Companion'ı geçici kurma (hesap / imza gerektirmez)

Koppy çoklu görseli iki yoldan yazabilir:

1. **Token'lı HTTP köprüsü (önerilen, kalıcı):** `scripts/install-bridge.sh` → Kontrol Merkezi > Genel > "Koppy Köprüsü" bölümüne `~/.koppy/bridge-token` içeriğini yapıştır. Companion gerekmez.
2. **Companion (Native Messaging):** imzasız olduğu için Firefox/Zen'de yalnız **geçici** yüklenir. Bu yol HTTP yoluna göre önceliklidir; kurulu değilse Koppy otomatik HTTP'ye düşer.

## Adımlar

1. `zsh scripts/build-companion.sh` → `dist/KoppyBridgeCompanion.xpi` (imzasız zip: `manifest.json`, `background.js`, `content.js`).
2. Native host'u kaydet: `zsh scripts/install-native-companion-host.sh`.
3. Zen/Firefox'ta `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `companion/manifest.json` (veya XPI) seç.
4. Google Görseller'de 2+ görsel seçip kopyala; yeşil bildirim gelmeli.

## Sınırlar

- **Tarayıcı yeniden başlayınca eklenti kaybolur;** her oturumda 3. adımı tekrarla. Kalıcılık için HTTP köprüsünü kullan.
- Release kanalında imzasız kalıcı kurulum çalışmaz (`xpinstall.signatures.required`); bu ayarı değiştirmeyi önermiyoruz.
- Companion yoksa ve köprü de kurulu değilse Koppy görünür hata verir: "köprü kurulu değil".
