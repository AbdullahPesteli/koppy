(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.KoppyPreviewFit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const DEFAULT_MAX_WIDTH = 960;
    const DEFAULT_MAX_HEIGHT = 720;

    function fallbackSize(windowLike) {
        const viewportWidth = Math.max(0, Number(windowLike && windowLike.innerWidth || 0));
        const viewportHeight = Math.max(0, Number(windowLike && windowLike.innerHeight || 0));
        return {
            width: Math.max(420, Math.min(DEFAULT_MAX_WIDTH, Math.round(viewportWidth * 0.72) || DEFAULT_MAX_WIDTH)),
            height: Math.max(320, Math.min(DEFAULT_MAX_HEIGHT, Math.round(viewportHeight * 0.70) || DEFAULT_MAX_HEIGHT)),
        };
    }

    function install(options) {
        const settings = options || {};
        const Constructor = settings.ImgWindowC;
        const prefs = settings.prefs;
        if (!Constructor || !Constructor.prototype || typeof Constructor.prototype.followPos !== "function" || !prefs || !prefs.floatBar) return false;
        if (Constructor.prototype.__koppyPreviewFitInstalled) return true;

        const originalFollowPos = Constructor.prototype.followPos;
        Constructor.prototype.followPos = function () {
            const configuredWidth = Number(prefs.floatBar.previewMaxSizeW || 0);
            const configuredHeight = Number(prefs.floatBar.previewMaxSizeH || 0);
            // Existing explicit limits always win. Empty legacy values get a calm,
            // contained QuickHover preview instead of claiming the whole screen.
            if (configuredWidth > 0 || configuredHeight > 0) return originalFollowPos.apply(this, arguments);

            const size = fallbackSize(settings.window);
            prefs.floatBar.previewMaxSizeW = size.width;
            prefs.floatBar.previewMaxSizeH = size.height;
            try {
                return originalFollowPos.apply(this, arguments);
            } finally {
                prefs.floatBar.previewMaxSizeW = configuredWidth;
                prefs.floatBar.previewMaxSizeH = configuredHeight;
            }
        };
        Constructor.prototype.__koppyPreviewFitInstalled = true;
        return true;
    }

    return { DEFAULT_MAX_WIDTH, DEFAULT_MAX_HEIGHT, fallbackSize, install };
});
