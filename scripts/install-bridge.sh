#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/Library/Application Support/Koppy Bridge"
PLIST="$HOME/Library/LaunchAgents/com.pestly.koppy.bridge.plist"
LABEL="com.pestly.koppy.bridge"
UID_VALUE="$(id -u)"

mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
chmod 700 "$DEST"
swiftc "$ROOT/bridge/KoppyBridge.swift" -framework AppKit -framework Security -o "$DEST/KoppyBridge"
chmod 700 "$DEST/KoppyBridge"
cp "$ROOT/bridge/com.pestly.koppy.bridge.plist" "$PLIST"
plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$UID_VALUE/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_VALUE" "$PLIST"
launchctl print "gui/$UID_VALUE/$LABEL" >/dev/null
echo "Koppy Bridge çalışıyor: http://127.0.0.1:47651/v1/health"
