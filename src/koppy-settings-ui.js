(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.KoppySettingsUI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const SECTION_META = [
        {
            title: "Araç Çubuğu",
            short: "Araç Çubuğu",
            description: "Hover araçlarını, önizleme davranışını ve görünme sınırlarını yönet.",
        },
        {
            title: "Yakınlaştırma",
            short: "Yakınlaştırma",
            description: "Büyütecin boyutunu, tekerlek davranışını ve yakınlaştırma adımlarını ayarla.",
        },
        {
            title: "Galeri ve İndirme",
            short: "Galeri",
            description: "Galeri görünümünü, toplu yüklemeyi, indirmeyi ve dışa aktarmayı yönet.",
        },
        {
            title: "Resim Penceresi",
            short: "Resim Penceresi",
            description: "Tam boy görsel penceresinin yerleşimini, kontrollerini ve görünümünü ayarla.",
        },
        {
            title: "Genel ve Kurallar",
            short: "Genel",
            description: "Dil, dosya adları, site kuralları ve tanılama seçeneklerini yönet.",
        },
    ];

    const GROUPS = [
        [
            { title: "Görünüm ve konum", match: /^(floatBar\.(position|stayOut|showDelay|hideDelay|forceShow|minSizeLimit|sizeLimitOr|showWithRules))/ },
            { title: "Kısayollar", match: /^(floatBar\.(globalkeys|keys|disableKeySites))/ },
            { title: "Araçlar ve davranış", match: /.*/ },
        ],
        [
            { title: "Büyüteç", match: /^magnifier\.radius/ },
            { title: "Tekerlekle yakınlaştırma", match: /.*/ },
        ],
        [
            { title: "İndirme ve dışa aktarma", match: /^gallery\.(exportType|download|formatConversion|aria2|scaleSmallSize|showSmallSize)/ },
            { title: "Otomasyon ve siteler", match: /^gallery\.(loadMore|loadAll|viewmoreEndless|autoOpen|searchData|editSite)/ },
            { title: "Görünüm ve gezinme", match: /.*/ },
        ],
        [
            { title: "Kapatma davranışı", match: /^imgWindow\.close/ },
            { title: "Renk ve katman", match: /^imgWindow\.(backgroundColor|overlayer)/ },
            { title: "Kontroller ve yakınlaştırma", match: /^imgWindow\.(defaultTool|shiftRotateStep|zoom)/ },
            { title: "Pencere yerleşimi", match: /.*/ },
        ],
        [
            { title: "Dil ve dosya adları", match: /^(customLang|saveName)/ },
            { title: "Site kuralları", match: /^customRules/ },
            { title: "Gelişmiş", match: /.*/ },
        ],
    ];

    const PRIVATE_MOUNTS = new WeakMap();
    const SECURE_STATES = new WeakMap();
    let ACTIVE_INSTALL = null;

    const CSS = String.raw`
        :root {
            color-scheme: dark;
            --k-bg: #0b0e13;
            --k-surface: #11151c;
            --k-elevated: #171c25;
            --k-field: #0e1218;
            --k-border: #2a3340;
            --k-border-strong: #3a4655;
            --k-text: #f4f7fb;
            --k-text-secondary: #aab4c2;
            --k-text-muted: #778393;
            --k-accent: #7c9cff;
            --k-accent-hover: #92afff;
            --k-danger: #ff7185;
            --k-focus: 0 0 0 3px rgb(124 156 255 / 32%);
            background: var(--k-bg);
        }

        html, body, #pv-prefs {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: var(--k-bg) !important;
            color: var(--k-text) !important;
            color-scheme: dark !important;
            font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }

        #pv-prefs, #pv-prefs * { box-sizing: border-box; }

        #pv-prefs_wrapper {
            display: grid !important;
            grid-template-rows: 72px minmax(0, 1fr) 68px;
            width: 100%;
            height: 100%;
            padding: 0 !important;
            background: var(--k-bg);
        }

        #pv-prefs_header {
            display: grid !important;
            grid-template-columns: minmax(210px, 1fr) minmax(240px, 430px) 36px;
            align-items: center;
            gap: 18px;
            min-height: 72px;
            margin: 0 !important;
            padding: 14px 20px;
            border-bottom: 1px solid var(--k-border);
            background: var(--k-surface);
            text-align: left !important;
        }

        .koppy-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .koppy-brand-mark {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            flex: 0 0 34px;
            border: 1px solid #4965b8;
            border-radius: 9px;
            background: #1b2850;
            color: #dce5ff;
            font-size: 16px;
            font-weight: 750;
            letter-spacing: -0.02em;
        }
        .koppy-brand-copy { min-width: 0; }
        .koppy-brand-title { color: var(--k-text); font-size: 19px; font-weight: 680; line-height: 1.2; }
        .koppy-brand-subtitle { margin-top: 2px; color: var(--k-text-muted); font-size: 11px; letter-spacing: .03em; }

        .koppy-search-wrap { position: relative; }
        .koppy-search-icon {
            position: absolute;
            left: 13px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--k-text-muted);
            pointer-events: none;
            font-size: 16px;
        }
        #koppy-settings-search {
            width: 100% !important;
            height: 40px !important;
            margin: 0 !important;
            padding: 0 46px 0 38px !important;
            border: 1px solid var(--k-border) !important;
            border-radius: 9px !important;
            outline: 0 !important;
            background: var(--k-field) !important;
            color: var(--k-text) !important;
            font: inherit !important;
        }
        #koppy-settings-search::placeholder { color: var(--k-text-muted); }
        #koppy-settings-search:focus { border-color: var(--k-accent) !important; box-shadow: var(--k-focus); }
        .koppy-search-hint {
            position: absolute;
            right: 9px;
            top: 50%;
            transform: translateY(-50%);
            padding: 2px 6px;
            border: 1px solid var(--k-border);
            border-radius: 5px;
            color: var(--k-text-muted);
            font-size: 10px;
            line-height: 16px;
        }
        #koppy-settings-close {
            display: grid;
            place-items: center;
            width: 36px;
            height: 36px;
            padding: 0;
            border: 1px solid transparent;
            border-radius: 8px;
            background: transparent;
            color: var(--k-text-secondary);
            font: 22px/1 inherit;
            cursor: pointer;
        }
        #koppy-settings-close:hover { border-color: var(--k-border); background: var(--k-elevated); color: var(--k-text); }
        #koppy-settings-close:focus-visible { outline: 0; box-shadow: var(--k-focus); }

        .koppy-settings-main {
            display: grid;
            grid-template-columns: 218px minmax(0, 1fr);
            min-height: 0;
            overflow: hidden;
        }
        #pv-prefs .nav-tabs {
            display: flex !important;
            flex-direction: column;
            gap: 4px;
            width: auto !important;
            max-width: none !important;
            min-width: 0;
            height: 100%;
            margin: 0 !important;
            padding: 20px 12px !important;
            overflow-y: auto !important;
            border-right: 1px solid var(--k-border);
            background: var(--k-surface);
            white-space: normal !important;
        }
        #pv-prefs .nav-tabs::before {
            content: "AYARLAR";
            display: block;
            padding: 0 10px 8px;
            color: var(--k-text-muted);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: .12em;
        }
        #pv-prefs .nav-tabs > .section_header {
            position: relative;
            display: flex !important;
            align-items: center;
            min-height: 42px;
            margin: 0 !important;
            padding: 0 12px 0 15px !important;
            border: 1px solid transparent !important;
            border-radius: 8px;
            background: transparent !important;
            color: var(--k-text-secondary) !important;
            text-align: left !important;
            font-size: 13px !important;
            font-weight: 540;
            cursor: pointer !important;
            transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
        }
        #pv-prefs .nav-tabs > .section_header::before {
            content: "";
            position: absolute;
            left: 0;
            top: 10px;
            bottom: 10px;
            width: 2px;
            border-radius: 2px;
            background: transparent;
        }
        #pv-prefs .nav-tabs > .section_header:hover { background: var(--k-elevated) !important; color: var(--k-text) !important; }
        #pv-prefs .nav-tabs > .section_header.active {
            border-color: #2b3b6d !important;
            background: #19233e !important;
            color: #e6ecff !important;
        }
        #pv-prefs .nav-tabs > .section_header.active::before { background: var(--k-accent); }
        #pv-prefs .nav-tabs > .section_header:focus-visible { outline: 0; box-shadow: var(--k-focus); }

        .koppy-settings-content {
            min-width: 0;
            min-height: 0;
            padding: 28px 32px 40px;
            overflow: auto;
            background: var(--k-bg);
            scrollbar-color: var(--k-border-strong) transparent;
        }
        .koppy-panel-heading { max-width: 760px; margin: 0 auto 22px; }
        .koppy-panel-heading h2 { margin: 0; color: var(--k-text); font-size: 20px; line-height: 1.3; font-weight: 680; }
        .koppy-panel-heading p { margin: 6px 0 0; color: var(--k-text-secondary); font-size: 13px; }
        .koppy-search-status {
            display: none;
            max-width: 760px;
            margin: 0 auto 14px;
            color: var(--k-text-secondary);
            font-size: 12px;
        }
        .koppy-settings-content.is-searching .koppy-search-status { display: block; }

        #pv-prefs .section_header_holder {
            display: none;
            max-width: 760px;
            margin: 0 auto !important;
            padding: 0 !important;
        }
        #pv-prefs .section_header_holder.koppy-active-section { display: block; }
        .koppy-settings-content.is-searching .section_header_holder.koppy-active-section { display: none !important; }
        .koppy-settings-content.is-searching .section_header_holder.koppy-search-match { display: block !important; margin-bottom: 26px !important; }
        .koppy-settings-content.is-searching .section_header_holder.koppy-search-match + .section_header_holder.koppy-search-match { padding-top: 8px !important; }
        .koppy-settings-content.is-searching .section_header_holder .koppy-panel-heading { display: block; margin-bottom: 12px; }

        .koppy-card {
            margin: 0 0 14px;
            overflow: hidden;
            border: 1px solid var(--k-border);
            border-radius: 11px;
            background: var(--k-surface);
        }
        .koppy-card-title {
            margin: 0;
            padding: 12px 16px 10px;
            border-bottom: 1px solid var(--k-border);
            color: var(--k-text-secondary);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .055em;
            text-transform: uppercase;
        }
        #pv-prefs .config_var.koppy-setting-row {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 8px 12px;
            min-height: 58px;
            margin: 0 !important;
            padding: 11px 16px !important;
            border-bottom: 1px solid #202733;
            color: var(--k-text-secondary) !important;
            font-size: 13px !important;
        }
        #pv-prefs .config_var.koppy-setting-row:last-child { border-bottom: 0; }
        #pv-prefs .config_var.koppy-setting-row.koppy-hidden { display: none !important; }
        #pv-prefs .config_var.koppy-setting-row[title]:not([title=""])::after {
            content: attr(title);
            flex: 0 0 100%;
            order: 10;
            padding-left: 0;
            color: var(--k-text-muted);
            font-size: 11px;
            line-height: 1.35;
        }
        #pv-prefs .config_var.koppy-setting-row > .field_label:first-child {
            flex: 1 1 280px;
            min-width: 180px;
            margin: 0 !important;
        }
        #pv-prefs .config_var.koppy-setting-row.inline > .config_var {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            margin: 0 !important;
            padding: 0 !important;
            color: var(--k-text-secondary) !important;
        }
        #pv-prefs .koppy-behavior-card {
            position: relative;
            display: grid;
            gap: 10px;
            margin: 12px 14px;
            padding: 14px;
            border: 1px solid var(--k-border);
            border-radius: 11px;
            background: linear-gradient(145deg, #121822, #10141b);
        }
        #pv-prefs .koppy-behavior-card.koppy-hidden { display: none !important; }
        #pv-prefs .koppy-behavior-header { min-width: 0; padding-right: 116px; }
        #pv-prefs .koppy-behavior-header h4 { margin: 0 0 3px; color: var(--k-text); font-size: 14px; line-height: 1.3; }
        #pv-prefs .koppy-behavior-summary { margin: 0; color: var(--k-text-muted); font-size: 12px; line-height: 1.4; }
        #pv-prefs .koppy-behavior-card .config_var.koppy-inline-control {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            min-height: 40px;
            gap: 9px;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            background: transparent !important;
        }
        #pv-prefs .koppy-behavior-card .config_var.koppy-inline-control[title]:not([title=""])::after { display: none; }
        #pv-prefs .koppy-behavior-card .koppy-inline-control > .field_label:first-child {
            min-width: 0;
            margin: 0 !important;
            color: var(--k-text-secondary) !important;
            font-size: 12px !important;
            font-weight: 600 !important;
        }
        #pv-prefs .koppy-behavior-card .koppy-inline-control input:not([type="checkbox"]):not([type="radio"]) { width: 70px !important; }
        #pv-prefs .koppy-behavior-card .koppy-inline-control select { min-width: 170px; }
        #pv-prefs .koppy-behavior-card .koppy-field-unit { color: var(--k-text-muted); font-size: 11px; }
        #pv-prefs .koppy-inline-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        #pv-prefs .koppy-inline-pair > .koppy-inline-control {
            padding: 8px 10px !important;
            border: 1px solid #263240 !important;
            border-radius: 8px;
            background: #0d1219 !important;
        }
        #pv-prefs .koppy-behavior-card .koppy-switch-row {
            grid-template-columns: minmax(0, 1fr) auto;
            padding-top: 4px !important;
        }
        #pv-prefs .koppy-behavior-card .koppy-switch-row > .field_label:first-child { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
        #pv-prefs .koppy-advanced {
            margin: 0;
            padding: 0;
            border: 0;
        }
        #pv-prefs .koppy-advanced[hidden] { display: none; }
        #pv-prefs .koppy-advanced > summary {
            width: fit-content;
            padding: 4px 0;
            color: #a9bcff;
            font-size: 12px;
            font-weight: 650;
            cursor: pointer;
        }
        #pv-prefs .koppy-advanced-hint { margin: 5px 0 8px; color: var(--k-text-muted); font-size: 11px; }
        #pv-prefs .koppy-location-preview {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 92px;
            height: 58px;
            border: 1px solid #314158;
            border-radius: 7px;
            background: #0a0e14;
        }
        #pv-prefs .koppy-preview-image { position: absolute; inset: 12px 14px; border-radius: 3px; background: linear-gradient(135deg, #34435c, #192231); }
        #pv-prefs .koppy-preview-bar { position: absolute; width: 24px; height: 5px; border-radius: 999px; background: var(--k-accent); box-shadow: 0 0 0 1px rgb(255 255 255 / 18%); }
        #pv-prefs .koppy-location-preview[data-position="top-left"] .koppy-preview-bar { top: 7px; left: 7px; }
        #pv-prefs .koppy-location-preview[data-position="top-right"] .koppy-preview-bar { top: 7px; right: 7px; }
        #pv-prefs .koppy-location-preview[data-position="bottom-left"] .koppy-preview-bar { bottom: 7px; left: 7px; }
        #pv-prefs .koppy-location-preview[data-position="bottom-right"] .koppy-preview-bar { bottom: 7px; right: 7px; }
        #pv-prefs .koppy-location-preview[data-position="top-center"] .koppy-preview-bar { top: 7px; left: 50%; transform: translateX(-50%); }
        #pv-prefs .koppy-location-preview[data-position="bottom-center"] .koppy-preview-bar { bottom: 7px; left: 50%; transform: translateX(-50%); }
        #pv-prefs .koppy-location-preview.is-outside .koppy-preview-bar { box-shadow: 0 0 0 2px #0a0e14, 0 0 0 3px var(--k-accent); }
        #pv-prefs .koppy-threshold-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 42px; }
        #pv-prefs .koppy-threshold-label { color: var(--k-text-secondary); font-size: 12px; font-weight: 650; }
        #pv-prefs .koppy-measure-controls { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
        #pv-prefs .koppy-measure-controls .koppy-inline-control { grid-template-columns: auto !important; }
        #pv-prefs .koppy-measure-controls .koppy-inline-control > .field_label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        #pv-prefs .koppy-measure-times { color: var(--k-text-muted); font-size: 16px; }
        #pv-prefs .koppy-rule-row { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding-top: 6px; border-top: 1px solid #202a37; color: var(--k-text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; }
        #pv-prefs .koppy-rule-row .koppy-rule-switch { display: contents !important; }
        #pv-prefs .koppy-rule-row .koppy-rule-switch > .field_label { display: none; }
        #pv-prefs .koppy-compact-group {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            min-width: 0;
            margin: 0;
            padding: 11px 16px 14px;
            border: 0;
            border-bottom: 1px solid #202733;
        }
        #pv-prefs .koppy-compact-group.koppy-hidden { display: none !important; }
        #pv-prefs .koppy-compact-group > legend {
            width: 100%;
            padding: 0 0 8px;
            color: var(--k-text-secondary);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .04em;
            text-transform: uppercase;
        }
        #pv-prefs .koppy-compact-group .config_var.koppy-compact-member {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            min-height: 52px;
            gap: 8px;
            margin: 0 !important;
            padding: 9px 10px !important;
            border: 1px solid var(--k-border) !important;
            border-radius: 8px;
            background: var(--k-field);
        }
        #pv-prefs .koppy-compact-group .config_var.koppy-compact-member[title]:not([title=""])::after { display: none; }
        #pv-prefs .koppy-compact-group .config_var.koppy-compact-member > .field_label:first-child {
            min-width: 0;
            flex: initial;
            display: flex;
            align-items: center;
            min-height: 44px;
            cursor: pointer;
            font-size: 12px !important;
        }
        #pv-prefs .koppy-compact-group .config_var.koppy-compact-member input:not([type="checkbox"]):not([type="radio"]) { width: 74px !important; }
        #pv-prefs .koppy-input-with-unit { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
        #pv-prefs .koppy-compact-group .config_var.koppy-compact-member .koppy-field-unit { color: var(--k-text-muted); font-size: 11px; }
        #pv-prefs .koppy-layout-toggle-pair > .koppy-compact-member:first-of-type { grid-column: 1 / -1; }
        #pv-prefs .koppy-layout-measure-toggle { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        #pv-prefs .koppy-layout-modifier { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        #pv-prefs .koppy-layout-modifier .config_var.koppy-compact-member {
            grid-template-columns: minmax(0, 1fr) auto;
            min-height: 48px;
        }
        #pv-prefs .koppy-layout-modifier .field_label { font-size: 12px !important; }
        #pv-prefs .field_label {
            color: var(--k-text) !important;
            font-size: 13px !important;
            font-weight: 540 !important;
            line-height: 1.4;
        }
        #pv-prefs a { color: #a9bcff !important; text-decoration: none; }
        #pv-prefs a:hover { color: #cad5ff !important; }

        #pv-prefs input:not([type="checkbox"]):not([type="radio"]),
        #pv-prefs select,
        #pv-prefs textarea {
            min-height: 36px !important;
            margin: 0 !important;
            padding: 7px 10px !important;
            border: 1px solid var(--k-border-strong) !important;
            border-radius: 7px !important;
            outline: 0 !important;
            background: var(--k-field) !important;
            color: var(--k-text) !important;
            font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        #pv-prefs input[type="text"], #pv-prefs input[type="number"] { width: 92px !important; }
        #pv-prefs input.order, #pv-prefs input.color { width: min(320px, 100%) !important; }
        #pv-prefs select { min-width: 170px; max-width: 320px; }
        #pv-prefs textarea {
            width: 100% !important;
            min-height: 104px !important;
            resize: vertical;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
        }
        #pv-prefs .config_var.koppy-setting-row:has(textarea) { align-items: flex-start; }
        #pv-prefs .config_var.koppy-setting-row:has(textarea) > .field_label:first-child { flex-basis: 100%; }
        #pv-prefs input:not([type="checkbox"]):not([type="radio"]):focus,
        #pv-prefs select:focus,
        #pv-prefs textarea:focus { border-color: var(--k-accent) !important; box-shadow: var(--k-focus); }

        #pv-prefs input:is([type="checkbox"], [type="radio"]) {
            appearance: none;
            position: relative;
            width: 38px;
            height: 22px;
            flex: 0 0 38px;
            margin: 0 !important;
            border: 1px solid var(--k-border-strong);
            border-radius: 999px;
            outline: 0;
            background: #252c37;
            cursor: pointer;
            transition: background-color 120ms ease, border-color 120ms ease;
        }
        #pv-prefs input:is([type="checkbox"], [type="radio"])::after {
            content: "";
            position: absolute;
            top: 3px;
            left: 3px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #c1c9d4;
            transition: transform 120ms ease, background-color 120ms ease;
        }
        #pv-prefs input:is([type="checkbox"], [type="radio"]):checked { border-color: #6485ed; background: #5677df; }
        #pv-prefs input:is([type="checkbox"], [type="radio"]):checked::after { transform: translateX(16px); background: #fff; }
        #pv-prefs input:is([type="checkbox"], [type="radio"]):focus-visible { box-shadow: var(--k-focus); }

        #pv-prefs_buttons_holder {
            position: static !important;
            display: flex;
            align-items: center;
            gap: 10px;
            width: auto !important;
            min-height: 68px;
            margin: 0 !important;
            padding: 12px 20px !important;
            border-top: 1px solid var(--k-border);
            background: var(--k-surface) !important;
            color: var(--k-text) !important;
            text-align: left !important;
        }
        .koppy-dirty-status { margin-right: auto; color: var(--k-text-muted); font-size: 12px; }
        .koppy-dirty-status.is-dirty { color: #d8e0ee; }
        .koppy-dirty-status.is-dirty::before {
            content: "";
            display: inline-block;
            width: 6px;
            height: 6px;
            margin-right: 7px;
            border-radius: 50%;
            background: var(--k-accent);
            vertical-align: 1px;
        }
        #pv-prefs_buttons_holder .reset_holder { display: contents; }
        #pv-prefs .saveclose_buttons, #pv-prefs_resetLink {
            min-height: 38px;
            margin: 0 !important;
            padding: 8px 15px !important;
            border: 1px solid var(--k-border-strong) !important;
            border-radius: 8px !important;
            background: var(--k-elevated) !important;
            color: var(--k-text) !important;
            font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
            text-decoration: none !important;
            cursor: pointer;
        }
        #pv-prefs_resetLink { order: -1; color: #ffacb7 !important; }
        #pv-prefs_resetLink:hover { border-color: #7a3e4a !important; background: #28181e !important; }
        #pv-prefs_saveBtn { order: 3; border-color: #6f8ef0 !important; background: #6f8ef0 !important; color: #081021 !important; }
        #pv-prefs_saveBtn:hover:not(:disabled) { border-color: var(--k-accent-hover) !important; background: var(--k-accent-hover) !important; }
        #pv-prefs_saveBtn:disabled { opacity: .38; cursor: default; }
        #pv-prefs_closeBtn { order: 2; }
        #pv-prefs .saveclose_buttons:focus-visible, #pv-prefs_resetLink:focus-visible { outline: 0; box-shadow: var(--k-focus); }

        #pv-prefs_section_4 > :not(.config_var):not(.koppy-card):not(.koppy-panel-heading) { display: none !important; }

        @media (max-width: 720px) {
            #pv-prefs_wrapper { grid-template-rows: auto minmax(0, 1fr) auto; }
            #pv-prefs_header { grid-template-columns: minmax(0, 1fr) 36px; gap: 10px; padding: 12px 14px; }
            #koppy-settings-close { width: 44px; height: 44px; }
            .koppy-brand-subtitle { display: none; }
            .koppy-search-wrap { grid-column: 1 / -1; grid-row: 2; }
            .koppy-settings-main { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
            #pv-prefs .nav-tabs {
                flex-direction: row;
                gap: 6px;
                height: auto;
                padding: 9px 10px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                border-right: 0;
                border-bottom: 1px solid var(--k-border);
                white-space: nowrap !important;
            }
            #pv-prefs .nav-tabs::before { display: none; }
            #pv-prefs .nav-tabs > .section_header { flex: 0 0 auto; min-height: 36px; padding: 0 11px !important; }
            #pv-prefs .nav-tabs > .section_header::before { display: none; }
            .koppy-settings-content { padding: 20px 14px 28px; }
            .koppy-panel-heading { margin-bottom: 16px; }
            #pv-prefs .config_var.koppy-setting-row { align-items: flex-start; justify-content: flex-start; padding: 12px 14px !important; }
            #pv-prefs .config_var.koppy-setting-row > .field_label:first-child { flex-basis: 100%; }
            #pv-prefs .koppy-compact-group { grid-template-columns: 1fr; padding: 11px 14px 14px; }
            #pv-prefs .koppy-layout-modifier { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            #pv-prefs .koppy-layout-measure-toggle { grid-template-columns: 1fr; }
            #pv-prefs .koppy-compact-group .config_var.koppy-compact-member { align-items: center; padding: 10px 11px !important; }
            #pv-prefs .koppy-compact-group .config_var.koppy-compact-member > .field_label:first-child { flex-basis: auto; }
            #pv-prefs .koppy-behavior-card { margin: 10px; padding: 12px; }
            #pv-prefs .koppy-behavior-header { padding-right: 0; }
            #pv-prefs .koppy-location-preview { display: none; }
            #pv-prefs .koppy-inline-pair { grid-template-columns: 1fr; gap: 8px; }
            #pv-prefs .koppy-threshold-row { align-items: flex-start; flex-direction: column; gap: 6px; }
            #pv-prefs .koppy-measure-controls { width: 100%; justify-content: flex-end; }
            #pv-prefs input.order, #pv-prefs input.color, #pv-prefs select { width: 100% !important; max-width: none; }
            #pv-prefs_buttons_holder { flex-wrap: wrap; padding: 10px 12px !important; }
            .koppy-dirty-status { order: -2; flex: 1 0 100%; }
            #pv-prefs .saveclose_buttons, #pv-prefs_resetLink { min-height: 44px; flex: 1 1 auto; text-align: center; }
        }

        @media (prefers-reduced-motion: reduce) {
            #pv-prefs *, #pv-prefs *::before, #pv-prefs *::after { transition-duration: 0s !important; }
        }
    `;

    function ensurePrivateMount(hostDocument) {
        if (!hostDocument) return null;
        const existing = PRIVATE_MOUNTS.get(hostDocument);
        if (existing && existing.host && existing.host.isConnected) return existing;

        const host = hostDocument.createElement("koppy-settings-root");
        host.setAttribute("data-koppy-ui", "settings");
        host.style.setProperty("all", "initial", "important");
        host.style.setProperty("position", "fixed", "important");
        host.style.setProperty("inset", "0", "important");
        host.style.setProperty("z-index", "2147483646", "important");
        host.style.setProperty("pointer-events", "none", "important");

        const shadow = host.attachShadow({ mode: "closed" });
        const isolationStyle = hostDocument.createElement("style");
        isolationStyle.textContent = `
            :host { all: initial !important; position: fixed !important; inset: 0 !important;
                    z-index: 2147483646 !important; pointer-events: none !important; }
            .koppy-private-backdrop { position: fixed; inset: 0; pointer-events: auto;
                    background: rgba(5,7,10,.72); backdrop-filter: blur(6px); }
            iframe { pointer-events: auto !important; }
        `;
        const backdrop = hostDocument.createElement("div");
        backdrop.className = "koppy-private-backdrop";
        shadow.append(isolationStyle, backdrop);
        (hostDocument.documentElement || hostDocument.body).appendChild(host);

        const state = { host, shadow, backdrop };
        PRIVATE_MOUNTS.set(hostDocument, state);
        return state;
    }

    function mountFrame(frame, hostDocument) {
        if (!frame) return frame;
        const documentForMount = hostDocument || frame.ownerDocument;
        const state = ensurePrivateMount(documentForMount);
        if (!state) return frame;
        frame.title = "Koppy Ayarları";
        if (frame.parentNode !== state.shadow) state.shadow.appendChild(frame);
        return frame;
    }

    function removePrivateMount(hostDocument) {
        const state = hostDocument && PRIVATE_MOUNTS.get(hostDocument);
        if (!state) return;
        if (state.host.parentNode) state.host.parentNode.removeChild(state.host);
        PRIVATE_MOUNTS.delete(hostDocument);
    }

    function secureRenderer() {
        "use strict";
        const SECTION_META = [
            ["Araç Çubuğu", "Hover araçlarını, önizleme davranışını ve görünme sınırlarını yönet."],
            ["Yakınlaştırma", "Büyütecin boyutunu, tekerlek davranışını ve yakınlaştırma adımlarını ayarla."],
            ["Galeri", "Galeri görünümünü, toplu yüklemeyi, indirmeyi ve dışa aktarmayı yönet."],
            ["Resim Penceresi", "Tam boy görsel penceresinin yerleşimini, kontrollerini ve görünümünü ayarla."],
            ["Genel", "Dil, dosya adları, site kuralları ve tanılama seçeneklerini yönet."],
        ];
        // The upstream schema stores related values as separate fields. Keep those exact
        // fields and ids for compatibility, but present the small control clusters as one
        // readable unit instead of a long list of nearly identical rows.
        const COMPACT_GROUPS = [
            { id: "floatbar-location", keys: ["floatBar.position", "floatBar.stayOut", "floatBar.stayOutOffsetX", "floatBar.stayOutOffsetY"], labels: ["Konum", "Görselin dışına taşı", "X", "Y"], legend: "Nerede dursun?", behavior: "location" },
            { id: "floatbar-delays", keys: ["floatBar.showDelay", "floatBar.hideDelay"], labels: ["Açılış", "Kapanış"], legend: "Ne zaman görünsün?", behavior: "timing" },
            { id: "floatbar-thresholds", keys: ["floatBar.minSizeLimit.w", "floatBar.minSizeLimit.h", "floatBar.sizeLimitOr", "floatBar.forceShow.size.w", "floatBar.forceShow.size.h"], labels: ["Genişlik", "Yükseklik", "Genişlik veya yükseklik yeterli", "Genişlik", "Yükseklik"], legend: "Hangi görsellerde gösterilsin?", behavior: "thresholds" },
            { id: "floatbar-preview-size", keys: ["floatBar.previewMaxSizeW", "floatBar.previewMaxSizeH"], labels: ["Genişlik", "Yükseklik"], legend: "Önizleme üst sınırı", layout: "pair" },
            { id: "floatbar-global-modifier", keys: ["floatBar.globalkeys.ctrl", "floatBar.globalkeys.alt", "floatBar.globalkeys.shift", "floatBar.globalkeys.command"], labels: ["Ctrl", "Alt", "Shift", "⌘ Cmd"], legend: "Önizleme etkinleştirme tuşu", layout: "modifier", exclusive: true },
            { id: "magnifier-wheel-modifier", keys: ["magnifier.wheelZoom.ctrl", "magnifier.wheelZoom.alt", "magnifier.wheelZoom.shift", "magnifier.wheelZoom.meta"], labels: ["Ctrl", "Alt", "Shift", "⌘ Cmd"], legend: "Tekerlek yakınlaştırma tuşları", layout: "modifier" },
            { id: "gallery-default-size", keys: ["gallery.defaultSizeLimit.w", "gallery.defaultSizeLimit.h"], labels: ["Genişlik", "Yükseklik"], legend: "Varsayılan galeri boyutu", layout: "pair" },
            { id: "gallery-sidebar", keys: ["gallery.sidebarPosition", "gallery.sidebarSize"], labels: ["Konum", "Boyut"], legend: "Galeri kenar çubuğu", layout: "pair" },
        ];
        let port = null;
        let sessionToken = null;
        let schema = [];
        let baseline = {};
        let activeIndex = 4;
        let closeArmed = false;
        let resetArmed = false;
        let allowProgrammaticAction = false;
        let requestClose = null;

        function create(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text != null) node.textContent = text;
            return node;
        }

        function fold(value) {
            return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
                .replace(/ı/g, "i").toLowerCase();
        }

        function groupTitle(sectionIndex, key) {
            if (sectionIndex === 0) {
                if (/^floatBar\.(globalkeys|keys|disableKeySites)/.test(key)) return "Kısayollar";
                if (/^floatBar\.(position|stayOut|showDelay|hideDelay|forceShow|minSizeLimit|sizeLimitOr|showWithRules)/.test(key)) return "Görünüm ve konum";
                return "Araçlar ve davranış";
            }
            if (sectionIndex === 1) return /^magnifier\.radius/.test(key) ? "Büyüteç" : "Tekerlekle yakınlaştırma";
            if (sectionIndex === 2) {
                if (/^gallery\.(exportType|download|formatConversion|aria2|scaleSmallSize|showSmallSize)/.test(key)) return "İndirme ve dışa aktarma";
                if (/^gallery\.(loadMore|loadAll|viewmoreEndless|autoOpen|searchData|editSite)/.test(key)) return "Otomasyon ve siteler";
                return "Görünüm ve gezinme";
            }
            if (sectionIndex === 3) {
                if (/^imgWindow\.close/.test(key)) return "Kapatma davranışı";
                if (/^imgWindow\.(backgroundColor|overlayer)/.test(key)) return "Renk ve katman";
                if (/^imgWindow\.(defaultTool|shiftRotateStep|zoom)/.test(key)) return "Kontroller ve yakınlaştırma";
                return "Pencere yerleşimi";
            }
            if (/^(customLang|saveName)/.test(key)) return "Dil ve dosya adları";
            if (/^customRules/.test(key)) return "Site kuralları";
            return "Gelişmiş";
        }

        function sectionIndexFor(key) {
            if (key.startsWith("floatBar.")) return 0;
            if (key.startsWith("magnifier.")) return 1;
            if (key.startsWith("gallery.")) return 2;
            if (key.startsWith("imgWindow.")) return 3;
            return 4;
        }

        function renderField(field, compact) {
            const row = create("div", "config_var koppy-setting-row" + (compact ? " koppy-compact-member" : ""));
            row.id = "pv-prefs_" + field.key + "_var";
            row.title = field.title || "";
            row.dataset.fieldKey = field.key;
            row.dataset.searchText = fold([field.label, compact && compact.legend, field.title, field.key, groupTitle(field.sectionIndex, field.key), SECTION_META[field.sectionIndex][0]].join(" "));
            const label = create("label", "field_label", compact && compact.label || field.label || field.key);
            label.htmlFor = "pv-prefs_field_" + field.key;
            row.appendChild(label);

            let input;
            if (field.type === "checkbox") {
                input = create("input", field.className || "");
                input.type = compact && compact.radio ? "radio" : "checkbox";
                input.checked = Boolean(field.value);
            } else if (field.type === "select") {
                input = create("select", field.className || "");
                Object.entries(field.options || {}).forEach(([value, optionLabel]) => {
                    const option = create("option", "", optionLabel);
                    option.value = value;
                    option.selected = String(value) === String(field.value);
                    input.appendChild(option);
                });
            } else if (field.type === "textarea") {
                input = create("textarea", field.className || "");
                input.value = field.value == null ? "" : String(field.value);
                input.spellcheck = false;
            } else if (field.type === "radio") {
                input = create("select", field.className || "");
                Object.entries(field.options || {}).forEach(([value, optionLabel]) => {
                    const option = create("option", "", optionLabel);
                    option.value = value;
                    option.selected = String(value) === String(field.value);
                    input.appendChild(option);
                });
            } else {
                input = create("input", field.className || "");
                input.type = field.secret ? "password" : "text";
                input.value = field.value == null ? "" : String(field.value);
                if (field.secret && field.hasStoredValue) input.placeholder = "Kayıtlı — değiştirmek için yaz";
                if (String(field.className || "").includes("floatBar-key")) {
                    input.readOnly = true;
                    input.addEventListener("keydown", event => {
                        input.value = event.key === "Escape" || event.key === "Backspace" ? "" : event.key;
                        input.dispatchEvent(new Event("input", { bubbles: true }));
                        event.preventDefault();
                    });
                }
            }
            input.id = "pv-prefs_field_" + field.key;
            input.dataset.fieldKey = field.key;
            input.dataset.fieldType = field.type || "text";
            if (field.after) {
                const control = create("span", "koppy-input-with-unit");
                control.append(input, create("span", "koppy-field-unit", field.after));
                row.appendChild(control);
            } else {
                row.appendChild(input);
            }
            return row;
        }

        function collectValues() {
            const values = {};
            schema.forEach(field => {
                const input = document.getElementById("pv-prefs_field_" + field.key);
                if (field.secret && input.dataset.clearSecret === "true") values[field.key] = "__KOPPY_CLEAR_SECRET__";
                else values[field.key] = field.type === "checkbox" ? input.checked : input.value;
            });
            return values;
        }

        function setStatus(message, dirty) {
            const status = document.querySelector(".koppy-dirty-status");
            status.textContent = message;
            status.classList.toggle("is-dirty", Boolean(dirty));
        }

        function refreshDirty() {
            const values = collectValues();
            const count = schema.filter(field => JSON.stringify(values[field.key]) !== JSON.stringify(baseline[field.key])).length;
            const save = document.getElementById("pv-prefs_saveBtn");
            save.disabled = count === 0;
            setStatus(count ? count + " kaydedilmemiş değişiklik" : "Tüm değişiklikler kayıtlı", count > 0);
            return count;
        }

        function activate(index) {
            activeIndex = Math.max(0, Math.min(index, SECTION_META.length - 1));
            document.querySelectorAll("[role='tab']").forEach((tab, tabIndex) => {
                const selected = tabIndex === activeIndex;
                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
                tab.tabIndex = selected ? 0 : -1;
            });
            document.querySelectorAll("[role='tabpanel']").forEach((panel, panelIndex) => {
                panel.classList.toggle("koppy-active-section", panelIndex === activeIndex);
            });
            document.getElementById("koppy-settings-content").scrollTop = 0;
        }

        function applySearch() {
            const search = document.getElementById("koppy-settings-search");
            const query = fold(search.value.trim());
            const content = document.getElementById("koppy-settings-content");
            content.classList.toggle("is-searching", Boolean(query));
            let matches = 0;
            document.querySelectorAll("[role='tabpanel']").forEach(panel => {
                let panelMatches = 0;
                panel.querySelectorAll(".koppy-setting-row").forEach(row => {
                    const matched = !query || row.dataset.searchText.includes(query);
                    row.classList.toggle("koppy-hidden", !matched);
                    if (query && matched) panelMatches += 1;
                });
                panel.querySelectorAll(".koppy-compact-group").forEach(group => {
                    group.classList.toggle("koppy-hidden", !group.querySelector(".koppy-compact-member:not(.koppy-hidden)"));
                });
                panel.querySelectorAll(".koppy-behavior-card").forEach(card => {
                    const hasMatch = Boolean(card.querySelector(".koppy-setting-row:not(.koppy-hidden)"));
                    card.classList.toggle("koppy-hidden", !hasMatch);
                    card.querySelectorAll("details").forEach(details => {
                        if (query && hasMatch) details.open = true;
                        else if (!query) details.open = false;
                    });
                });
                panel.querySelectorAll(".koppy-card").forEach(card => {
                    card.style.display = card.querySelector(".koppy-setting-row:not(.koppy-hidden)") ? "" : "none";
                });
                panel.classList.toggle("koppy-search-match", panelMatches > 0);
                matches += panelMatches;
            });
            const status = document.querySelector(".koppy-search-status");
            if (!query) {
                document.querySelectorAll("[role='tabpanel']").forEach(panel => panel.classList.remove("koppy-search-match"));
                activate(activeIndex);
                status.textContent = "";
            } else {
                document.querySelectorAll("[role='tab']").forEach(tab => {
                    tab.classList.remove("active");
                    tab.setAttribute("aria-selected", "false");
                    tab.tabIndex = -1;
                });
                status.textContent = matches
                    ? "“" + search.value.trim() + "” için " + matches + " ayar bulundu"
                    : "“" + search.value.trim() + "” ile eşleşen ayar bulunamadı";
            }
            content.scrollTop = 0;
        }

        function renderBehaviorCard(compact) {
            const card = create("section", "koppy-behavior-card koppy-behavior-" + compact.behavior);
            card.dataset.compactGroup = compact.id;
            const header = create("header", "koppy-behavior-header");
            const title = create("h4", "", compact.legend);
            const summary = create("p", "koppy-behavior-summary");
            summary.setAttribute("aria-live", "polite");
            header.append(title, summary);
            card.appendChild(header);

            const field = key => schema.find(candidate => candidate.key === key);
            const inputs = new Map();
            const member = (key, label, className) => {
                const definition = field(key);
                if (!definition) return null;
                const row = renderField(definition, { legend: compact.legend, label });
                inputs.set(key, row.querySelector("[data-field-key]"));
                row.classList.add("koppy-inline-control");
                if (className) row.classList.add(className);
                return row;
            };
            const input = key => inputs.get(key) || document.getElementById("pv-prefs_field_" + key);

            if (compact.behavior === "location") {
                const preview = create("div", "koppy-location-preview");
                preview.setAttribute("aria-hidden", "true");
                preview.append(create("span", "koppy-preview-image"), create("span", "koppy-preview-bar"));
                const position = member("floatBar.position", "Araç çubuğu konumu", "koppy-position-control");
                const outside = member("floatBar.stayOut", "Araç çubuğunu görselin dışına taşı", "koppy-switch-row");
                const tuning = create("details", "koppy-advanced");
                const tuningSummary = create("summary", "", "İnce ayar: konumu kaydır");
                const tuningHint = create("p", "koppy-advanced-hint", "Pozitif değer sağa ve aşağı kaydırır.");
                const offsets = create("div", "koppy-inline-pair");
                [member("floatBar.stayOutOffsetX", "X", "koppy-offset-control"), member("floatBar.stayOutOffsetY", "Y", "koppy-offset-control")]
                    .filter(Boolean).forEach(row => offsets.appendChild(row));
                tuning.append(tuningSummary, tuningHint, offsets);
                if (position) card.appendChild(position);
                if (outside) card.appendChild(outside);
                card.append(preview, tuning);

                const refreshLocation = () => {
                    const positionInput = input("floatBar.position");
                    const outsideInput = input("floatBar.stayOut");
                    const positionLabels = {
                        "top left": "Sol üst",
                        "top right": "Sağ üst",
                        "bottom left": "Sol alt",
                        "bottom right": "Sağ alt",
                        "top center": "Üst orta",
                        "bottom center": "Alt orta",
                        hide: "Gizle",
                    };
                    Array.from(positionInput.options).forEach(option => {
                        if (positionLabels[option.value]) option.textContent = positionLabels[option.value];
                    });
                    const option = positionInput && positionInput.options[positionInput.selectedIndex];
                    const positionText = option ? option.textContent : "seçilen köşede";
                    const isOutside = Boolean(outsideInput && outsideInput.checked);
                    summary.textContent = isOutside ? "Görselin dışında · " + positionText : "Görselin üzerinde · " + positionText;
                    preview.dataset.position = String(positionInput && positionInput.value || "top right").replace(/\s+/g, "-");
                    preview.classList.toggle("is-outside", isOutside);
                    tuning.hidden = !isOutside;
                    tuning.setAttribute("aria-hidden", String(!isOutside));
                };
                input("floatBar.position").addEventListener("change", refreshLocation);
                input("floatBar.stayOut").addEventListener("change", refreshLocation);
                refreshLocation();
            } else if (compact.behavior === "timing") {
                const controls = create("div", "koppy-inline-pair");
                [member("floatBar.showDelay", "Açılış"), member("floatBar.hideDelay", "Kapanış")]
                    .filter(Boolean).forEach(row => controls.appendChild(row));
                card.appendChild(controls);
                const refreshTiming = () => {
                    summary.textContent = "Hover’dan " + input("floatBar.showDelay").value + " ms sonra açılır · " + input("floatBar.hideDelay").value + " ms sonra kapanır";
                };
                input("floatBar.showDelay").addEventListener("input", refreshTiming);
                input("floatBar.hideDelay").addEventListener("input", refreshTiming);
                refreshTiming();
            } else if (compact.behavior === "thresholds") {
                const primary = create("div", "koppy-threshold-row");
                primary.appendChild(create("span", "koppy-threshold-label", "Zoomlu görünüm"));
                const primaryControls = create("div", "koppy-measure-controls");
                [member("floatBar.minSizeLimit.w", "En az"), create("span", "koppy-measure-times", "×"), member("floatBar.minSizeLimit.h", "Yükseklik")]
                    .filter(Boolean).forEach(node => primaryControls.appendChild(node));
                primary.appendChild(primaryControls);
                const either = member("floatBar.sizeLimitOr", "", "koppy-rule-switch");
                const rule = create("label", "koppy-rule-row");
                const ruleText = create("span", "");
                if (either) rule.append(ruleText, either);
                const advanced = create("details", "koppy-advanced");
                advanced.appendChild(create("summary", "", "İnce ayar: normal görünüm eşiği"));
                const normal = create("div", "koppy-threshold-row");
                normal.appendChild(create("span", "koppy-threshold-label", "Normal görünüm"));
                const normalControls = create("div", "koppy-measure-controls");
                [member("floatBar.forceShow.size.w", "En az"), create("span", "koppy-measure-times", "×"), member("floatBar.forceShow.size.h", "Yükseklik")]
                    .filter(Boolean).forEach(node => normalControls.appendChild(node));
                normal.appendChild(normalControls);
                advanced.appendChild(normal);
                card.append(primary, rule, advanced);
                const refreshThresholds = () => {
                    const w = input("floatBar.minSizeLimit.w").value;
                    const h = input("floatBar.minSizeLimit.h").value;
                    const eitherChecked = input("floatBar.sizeLimitOr").checked;
                    ruleText.textContent = eitherChecked ? "Genişlik veya yükseklik yeterli" : "Genişlik ve yükseklik gerekli";
                    summary.textContent = "Zoomlu görünümde en az " + w + " × " + h + " px · " + ruleText.textContent;
                };
                ["floatBar.minSizeLimit.w", "floatBar.minSizeLimit.h"].forEach(key => input(key).addEventListener("input", refreshThresholds));
                input("floatBar.sizeLimitOr").addEventListener("change", refreshThresholds);
                refreshThresholds();
            }
            return card;
        }

        function build(payload) {
            schema = payload.schema;
            const globalModifiers = COMPACT_GROUPS.find(group => group.id === "floatbar-global-modifier");
            const modifierFields = globalModifiers.keys.map(key => schema.find(field => field.key === key)).filter(Boolean);
            const storedModifierValues = Object.fromEntries(modifierFields.map(field => [field.key, Boolean(field.value)]));
            const selectedModifiers = modifierFields.filter(field => Boolean(field.value));
            let modifierMigrationNeeded = false;
            if (selectedModifiers.length !== 1) {
                const isMac = /mac/i.test(String(navigator.platform || ""));
                const preferredKey = isMac ? ".command" : ".ctrl";
                const preferred = selectedModifiers.find(field => field.key.endsWith(".command")) || selectedModifiers[0] ||
                    modifierFields.find(field => field.key.endsWith(preferredKey));
                modifierFields.forEach(field => { field.value = field === preferred; });
                modifierMigrationNeeded = true;
            }
            activeIndex = Number.isInteger(payload.activeIndex) ? payload.activeIndex : 4;
            document.body.id = "pv-prefs";
            const wrapper = create("div");
            wrapper.id = "pv-prefs_wrapper";
            wrapper.setAttribute("role", "dialog");
            wrapper.setAttribute("aria-modal", "true");
            wrapper.setAttribute("aria-labelledby", "koppy-settings-title");
            wrapper.innerHTML = `
                <div id="pv-prefs_header" class="config_header">
                    <div class="koppy-brand"><div class="koppy-brand-mark">K</div><div class="koppy-brand-copy">
                        <div id="koppy-settings-title" class="koppy-brand-title">Koppy Ayarları</div>
                        <div class="koppy-brand-subtitle">KİŞİSEL GÖRSEL ARAÇLARI</div></div></div>
                    <label class="koppy-search-wrap" for="koppy-settings-search"><span class="koppy-search-icon">⌕</span>
                        <input id="koppy-settings-search" type="search" autocomplete="off" placeholder="Ayarlarda ara…" aria-label="Ayarlarda ara">
                        <span class="koppy-search-hint">⌘K</span></label>
                    <button id="koppy-settings-close" type="button" aria-label="Ayarları kapat" title="Ayarları kapat">×</button>
                </div>
                <div class="koppy-settings-main"><nav class="nav-tabs" role="tablist" aria-label="Ayar kategorileri"></nav>
                    <main id="koppy-settings-content" class="koppy-settings-content"><div class="koppy-search-status" role="status"></div></main></div>
                <div id="pv-prefs_buttons_holder"><div class="koppy-dirty-status" role="status" aria-live="polite" aria-atomic="true">Tüm değişiklikler kayıtlı</div>
                    <a id="pv-prefs_resetLink" href="#" role="button">Varsayılana dön</a>
                    <button id="pv-prefs_saveBtn" class="saveclose_buttons" type="button">Kaydet ve kapat</button>
                    <button id="pv-prefs_closeBtn" class="saveclose_buttons" type="button">Vazgeç</button></div>`;
            document.body.appendChild(wrapper);

            const nav = wrapper.querySelector(".nav-tabs");
            const content = wrapper.querySelector(".koppy-settings-content");
            const sectionCards = new Map();
            SECTION_META.forEach((meta, index) => {
                const tab = create("div", "section_header", meta[0]);
                tab.id = "pv-prefs_section_header_" + index;
                tab.dataset.sectionIndex = String(index);
                tab.setAttribute("role", "tab");
                tab.setAttribute("aria-controls", "pv-prefs_section_" + index);
                nav.appendChild(tab);
                const panel = create("section", "section_header_holder");
                panel.id = "pv-prefs_section_" + index;
                panel.setAttribute("role", "tabpanel");
                panel.setAttribute("aria-labelledby", tab.id);
                panel.tabIndex = 0;
                const heading = create("header", "koppy-panel-heading");
                heading.append(create("h2", "", index === 2 ? "Galeri ve İndirme" : index === 4 ? "Genel ve Kurallar" : meta[0]), create("p", "", meta[1]));
                panel.appendChild(heading);
                content.appendChild(panel);
                sectionCards.set(index, new Map());
                tab.addEventListener("click", () => {
                    document.getElementById("koppy-settings-search").value = "";
                    applySearch();
                    activate(index);
                    port.postMessage({ type: "tab", token: sessionToken, index });
                });
                tab.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); tab.click(); return; }
                    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
                    event.preventDefault();
                    let next = index;
                    if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = SECTION_META.length - 1;
                    else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % SECTION_META.length;
                    else next = (index - 1 + SECTION_META.length) % SECTION_META.length;
                    nav.children[next].click();
                    nav.children[next].focus();
                });
            });

            const compactFirstKeys = new Map();
            const compactMembers = new Set();
            COMPACT_GROUPS.forEach(group => {
                compactFirstKeys.set(group.keys[0], group);
                group.keys.slice(1).forEach(key => compactMembers.add(key));
            });
            schema.forEach(field => {
                if (compactMembers.has(field.key)) return;
                const panel = document.getElementById("pv-prefs_section_" + field.sectionIndex);
                const title = groupTitle(field.sectionIndex, field.key);
                let card = sectionCards.get(field.sectionIndex).get(title);
                if (!card) {
                    card = create("section", "koppy-card");
                    card.appendChild(create("h3", "koppy-card-title", title));
                    sectionCards.get(field.sectionIndex).set(title, card);
                    panel.appendChild(card);
                }
                const compact = compactFirstKeys.get(field.key);
                if (!compact) {
                    card.appendChild(renderField(field));
                    return;
                }
                if (compact.behavior) {
                    card.appendChild(renderBehaviorCard(compact));
                    return;
                }
                const group = create("fieldset", "koppy-compact-group koppy-layout-" + compact.layout);
                group.dataset.compactGroup = compact.id;
                if (compact.exclusive) {
                    group.dataset.exclusive = "true";
                    group.setAttribute("role", "radiogroup");
                    group.setAttribute("aria-label", compact.legend);
                }
                group.appendChild(create("legend", "", compact.legend));
                compact.keys.forEach((key, index) => {
                    const member = schema.find(candidate => candidate.key === key);
                    if (member) group.appendChild(renderField(member, { legend: compact.legend, label: compact.labels[index], radio: Boolean(compact.exclusive) }));
                });
                if (compact.exclusive) group.querySelectorAll("input[type='radio']").forEach(input => { input.name = "koppy-" + compact.id; });
                card.appendChild(group);
            });

            baseline = collectValues();
            if (modifierMigrationNeeded) Object.assign(baseline, storedModifierValues);
            activate(activeIndex);
            refreshDirty();
            if (modifierMigrationNeeded) setStatus("Önizleme tuşu tek seçime geçirildi — kaydet", true);
            const search = document.getElementById("koppy-settings-search");
            search.addEventListener("input", applySearch);
            wrapper.addEventListener("input", event => {
                if (event.target !== search) {
                    if (event.target.type === "password" && event.target.value) delete event.target.dataset.clearSecret;
                    closeArmed = false;
                    resetArmed = false;
                    refreshDirty();
                }
            });
            wrapper.addEventListener("change", event => {
                if (event.target === search) return;
                const exclusiveGroup = event.target.closest && event.target.closest(".koppy-compact-group[data-exclusive='true']");
                if (exclusiveGroup && (event.target.type === "checkbox" || event.target.type === "radio")) {
                    if (!event.target.checked) event.target.checked = true;
                    exclusiveGroup.querySelectorAll("input[type='checkbox']").forEach(input => {
                        if (input !== event.target) input.checked = false;
                    });
                }
                closeArmed = false;
                resetArmed = false;
                refreshDirty();
            });

            const save = document.getElementById("pv-prefs_saveBtn");
            save.addEventListener("click", event => {
                if (!event.isTrusted && !allowProgrammaticAction) {
                    setStatus("Güvenilmeyen kayıt girişimi engellendi", true);
                    return;
                }
                save.disabled = true;
                setStatus("Ayarlar kaydediliyor…", true);
                port.postMessage({ type: "save", token: sessionToken, values: collectValues() });
            });

            requestClose = function () {
                if (refreshDirty() && !closeArmed) {
                    closeArmed = true;
                    setStatus("Değişiklikleri silmek için Vazgeç’e tekrar bas", true);
                    return;
                }
                port.postMessage({ type: "close", token: sessionToken });
            };
            document.getElementById("pv-prefs_closeBtn").addEventListener("click", requestClose);
            document.getElementById("koppy-settings-close").addEventListener("click", requestClose);
            const reset = document.getElementById("pv-prefs_resetLink");
            reset.addEventListener("click", event => {
                event.preventDefault();
                if (!resetArmed) { resetArmed = true; setStatus("Tüm ayarları sıfırlamak için tekrar bas", true); return; }
                resetArmed = false;
                schema.forEach(field => {
                    const input = document.getElementById("pv-prefs_field_" + field.key);
                    if (field.secret) { input.value = ""; input.dataset.clearSecret = "true"; }
                    else if (field.type === "checkbox") input.checked = Boolean(field.defaultValue);
                    else input.value = field.defaultValue == null ? "" : String(field.defaultValue);
                });
                refreshDirty();
            });
            reset.addEventListener("keydown", event => {
                if (event.key === " ") { event.preventDefault(); reset.click(); }
            });

            document.addEventListener("keydown", event => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                    event.preventDefault(); search.focus(); search.select();
                } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                    event.preventDefault();
                    if (save.disabled) setStatus("Kaydedilecek değişiklik yok", false);
                    else { allowProgrammaticAction = true; try { save.click(); } finally { allowProgrammaticAction = false; } }
                } else if (event.key === "Escape" && search.value) {
                    search.value = ""; applySearch();
                } else if (event.key === "Escape" && !refreshDirty()) {
                    port.postMessage({ type: "close", token: sessionToken });
                } else if (event.key === "Escape") {
                    setStatus("Önce kaydet veya değişikliklerden vazgeç", true);
                } else if (event.key === "Tab") {
                    const focusable = Array.from(document.querySelectorAll(
                        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
                    )).filter(node => node.getClientRects().length && !node.closest("[hidden]"));
                    if (!focusable.length) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                }
            });
            setTimeout(() => search.focus({ preventScroll: true }), 0);
        }

        window.addEventListener("message", event => {
            if (port || !event.data || event.data.type !== "koppy-init" || typeof event.data.token !== "string" || !event.ports[0]) return;
            sessionToken = event.data.token;
            port = event.ports[0];
            port.onmessage = messageEvent => {
                const message = messageEvent.data;
                if (!message || message.token !== sessionToken) return;
                if (message.type === "request-close" && requestClose) {
                    requestClose();
                } else if (message.type === "save-result" && !message.ok) {
                    document.getElementById("pv-prefs_saveBtn").disabled = false;
                    setStatus(message.error || "Ayarlar kaydedilemedi; değişikliklerin korunuyor", true);
                }
            };
            port.start();
            build(event.data);
            port.postMessage({ type: "ready", token: sessionToken });
        }, { once: false });
    }

    function plainText(value) {
        if (value == null) return "";
        if (typeof value === "string" || typeof value === "number") return String(value);
        return value.textContent || "";
    }

    function firstElementNonce(hostDocument, selector) {
        if (!hostDocument || typeof hostDocument.querySelectorAll !== "function") return "";
        const candidates = hostDocument.querySelectorAll(selector);
        for (const candidate of candidates) {
            const nonce = String(candidate.nonce || candidate.getAttribute("nonce") || "").trim();
            if (/^[A-Za-z0-9+/_=-]{8,512}$/.test(nonce)) return nonce;
        }
        return "";
    }

    function pageCspNonces(hostDocument) {
        const script = firstElementNonce(hostDocument, "script[nonce]");
        return {
            script,
            style: firstElementNonce(hostDocument, "style[nonce]") || script,
        };
    }

    function escapeHtmlAttribute(value) {
        return String(value || "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        })[character]);
    }

    function showSecureLoadError(config, state) {
        if (!state || SECURE_STATES.get(config) !== state || state.ready || state.errorCard) return;
        state.frame.style.setProperty("display", "none", "important");
        const card = state.hostDocument.createElement("section");
        card.setAttribute("role", "alertdialog");
        card.setAttribute("aria-modal", "true");
        card.setAttribute("aria-labelledby", "koppy-load-error-title");
        card.style.cssText = "pointer-events:auto;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);" +
            "width:min(520px,calc(100vw - 32px));box-sizing:border-box;padding:28px;border:1px solid #2a3340;" +
            "border-radius:14px;background:#0b0e13;color:#f4f7fb;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
            "box-shadow:0 24px 80px rgba(0,0,0,.5)";
        const title = state.hostDocument.createElement("h2");
        title.id = "koppy-load-error-title";
        title.textContent = "Koppy ayarları yüklenemedi";
        title.style.cssText = "margin:0 0 8px;font-size:20px";
        const detail = state.hostDocument.createElement("p");
        detail.textContent = "Bu sayfanın güvenlik politikası ayar renderer’ını durdurdu. Koppy’yi güncelleyip sayfayı yeniledikten sonra tekrar dene.";
        detail.style.cssText = "margin:0 0 20px;color:#aab4c2";
        const close = state.hostDocument.createElement("button");
        close.type = "button";
        close.textContent = "Kapat";
        close.style.cssText = "min-height:40px;padding:0 16px;border:0;border-radius:8px;background:#7c9cff;color:#08101f;font-weight:700;cursor:pointer";
        close.addEventListener("click", event => { if (event.isTrusted) closeSecure(config); });
        card.append(title, detail, close);
        state.shadow.appendChild(card);
        state.errorCard = card;
        close.focus({ preventScroll: true });
    }

    function serializeSchema(config) {
        return Object.keys(config.fields || {}).filter(key => config.fields[key].save !== false).map(key => {
            const field = config.fields[key];
            const settings = field.settings || {};
            let sectionIndex = 4;
            if (key.startsWith("floatBar.")) sectionIndex = 0;
            else if (key.startsWith("magnifier.")) sectionIndex = 1;
            else if (key.startsWith("gallery.")) sectionIndex = 2;
            else if (key.startsWith("imgWindow.")) sectionIndex = 3;
            const options = {};
            if (Array.isArray(settings.options)) settings.options.forEach(option => { options[String(option)] = String(option); });
            else Object.entries(settings.options || {}).forEach(([value, label]) => { options[value] = plainText(label); });
            let value = field.value;
            let defaultValue = field.default;
            if ((settings.type === "select" || settings.type === "radio") && Object.keys(options).length) {
                const allowed = Object.keys(options);
                if (!allowed.includes(String(defaultValue))) defaultValue = allowed[0];
                if (!allowed.includes(String(value))) value = defaultValue;
            }
            return {
                key,
                sectionIndex,
                type: settings.type || "text",
                label: plainText(settings.label) || key,
                title: plainText(settings.title),
                after: plainText(settings.after),
                className: settings.className || "",
                options,
                secret: key === "gallery.aria2Token",
                hasStoredValue: key === "gallery.aria2Token" && Boolean(value),
                value: key === "gallery.aria2Token" ? "" : value,
                defaultValue: key === "gallery.aria2Token" ? "" : defaultValue,
            };
        });
    }

    function validateAndNormalizeValues(config, incoming) {
        if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("Geçersiz ayar paketi");
        const normalized = {};
        Object.keys(config.fields || {}).forEach(key => {
            const field = config.fields[key];
            if (field.save === false) return;
            if (!Object.prototype.hasOwnProperty.call(incoming, key)) throw new Error("Eksik ayar: " + key);
            const settings = field.settings || {};
            const type = settings.type || "text";
            let value = incoming[key];
            if (key === "gallery.aria2Token") {
                if (value === "__KOPPY_CLEAR_SECRET__") value = "";
                else if (value === "") value = field.value;
                else if (typeof value !== "string" || value.length > 200_000) throw new Error("Geçersiz gizli ayar");
            } else if (type === "checkbox") {
                if (typeof value !== "boolean") throw new Error("Geçersiz boolean ayarı: " + key);
            } else if (["int", "integer", "float", "number"].includes(type)) {
                value = Number(value);
                if (!Number.isFinite(value)) throw new Error("Geçersiz sayı: " + key);
                if (type === "int" || type === "integer") value = Math.trunc(value);
            } else {
                if (typeof value !== "string") throw new Error("Geçersiz metin ayarı: " + key);
                if (value.length > (key === "customRules" ? 2_000_000 : 200_000)) throw new Error("Ayar değeri çok uzun: " + key);
                if ((type === "select" || type === "radio") && settings.options) {
                    const allowed = Array.isArray(settings.options) ? settings.options.map(String) : Object.keys(settings.options);
                    if (!allowed.includes(value)) throw new Error("Geçersiz seçim: " + key);
                }
            }
            normalized[key] = value;
        });

        if (typeof normalized.customRules === "string") {
            const rules = JSON.parse(normalized.customRules || "[]", (key, value) => {
                if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error("Güvenli olmayan kural anahtarı: " + key);
                return value;
            });
            if (!Array.isArray(rules) || rules.some(rule => !rule || Array.isArray(rule) || typeof rule !== "object")) {
                throw new Error("Özel kurallar JSON nesnelerinden oluşan bir dizi olmalı");
            }
            normalized.customRules = JSON.stringify(rules, null, 4);
        }
        return normalized;
    }

    function closeSecure(config) {
        const state = SECURE_STATES.get(config);
        if (!state) return false;
        SECURE_STATES.delete(config);
        try { state.port.close(); } catch (_error) {}
        removePrivateMount(state.hostDocument);
        config.frame = null;
        config.isOpen = false;
        config.__koppySecureOpen = false;
        Object.values(config.fields || {}).forEach(field => { field.node = null; field.wrapper = null; });
        try { config.onClose(); } catch (_error) {}
        if (state.options && typeof state.options.onCloseState === "function") state.options.onCloseState();
        const previousFocus = state.previousFocus;
        if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
        return true;
    }

    function openSecure() {
        const installed = ACTIVE_INSTALL;
        if (!installed || !installed.config) return false;
        const { config, options, hostWindow, hostDocument } = installed;
        if (SECURE_STATES.has(config)) return true;
        if (typeof options.beforeOpen === "function") options.beforeOpen();
        if (typeof options.onOpenState === "function") options.onOpenState();

        const random = new Uint32Array(8);
        (hostWindow.crypto || crypto).getRandomValues(random);
        const token = Array.from(random, value => value.toString(16).padStart(8, "0")).join("");
        const frame = hostDocument.createElement("iframe");
        frame.id = config.id;
        frame.title = "Koppy Ayarları";
        frame.setAttribute("sandbox", "allow-scripts");
        frame.setAttribute("referrerpolicy", "no-referrer");
        frame.setAttribute("aria-label", "Koppy Ayarları");
        const rendererSource = "(" + secureRenderer.toString() + ")();";
        const nonces = pageCspNonces(hostDocument);
        const scriptNonce = escapeHtmlAttribute(nonces.script);
        const styleNonce = escapeHtmlAttribute(nonces.style);
        const scriptNonceAttribute = scriptNonce ? " nonce=\"" + scriptNonce + "\"" : "";
        const styleNonceAttribute = styleNonce ? " nonce=\"" + styleNonce + "\"" : "";
        const rendererPolicy = scriptNonce || styleNonce ? "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src " +
            (scriptNonce ? "'nonce-" + scriptNonce + "'" : "'unsafe-inline'") + "; style-src " +
            (styleNonce ? "'nonce-" + styleNonce + "'" : "'unsafe-inline'") + "\">" : "";
        const html = "<!doctype html><html><head><meta charset='utf-8'><meta name='color-scheme' content='dark'>" + rendererPolicy + "<style" +
            styleNonceAttribute + ">" + CSS + "</style></head><body><script" + scriptNonceAttribute + ">" + rendererSource + "</script></body></html>";
        frame.src = "data:text/html;charset=utf-8," + encodeURIComponent(html);

        config.frame = frame;
        config.isOpen = true;
        config.__koppySecureOpen = true;
        const channel = new hostWindow.MessageChannel();
        const state = { frame, port: channel.port1, token, hostDocument, options, previousFocus: hostDocument.activeElement, ready: false };
        SECURE_STATES.set(config, state);

        channel.port1.onmessage = event => {
            const message = event.data;
            if (!message || message.token !== token) return;
            if (message.type === "ready") {
                state.ready = true;
                if (state.handshakeTimer) hostWindow.clearTimeout(state.handshakeTimer);
                return;
            }
            if (message.type === "tab" && Number.isInteger(message.index)) {
                config.__koppyTab = Math.max(0, Math.min(4, message.index));
                return;
            }
            if (message.type === "close") {
                closeSecure(config);
                return;
            }
            if (message.type !== "save") return;
            const previousValues = {};
            try {
                const values = validateAndNormalizeValues(config, message.values);
                Object.keys(values).forEach(key => {
                    previousValues[key] = config.fields[key].value;
                    config.fields[key].value = values[key];
                });
                const saved = config.save();
                if (saved === false) throw new Error("Ayar deposu yazmayı doğrulamadı");
                channel.port1.postMessage({ type: "save-result", token, ok: true });
                hostWindow.setTimeout(() => closeSecure(config), 0);
            } catch (error) {
                Object.keys(previousValues).forEach(key => { config.fields[key].value = previousValues[key]; });
                channel.port1.postMessage({
                    type: "save-result",
                    token,
                    ok: false,
                    error: "Ayarlar kaydedilemedi: " + (error && error.message || error),
                });
            }
        };
        channel.port1.start();
        frame.addEventListener("load", () => {
            frame.contentWindow.postMessage({
                type: "koppy-init",
                token,
                schema: serializeSchema(config),
                activeIndex: Number.isInteger(config.__koppyTab) ? config.__koppyTab : 4,
            }, "*", [channel.port2]);
        }, { once: true });
        mountFrame(frame, hostDocument);
        const privateMount = PRIVATE_MOUNTS.get(hostDocument);
        if (privateMount) {
            state.shadow = privateMount.shadow;
            state.backdrop = privateMount.backdrop;
            state.backdrop.addEventListener("click", event => {
                if (event.isTrusted && event.target === state.backdrop && SECURE_STATES.get(config) === state) {
                    channel.port1.postMessage({ type: "request-close", token });
                }
            });
        }
        state.handshakeTimer = hostWindow.setTimeout(() => showSecureLoadError(config, state), 2500);
        applyFrameLayout({ frame }, hostWindow, hostDocument);
        return true;
    }

    function fieldKeyFromRow(row, configId) {
        const prefix = configId + "_";
        if (!row.id || !row.id.startsWith(prefix) || !row.id.endsWith("_var")) return "";
        return row.id.slice(prefix.length, -4);
    }

    function readFieldValue(field) {
        const node = field && field.node;
        const type = field && field.settings && field.settings.type || node && node.type;
        if (node && type === "checkbox") return node.checked;
        if (node && type === "select") return node.value;
        if (node && type === "radio") {
            const checked = node.querySelector("input[type='radio']:checked");
            return checked ? checked.value : null;
        }
        if (node && "value" in node) return node.value;
        try {
            return field && typeof field.toValue === "function" ? field.toValue() : undefined;
        } catch (_error) {
            return undefined;
        }
    }

    function snapshotFields(config) {
        const values = {};
        Object.keys(config.fields || {}).forEach(key => { values[key] = readFieldValue(config.fields[key]); });
        return values;
    }

    function changedCount(config, baseline) {
        let count = 0;
        Object.keys(config.fields || {}).forEach(key => {
            if (JSON.stringify(readFieldValue(config.fields[key])) !== JSON.stringify(baseline[key])) count += 1;
        });
        return count;
    }

    function addStyle(doc) {
        if (doc.getElementById("koppy-settings-style")) return;
        const style = doc.createElement("style");
        style.id = "koppy-settings-style";
        style.textContent = CSS;
        doc.head.appendChild(style);
    }

    function create(doc, tag, className, text) {
        const element = doc.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }

    function foldSearchText(value) {
        return String(value || "")
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/ı/g, "i")
            .toLowerCase();
    }

    function buildHeader(doc, header, closeButton) {
        header.textContent = "";

        const brand = create(doc, "div", "koppy-brand");
        brand.appendChild(create(doc, "div", "koppy-brand-mark", "K"));
        const brandCopy = create(doc, "div", "koppy-brand-copy");
        const brandTitle = create(doc, "div", "koppy-brand-title", "Koppy Ayarları");
        brandTitle.id = "koppy-settings-title";
        brandCopy.appendChild(brandTitle);
        brandCopy.appendChild(create(doc, "div", "koppy-brand-subtitle", "KİŞİSEL GÖRSEL ARAÇLARI"));
        brand.appendChild(brandCopy);

        const searchWrap = create(doc, "label", "koppy-search-wrap");
        searchWrap.setAttribute("for", "koppy-settings-search");
        searchWrap.appendChild(create(doc, "span", "koppy-search-icon", "⌕"));
        const search = create(doc, "input");
        search.id = "koppy-settings-search";
        search.type = "search";
        search.autocomplete = "off";
        search.placeholder = "Ayarlarda ara…";
        search.setAttribute("aria-label", "Ayarlarda ara");
        searchWrap.appendChild(search);
        searchWrap.appendChild(create(doc, "span", "koppy-search-hint", "⌘K"));

        const close = create(doc, "button", "", "×");
        close.id = "koppy-settings-close";
        close.type = "button";
        close.title = "Ayarları kapat";
        close.setAttribute("aria-label", "Ayarları kapat");
        close.addEventListener("click", () => closeButton.click());

        header.append(brand, searchWrap, close);
        return search;
    }

    function groupRows(doc, section, sectionIndex, configId) {
        const rows = Array.from(section.children).filter(child => child.classList.contains("config_var"));
        const definitions = GROUPS[sectionIndex] || [{ title: "Ayarlar", match: /.*/ }];
        const cards = new Map();

        definitions.forEach(definition => {
            const card = create(doc, "section", "koppy-card");
            card.dataset.group = definition.title;
            card.appendChild(create(doc, "h3", "koppy-card-title", definition.title));
            cards.set(definition, card);
        });

        rows.forEach(row => {
            const descendantIds = [row.id].concat(Array.from(row.querySelectorAll("[id$='_var']")).map(node => node.id));
            const keys = descendantIds.map(id => {
                const holder = { id };
                return fieldKeyFromRow(holder, configId);
            }).filter(Boolean);
            const primaryKey = keys[0] || fieldKeyFromRow(row, configId);
            const definition = definitions.find(candidate => candidate.match.test(primaryKey)) || definitions[definitions.length - 1];
            row.classList.add("koppy-setting-row");
            row.dataset.fieldKey = keys.join(" ");
            row.dataset.searchText = foldSearchText(
                [row.textContent, row.title, keys.join(" "), definition.title, SECTION_META[sectionIndex].title]
                    .filter(Boolean).join(" ")
            );
            cards.get(definition).appendChild(row);
        });

        cards.forEach(card => {
            if (card.querySelector(".koppy-setting-row")) section.appendChild(card);
        });
    }

    function applyFrameLayout(config, hostWindow, hostDocument) {
        const frame = config && config.frame;
        if (!frame || !frame.style) return;
        mountFrame(frame, hostDocument || frame.ownerDocument);
        const narrow = (hostWindow && hostWindow.innerWidth || 1024) < 640;
        Object.assign(frame.style, {
            position: "fixed",
            display: frame.style.display === "none" ? "none" : "block",
            width: narrow ? "calc(100vw - 16px)" : "min(1040px, calc(100vw - 32px))",
            height: narrow ? "calc(100vh - 16px)" : "min(780px, calc(100vh - 32px))",
            maxWidth: "none",
            maxHeight: "none",
            top: narrow ? "8px" : "50%",
            left: narrow ? "8px" : "50%",
            right: "auto",
            bottom: "auto",
            margin: "0",
            padding: "0",
            boxSizing: "border-box",
            transform: narrow ? "none" : "translate(-50%, -50%)",
            overflow: "hidden",
            border: "1px solid #2a3340",
            borderRadius: narrow ? "10px" : "14px",
            background: "#0b0e13",
            boxShadow: "0 24px 80px rgba(0,0,0,.55)",
            opacity: "1",
            zIndex: "2147483647",
        });
    }

    function enhance(config, options) {
        options = options || {};
        const frame = config && config.frame;
        const doc = options.document || (frame && frame.contentDocument) || null;
        if (!config || !doc) return false;
        const wrapper = doc.getElementById(config.id + "_wrapper");
        if (!wrapper || wrapper.dataset.koppyEnhanced === "true") return Boolean(wrapper);

        const header = doc.getElementById(config.id + "_header");
        const nav = wrapper.querySelector(".nav-tabs");
        const buttons = doc.getElementById(config.id + "_buttons_holder");
        const saveButton = doc.getElementById(config.id + "_saveBtn");
        const closeButton = doc.getElementById(config.id + "_closeBtn");
        const resetLink = doc.getElementById(config.id + "_resetLink");
        const sections = SECTION_META.map((_meta, index) => doc.getElementById(config.id + "_section_" + index)).filter(Boolean);
        if (!header || !nav || !buttons || !saveButton || !closeButton || !resetLink || !sections.length) return false;

        wrapper.dataset.koppyEnhanced = "true";
        wrapper.setAttribute("role", "dialog");
        wrapper.setAttribute("aria-modal", "true");
        wrapper.setAttribute("aria-labelledby", "koppy-settings-title");
        config.__koppyPreviousFocus = options.hostDocument && options.hostDocument.activeElement;
        addStyle(doc);
        applyFrameLayout(config, options.hostWindow || (frame && frame.ownerDocument && frame.ownerDocument.defaultView), options.hostDocument || (frame && frame.ownerDocument));

        const search = buildHeader(doc, header, closeButton);
        const main = create(doc, "div", "koppy-settings-main");
        const content = create(doc, "main", "koppy-settings-content");
        content.id = "koppy-settings-content";
        const searchStatus = create(doc, "div", "koppy-search-status");
        searchStatus.setAttribute("role", "status");
        content.appendChild(searchStatus);

        wrapper.insertBefore(main, buttons);
        main.appendChild(nav);
        main.appendChild(content);

        nav.setAttribute("role", "tablist");
        nav.setAttribute("aria-label", "Ayar kategorileri");

        const tabs = Array.from(nav.querySelectorAll(".section_header"));
        tabs.forEach((tab, index) => {
            const meta = SECTION_META[index] || { short: tab.textContent || "Ayarlar" };
            tab.textContent = meta.short;
            tab.setAttribute("role", "tab");
            tab.setAttribute("tabindex", "-1");
            tab.dataset.sectionIndex = String(index);
            tab.setAttribute("aria-controls", config.id + "_section_" + index);
        });

        sections.forEach((section, index) => {
            const meta = SECTION_META[index];
            const heading = create(doc, "header", "koppy-panel-heading");
            heading.appendChild(create(doc, "h2", "", meta.title));
            heading.appendChild(create(doc, "p", "", meta.description));
            section.insertBefore(heading, section.firstChild);
            section.setAttribute("role", "tabpanel");
            section.setAttribute("aria-labelledby", config.id + "_section_header_" + index);
            section.setAttribute("tabindex", "0");
            groupRows(doc, section, index, config.id);
            content.appendChild(section);
        });

        let activeIndex = Math.max(0, tabs.findIndex(tab => tab.classList.contains("active")));
        let closeArmed = false;
        let resetArmed = false;
        let allowProgrammaticAction = false;
        let closeTimer = null;
        let resetTimer = null;
        let baseline = snapshotFields(config);
        const dirtyStatus = create(doc, "div", "koppy-dirty-status", "Tüm değişiklikler kayıtlı");
        dirtyStatus.setAttribute("role", "status");
        dirtyStatus.setAttribute("aria-live", "polite");
        dirtyStatus.setAttribute("aria-atomic", "true");
        buttons.insertBefore(dirtyStatus, buttons.firstChild);
        saveButton.textContent = "Kaydet ve kapat";
        closeButton.textContent = "Vazgeç";
        resetLink.textContent = "Varsayılana dön";
        resetLink.setAttribute("role", "button");
        resetLink.setAttribute("aria-label", "Tüm ayarları varsayılana döndür");

        function setStatus(message, dirty) {
            dirtyStatus.textContent = message;
            dirtyStatus.classList.toggle("is-dirty", Boolean(dirty));
        }
        config.__koppyShowSaveError = () => {
            saveButton.disabled = false;
            setStatus("Ayarlar kaydedilemedi; değişikliklerin korunuyor", true);
        };

        function refreshDirty() {
            const count = changedCount(config, baseline);
            saveButton.disabled = count === 0;
            if (count) setStatus(count + " kaydedilmemiş değişiklik", true);
            else setStatus("Tüm değişiklikler kayıtlı", false);
            closeArmed = false;
            return count;
        }

        function activate(index) {
            activeIndex = Math.max(0, Math.min(index, sections.length - 1));
            tabs.forEach((tab, tabIndex) => {
                const selected = tabIndex === activeIndex;
                tab.classList.toggle("active", selected);
                tab.setAttribute("aria-selected", String(selected));
                tab.setAttribute("tabindex", selected ? "0" : "-1");
            });
            sections.forEach((section, sectionIndex) => section.classList.toggle("koppy-active-section", sectionIndex === activeIndex));
            config.__koppyTab = activeIndex;
            content.scrollTop = 0;
        }

        function applySearch() {
            const query = foldSearchText(search.value.trim());
            content.classList.toggle("is-searching", Boolean(query));
            let matches = 0;
            sections.forEach(section => {
                let sectionMatches = 0;
                section.querySelectorAll(".koppy-setting-row").forEach(row => {
                    const matched = !query || row.dataset.searchText.includes(query);
                    row.classList.toggle("koppy-hidden", !matched);
                    if (matched && query) sectionMatches += 1;
                });
                section.querySelectorAll(".koppy-card").forEach(card => {
                    card.style.display = card.querySelector(".koppy-setting-row:not(.koppy-hidden)") ? "" : "none";
                });
                section.classList.toggle("koppy-search-match", sectionMatches > 0);
                matches += sectionMatches;
            });
            if (!query) {
                sections.forEach(section => section.classList.remove("koppy-search-match"));
                activate(activeIndex);
                searchStatus.textContent = "";
            } else if (matches) {
                tabs.forEach(tab => {
                    tab.classList.remove("active");
                    tab.setAttribute("aria-selected", "false");
                    tab.setAttribute("tabindex", "-1");
                });
                searchStatus.textContent = "“" + search.value.trim() + "” için " + matches + " ayar bulundu";
            } else {
                tabs.forEach(tab => {
                    tab.classList.remove("active");
                    tab.setAttribute("aria-selected", "false");
                    tab.setAttribute("tabindex", "-1");
                });
                searchStatus.textContent = "“" + search.value.trim() + "” ile eşleşen ayar bulunamadı";
            }
            content.scrollTop = 0;
        }

        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => {
                search.value = "";
                applySearch();
                activate(index);
            });
            tab.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    tab.click();
                } else if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    let nextIndex = index;
                    if (event.key === "Home") nextIndex = 0;
                    else if (event.key === "End") nextIndex = tabs.length - 1;
                    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
                    else nextIndex = (index - 1 + tabs.length) % tabs.length;
                    tabs[nextIndex].click();
                    tabs[nextIndex].focus();
                }
            });
        });

        search.addEventListener("input", applySearch);
        wrapper.addEventListener("input", event => {
            if (event.target !== search) refreshDirty();
        });
        wrapper.addEventListener("change", event => {
            if (event.target !== search) refreshDirty();
        });

        saveButton.addEventListener("click", event => {
            if (!event.isTrusted && !allowProgrammaticAction) {
                event.preventDefault();
                event.stopImmediatePropagation();
                setStatus("Güvenilmeyen kayıt girişimi engellendi", true);
            }
        }, true);

        closeButton.addEventListener("click", event => {
            if (changedCount(config, baseline) && !closeArmed) {
                event.preventDefault();
                event.stopImmediatePropagation();
                closeArmed = true;
                setStatus("Değişiklikleri silmek için Vazgeç’e tekrar bas", true);
                clearTimeout(closeTimer);
                closeTimer = setTimeout(() => { closeArmed = false; refreshDirty(); }, 4000);
            } else {
                clearTimeout(closeTimer);
            }
        }, true);

        resetLink.addEventListener("click", event => {
            if (!resetArmed) {
                event.preventDefault();
                event.stopImmediatePropagation();
                resetArmed = true;
                setStatus("Tüm ayarları sıfırlamak için tekrar bas", true);
                clearTimeout(resetTimer);
                resetTimer = setTimeout(() => { resetArmed = false; refreshDirty(); }, 4000);
                return;
            }
            clearTimeout(resetTimer);
            resetArmed = false;
            setTimeout(refreshDirty, 0);
        }, true);
        resetLink.addEventListener("keydown", event => {
            if (event.key !== " ") return;
            event.preventDefault();
            allowProgrammaticAction = true;
            try { resetLink.click(); } finally { allowProgrammaticAction = false; }
        });

        doc.addEventListener("keydown", event => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                search.focus();
                search.select();
            } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                if (saveButton.disabled) {
                    setStatus("Kaydedilecek değişiklik yok", false);
                } else {
                    allowProgrammaticAction = true;
                    try { saveButton.click(); } finally { allowProgrammaticAction = false; }
                }
            } else if (event.key === "Escape" && doc.activeElement === search && search.value) {
                search.value = "";
                applySearch();
            } else if (event.key === "Escape" && !changedCount(config, baseline)) {
                closeButton.click();
            } else if (event.key === "Escape") {
                setStatus("Önce kaydet veya değişikliklerden vazgeç", true);
            } else if (event.key === "Tab") {
                const focusable = Array.from(wrapper.querySelectorAll(
                    "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
                )).filter(node => node.getClientRects().length > 0);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && doc.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && doc.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });

        const preferred = Number.isInteger(config.__koppyTab) ? config.__koppyTab : activeIndex;
        activate(Number.isFinite(preferred) ? preferred : activeIndex);
        baseline = snapshotFields(config);
        refreshDirty();
        setTimeout(() => search.focus({ preventScroll: true }), 0);
        return true;
    }

    function install(options) {
        options = options || {};
        const config = options.config;
        if (!config || config.__koppySettingsInstalled) return false;
        config.__koppySettingsInstalled = true;

        const hostWindow = options.window || (typeof window !== "undefined" ? window : null);
        const hostDocument = options.document || (hostWindow && hostWindow.document) || null;
        const originalToTabs = config.toTabs;
        const originalSave = config.save;
        const originalClose = config.close;
        ACTIVE_INSTALL = { config, options, hostWindow, hostDocument };

        config.toTabs = function () {
            const result = originalToTabs.apply(config, arguments);
            enhance(config, { hostWindow, hostDocument });
            return result;
        };

        config.save = function () {
            let result = false;
            try {
                result = originalSave.apply(config, arguments);
            } catch (_error) {
                result = false;
            }
            if (result === false && typeof config.__koppyShowSaveError === "function") {
                config.__koppyShowSaveError();
            }
            return result;
        };

        config.close = function () {
            if (SECURE_STATES.has(config)) return closeSecure(config);
            const result = originalClose.apply(config, arguments);
            removePrivateMount(hostDocument);
            const previousFocus = config.__koppyPreviousFocus;
            if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
                previousFocus.focus({ preventScroll: true });
            }
            config.__koppyPreviousFocus = null;
            config.__koppyShowSaveError = null;
            return result;
        };

        if (hostWindow && typeof hostWindow.addEventListener === "function") {
            hostWindow.addEventListener("resize", () => applyFrameLayout(config, hostWindow, hostDocument), false);
        }
        return true;
    }

    return {
        SECTION_META,
        CSS,
        enhance,
        install,
        openSecure,
        closeSecure,
        mountFrame,
        removePrivateMount,
        serializeSchema,
        validateAndNormalizeValues,
        pageCspNonces,
        snapshotFields,
        changedCount,
    };
});
