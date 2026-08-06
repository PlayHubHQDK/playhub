#!/usr/bin/env node
// Registers the GameHub Steam MCP server in Claude Desktop's config —
// with paths resolved for the current user/machine. Safe: takes a backup
// and only touches the one mcpServers entry.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY_NAME = "playhub-steam";
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoDir, "mcp-server", "index.js");
const cfgPath = path.join(
  os.homedir(),
  "Library/Application Support/Claude/claude_desktop_config.json"
);

if (!fs.existsSync(path.dirname(cfgPath))) {
  console.log("[mcp] Claude Desktop does not seem to be installed — skipping.");
  process.exit(0);
}

let cfg = {};
if (fs.existsSync(cfgPath)) {
  const backup = `${cfgPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(cfgPath, backup);
  cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
}
// process.execPath can be a version-pinned Homebrew Cellar path
// (/opt/homebrew/Cellar/node/26.5.0/bin/node) that BREAKS when brew
// upgrades node — the old binary loses its dylibs. Prefer the stable
// opt-symlink, which always points at the current version.
function stableNodePath() {
  const exec = process.execPath;
  const m = exec.match(/^(.*)\/Cellar\/node(?:@\d+)?\/[^/]+\/bin\/node$/);
  if (m) {
    for (const candidate of [`${m[1]}/opt/node/bin/node`, `${m[1]}/bin/node`]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return exec;
}
const nodePath = stableNodePath();

cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers[ENTRY_NAME] = {
  command: nodePath,
  args: [serverPath],
};
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(
  `[mcp] '${ENTRY_NAME}' registered (${nodePath} ${serverPath}).\n` +
    "[mcp] Restart Claude Desktop (Cmd+Q and reopen) to activate."
);
