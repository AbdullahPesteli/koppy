# Legacy FloatBar removal (K25)

Koppy's build now prevents all three legacy `FloatBarC` construction paths from running. This is enforced in the build output, not by changing persisted `prefs.floatBar.butonOrder`, so existing users with saved toolbar buttons are covered. No FloatBar button nodes are constructed, leaving no invisible toolbar hit area. The userscript's preview gesture handler and Google image-copy controller remain injected.

## Scope and verification

- Source change: `scripts/build.mjs`, guarded by an expected count of three upstream constructor sites.
- Generated artifact: `dist/Koppy.user.js` (reproducible via `bun scripts/build.mjs`).
- Targeted test: `bun test tests/unit/legacy-toolbar.test.js` (1 pass, 0 fail).
- Build: `bun scripts/build.mjs` (exit 0).

This is source/build evidence only, not an installed Tampermonkey or live-browser verification. It does not establish that an installed user's toolbar is already removed. Explicit preview, copy/acquisition, page controls, and native HUD were not intentionally changed. Full isolated browser interaction, Cmd+C byte validation, preview shortcut, and independent review remain separate acceptance gates.
