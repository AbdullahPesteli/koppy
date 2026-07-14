(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KoppyDiagnostics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    // This is deliberately a small, in-memory, per-tab diagnostic ledger. It
    // is a troubleshooting aid, not telemetry: it never persists or uploads
    // URLs, tokens, image bytes, clipboard contents, headers or response text.
    const MAX_EVENTS = 120;
    const ALLOWED = new Set([
        "flowId", "stage", "outcome", "transport", "route", "status", "durationMs",
        "imageCount", "totalBytes", "candidateSource", "candidateKind", "mime",
        "errorCode", "errorKind", "attempt", "width", "height", "version",
    ]);
    let sequence = 0;
    const events = [];
    let persist = null;
    let persistTimer = null;

    function boundedNumber(value, maximum) {
        const number = Number(value);
        if (!Number.isFinite(number)) return undefined;
        return Math.max(0, Math.min(maximum, Math.round(number)));
    }

    function safeString(value, maximum) {
        if (typeof value !== "string") return undefined;
        // Never allow an accidental URL or credential-like value into the log.
        if (/(:\/\/|bearer\s|token|authorization|cookie|data:)/i.test(value)) return undefined;
        return value.slice(0, maximum);
    }

    function sanitize(fields) {
        const output = {};
        for (const [key, value] of Object.entries(fields || {})) {
            if (!ALLOWED.has(key)) continue;
            if (["status", "durationMs", "imageCount", "totalBytes", "attempt", "width", "height"].includes(key)) {
                const number = boundedNumber(value, key === "totalBytes" ? 200 * 1024 * 1024 : 60 * 60 * 1000);
                if (number !== undefined) output[key] = number;
            } else {
                const text = safeString(value, 80);
                if (text) output[key] = text;
            }
        }
        return output;
    }

    function flowId() {
        sequence += 1;
        return "k" + Date.now().toString(36) + "-" + sequence.toString(36);
    }

    function record(event, fields) {
        const name = String(event || "unknown");
        const safeEvent = /^[a-z0-9_-]{1,60}$/i.test(name) ? name : "unknown";
        const item = Object.assign({ at: new Date().toISOString(), event: safeEvent }, sanitize(fields));
        events.push(item);
        while (events.length > MAX_EVENTS) events.shift();
        if (typeof persist === "function" && !persistTimer) {
            persistTimer = setTimeout(() => {
                persistTimer = null;
                try { persist(snapshot()); } catch (_) {}
            }, 350);
            if (persistTimer && typeof persistTimer.unref === "function") persistTimer.unref();
        }
        return item;
    }

    function snapshot() {
        const recent = events.slice(-30);
        const counts = { copied: 0, copyFailed: 0, bridgeOk: 0, bridgeFailed: 0, candidateFailed: 0 };
        for (const item of events) {
            if (item.event === "copy_complete") counts.copied += 1;
            if (item.event === "copy_failed") counts.copyFailed += 1;
            if (item.event === "bridge_request_ok") counts.bridgeOk += 1;
            if (item.event === "bridge_request_failed") counts.bridgeFailed += 1;
            if (item.event === "candidate_failed") counts.candidateFailed += 1;
        }
        return { schema: 1, generatedAt: new Date().toISOString(), counts, recent };
    }

    function summaryText() {
        const data = snapshot();
        const headline = "Koppy tanı özeti · kopya " + data.counts.copied + "/" + data.counts.copyFailed
            + " · Bridge " + data.counts.bridgeOk + "/" + data.counts.bridgeFailed;
        return [headline].concat(data.recent.slice(-12).map(item => {
            const details = [item.outcome, item.route, item.transport, item.status && "HTTP " + item.status, item.errorKind, item.imageCount && item.imageCount + " görsel"].filter(Boolean).join(" · ");
            return item.at + "  " + item.event + (details ? " · " + details : "");
        })).join("\n");
    }

    function clear() { events.splice(0, events.length); }

    function configure(options) {
        const settings = options || {};
        persist = typeof settings.persist === "function" ? settings.persist : null;
    }

    return { MAX_EVENTS, clear, configure, flowId, record, snapshot, summaryText };
});
