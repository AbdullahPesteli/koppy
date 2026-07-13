import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const upstreamPath = path.join(root, "vendor/picviewer-ce-plus/Picviewer CE+.user.js");
const modulePath = path.join(root, "src/google-images-copy.js");
const settingsModulePath = path.join(root, "src/koppy-settings-ui.js");
const previewModulePath = path.join(root, "src/koppy-preview-fit.js");
const controlDeckModulePath = path.join(root, "src/koppy-control-deck.js");
const runtimeDir = path.join(root, "vendor/runtime");
const outputDir = path.join(root, "dist");
const outputPath = path.join(outputDir, "Koppy.user.js");
const marker = "        // 注册按键";

let source = fs.readFileSync(upstreamPath, "utf8");
const googleModuleSource = fs.readFileSync(modulePath, "utf8");
const settingsModuleSource = fs.readFileSync(settingsModulePath, "utf8");
const previewModuleSource = fs.readFileSync(previewModulePath, "utf8");
const controlDeckModuleSource = fs.readFileSync(controlDeckModulePath, "utf8");
// Keep the current, audited PDF.js modules local and pinned in the built script.
// They are loaded as browser modules only when a PDF/AI-PDF is copied; inserting
// ESM syntax directly into Picviewer’s legacy wrapper would make the userscript
// fail to parse before any feature could start.
const pdfJsSource = fs.readFileSync(path.join(root, "node_modules/pdfjs-dist/build/pdf.mjs"), "utf8");
const pdfWorkerSource = fs.readFileSync(path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.mjs"), "utf8");
const moduleSource = `${settingsModuleSource}\n\n        globalThis.KoppySettingsUI.install({
            config: GM_config,
            document: document,
            window: window,
            beforeOpen: () => {
                const searchDataField = GM_config.fields["gallery.searchData"];
                if (searchDataField && searchDataField.value === "") searchDataField.value = defaultSearchData;
                const customRulesField = GM_config.fields.customRules;
                if (customRulesField) {
                    customRulesField.default = "[]";
                    if (typeof customRulesField.value !== "string" || customRulesField.value.indexOf("Example, can be deleted safely") !== -1) {
                        customRulesField.value = "[]";
                    }
                }
            },
            onOpenState: () => { isConfigOpen = true; },
            onCloseState: () => { isConfigOpen = false; },
});\n\n${controlDeckModuleSource}\n\n${previewModuleSource}\n\n${googleModuleSource}`;
const runtimeHashes = new Map(fs.readFileSync(path.join(runtimeDir, "SHA256SUMS"), "utf8").trim().split("\n").map(line => {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!match) throw new Error(`Invalid runtime hash line: ${line}`);
    return [match[2], match[1]];
}));
function readVerifiedRuntime(name) {
    const content = fs.readFileSync(path.join(runtimeDir, name));
    const actual = createHash("sha256").update(content).digest("hex");
    const expected = runtimeHashes.get(name);
    if (!expected || actual !== expected) throw new Error(`Runtime dependency hash mismatch: ${name}`);
    return content.toString("utf8");
}
const bundledRequires = [
    "gm-config.js",
    "pvcep-rules.js",
    "pvcep-lang.js",
].map(readVerifiedRuntime);
const videoJsSource = readVerifiedRuntime("video-8.23.3.min.js");
const videoCssSource = readVerifiedRuntime("video-js-8.23.3.min.css");

const replacements = new Map([
    ["// @name                 Picviewer CE+", "// @name                 Koppy"],
    ["// @name:zh-CN           Picviewer CE+", "// @name:zh-CN           Koppy"],
    ["// @name:zh-TW           Picviewer CE+", "// @name:zh-TW           Koppy"],
    ["// @name:ja              Picviewer CE+", "// @name:ja              Koppy"],
    ["// @name:pt-BR           Picviewer CE+", "// @name:pt-BR           Koppy"],
    ["// @name:ru              Picviewer CE+", "// @name:ru              Koppy"],
    ["// @author               NLF && ywzhaiqi && hoothin", "// @author               NLF && ywzhaiqi && hoothin; Koppy fork by pestly"],
    ["// @version              2026.2.6.1", "// @version              0.4.2"],
    ["// @namespace            https://github.com/hoothin/UserScripts", "// @namespace            https://github.com/AbdullahPesteli/koppy"],
    ["// @homepage             https://pv.hoothin.com/", "// @homepage             https://github.com/AbdullahPesteli/koppy"],
    ["// @supportURL           https://github.com/hoothin/UserScripts/issues", "// @supportURL           https://github.com/AbdullahPesteli/koppy/issues"],
]);

for (const [from, to] of replacements) {
    if (!source.includes(from)) throw new Error(`Upstream metadata marker missing: ${from}`);
    source = source.replace(from, to);
}

const updateUrl = "https://raw.githubusercontent.com/AbdullahPesteli/koppy/master/dist/Koppy.user.js";
const koppyUpdateMetadata = "// @updateURL            " + updateUrl + "\n// @downloadURL          " + updateUrl;
const koppySupportUrl = "// @supportURL           https://github.com/AbdullahPesteli/koppy/issues";
if (!source.includes(koppySupportUrl)) throw new Error("Koppy support URL marker missing after metadata replacement");
source = source.replace(koppySupportUrl, koppySupportUrl + "\n" + koppyUpdateMetadata);

const remoteRequires = [
    "// @require              https://update.greasyfork.org/scripts/6158/23710/GM_config%20CN.js",
    "// @require              https://update.greasyfork.org/scripts/438080/1738227/pvcep_rules.js",
    "// @require              https://update.greasyfork.org/scripts/440698/1740314/pvcep_lang.js",
];
for (const remoteRequire of remoteRequires) {
    if (!source.includes(remoteRequire)) throw new Error(`Upstream @require marker missing: ${remoteRequire}`);
    source = source.replace(remoteRequire + "\n", "");
}

const upstreamContributionMetadata = [
    "// @contributionURL      https://ko-fi.com/hoothin",
    "// @contributionAmount   1",
];
for (const metadataLine of upstreamContributionMetadata) {
    if (!source.includes(metadataLine)) throw new Error(`Upstream contribution marker missing: ${metadataLine}`);
    source = source.replace(metadataLine + "\n", "");
}

const metadataEnd = "// ==/UserScript==\n";
if (!source.includes(metadataEnd)) throw new Error("Userscript metadata end marker missing");
const pdfRuntimeBootstrap = `globalThis.KoppyPdfModuleBase64 = ${JSON.stringify(Buffer.from(pdfJsSource).toString("base64"))};
globalThis.KoppyPdfWorkerBase64 = ${JSON.stringify(Buffer.from(pdfWorkerSource).toString("base64"))};`;
source = source.replace(metadataEnd, metadataEnd + "\n" + bundledRequires.join("\n\n") + "\n\n" + pdfRuntimeBootstrap + "\n\n");

const insecureFrameMount = "document.body.appendChild((this.frame = this.create('iframe', {";
if (!source.includes(insecureFrameMount)) throw new Error("GM_config frame mount marker missing");
source = source.replace(insecureFrameMount, "globalThis.KoppySettingsUI.mountFrame((this.frame = this.create('iframe', {");

const legacyTabRead = "var curTab = localStorage.getItem('picviewerCE.config.curTab') || 0;";
const legacyTabWrite = "localStorage.setItem('picviewerCE.config.curTab', curTab)";
if (!source.includes(legacyTabRead) || !source.includes(legacyTabWrite)) throw new Error("GM_config tab state markers missing");
source = source.replace(legacyTabRead, "var curTab = this.__koppyTab || 0;");
source = source.replace(legacyTabWrite, "this.__koppyTab = curTab");

const legacySaveAndClose = `                        config.save();
                        config.close();`;
if (!source.includes(legacySaveAndClose)) throw new Error("GM_config save/close marker missing");
source = source.replace(legacySaveAndClose, `                        if (config.save() !== false) config.close();`);

const legacySaveMethod = `    save: function () {
        var forgotten = this.write();
        this.onSave(forgotten); // Call the save() callback function
    },`;
const verifiedSaveMethod = `    save: function () {
        var forgotten = this.write();
        if (forgotten === false) return false;
        try {
            this.onSave(forgotten); // Call the save() callback function
            return true;
        } catch (e) {
            this.log("GM_config failed to apply settings!");
            return false;
        }
    },`;
if (!source.includes(legacySaveMethod)) throw new Error("GM_config save method marker missing");
source = source.replace(legacySaveMethod, verifiedSaveMethod);

const legacyWriteMethod = `        try {
            this.setValue(store || this.id, this.stringify(obj || values));
        } catch(e) {
            this.log("GM_config failed to save settings!");
        }

        return forgotten;`;
const verifiedWriteMethod = `        try {
            var storageKey = store || this.id;
            var serializedValue = this.stringify(obj || values);
            this.setValue(storageKey, serializedValue);
            if (this.getValue(storageKey, null) !== serializedValue) {
                this.log("GM_config settings read-back verification failed!");
                return false;
            }
        } catch(e) {
            this.log("GM_config failed to save settings!");
            return false;
        }

        return forgotten;`;
if (!source.includes(legacyWriteMethod)) throw new Error("GM_config write method marker missing");
source = source.replace(legacyWriteMethod, verifiedWriteMethod);

const videoLoaderStart = source.indexOf("    function loadVideoJsLibrary() {");
const videoLoaderEnd = source.indexOf("    async function initVideojs(media, imgSrc) {", videoLoaderStart);
if (videoLoaderStart === -1 || videoLoaderEnd === -1) throw new Error("Upstream Video.js loader markers missing");
const bundledVideoLoader = `    function loadVideoJsLibrary() {
        if (window.videoJsStatus === 'loaded' && window.videojs) return Promise.resolve();
        if (window.koppyVideoJsPromise) return window.koppyVideoJsPromise;
        window.videoJsStatus = 'loading';
        window.koppyVideoJsPromise = Promise.resolve().then(() => {
${videoJsSource}
            if (!document.getElementById('imagus-videojs-styles')) {
                const styleElement = document.createElement('style');
                styleElement.textContent = ${JSON.stringify(videoCssSource)};
                styleElement.id = 'imagus-videojs-styles';
                document.head.appendChild(styleElement);
            }
            window.videoJsStatus = 'loaded';
        }).catch(error => {
            window.videoJsStatus = 'failed';
            window.koppyVideoJsPromise = null;
            throw error;
        });
        return window.koppyVideoJsPromise;
    }
`;
source = source.slice(0, videoLoaderStart) + bundledVideoLoader + source.slice(videoLoaderEnd);

if (!source.includes(marker)) throw new Error("Koppy injection marker missing from upstream userscript");
const upstreamAboutStart = '                    let about = doc.getElementById(this.id + "_section_4");\n                    if (about) {';
const upstreamAboutEnd = "\n                },\n                save: function() {";
const upstreamAboutStartIndex = source.indexOf(upstreamAboutStart);
const upstreamAboutEndIndex = source.indexOf(upstreamAboutEnd, upstreamAboutStartIndex);
if (upstreamAboutStartIndex === -1 || upstreamAboutEndIndex === -1) {
    throw new Error("Upstream settings about block markers missing");
}
source = source.slice(0, upstreamAboutStartIndex)
    + '                    const about = doc.getElementById(this.id + "_section_4");\n'
    + '                    if (about) about.dataset.koppyAbout = "local";'
    + source.slice(upstreamAboutEndIndex);

const legacyFrameRemount = "            document.documentElement.appendChild(GM_config.frame);";
if (!source.includes(legacyFrameRemount)) throw new Error("Upstream settings frame remount marker missing");
source = source.replace(legacyFrameRemount, "            globalThis.KoppySettingsUI.mountFrame(GM_config.frame, document);");

const legacyTabInit = "                    if (localStorage && localStorage.getItem && localStorage.getItem('picviewerCE.config.curTab') === null) {\n                        localStorage.setItem('picviewerCE.config.curTab', 4);\n                    }";
if (!source.includes(legacyTabInit)) throw new Error("Upstream settings tab init marker missing");
source = source.replace(legacyTabInit, "                    this.__koppyTab = Number.isInteger(this.__koppyTab) ? this.__koppyTab : 4;");

const automaticUpstreamTabs = [
    '_GM_openInTab("https://pv.hoothin.com/open-settings", {active:true});',
    '_GM_openInTab("https://pv.hoothin.com/first-run", {active:true});',
];
for (const openCall of automaticUpstreamTabs) {
    if (!source.includes(openCall)) throw new Error(`Upstream automatic tab marker missing: ${openCall}`);
    source = source.replace(openCall, "void 0; // Koppy never opens upstream tabs automatically.");
}
const legacyImportTabWrite = "localStorage.setItem('picviewerCE.config.curTab', 4);";
if (!source.includes(legacyImportTabWrite)) throw new Error("Upstream imported-rule tab marker missing");
source = source.replace(legacyImportTabWrite, "GM_config.__koppyTab = 4;");

const executableRuleLoad = `                        if (prefs.customRules.indexOf("name:") !== -1) {
                            if (!isunsafe()) {
                                customRules = unsafeWindow.eval(createScript(prefs.customRules));
                            }
                        } else {
                            customRules = JSON.parse(prefs.customRules);
                        }`;
const declarativeRuleLoad = `                        customRules = JSON.parse(prefs.customRules, (key, value) => {
                            if (key === "__proto__" || key === "prototype" || key === "constructor") {
                                throw new Error("Unsafe custom rule key: " + key);
                            }
                            return value;
                        });`;
if (!source.includes(executableRuleLoad)) throw new Error("Executable custom-rule load marker missing");
source = source.replace(executableRuleLoad, declarativeRuleLoad);

const customRuleSaveStart = "                    saveBtn.addEventListener('click', e => {";
const customRuleSaveEnd = "\n                    }, true);\n                    closeBtn.textContent=i18n(\"closeBtn\");";
const customRuleSaveStartIndex = source.indexOf(customRuleSaveStart);
const customRuleSaveEndIndex = source.indexOf(customRuleSaveEnd, customRuleSaveStartIndex);
if (customRuleSaveStartIndex === -1 || customRuleSaveEndIndex === -1) {
    throw new Error("Custom-rule save validator markers missing");
}
const declarativeRuleSave = `                    saveBtn.addEventListener('click', e => {
                        if (!customInput.value) return;
                        try {
                            const parsedRules = JSON.parse(customInput.value, (key, value) => {
                                if (key === "__proto__" || key === "prototype" || key === "constructor") {
                                    throw new Error("Unsafe key: " + key);
                                }
                                return value;
                            });
                            if (!Array.isArray(parsedRules)) throw new Error("Rules must be a JSON array.");
                            if (parsedRules.some(rule => !rule || Array.isArray(rule) || typeof rule !== "object")) {
                                throw new Error("Every rule must be a JSON object.");
                            }
                            customInput.value = JSON.stringify(parsedRules, null, 4);
                        } catch (err) {
                            e.stopPropagation();
                            e.preventDefault();
                            alert("Kurallar yalnızca geçerli bir JSON dizisi olabilir: " + err.message);
                        }
                    }, true);`;
source = source.slice(0, customRuleSaveStartIndex)
    + declarativeRuleSave
    + source.slice(customRuleSaveEndIndex + "\n                    }, true);".length);

const openPrefsSecureEntry = "        function openPrefs() {\n            if (window.top != window.self) return;";
if (!source.includes(openPrefsSecureEntry)) throw new Error("Upstream openPrefs marker missing");
source = source.replace(openPrefsSecureEntry, openPrefsSecureEntry
    + "\n            globalThis.KoppySettingsUI.openSecure();\n            return;");
const integration = `${moduleSource}\n\n        globalThis.KoppyGoogleCopy.createController({\n            document: document,\n            window: window,\n            location: location,\n            navigator: navigator,\n            ClipboardItem: typeof ClipboardItem === "undefined" ? null : ClipboardItem,\n            gmRequest: _GM_xmlhttpRequest,\n            resolvePic: findPic,\n            isPreviewGesture: event => checkPreview(event),\n        }).start();\n        globalThis.KoppyPreviewFit.install({ ImgWindowC: ImgWindowC, prefs: prefs, window: window });\n\n`;
const controlDeckIntegration = `        const koppyOpenUpdate = () => _GM_openInTab(${JSON.stringify(updateUrl)}, {active:true});
        const koppyControlDeck = globalThis.KoppyControlDeck.install({
            config: GM_config,
            prefs: prefs,
            document: document,
            window: window,
            getFloatBar: () => floatBar,
            getPreview: () => uniqueImgWin,
            openFullSettings: () => globalThis.KoppySettingsUI.openSecure(),
            openUpdate: koppyOpenUpdate,
        });
        if (koppyControlDeck) _GM_registerMenuCommand("Koppy Canlı Kontrol", () => koppyControlDeck.toggle());
        _GM_registerMenuCommand("Koppy · Güncellemeyi aç", koppyOpenUpdate);

`;
source = source.replace(marker, integration + controlDeckIntegration + marker);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, source);
console.log(`Built ${path.relative(root, outputPath)} (${source.length} bytes)`);
