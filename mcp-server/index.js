#!/usr/bin/env node
// GameHub Steam MCP server (Part 1).
// Exposes three tools over stdio for Claude Desktop:
//   - get_owned_games          (GetOwnedGames, with playtime, most-played first)
//   - get_recently_played_games(GetRecentlyPlayedGames)
//   - get_achievements         (GetPlayerAchievements for one appid)

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  getOwnedGames,
  getRecentlyPlayedGames,
  getAchievements,
} from "./steam.js";

// Load the shared .env from the project root (one level up from mcp-server/).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
// Also allow a local .env inside mcp-server/ as a fallback.
dotenv.config({ path: path.join(__dirname, ".env") });

const server = new McpServer({
  name: "gamehub-steam",
  version: "1.0.0",
});

function jsonResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

function errorResult(err) {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
  };
}

server.tool(
  "get_owned_games",
  "Get your full Steam library with total playtime per game, sorted by most played first. Optionally override the SteamID.",
  {
    steamId: z
      .string()
      .optional()
      .describe("64-bit SteamID to query. Defaults to STEAM_ID from .env."),
  },
  async ({ steamId }) => {
    try {
      return jsonResult(await getOwnedGames({ steamId }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_recently_played_games",
  "Get the games you've played in the last two weeks, with recent and total playtime.",
  {
    steamId: z
      .string()
      .optional()
      .describe("64-bit SteamID to query. Defaults to STEAM_ID from .env."),
    count: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max number of games to return."),
  },
  async ({ steamId, count }) => {
    try {
      return jsonResult(await getRecentlyPlayedGames({ steamId, count }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_achievements",
  "Get your achievements for a single game (by appid): which are unlocked, when, and overall completion percentage.",
  {
    appid: z
      .number()
      .int()
      .positive()
      .describe("Steam appid of the game (e.g. 1520). Get it from get_owned_games."),
    steamId: z
      .string()
      .optional()
      .describe("64-bit SteamID to query. Defaults to STEAM_ID from .env."),
  },
  async ({ appid, steamId }) => {
    try {
      return jsonResult(await getAchievements({ appid, steamId }));
    } catch (err) {
      return errorResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: never log to stdout — it's the JSON-RPC channel. Use stderr.
  console.error("gamehub-steam MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting gamehub-steam MCP server:", err);
  process.exit(1);
});
