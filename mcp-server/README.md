# GameHub Steam MCP server (Part 1)

A local [MCP](https://modelcontextprotocol.io) server that exposes your Steam
data to Claude Desktop over stdio.

## Tools

| Tool | Steam endpoint | What it returns |
|------|----------------|-----------------|
| `get_owned_games` | `GetOwnedGames` | Your full library with total playtime per game, sorted most-played first (incl. header/cover image URLs). |
| `get_recently_played_games` | `GetRecentlyPlayedGames` | Games played in the last two weeks. |
| `get_achievements` | `GetPlayerAchievements` (+ `GetSchemaForGame` for names) | Unlocked/locked achievements and completion % for one game (`appid`). |

## Setup

1. Copy the env template and fill in your own values:
   ```bash
   cp ../.env.example ../.env
   # edit ../.env → STEAM_API_KEY and STEAM_ID
   ```
   - API key: https://steamcommunity.com/dev/apikey
   - SteamID64: https://steamid.io
   - Your Steam profile's **Game details** must be **Public** for `GetOwnedGames`
     and achievements to be visible.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Test with real calls:
   ```bash
   npm run test:steam   # hits the Steam API directly
   node test-mcp.js     # spins up the server and calls a tool over stdio
   ```

## Register in Claude Desktop

Run the registration script — it resolves the correct node and repo paths
for your machine, backs up the config, and only touches this one entry:

```bash
node ../scripts/register-mcp.mjs
```

Then **fully quit and reopen Claude Desktop** (Cmd+Q — not just closing the
window) to load the server. Look for the tools under the 🔌 / tools menu.
