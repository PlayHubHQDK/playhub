// Year in review + achievement hunt.
//
// Steam does not expose historical per-year playtime, so the year card is
// built honestly from what exists: last-played dates (games touched this
// year), achievement unlock timestamps (unlocked this year), and lifetime
// stats. The achievement hunt uses the public global-percentages endpoint
// to rank your missing achievements by how common they are (= easiest).

import { getOwnedGames, getAchievements } from "../../mcp-server/steam.js";
import { getLocalLibrary } from "./localsteam.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let yrCache = null; // { at, data }
let huntCache = null;

async function library() {
  return process.env.STEAM_API_KEY && process.env.STEAM_ID
    ? await getOwnedGames()
    : await getLocalLibrary();
}

// Kandidat-spil: rørt i år, ellers mest spillede med achievements-potentiale.
function thisYearGames(games, year) {
  return games.filter(
    (g) => g.last_played_unix && new Date(g.last_played_unix * 1000).getFullYear() === year
  );
}

export async function getYearReview() {
  if (yrCache && Date.now() - yrCache.at < 3600_000) return yrCache.data;
  const year = new Date().getFullYear();
  const { games } = await library();
  const played = games.filter((g) => g.playtime_forever_min > 0);
  const yearGames = thisYearGames(games, year).sort(
    (a, b) => b.last_played_unix - a.last_played_unix
  );

  // Achievements låst op i år (kræver nøgle; max 12 spil for at skåne API'et)
  let achievementsThisYear = null;
  const perGame = [];
  if (process.env.STEAM_API_KEY) {
    achievementsThisYear = 0;
    for (const g of yearGames.slice(0, 12)) {
      try {
        const a = await getAchievements({ appid: g.appid });
        if (a.success) {
          const n = a.achievements.filter(
            (x) => x.achieved && x.unlock_time_unix && new Date(x.unlock_time_unix * 1000).getFullYear() === year
          ).length;
          achievementsThisYear += n;
          if (n > 0) perGame.push({ name: g.name, unlocked: n });
        }
      } catch {}
      await sleep(300);
    }
  }

  const top = [...played].sort((a, b) => b.playtime_forever_min - a.playtime_forever_min)[0];
  const data = {
    year,
    games_played_this_year: yearGames.length,
    roster: yearGames.slice(0, 6).map((g) => ({
      name: g.name,
      hours: g.playtime_forever_hours,
      last_played: g.last_played_unix,
    })),
    achievements_this_year: achievementsThisYear,
    achievements_per_game: perGame.sort((a, b) => b.unlocked - a.unlocked).slice(0, 3),
    lifetime_hours: Math.round(played.reduce((s, g) => s + g.playtime_forever_min, 0) / 60),
    library_size: games.length,
    most_played: top ? { name: top.name, hours: Math.round(top.playtime_forever_hours) } : null,
  };
  yrCache = { at: Date.now(), data };
  return data;
}

async function globalPercents(appid) {
  const res = await fetch(
    `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`
  );
  if (!res.ok) return {};
  const j = await res.json();
  const map = {};
  for (const a of j?.achievementpercentages?.achievements || []) {
    map[a.name] = Number(a.percent);
  }
  return map;
}

export async function getAchievementHunt() {
  if (!process.env.STEAM_API_KEY) {
    return { enabled: false, reason: "Achievements require a Steam Web API key — add one to .env (STEAM_API_KEY)." };
  }
  if (huntCache && Date.now() - huntCache.at < 6 * 3600_000) return huntCache.data;
  const { games } = await library();
  const year = new Date().getFullYear();
  const candidates = [
    ...thisYearGames(games, year),
    ...games.filter((g) => g.playtime_forever_min > 120),
  ];
  const seen = new Set();
  const scan = [];
  for (const g of candidates) {
    if (seen.has(g.appid)) continue;
    seen.add(g.appid);
    scan.push(g);
    if (scan.length >= 10) break;
  }

  const hunt = [];
  for (const g of scan) {
    try {
      const a = await getAchievements({ appid: g.appid });
      if (!a.success || !a.total || a.unlocked === a.total) continue;
      const globals = await globalPercents(g.appid);
      for (const x of a.achievements) {
        if (x.achieved) continue;
        const pct = globals[x.api_name];
        if (typeof pct !== "number") continue;
        hunt.push({
          game: g.name,
          appid: g.appid,
          name: x.name,
          description: x.description,
          global_pct: Math.round(pct * 10) / 10,
        });
      }
    } catch {}
    await sleep(300);
  }
  hunt.sort((a, b) => b.global_pct - a.global_pct);
  // Variation: max 3 forslag per spil
  const perGameCount = {};
  const varied = hunt.filter((x) => {
    perGameCount[x.appid] = (perGameCount[x.appid] || 0) + 1;
    return perGameCount[x.appid] <= 3;
  });
  const data = { enabled: true, scanned: scan.length, hunt: varied.slice(0, 15) };
  huntCache = { at: Date.now(), data };
  return data;
}
