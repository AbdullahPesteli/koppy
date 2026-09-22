#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/dist/KoppyBridgeCompanion.xpi"
rm -f "$OUTPUT"
(
  cd "$ROOT/companion"
  /usr/bin/zip -q -r "$OUTPUT" manifest.json background.js content.js
)
echo "Built $OUTPUT"
