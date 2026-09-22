#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Koppy Bridge"
MANIFEST_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"

mkdir -p "$DEST" "$MANIFEST_DIR"
chmod 700 "$DEST" "$MANIFEST_DIR"
swiftc "$ROOT/bridge/KoppyNativeHost.swift" -framework AppKit -o "$DEST/KoppyNativeHost"
chmod 700 "$DEST/KoppyNativeHost"
cp "$ROOT/bridge/com.pestly.koppy.bridge.native.json" "$MANIFEST_DIR/com.pestly.koppy.bridge.native.json"
chmod 600 "$MANIFEST_DIR/com.pestly.koppy.bridge.native.json"
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$MANIFEST_DIR/com.pestly.koppy.bridge.native.json"
"$DEST/KoppyNativeHost" --self-test
echo "Koppy Native Host kuruldu: $MANIFEST_DIR/com.pestly.koppy.bridge.native.json"
