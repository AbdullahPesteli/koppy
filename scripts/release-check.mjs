#!/usr/bin/env node
// Fail-closed release gate. Never mutates the source tree or dist/:
// the rebuild goes to a temp dir under .context/tmp via KOPPY_BUILD_OUT.
//
// Contract
//   target branch : --branch <name> | KOPPY_RELEASE_BRANCH | real current git branch
//   "latest tag"  : a tag pointing exactly at HEAD named v<package.version>
//                   (older/unrelated tags never satisfy this check)
//   exit code     : 0 only if every check is PASS, otherwise 1
//   --expect-version <x.y.z> | KOPPY_EXPECT_VERSION : optional extra pin
//   --no-rebuild  : diagnostic only; rebuild checks are reported FAIL (never skipped as pass)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const noRebuild = args.includes("--no-rebuild");
const results = [];
const check = (name, fn) => {
    let ok = false, detail = "";
    try { const r = fn(); ok = r.ok === true; detail = r.detail; } catch (e) { detail = `error: ${e.message}`; }
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};
const git = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const distPath = path.join(root, "dist/Koppy.user.js");

// 1. dirty state measured BEFORE any rebuild
const porcelainBefore = git("status", "--porcelain", "--untracked-files=all");
check("working tree clean before build", () => {
    if (porcelainBefore.status !== 0) return { ok: false, detail: "git status failed" };
    const lines = porcelainBefore.stdout.split("\n").filter(Boolean);
    return { ok: lines.length === 0, detail: lines.length ? `${lines.length} dirty path(s): ${lines.slice(0, 5).join("; ")}` : "clean" };
});

let pkgVersion = "";
check("package.json version is semver (single authority)", () => {
    pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
    return { ok: /^\d+\.\d+\.\d+$/.test(pkgVersion), detail: pkgVersion };
});
const expected = argVal("--expect-version") || process.env.KOPPY_EXPECT_VERSION;
if (expected) check("package version equals pinned expectation", () => ({ ok: pkgVersion === expected, detail: `package=${pkgVersion} expected=${expected}` }));

check("package-lock root version equals package.json", () => {
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
    const a = lock.version, b = lock.packages && lock.packages[""] && lock.packages[""].version;
    return { ok: a === pkgVersion && b === pkgVersion, detail: `lock=${a} lock.packages[""]=${b} package=${pkgVersion}` };
});

check("STATUS.md version equals package.json", () => {
    const m = fs.readFileSync(path.join(root, "STATUS.md"), "utf8").match(/\*\*Sürüm:\*\*\s*(\S+)/);
    return { ok: !!m && m[1] === pkgVersion, detail: `status=${m ? m[1] : "missing"} package=${pkgVersion}` };
});

check("src bridge SCRIPT_VERSION is a build placeholder", () => {
    const src = fs.readFileSync(path.join(root, "src/koppy-bridge.js"), "utf8");
    return { ok: src.includes('const SCRIPT_VERSION = "__KOPPY_VERSION__";'), detail: "placeholder expected in source" };
});

let dist = null;
check("dist artefact exists", () => {
    if (!fs.existsSync(distPath)) return { ok: false, detail: "dist/Koppy.user.js missing" };
    dist = fs.readFileSync(distPath, "utf8");
    return { ok: true, detail: `sha256 ${sha(dist).slice(0, 12)}…` };
});
const meta = (k) => { const m = dist && dist.match(new RegExp(`^// @${k}\\s+(\\S+)`, "m")); return m ? m[1] : undefined; };

check("dist @version equals package.json", () => ({ ok: !!dist && meta("version") === pkgVersion, detail: `dist=${meta("version")} package=${pkgVersion}` }));
check("dist bridge SCRIPT_VERSION equals package.json", () => {
    const m = dist && dist.match(/const SCRIPT_VERSION = "([^"]+)";/);
    return { ok: !!m && m[1] === pkgVersion, detail: `bridge=${m ? m[1] : "missing"} package=${pkgVersion}` };
});

const branchProc = git("rev-parse", "--abbrev-ref", "HEAD");
const targetBranch = argVal("--branch") || process.env.KOPPY_RELEASE_BRANCH || (branchProc.stdout || "").trim();
const rawRe = /^https:\/\/raw\.githubusercontent\.com\/AbdullahPesteli\/koppy\/(.+)\/dist\/Koppy\.user\.js$/;
for (const key of ["updateURL", "downloadURL"]) {
    check(`dist ${key} branch equals target branch`, () => {
        const u = meta(key); const m = u && u.match(rawRe);
        return { ok: !!m && m[1] === targetBranch, detail: `url-branch=${m ? m[1] : u} target=${targetBranch}` };
    });
}

check("HEAD carries tag v<package.version> (exact HEAD, not 'latest by date')", () => {
    const t = git("tag", "--points-at", "HEAD");
    if (t.status !== 0) return { ok: false, detail: "git tag failed" };
    const tags = t.stdout.split("\n").filter(Boolean);
    return { ok: tags.includes(`v${pkgVersion}`), detail: `tags at HEAD=[${tags.join(",")}] want v${pkgVersion}` };
});

check("dist rebuilt from source is byte-identical (sha256)", () => {
    if (noRebuild) return { ok: false, detail: "--no-rebuild given; rebuild unverified = FAIL" };
    if (!dist) return { ok: false, detail: "no dist" };
    const tmpBase = path.join(root, ".context/tmp");
    fs.mkdirSync(tmpBase, { recursive: true });
    const dir = fs.mkdtempSync(path.join(tmpBase, "rc-"));
    const out = path.join(dir, "Koppy.user.js");
    const b = spawnSync(process.execPath, [path.join(root, "scripts/build.mjs")], { cwd: root, encoding: "utf8", env: { ...process.env, KOPPY_BUILD_OUT: out } });
    if (b.status !== 0 || !fs.existsSync(out)) return { ok: false, detail: `build failed rc=${b.status}: ${(b.stderr || "").trim().slice(0, 200)}` };
    const a = sha(fs.readFileSync(out)), d = sha(dist);
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: a === d, detail: `rebuilt=${a.slice(0, 12)}… dist=${d.slice(0, 12)}…` };
});

check("release-check left source tree and dist untouched", () => {
    const after = git("status", "--porcelain", "--untracked-files=all");
    return { ok: after.stdout === porcelainBefore.stdout && (!dist || sha(fs.readFileSync(distPath)) === sha(dist)), detail: "porcelain + dist sha unchanged" };
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\nrelease-check: ${results.length - failed} PASS, ${failed} FAIL -> rc=${failed ? 1 : 0}`);
process.exit(failed ? 1 : 0);
