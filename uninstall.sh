#!/bin/bash
# PlayHub uninstaller — removes everything install.sh created.
#   ./uninstall.sh           # keeps your .env, caches and shader-cache backups
#   ./uninstall.sh --purge   # also deletes .env, caches and backups
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="PlayHub"
APP_ID="com.playhub"
PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

say() { printf '\033[1;36m[playhub]\033[0m %s\n' "$*"; }

# Launch agents
for label in "${APP_ID}.server" "${APP_ID}.menubar"; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null && say "stopped $label"
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done

# Apps
pkill -f "${APP_NAME}Bar" 2>/dev/null
rm -rf "$HOME/Applications/${APP_NAME}Bar.app" && say "removed menu bar app"
rm -rf "$HOME/Desktop/${APP_NAME}.app" && say "removed Desktop launcher"

# Any leftover server process
pkill -f "node server.js" 2>/dev/null || true

# Log
rm -f "$HOME/Library/Logs/${APP_NAME}.log"

# Claude Desktop MCP entry (best effort)
if command -v node >/dev/null; then
  node -e '
    const fs = require("fs");
    const p = process.env.HOME + "/Library/Application Support/Claude/claude_desktop_config.json";
    try {
      const c = JSON.parse(fs.readFileSync(p, "utf8"));
      if (c.mcpServers && c.mcpServers["playhub-steam"]) {
        delete c.mcpServers["playhub-steam"];
        fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
        console.log("[playhub] removed MCP entry (restart Claude Desktop to apply)");
      }
    } catch {}
  ' || true
fi

if [ "$PURGE" = "1" ]; then
  rm -f "$REPO_DIR/.env"
  rm -rf "$REPO_DIR/web/cache" "$REPO_DIR/web/backups"
  say "purged .env, caches and shader-cache backups"
fi

say ""
say "✅ PlayHub uninstalled."
if [ "$PURGE" = "0" ]; then
  say "   Your .env, caches and shader-cache backups were kept."
  say "   Re-install anytime with ./install.sh — or delete this folder to remove everything."
else
  say "   Delete this folder to remove the last traces."
fi
