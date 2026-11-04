const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

// Structural guard accompanies the full-dist browser tests; it is not acceptance alone.
const BROKEN = "b1f024a8d9914ceecce26fe65cddcc4bad38fb0e";
const MOUNT = "container.id='pv-float-bar-container';\n                getBody(document).appendChild(container);";
const DETACHED = "container.id='pv-float-bar-container'; // KOPPY_DETACHED_LEGACY_FLOATBAR";

function dist(variant) {
    if (variant === "broken") {
        return execFileSync("git", ["show", `${BROKEN}:dist/Koppy.user.js`], { maxBuffer: 8e6 }).toString();
    }
    return fs.readFileSync(path.join(__dirname, "../../dist/Koppy.user.js"), "utf8");
}

test("controller constructors survive while only the legacy mount is removed", () => {
    const output = dist(process.env.LEGACY_VARIANT);
    assert.equal(output.split("floatBar = new FloatBarC();").length - 1, 3,
        "the three FloatBarC constructors must stay alive for start/data/open");
    assert.ok(output.includes(DETACHED), "legacy mount must be detached at build time");
    assert.ok(!output.includes(MOUNT), "legacy toolbar container must not be mounted");
});

test("broken candidate violates the guard (negative control)", () => {
    const output = dist("broken");
    const constructors = output.split("floatBar = new FloatBarC();").length - 1;
    assert.ok(constructors !== 3 || !output.includes(DETACHED) || output.includes(MOUNT),
        "b1f024a must fail the kept-controller guard");
});
