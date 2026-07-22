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
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers[ENTRY_NAME] = {
  command: process.execPath, // den node der kører dette script
  args: [serverPath],
};
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(
  `[mcp] '${ENTRY_NAME}' registered (${process.execPath} ${serverPath}).\n` +
    "[mcp] Restart Claude Desktop (Cmd+Q and reopen) to activate."
);
