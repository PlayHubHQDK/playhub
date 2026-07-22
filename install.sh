#!/bin/bash
# PlayHub installer.
#   ./install.sh          # interactive
#   ./install.sh --yes    # non-interactive (assume yes to optional steps)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

say()  { printf '\033[1;36m[playhub]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[playhub]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- Prerequisites -----------------------------------------------------------
[ "$(uname)" = "Darwin" ] || fail "PlayHub only runs on macOS."

if ! command -v node >/dev/null; then
  if command -v brew >/dev/null; then
    fail "Node.js is required. Install it with:  brew install node   — then re-run ./install.sh"
  else
    fail "Node.js (>=18) is required. Get it from https://nodejs.org — then re-run ./install.sh"
  fi
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js >= 18 required (found $(node -v)). Please upgrade."
say "Node.js $(node -v) ✓"

if ! command -v swiftc >/dev/null; then
  say "NOTE: swiftc (Xcode Command Line Tools) not found — the menu bar app will be skipped."
  say "      Install later with:  xcode-select --install   then re-run scripts/setup.sh --menubar"
fi

# ---- Dependencies -------------------------------------------------------------
say "Installing dependencies (mcp-server)…"
(cd "$REPO_DIR/mcp-server" && npm install --silent --no-audit --no-fund)
say "Installing dependencies (web)…"
(cd "$REPO_DIR/web" && npm install --silent --no-audit --no-fund)

# ---- Generate user artifacts ---------------------------------------------------
say "Setting up launch agents, menu bar app and Desktop launcher…"
"$REPO_DIR/scripts/setup.sh" --services --menubar --desktop

# ---- Optional: Claude Desktop MCP ----------------------------------------------
CLAUDE_DIR="$HOME/Library/Application Support/Claude"
if [ -d "$CLAUDE_DIR" ]; then
  DO_MCP=0
  if [ "$ASSUME_YES" = "1" ]; then
    DO_MCP=1
  else
    printf '\033[1;36m[playhub]\033[0m Claude Desktop detected. Register the PlayHub Steam MCP server? [y/N] '
    read -r answer
    [ "$answer" = "y" ] || [ "$answer" = "Y" ] && DO_MCP=1
  fi
  if [ "$DO_MCP" = "1" ]; then
    "$REPO_DIR/scripts/setup.sh" --mcp
  fi
fi

# ---- Done -----------------------------------------------------------------------
say ""
say "✅ PlayHub is installed and running."
say "   Open:  http://127.0.0.1:4173   (or double-click PlayHub on your Desktop)"
say "   First run shows a setup wizard for your Steam API key."
say ""
say "   Uninstall anytime with:  ./uninstall.sh"
