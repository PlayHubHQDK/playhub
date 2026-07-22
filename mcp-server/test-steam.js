// Real-call smoke test for the Steam API layer.
// Run: node test-steam.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  getOwnedGames,
  getRecentlyPlayedGames,
  getAchievements,
} from "./steam.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, ".env") });

function line() {
  console.log("-".repeat(60));
}

async function main() {
  line();
  console.log("1) get_owned_games");
  const owned = await getOwnedGames();
  console.log(`   game_count: ${owned.game_count}`);
  console.log("   top 5 by playtime:");
  for (const g of owned.games.slice(0, 5)) {
    console.log(`   - ${g.name} (appid ${g.appid}) — ${g.playtime_forever_hours}h`);
  }

  line();
  console.log("2) get_recently_played_games");
  const recent = await getRecentlyPlayedGames();
  console.log(`   total_count: ${recent.total_count}`);
  for (const g of recent.games.slice(0, 5)) {
    console.log(`   - ${g.name} — ${g.playtime_2weeks_hours}h in last 2 weeks`);
  }

  line();
  console.log("3) get_achievements (for most-played game)");
  const target = owned.games[0];
  if (target) {
    const ach = await getAchievements({ appid: target.appid });
    if (ach.success) {
      console.log(
        `   ${target.name}: ${ach.unlocked}/${ach.total} unlocked (${ach.percent_complete}%)`
      );
    } else {
      console.log(`   ${target.name}: ${ach.error}`);
    }
  }
  line();
  console.log("OK — all three Steam calls returned.");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
