# Koppy K03 — Çoklu görsel köprüsü kararı (kanıt + maliyet)

Tarih: 2026-10-31 · Taban: public-clean @ 0137d15 · Karar sahibi: Jack (bu belge kanıt/öneridir)

## Ölçülmüş zemin
| Bulgu | Kaynak |
|---|---|
| Kurulu 0.5.9 HTTP kullanıyor (`POST /v1/images`, 127.0.0.1:47651) | canlı daemon, `/v1/health` 200 |
| Repo 0.6.0 `postMessage` → companion → Native Messaging; dosya: "never opens a loopback socket" | `src/koppy-bridge.js` |
| Companion `koppy-bridge@pestly.local` hiçbir profilde kurulu değil; native manifest yalnız ona izin veriyor | `bridge/com.pestly.koppy.bridge.native.json` |
| dist 0.6.0 eski HTTP yolunu taşımıyor → 0.6.0 çoklu görsel BUGÜN KURULAMAZ | dize taraması |
| Mevcut HTTP kapısı yalnız `x-koppy-client: tampermonkey-v1` başlığı; Origin/token/jest yok. Özel başlık+özel content-type preflight zorlar, daemonda OPTIONS yok → tarayıcı sayfaları engelli; **yerel süreçler (curl) engelsiz** | `KoppyBridge.swift` 15, 282, 310 |
| Native host bağımsız çalışıyor: CLI'dan 2 PNG → 2 ayrı pano öğesi | PoC aşağıda |

## PoC (kanıt)
`python3 scripts/bridge-poc.py` (host + pano aracı scratch'e derlenir; Zen/LaunchAgent'a dokunmaz; pano önce yedeklenir, sonda geri yüklenir):
```
onceki pano: backup items=1
host yaniti: {'ok': True, 'count': 2, ...}
items=2 png=2   (item0 png_bytes=75, item1 png_bytes=74)
osascript PNGf: «data PNGf89504E47...
geri yukleme: restored items=1
SONUC: 2 ayri pano ogesi yazildi, dogrulandi
```
Sınır: geri yükleme öğe sayısını (1) geri getirir; yedekteki öğe PNG içermediği için `png=0` doğru. Native host katmanı sağlam; eksik olan yalnız **Zen'e companion'ı kalıcı kurmak**.

## Seçenekler
| | A — AMO unlisted imzalı companion (Native Messaging) | B — HTTP'ye dön + sertleştir | C — Hibrit |
|---|---|---|---|
| Maliyet | Bir kez: AMO hesabı + API anahtarı (JWT issuer/secret), `web-ext sign`. Kod: köprü zaten yazılı (0.6.0). Sürüm başına yeniden imza. | dist'e HTTP yolunu geri koy + daemonda Origin allowlist, tek kullanımlık token, 60 sn TTL, jest. Token dağıtımı Tampermonkey ↔ daemon için ek tasarım gerektirir (sayfa token'ı nereden alır?). | A + B'nin ikisi: iki taşıma, iki test matrisi, iki güvenlik yüzeyi. |
| Güvenlik | En güçlü: soket yok; Firefox host'u yalnız manifestteki extension id'ye açar; host'ta URL/çerez/pano-okuma yok. | Her yerel süreç ve (gevşek kapıda) her sayfa localhost'a POST atabilir. Origin başlığı tarayıcı dışı istemcide sahtelenir; token'ı sayfaya veren her şey sızdırır. Kullanıcı jesti sunucu tarafında doğrulanamaz. Hata payı yüksek. | Daha geniş yüzey = B'nin zayıflığı kalır. |
| Kurulum sürtünmesi | Bir kez XPI kurulumu. İmzasız Zen'de kalıcı değil; imzalı XPI kalıcı. | Mevcut kullanıcıda sıfır (daemon zaten çalışıyor), ama LaunchAgent bağımlılığı sürer. | A + B. |
| 2027 dayanıklılığı | İyi: Native Messaging Firefox'un kararlı API'si; MV2/MV3 geçişi `manifest_version` ile yönetilir. Risk: AMO politikası/hesap. | Zayıf: Tampermonkey `@connect`/loopback ve tarayıcıların Private Network Access sıkılaştırması zamanla bozar. | Orta: B kısmı aşınır. |

## Öneri (tek yol): **A**
Neden: 0.6.0 kodu zaten A için yazıldı, B'yi geri taşımak güvenlikte geri adımdır ve kapıyı tam kapatamaz, C iki bakım yükü getirir. Tek açık nokta imzalama; bunun doğrulanması aşağıdaki adım 2'dir.

**VARSAYIM / DOĞRULANMADI:** AMO unlisted imzalama süresi (otomatik inceleme, genelde dakikalar) ve imzalı XPI'nin Zen'de kalıcı kurulabilirliği bu görevde ÖLÇÜLMEDİ (AMO hesabı/API anahtarı yok; Zen'e dokunmak yasak). `web-ext` 10.1.0 yerelde var. Kabul adım 3'te canlı kanıtla kapanır.

## 6 adımlık uygulama planı
1. **Hesap/anahtar (Abdullah, bir kez):** addons.mozilla.org geliştirici hesabı → Tools → API keys → JWT issuer/secret; Automic Vault'a kaydet (repoya YAZMA).
2. **İmzalama:** `scripts/build-companion.sh` çıktısı dizininde `web-ext sign --channel=unlisted --source-dir=companion --api-key=$AMO_JWT_ISSUER --api-secret=$AMO_JWT_SECRET --artifacts-dir=<scratch>` → `.xpi`. Not: `browser_specific_settings.gecko.id` (koppy-bridge@pestly.local) ve sürüm sabit kalmalı; sürüm artmadan aynı id yeniden imzalanmaz.
3. **Kurulum kanıtı (Abdullah'ın onayıyla):** Zen'de `about:addons` → dosyadan yükle; yeniden başlatmada kalıcılık + `about:debugging` ile arka plan sayfasında `connectNative` hatasız.
4. **Native host kurulumu:** `scripts/install-native-companion-host.sh` (manifest `~/Library/Application Support/Mozilla/NativeMessagingHosts`, yalnız companion id). Eski HTTP LaunchAgent'ı kapatma ayrı onaylı adım.
5. **E2E gerçek pencerede:** Google Görseller'de çoklu seçim → Koppy → Cmd+V hedef uygulamada 2+ ayrı görsel. `E2E: <ne koşuldu> -> <ne görüldü>` makbuzu; PoC yalnız host katmanıdır.
6. **Yayın:** 0.6.x sürümünü imzalı XPI + `latest` notu ile yayınla; her companion değişikliğinde sürüm artır + yeniden imzala (CI'ya `web-ext sign` adımı, anahtar gizli). `src/koppy-bridge.js` bu karar onaylanana dek DEĞİŞMEDİ.

## Geri dönüş
Adım 3 başarısız olursa (Zen imzalıyı kalıcı tutmuyorsa) tek seçenek B-sertleştirmeye düşer; o durumda token'ı sayfa değil kullanıcı jesti sonrası Tampermonkey menüsü üretmeli ve daemon Origin yerine yalnız süreli token'a güvenmeli.
