(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KoppyControlDeck = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const ACCENT = "#7c9cff";
    const MODIFIERS = [
        { id: "ctrl", label: "⌃", name: "Control" },
        { id: "alt", label: "⌥", name: "Option" },
        { id: "shift", label: "⇧", name: "Shift" },
        { id: "command", label: "⌘", name: "Command" },
    ];
    const POSITIONS = [
        { value: "top left", label: "Sol üst" },
        { value: "top center", label: "Üst orta" },
        { value: "top right", label: "Sağ üst" },
        { value: "bottom left", label: "Sol alt" },
        { value: "bottom center", label: "Alt orta" },
        { value: "bottom right", label: "Sağ alt" },
    ];
    const SIZES = [
        { id: "fit", label: "Ekrana sığdır", width: 0, height: 0 },
        { id: "compact", label: "Kompakt", width: 720, height: 540 },
        { id: "wide", label: "Geniş", width: 960, height: 720 },
    ];

    function activeModifier(prefs) {
        const keys = prefs && prefs.floatBar && prefs.floatBar.globalkeys || {};
        return (MODIFIERS.find(item => keys[item.id]) || MODIFIERS[3]).id;
    }

    function activeSize(prefs) {
        const bar = prefs && prefs.floatBar || {};
        const width = Number(bar.previewMaxSizeW || 0);
        const height = Number(bar.previewMaxSizeH || 0);
        return (SIZES.find(item => item.width === width && item.height === height) || SIZES[0]).id;
    }

    function create(doc, tag, className, text) {
        const element = doc.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }

    function install(options) {
        const settings = options || {};
        const doc = settings.document;
        const win = settings.window || (doc && doc.defaultView);
        const config = settings.config;
        const prefs = settings.prefs;
        if (!doc || !doc.documentElement || !config || !prefs) return false;
        if (config.__koppyControlDeck) return config.__koppyControlDeck;

        let host;
        let root;
        let panel;
        let status;
        let isOpen = false;
        let closeTimer;
        let statusMessage = "Son Kopyalar tutulur · ▣ rozeti gerçek çoklu panoya yazar";
        let statusError = false;
        let isPinned = false;
        let activeTab = "control";
        let drag;
        let stackState = typeof settings.getStackState === "function"
            ? settings.getStackState()
            : { enabled: false, count: 0, bytes: 0, maxItems: 10, maxBytes: 150 * 1024 * 1024 };

        if (typeof settings.onStackChange === "function") {
            settings.onStackChange(nextState => {
                stackState = nextState || stackState;
                if (isOpen) render();
            });
        }

        function isUserEvent(event) {
            return settings.requireTrusted === false || Boolean(event && event.isTrusted);
        }

        function save(values) {
            const entries = Object.entries(values || {});
            if (!entries.length) return false;
            for (const [key, value] of entries) {
                if (!config.fields || !config.fields[key]) return false;
            }
            entries.forEach(([key, value]) => config.set(key, value));
            const saved = config.save();
            if (saved === false) return false;
            return true;
        }

        function refreshVisibleFloatBar() {
            const bar = typeof settings.getFloatBar === "function" ? settings.getFloatBar() : null;
            if (bar && bar.shown && bar.data && typeof bar.setPosition === "function") bar.setPosition();
        }

        function refreshVisiblePreview() {
            const preview = typeof settings.getPreview === "function" ? settings.getPreview() : null;
            if (!preview || preview.removed || !preview.preview) return false;
            if (preview.following && typeof preview.followPos === "function") preview.followPos();
            else if (typeof preview.initMaxSize === "function") preview.initMaxSize();
            if (typeof preview.keepScreenInside === "function") preview.keepScreenInside();
            return true;
        }

        function setStatus(message, error) {
            statusMessage = message;
            statusError = Boolean(error);
            if (!status) return;
            status.textContent = statusMessage;
            status.dataset.error = String(statusError);
            clearTimeout(closeTimer);
        }

        function addSwitch(container, label, hint, active, onChange) {
            const row = create(doc, "div", "switch-row");
            const copy = create(doc, "div", "switch-copy");
            copy.append(create(doc, "strong", "", label), create(doc, "small", "", hint));
            const control = create(doc, "button", "switch", active ? "Açık" : "Kapalı");
            control.type = "button";
            control.setAttribute("role", "switch");
            control.setAttribute("aria-checked", String(active));
            control.addEventListener("click", event => {
                if (!isUserEvent(event)) return;
                onChange();
            });
            row.append(copy, control);
            container.appendChild(row);
        }

        function addTool(container, label, title, action) {
            if (typeof action !== "function") return;
            const button = create(doc, "button", "text-button", label);
            button.type = "button";
            button.title = title;
            button.addEventListener("click", event => {
                if (!isUserEvent(event)) return;
                Promise.resolve(action()).then(result => {
                    if (result === false) setStatus(label + " için uygun içerik yok", true);
                    else { setStatus(title); render(); }
                }).catch(() => setStatus(label + " açılamadı", true));
            });
            container.appendChild(button);
        }

        function render() {
            if (!root) return;
            panel.textContent = "";
            const header = create(doc, "header", "header");
            const title = create(doc, "div", "title");
            title.title = "Sürükleyerek konumlandır";
            title.append(create(doc, "span", "mark", "K"), create(doc, "div", "title-copy"));
            title.lastChild.append(create(doc, "strong", "", "Kontrol Merkezi"), create(doc, "small", "", "canlı ayarlar ve araçlar"));
            title.addEventListener("pointerdown", beginDrag);
            const recentCopies = stackState.count >= 2
                ? create(doc, "button", "recent-copies", "Son " + stackState.count)
                : null;
            if (recentCopies) {
                recentCopies.type = "button";
                recentCopies.setAttribute("aria-label", "Son " + stackState.count + " görseli tek yapıştırma için panoya koy");
                recentCopies.title = "Mouse yanındaki ▣ rozetiyle aynı işlem";
                recentCopies.addEventListener("click", event => {
                    if (!isUserEvent(event)) return;
                    if (typeof settings.acceptRecentCopies === "function") stackState = settings.acceptRecentCopies() || stackState;
                    setStatus(stackState.delivering
                        ? "Son " + stackState.count + " görsel panoya aktarılıyor…"
                        : stackState.accepted
                            ? "Son " + stackState.count + " görsel panoda · tek ⌘V ile yapıştır"
                            : "Son " + stackState.count + " görsel panoya hazırlanıyor…");
                    render();
                });
            }
            const stackClear = stackState.count && typeof settings.clearStack === "function"
                ? create(doc, "button", "stack-clear", "×")
                : null;
            if (stackClear) {
                stackClear.type = "button";
                stackClear.title = "Son Kopyalar'ı temizle; sistem panosuna dokunmaz";
                stackClear.setAttribute("aria-label", "Son Kopyalar'ı temizle; sistem panosuna dokunmaz");
                stackClear.addEventListener("click", event => {
                    if (!isUserEvent(event)) return;
                    stackState = settings.clearStack() || stackState;
                    setStatus("Son Kopyalar temizlendi · pano aynen korundu");
                    render();
                });
            }
            const pin = create(doc, "button", "pin", isPinned ? "Sabit" : "Sabitle");
            pin.type = "button";
            pin.title = isPinned ? "Sabitlemeyi kaldır" : "Paneli sabitle";
            pin.setAttribute("aria-label", pin.title);
            pin.setAttribute("aria-pressed", String(isPinned));
            pin.addEventListener("click", event => {
                if (!isUserEvent(event)) return;
                isPinned = !isPinned;
                setStatus(isPinned
                    ? "Panel sabitlendi · sayfada denerken açık kalır"
                    : "Panel serbest · sayfaya tıklayınca kapanır");
                render();
            });
            const close = create(doc, "button", "icon", "×");
            close.type = "button";
            close.title = "Kapat";
            close.setAttribute("aria-label", "Canlı kontrolü kapat");
            close.addEventListener("click", hide);
            header.append(title, ...(recentCopies ? [recentCopies] : []), ...(stackClear ? [stackClear] : []), pin, close);
            panel.appendChild(header);

            const tabs = create(doc, "nav", "tabs");
            [
                { id: "control", label: "Kontrol" },
                { id: "behavior", label: "Davranış" },
                { id: "tools", label: "Araçlar" },
            ].forEach(item => {
                const button = create(doc, "button", "tab", item.label);
                button.type = "button";
                button.setAttribute("aria-pressed", String(activeTab === item.id));
                button.addEventListener("click", event => {
                    if (!isUserEvent(event)) return;
                    activeTab = item.id;
                    render();
                });
                tabs.appendChild(button);
            });
            panel.appendChild(tabs);

            if (activeTab === "control") {
                const selectedModifier = MODIFIERS.find(item => item.id === activeModifier(prefs)) || MODIFIERS[3];
                const modifierCard = card("Önizleme tuşu", "Önizleme: " + selectedModifier.name + " (" + selectedModifier.label + ") basılı · Kopya: ⌘C.");
                const modifierGroup = create(doc, "div", "segmented four");
                MODIFIERS.forEach(item => {
                    const button = create(doc, "button", "key", item.label);
                    button.type = "button";
                    button.title = item.name;
                    button.setAttribute("aria-label", item.name + " ile önizleme");
                    button.setAttribute("aria-pressed", String(activeModifier(prefs) === item.id));
                    button.addEventListener("click", event => {
                        if (!isUserEvent(event)) return;
                        const values = {};
                        MODIFIERS.forEach(modifier => { values["floatBar.globalkeys." + modifier.id] = modifier.id === item.id; });
                        if (save(values)) {
                            setStatus(item.name + " seçildi · sonraki hover’da hazır");
                            render();
                        } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                    });
                    modifierGroup.appendChild(button);
                });
                modifierCard.appendChild(modifierGroup);
                panel.appendChild(modifierCard);

                const previewCard = card("Süzülen preview boyutu", "Büyük görseller ekrana taşmadan aynı oranı korur.");
                const sizeGroup = create(doc, "div", "segmented sizes");
                SIZES.forEach(item => {
                    const button = create(doc, "button", "text-button", item.label);
                    button.type = "button";
                    button.setAttribute("aria-pressed", String(activeSize(prefs) === item.id));
                    button.addEventListener("click", event => {
                        if (!isUserEvent(event)) return;
                        if (save({
                            "floatBar.previewMaxSizeW": item.width,
                            "floatBar.previewMaxSizeH": item.height,
                        })) {
                            const changed = refreshVisiblePreview();
                            setStatus(changed ? "Preview şimdi yeniden ölçülendi" : item.label + " seçildi · sonraki hover’da hazır");
                            render();
                        } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                    });
                    sizeGroup.appendChild(button);
                });
                previewCard.appendChild(sizeGroup);
                panel.appendChild(previewCard);

                const positionCard = card("Araç çubuğu", "Aktif görseldeki düğmeler burada görünür.");
                const positionRow = create(doc, "label", "select-row");
                positionRow.append(create(doc, "span", "", "Konum"));
                const position = create(doc, "select", "position-select");
                position.setAttribute("aria-label", "Araç çubuğu konumu");
                POSITIONS.forEach(item => {
                    const option = create(doc, "option", "", item.label);
                    option.value = item.value;
                    option.selected = prefs.floatBar.position === item.value;
                    position.appendChild(option);
                });
                position.addEventListener("change", event => {
                    if (!isUserEvent(event)) return;
                    if (save({ "floatBar.position": position.value })) {
                        refreshVisibleFloatBar();
                        setStatus(position.options[position.selectedIndex].textContent + " seçildi");
                    } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                });
                positionRow.appendChild(position);
                positionCard.appendChild(positionRow);
                panel.appendChild(positionCard);
            }

            if (activeTab === "behavior") {
                const previewBehavior = card("Preview davranışı", "Hover deneyimini bozmadan ayarlanır.");
                addSwitch(previewBehavior, "Mouse’u takip et", "Preview imlecin yanında kalır.", Boolean(prefs.floatBar.globalkeys.previewFollowMouse), () => {
                    if (save({ "floatBar.globalkeys.previewFollowMouse": !prefs.floatBar.globalkeys.previewFollowMouse })) {
                        setStatus("Preview takip davranışı güncellendi"); render();
                    } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                });
                addSwitch(previewBehavior, "Tuşu bırakınca kapat", "Kapalıysa preview sabit kalır.", Boolean(prefs.floatBar.globalkeys.closeAfterPreview), () => {
                    if (save({ "floatBar.globalkeys.closeAfterPreview": !prefs.floatBar.globalkeys.closeAfterPreview })) {
                        setStatus("Preview kapanış davranışı güncellendi"); render();
                    } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                });
                panel.appendChild(previewBehavior);

                const hoverCard = card("Hover hızı", "Araç çubuğunun açılış ve kapanış ritmi.");
                const speedGroup = create(doc, "div", "segmented speeds");
                [
                    { label: "Anında", show: 0, hide: 160 },
                    { label: "Dengeli", show: 100, hide: 566 },
                    { label: "Sakin", show: 260, hide: 720 },
                ].forEach(item => {
                    const button = create(doc, "button", "text-button", item.label);
                    button.type = "button";
                    const active = Number(prefs.floatBar.showDelay) === item.show && Number(prefs.floatBar.hideDelay) === item.hide;
                    button.setAttribute("aria-pressed", String(active));
                    button.addEventListener("click", event => {
                        if (!isUserEvent(event)) return;
                        if (save({ "floatBar.showDelay": item.show, "floatBar.hideDelay": item.hide })) {
                            setStatus(item.label + " hover hızı seçildi"); render();
                        } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                    });
                    speedGroup.appendChild(button);
                });
                hoverCard.appendChild(speedGroup);
                panel.appendChild(hoverCard);

                const barBehavior = card("Araç çubuğu", "Görselin üstünde veya dışında konumlanır.");
                addSwitch(barBehavior, "Görselin dışında", "Düğmeler resmin üstünü kapatmaz.", Boolean(prefs.floatBar.stayOut), () => {
                    if (save({ "floatBar.stayOut": !prefs.floatBar.stayOut })) {
                        refreshVisibleFloatBar();
                        setStatus("Araç çubuğu yerleşimi güncellendi"); render();
                    } else setStatus("Kaydedilemedi; değişiklik uygulanmadı", true);
                });
                panel.appendChild(barBehavior);
            }

            if (activeTab === "tools") {
                const siteCard = card("Bu sitede", "Yalnız açık sayfanın davranışını değiştirir.");
                const siteTools = create(doc, "div", "segmented utilities");
                addTool(siteTools, typeof settings.isFloatBarHidden === "function" && settings.isFloatBarHidden() ? "Simgeyi göster" : "Simgeyi gizle", "Bu sitede araç çubuğu görünürlüğünü değiştir", settings.toggleFloatBar);
                addTool(siteTools, typeof settings.areShortcutsDisabled === "function" && settings.areShortcutsDisabled() ? "Kısayolları aç" : "Kısayolları kapat", "Bu sitede kısayolları değiştir", settings.toggleShortcuts);
                siteCard.appendChild(siteTools);
                panel.appendChild(siteCard);

                const actionCard = card("Araçlar", "Geçici işi burada aç; ayarlar etkilenmez.");
                const tools = create(doc, "div", "segmented utilities");
                addTool(tools, "Galeri", "Galeri aç", settings.openGallery);
                addTool(tools, "Birleştir", "Açık görselleri birleştir", settings.openStitcher);
                addTool(tools, "Tanı", "Tanı özetini panoya kopyala", settings.copyDiagnostics);
                actionCard.appendChild(tools);
                panel.appendChild(actionCard);
            }

            const footer = create(doc, "footer", "footer");
            if (typeof settings.openUpdate === "function") {
                const update = create(doc, "button", "update", "Koppy’yi güncelle  ↗");
                update.type = "button";
                update.addEventListener("click", event => {
                    if (!isUserEvent(event)) return;
                    const opened = settings.openUpdate();
                    setStatus(opened === false
                        ? "Güncelleme sayfası açılamadı"
                        : "Güncelleme sayfası açıldı · Tampermonkey kurulumu doğrular", opened === false);
                });
                footer.appendChild(update);
            }
            const full = create(doc, "button", "full-settings", "Ayrıntılı ayarlar  →");
            full.type = "button";
            full.addEventListener("click", event => {
                if (!isUserEvent(event)) return;
                hide();
                if (typeof settings.openFullSettings === "function") settings.openFullSettings();
            });
            footer.appendChild(full);
            panel.appendChild(footer);

            status = create(doc, "div", "status", statusMessage);
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
            status.dataset.error = String(statusError);
            panel.appendChild(status);
        }

        function card(title, description) {
            const section = create(doc, "section", "card");
            section.append(create(doc, "h2", "", title), create(doc, "p", "", description));
            return section;
        }

        function ensure() {
            if (host) return;
            host = doc.createElement("koppy-control-deck");
            host.setAttribute("data-koppy-ui", "control-deck");
            Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147483646", pointerEvents: "none" });
            root = host.attachShadow({ mode: "open" });
            const style = create(doc, "style");
            style.textContent = `
                :host { all: initial; }
                *, *::before, *::after { box-sizing: border-box; }
                .panel { position: fixed; right: 20px; top: 82px; width: min(340px, calc(100vw - 32px)); transform: scale(.98); transform-origin: top right; opacity: 0; pointer-events: none; color: #f4f7fb; background: #11151c; border: 1px solid #2a3340; border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.55); overflow: hidden; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; transition: opacity 160ms ease, transform 160ms ease; }
                .panel.open { opacity: 1; transform: scale(1); pointer-events: auto; } .panel.manual { transform-origin: top left; } .panel.dragging { transition: none; }
                header { min-height: 62px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #252e3a; }
                .title { display: flex; min-width: 0; margin-right: auto; align-items: center; gap: 10px; cursor: grab; user-select: none; touch-action: none; } .panel.dragging .title { cursor: grabbing; }
                .mark { width: 28px; height: 28px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 8px; color: #081021; background: ${ACCENT}; font-weight: 800; }
                .title-copy { display: grid; gap: 1px; } .title-copy strong { font-size: 14px; } .title-copy small { color: #aab4c2; font-size: 11px; }
                button { appearance: none; font: inherit; color: inherit; cursor: pointer; } .icon { width: 30px; height: 30px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #aab4c2; font-size: 22px; line-height: 1; } .icon:hover { background: #171c25; border-color: #2a3340; color: #f4f7fb; } .pin, .recent-copies { min-width: 55px; height: 30px; margin-right: 4px; padding: 0 7px; border: 1px solid #2a3340; border-radius: 8px; background: transparent; color: #aab4c2; font-size: 11px; font-weight: 650; } .pin:hover, .recent-copies:hover { color: #f4f7fb; border-color: #52647c; background: #171c25; } .recent-copies { color: #dbe5ff; background: #1a2336; border-color: #40547c; } .stack-clear { width: 24px; height: 30px; margin: 0 2px 0 -4px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: #ff9daa; font-size: 18px; line-height: 1; } .stack-clear:hover { background: rgba(255,113,133,.12); color: #ffd5dc; }
                .card { padding: 14px; border-bottom: 1px solid #252e3a; } h2 { margin: 0; font-size: 12px; letter-spacing: .01em; } p { margin: 3px 0 10px; color: #aab4c2; font-size: 11px; }
                .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 8px 14px; border-bottom: 1px solid #252e3a; background: #10151d; } .tab { min-height: 30px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #aab4c2; font-size: 11px; font-weight: 650; } .tab:hover { color: #f4f7fb; background: #171c25; } .tab[aria-pressed="true"] { color: #fff; border-color: #536fab; background: #27365a; }
                .segmented { display: grid; gap: 5px; padding: 4px; border-radius: 10px; background: #0e1218; border: 1px solid #2a3340; } .segmented.four { grid-template-columns: repeat(4, 1fr); } .segmented.sizes { grid-template-columns: 1.35fr 1fr 1fr; }
                .segmented button { min-height: 34px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #aab4c2; } .segmented button:hover { color: #f4f7fb; background: #171c25; } .segmented button[aria-pressed="true"] { color: #fff; background: #263557; border-color: #6281e8; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); } .segmented.speeds { grid-template-columns: repeat(3, 1fr); } .utilities { display: flex; flex-wrap: wrap; gap: 3px; } .utilities .text-button { flex: 1 1 92px; min-height: 30px; border: 1px solid #2a3340; }
                .key { font-size: 17px !important; font-weight: 650; } .text-button { padding: 0 6px; font-size: 11px; }
                .select-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; padding: 0 10px; border: 1px solid #2a3340; border-radius: 9px; background: #0e1218; color: #cbd5e1; font-size: 11px; font-weight: 650; } .position-select { min-width: 116px; border: 0; outline: 0; background: transparent; color: #f4f7fb; font: inherit; text-align: right; } .position-select option { color: #11151c; } .switch-row { display: flex; min-height: 46px; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid #252e3a; } .switch-row:first-of-type { border-top: 0; padding-top: 0; } .switch-copy { min-width: 0; margin-right: auto; display: grid; gap: 1px; } .switch-copy strong { font-size: 11px; } .switch-copy small { color: #aab4c2; font-size: 10px; } .switch { min-width: 52px; height: 28px; border: 1px solid #2a3340; border-radius: 999px; background: #171c25; color: #aab4c2; font-size: 10px; font-weight: 700; } .switch:hover { border-color: #52647c; color: #f4f7fb; } .switch[aria-checked="true"] { border-color: #6281e8; background: #263557; color: #e8eeff; }
                .footer { display: grid; gap: 6px; padding: 10px 14px; } .full-settings, .update { width: 100%; min-height: 34px; border: 1px solid #2a3340; border-radius: 8px; background: transparent; color: #cbd5e1; text-align: left; padding: 0 10px; } .full-settings:hover, .update:hover { color: #f4f7fb; border-color: #52647c; background: #171c25; } .update { color: #b9c9ff; border-color: #40547c; background: #141b29; }
                .status { min-height: 32px; padding: 8px 14px; border-top: 1px solid #252e3a; color: #aab4c2; background: #0e1218; font-size: 11px; } .status[data-error="true"] { color: #ff9daa; }
                @media (max-width: 600px) { .panel { right: 8px; left: 8px; top: auto; bottom: 8px; width: auto; transform: translateY(8px) scale(.99); } .panel.open { transform: translateY(0) scale(1); } .panel.manual { right: auto; bottom: auto; transform: none; } }
                @media (prefers-reduced-motion: reduce) { .panel { transition: none; } }
            `;
            panel = create(doc, "aside", "panel");
            panel.setAttribute("role", "dialog");
            panel.setAttribute("aria-label", "Koppy canlı kontrol");
            root.append(style, panel);
            doc.documentElement.appendChild(host);
            render();
        }

        function show() {
            if (config.isOpen) {
                if (typeof settings.openFullSettings === "function") settings.openFullSettings();
                return false;
            }
            ensure();
            isOpen = true;
            panel.classList.add("open");
            // The host covers the viewport, but must never become a glass pane:
            // only the panel receives pointer events so the page stays testable.
            host.style.pointerEvents = "none";
            return true;
        }

        function hide() {
            if (!host) return;
            isOpen = false;
            panel.classList.remove("open");
            host.style.pointerEvents = "none";
        }

        function toggle() { return isOpen ? (hide(), false) : show(); }

        function beginDrag(event) {
            if (!isUserEvent(event) || event.button !== 0 || !panel) return;
            const rect = panel.getBoundingClientRect();
            drag = { pointerId: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
            panel.classList.add("dragging");
            titlePointerCapture(event);
            event.preventDefault();
        }

        function titlePointerCapture(event) {
            const target = event.currentTarget;
            if (target && typeof target.setPointerCapture === "function") target.setPointerCapture(event.pointerId);
        }

        function moveDrag(event) {
            if (!drag || event.pointerId !== drag.pointerId || !panel) return;
            const rect = panel.getBoundingClientRect();
            const maxLeft = Math.max(8, win.innerWidth - rect.width - 8);
            const maxTop = Math.max(8, win.innerHeight - rect.height - 8);
            const left = Math.max(8, Math.min(maxLeft, event.clientX - drag.x));
            const top = Math.max(8, Math.min(maxTop, event.clientY - drag.y));
            panel.style.left = Math.round(left) + "px";
            panel.style.top = Math.round(top) + "px";
            panel.style.right = "auto";
            panel.style.bottom = "auto";
            panel.classList.add("manual");
        }

        function endDrag(event) {
            if (!drag || event.pointerId !== drag.pointerId) return;
            drag = null;
            panel.classList.remove("dragging");
        }

        function closeWhenClickingOutside(event) {
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            const insidePanel = path.length ? path.includes(panel) : panel && panel.contains(event.target);
            if (isOpen && !isPinned && !insidePanel) hide();
        }

        doc.addEventListener("pointerdown", closeWhenClickingOutside, true);
        // Firefox normally emits pointerdown too; mousedown covers pages/devtools
        // configurations that expose only the mouse event path.
        doc.addEventListener("mousedown", closeWhenClickingOutside, true);
        doc.addEventListener("pointermove", moveDrag, true);
        doc.addEventListener("pointerup", endDrag, true);
        doc.addEventListener("pointercancel", endDrag, true);
        doc.addEventListener("keydown", event => {
            if (isOpen && event.key === "Escape") {
                event.preventDefault();
                hide();
            }
        }, true);

        config.__koppyControlDeck = { show, hide, toggle, isOpen: () => isOpen, refresh: render };
        return config.__koppyControlDeck;
    }

    return { MODIFIERS, POSITIONS, SIZES, activeModifier, activeSize, install };
});
