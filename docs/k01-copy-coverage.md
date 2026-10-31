# K01 — Cmd+C kapsam tablosu (fixture E2E, ağsız; pano Playwright clipboard izniyle okundu)

| Senaryo | Önce (pano ne oldu) | Sonra (pano MIME + bayt) | Kanıt |
|---|---|---|---|
| a) küçük `<img>` | image/png, kopyalandı | image/png, 1686 B | `copy coverage a-img` |
| b) srcset + `<picture>` | image/png ama yanlış aday: `s-1200.jpg` (picture-source 1600w yok sayıldı) | image/png, 1686 B, aday `pic-1600.webp` | `copy coverage b-srcset-picture` (önce FAIL, sonra PASS) |
| c) CSS background-image | image/png, kopyalandı | image/png, 1686 B | `copy coverage c-background` |
| d) Google udm=2, yalnız preview | image/png ("Önizleme kopyalandı") | image/png, 1686 B | `copy coverage d-google-preview-only` |
| e) `data:` thumbnail (Google dışı site) | HİÇ kopyalamadı: pano `text/plain`, istek yok, toast yok (sessiz düşüş) | image/png, 1686 B | `copy coverage e-data-uri` (önce FAIL 30 sn, sonra PASS) |
| f) çözülemeyen kaynak (`blob:`) | sessiz, native Cmd+C | pano değişmez + toast "Koppy: kopyalanamadı: kaynak çözülemedi" | `unresolvable source shows honest visible error` |
| metin seçili | native | native ("plain text"), Koppy isteği 0 | `text selection keeps native Cmd+C` |

Kök neden: (1) `data:` embedded-preview adayı yalnız normal Google arama sayfasında izinliydi; (2) Google dışı sayfada aday boşsa sessizce native'e düşülüyordu; (3) srcset ve picture-source ayrı sıralanıyordu, en büyük aday garanti değildi.
Karar: Google sayfasında Google sonucu olmayan görsel native kalır (mevcut regresyon testi); diğer tüm sayfalarda çözülemeyen görsel görünür hata verir.
Aday sırası: quickhover/original attr > srcset+picture (en büyük) > src > background > poster/svg > data URI.
