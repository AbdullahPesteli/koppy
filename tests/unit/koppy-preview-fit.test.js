const test = require("node:test");
const assert = require("node:assert/strict");
const PreviewFit = require("../../src/koppy-preview-fit.js");

test("empty preview limits get a contained QuickHover size without persisting it", () => {
    const prefs = { floatBar: { previewMaxSizeW: 0, previewMaxSizeH: 0 } };
    class ImageWindow {
        followPos() { this.seen = [prefs.floatBar.previewMaxSizeW, prefs.floatBar.previewMaxSizeH]; }
    }
    assert.equal(PreviewFit.install({ ImgWindowC: ImageWindow, prefs, window: { innerWidth: 1440, innerHeight: 900 } }), true);
    const instance = new ImageWindow();
    instance.followPos(200, 200);
    assert.deepEqual(instance.seen, [960, 630]);
    assert.deepEqual([prefs.floatBar.previewMaxSizeW, prefs.floatBar.previewMaxSizeH], [0, 0]);
});

test("an explicit preview size is never overridden", () => {
    const prefs = { floatBar: { previewMaxSizeW: 700, previewMaxSizeH: 500 } };
    class ImageWindow {
        followPos() { this.seen = [prefs.floatBar.previewMaxSizeW, prefs.floatBar.previewMaxSizeH]; }
    }
    PreviewFit.install({ ImgWindowC: ImageWindow, prefs, window: { innerWidth: 2400, innerHeight: 1500 } });
    const instance = new ImageWindow();
    instance.followPos(200, 200);
    assert.deepEqual(instance.seen, [700, 500]);
});
