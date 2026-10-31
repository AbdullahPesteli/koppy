# Google Images — En Kaliteli Kopyalama Mekanizması Notları

## Mevcut Durum

Picviewer CE+'da Google Images işleme `pvcep_rules.js:32-74`:

```js
{
    name: "google 图片搜索",
    url: /https?:\/\/www.google(\.\w{1,3}){1,3}\/search\?.*&(tbm=isch|udm=2)/,
    getImage: function(a) {
        // a = parent <a> elementi
        // href'teki imgurl= parametresini decode et
        if (a.href.match(/imgurl=(.*?)&/i)) {
            return decodeURIComponent(RegExp.$1);
        }
        // Yeni layout: TouchEvent ile lazy-load tetikle
        if (jsaction && jsaction.indexOf('touchstart') !== -1) {
            // fake TouchEvent dispatch et
            // tekrar imgurl= çıkar
        }
    }
}
```

**Sorun**: Bu sadece URL döner. Cmd+C yapınca:
- ImgWindowC içinde → `_GM_setClipboard(self.src)` (URL string)
- FloatBar copyImg → `copyData(url)` (binary blob, modern ClipboardItem API)
- Ama Google Images sayfasında direkt Cmd+C ile binary kopyalama için **özel bir handler YOK**

## Hedef Akış

```
Google Images sayfasında resim üstünde Cmd+C
  → thumbnail'dan parent <a> href'i al
  → imgurl= parametresinden gerçek resim URL'sini decode et
  → Service Worker üzerinden fetch et (CORS bypass)
  → PNG/JPEG blob'u ClipboardItem API ile panoya yaz
  → Panoya sadece 1 resim kopyalanır (panoyu şişirmez)
```

## Teknik Detaylar

### Google Images Sayfasını Tespit
```regex
/google(\.\w{1,3}){1,3}\/search\?.*&(tbm=isch|udm=2)/
```

### URL Çıkarma
```js
// href örneği:
// https://www.google.com/imgres?imgurl=https://upload.wikimedia.org/...&imgrefurl=...
const match = a.href.match(/imgurl=([^&]+)/);
const realUrl = decodeURIComponent(match[1]);
```

### Binary Kopyalama (Manifest V3)
```js
// Content script'te:
async function copyImageToClipboard(imageUrl) {
    // Background script'e istek gönder
    const response = await chrome.runtime.sendMessage({
        type: 'fetchImage',
        url: imageUrl
    });
    if (response.blob) {
        const clipboardItem = new ClipboardItem({
            [response.blob.type]: response.blob
        });
        await navigator.clipboard.write([clipboardItem]);
    }
}

// Service Worker'da:
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'fetchImage') {
        fetch(msg.url)
            .then(r => r.blob())
            .then(blob => sendResponse({ blob }))
            .catch(err => sendResponse({ error: err.message }));
        return true; // async response
    }
});
```

### Cmd+C Intercept
```js
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const hoveredImg = getHoveredGoogleImage();
        if (hoveredImg) {
            e.preventDefault();
            copyImageToClipboard(hoveredImg.realUrl);
        }
    }
});
```

## Not

- `navigator.clipboard.write()` sadece focus'taki sayfada çalışır (security)
- `ClipboardItem` API'si Chrome 76+, Firefox 87+, Safari 13.1+ destekler
- Cross-origin fetch için Manifest V3'te `host_permissions` gerek
- Google Images yeni layout'unda (udm=2) DOM yapısı farklı olabilir — test edilmeli
