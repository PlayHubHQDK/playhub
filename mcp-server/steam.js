// Thin wrapper around the parts of the Steam Web API we use.
// Shared by the MCP server (Part 1) and the web interface (Part 2).

const BASE = "https://api.steampowered.com";

function requireCreds() {
  const key = process.env.STEAM_API_KEY;
  const steamId = process.env.STEAM_ID;
  if (!key || !steamId) {
    throw new Error(
      "Missing STEAM_API_KEY and/or STEAM_ID. Copy .env.example to .env and fill them in."
    );
  }
  return { key, steamId };
}

async function steamGet(path, params) {
  const { key } = requireCreds();
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Steam API ${path} returned HTTP ${res.status} ${res.statusText}. ${body.slice(0, 300)}`
    );
  }
  return res.json();
}

// Header capsule image URL for a game (used by the web UI as a "cover").
export function headerImage(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

export function libraryCapsule(appid) {
  // Vertical box-art style capsule; falls back to header if missing.
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

function minutesToHours(min) {
  return Math.round(((min || 0) / 60) * 10) / 10;
}

// GetOwnedGames — full library with playtime, sorted by most played.
export async function getOwnedGames({ steamId } = {}) {
  const { steamId: defId } = requireCreds();
  const data = await steamGet("/IPlayerService/GetOwnedGames/v1/", {
    steamid: steamId || defId,
    include_appinfo: 1,
    include_played_free_games: 1,
    format: "json",
  });
  const games = (data?.response?.games || []).map((g) => ({
    appid: g.appid,
    name: g.name,
    playtime_forever_min: g.playtime_forever || 0,
    playtime_forever_hours: minutesToHours(g.playtime_forever),
    playtime_2weeks_min: g.playtime_2weeks || 0,
    playtime_2weeks_hours: minutesToHours(g.playtime_2weeks),
    last_played_unix: g.rtime_last_played || null,
    header_image: headerImage(g.appid),
    library_capsule: libraryCapsule(g.appid),
  }));
  games.sort((a, b) => b.playtime_forever_min - a.playtime_forever_min);
  return {
    game_count: data?.response?.game_count ?? games.length,
    games,
  };
}

// GetRecentlyPlayedGames — games played in the last 2 weeks.
export async function getRecentlyPlayedGames({ steamId, count } = {}) {
  const { steamId: defId } = requireCreds();
  const data = await steamGet("/IPlayerService/GetRecentlyPlayedGames/v1/", {
    steamid: steamId || defId,
    count,
    format: "json",
  });
  const games = (data?.response?.games || []).map((g) => ({
    appid: g.appid,
    name: g.name,
    playtime_2weeks_min: g.playtime_2weeks || 0,
    playtime_2weeks_hours: minutesToHours(g.playtime_2weeks),
    playtime_forever_min: g.playtime_forever || 0,
    playtime_forever_hours: minutesToHours(g.playtime_forever),
    header_image: headerImage(g.appid),
  }));
  return {
    total_count: data?.response?.total_count ?? games.length,
    games,
  };
}

// GetSchemaForGame — used to resolve achievement display names/descriptions.
async function getSchemaAchievements(appid) {
  try {
    const data = await steamGet("/ISteamUserStats/GetSchemaForGame/v2/", {
      appid,
      l: "english",
    });
    const list =
      data?.game?.availableGameStats?.achievements || [];
    const map = {};
    for (const a of list) {
      map[a.name] = {
        display_name: a.displayName,
        description: a.description || "",
        icon: a.icon,
        icon_gray: a.icongray,
        hidden: a.hidden === 1,
      };
    }
    return map;
  } catch {
    return {};
  }
}

// GetPlayerAchievements for a single game (appid required).
export async function getAchievements({ appid, steamId } = {}) {
  if (!appid) throw new Error("appid is required for getAchievements.");
  const { steamId: defId } = requireCreds();

  let data;
  try {
    data = await steamGet("/ISteamUserStats/GetPlayerAchievements/v1/", {
      appid,
      steamid: steamId || defId,
      l: "english",
    });
  } catch (err) {
    // Steam returns non-200 for games without stats / private profiles.
    return {
      appid,
      success: false,
      error: String(err.message || err),
      achievements: [],
    };
  }

  const resp = data?.playerstats;
  if (!resp || resp.success === false) {
    return {
      appid,
      success: false,
      error: resp?.error || "No achievement data (game may have no achievements or profile is private).",
      achievements: [],
    };
  }

  const schema = await getSchemaAchievements(appid);
  const achievements = (resp.achievements || []).map((a) => {
    const meta = schema[a.apiname] || {};
    return {
      api_name: a.apiname,
      name: meta.display_name || a.apiname,
      description: meta.description || "",
      achieved: a.achieved === 1,
      unlock_time_unix: a.unlocktime || null,
      icon: a.achieved === 1 ? meta.icon : meta.icon_gray,
    };
  });

  const unlocked = achievements.filter((a) => a.achieved).length;
  return {
    appid,
    game_name: resp.gameName || null,
    success: true,
    total: achievements.length,
    unlocked,
    percent_complete: achievements.length
      ? Math.round((unlocked / achievements.length) * 1000) / 10
      : 0,
    achievements,
  };
}
