#!/bin/bash
# GameHub setup — generates all user-specific artifacts dynamically.
# Safe to re-run (idempotent). Usage:
#   scripts/setup.sh                # everything
#   scripts/setup.sh --services     # launchd server agent only
#   scripts/setup.sh --menubar      # menu bar app only
#   scripts/setup.sh --desktop      # Desktop launcher app only
#   scripts/setup.sh --mcp          # register MCP server in Claude Desktop
set -euo pipefail

# ----- Single place to change branding later ---------------------------------
APP_NAME="PlayHub"
APP_ID="com.playhub"
PORT="${PORT:-4173}"
# ------------------------------------------------------------------------------

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
LOG_FILE="$HOME/Library/Logs/${APP_NAME}.log"
MENUBAR_APP="$HOME/Applications/${APP_NAME}Bar.app"
DESKTOP_APP="$HOME/Desktop/${APP_NAME}.app"
ICON="$REPO_DIR/assets/${APP_NAME}.icns"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found in PATH. Install Node.js (>=18) first." >&2
  exit 1
fi

say() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }

gen_server_agent() {
  mkdir -p "$LAUNCH_AGENTS" "$(dirname "$LOG_FILE")"
  local plist="$LAUNCH_AGENTS/${APP_ID}.server.plist"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>${APP_ID}.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>server.js</string>
    </array>
    <key>WorkingDirectory</key><string>${REPO_DIR}/web</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${LOG_FILE}</string>
    <key>StandardErrorPath</key><string>${LOG_FILE}</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/${APP_ID}.server" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  say "server agent loaded (${APP_ID}.server) — node: $NODE_BIN"
}

gen_menubar() {
  local src="$REPO_DIR/menubar/PlayHubBar.swift"
  if ! command -v swiftc >/dev/null; then
    say "WARNING: swiftc missing (Xcode CLT) — skipping menu bar app."
    return 0
  fi
  mkdir -p "$MENUBAR_APP/Contents/MacOS" "$MENUBAR_APP/Contents/Resources"
  swiftc -O "$src" -o "$MENUBAR_APP/Contents/MacOS/${APP_NAME}Bar"
  cat > "$MENUBAR_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>${APP_NAME}Bar</string>
    <key>CFBundleIdentifier</key><string>${APP_ID}.menubar</string>
    <key>CFBundleExecutable</key><string>${APP_NAME}Bar</string>
    <key>CFBundleVersion</key><string>1.0</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>LSUIElement</key><true/>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF
  codesign --force --sign - "$MENUBAR_APP" >/dev/null 2>&1 || true

  local plist="$LAUNCH_AGENTS/${APP_ID}.menubar.plist"
  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>${APP_ID}.menubar</string>
    <key>ProgramArguments</key>
    <array><string>/usr/bin/open</string><string>${MENUBAR_APP}</string></array>
    <key>RunAtLoad</key><true/>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/${APP_ID}.menubar" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || true
  pkill -f "${APP_NAME}Bar" 2>/dev/null || true
  open "$MENUBAR_APP"
  say "menu bar app built and started ($MENUBAR_APP)"
}

gen_desktop() {
  local tmp
  tmp="$(mktemp -d)/launcher.applescript"
  cat > "$tmp" <<EOF
do shell script "
if ! /usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  cd '${REPO_DIR}/web'
  /usr/bin/nohup '${NODE_BIN}' server.js > /tmp/gamehub-web.log 2>&1 &
  for i in 1 2 3 4 5 6 7 8 9 10; do
    /usr/sbin/lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
open 'http://127.0.0.1:${PORT}'
"
EOF
  osacompile -o "$DESKTOP_APP" "$tmp"
  if [ -f "$ICON" ]; then
    cp "$ICON" "$DESKTOP_APP/Contents/Resources/applet.icns"
    touch "$DESKTOP_APP"
  fi
  say "Desktop launcher created ($DESKTOP_APP)"
}

gen_mcp() {
  "$NODE_BIN" "$REPO_DIR/scripts/register-mcp.mjs"
}

if [ $# -eq 0 ]; then
  gen_server_agent
  gen_menubar
  gen_desktop
  gen_mcp
else
  for arg in "$@"; do
    case "$arg" in
      --services) gen_server_agent ;;
      --menubar)  gen_menubar ;;
      --desktop)  gen_desktop ;;
      --mcp)      gen_mcp ;;
      *) echo "Unknown flag: $arg" >&2; exit 1 ;;
    esac
  done
fi
say "done."
