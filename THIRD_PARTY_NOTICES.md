# Third-party notices

Koppy is based on the MIT-licensed **Picviewer CE+** userscript from
[hoothin/UserScripts](https://github.com/hoothin/UserScripts).

- Upstream snapshot commit: `c7cbfceda0a46350bbced9867b3abafb186a5153`
- Snapshot directory: `vendor/picviewer-ce-plus/`
- Original authors: NLF, ywzhaiqi, and hoothin
- Upstream license declaration: MIT

The snapshot is retained unchanged for attribution and reproducible builds. Koppy-specific code lives
under `src/` and is injected into the generated `dist/Koppy.user.js` by `scripts/build.mjs`.

To make the userscript deterministic and remove runtime executable-code downloads, the exact dependency
snapshots previously referenced by Picviewer are stored under `vendor/runtime/` and bundled at build time:

- GM_config CN 1.1 (`gm-config.js`), LGPL-3.0-or-later. License text:
  `vendor/runtime/licenses/LGPL-3.0.txt`.
- Picviewer CE+ rules and language data (`pvcep-rules.js`, `pvcep-lang.js`), from the upstream MIT project.
- Video.js 8.23.3 JavaScript and CSS, Apache-2.0 (including bundled components identified by its header).
  License notice: `vendor/runtime/licenses/VIDEOJS-LICENSE.txt`.
- PDF.js 5.4.530, Apache-2.0. It is packaged into `dist/Koppy.user.js` as local, base64-encoded
  browser modules and is loaded only for PDF/PDF-compatible Illustrator first-page rendering. It is
  never fetched from a third-party CDN at runtime. License: https://github.com/mozilla/pdf.js/blob/master/LICENSE

The SHA-256 values used to audit the imported snapshots are recorded in `vendor/runtime/SHA256SUMS`.
