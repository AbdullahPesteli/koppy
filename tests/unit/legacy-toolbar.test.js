import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("built userscript removes legacy FloatBar behavior without disabling preview or acquisition", () => {
  const result = spawnSync("bun", ["scripts/build.mjs"], { cwd: root, encoding: "utf8" });
  expect(result.status).toBe(0);
  const output = fs.readFileSync(path.join(root, "dist/Koppy.user.js"), "utf8");
  // New build policy must disable the vendor's toolbar regardless of stored buttonOrder.
  // All three legacy initialization paths must remain absent with saved buttonOrder populated.
  expect((output.match(/floatBar = null; \/\/ KOPPY_DISABLE_LEGACY_FLOATBAR/g) || []).length).toBe(3);
  expect(output).toContain("checkPreview(event)");
  expect(output).toContain("KoppyGoogleCopy.createController");
});
