// Local mode: build the library by reading the Steam installation directly —
// no Steam Web API key required. Sources:
//   - localconfig.vdf (native Steam + every CrossOver bottle's Steam):
//     per-app Playtime (minutes) and LastPlayed
//   - appmanifest_*.acf: names for installed games
//   - storemeta cache: names for everything else (fills in as background
//     enrichment runs; until then games show as "App <id>")
// Coverage note: local files only know games this machine has touched —
// never-launched purchases won't appear. The API-key mode shows everything.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { headerImage, libraryCapsule } from "../../mcp-server/steam.js";
import { getSteamInstalledGames, getCrossoverInstalledGames } from "./native.js";
import { getMeta } from "./storemeta.js";

const HOME = os.homedir();

function localConfigPaths() {
  const paths = [];
  const roots = [path.join(HOME, "Library/Application Support/Steam/userdata")];
  const bottles = path.join(HOME, "Library/Application Support/CrossOver/Bottles");
  try {
    for (const b of fs.readdirSync(bottles)) {
      roots.push(
        path.join(bottles, b, "drive_c/Program Files (x86)/Steam/userdata")
      );
    }
  } catch {
    /* no bottles */
  }
  for (const root of roots) {
    try {
      for (const acc of fs.readdirSync(root)) {
        const p = path.join(root, acc, "config", "localconfig.vdf");
        if (fs.existsSync(p)) paths.push(p);
      }
    } catch {
      /* skip */
    }
  }
  return paths;
}

// Pull { appid: {playtime_min, last_played} } out of one localconfig.vdf.
function parseLocalConfig(text) {
  const out = {};
  const appsIdx = text.indexOf('"apps"');
  if (appsIdx === -1) return out;
  // App blocks look like: "220"\n{ ... "LastPlayed" "123" ... "Playtime" "199" ... }
  const re = /"(\d+)"\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  const section = text.slice(appsIdx);
  let m;
  while ((m = re.exec(section))) {
    const appid = Number(m[1]);
    const body = m[2];
    const playtime = Number((body.match(/"Playtime"\s+"(\d+)"/) || [])[1] || 0);
    const played2w = Number((body.match(/"Playtime2wks"\s+"(\d+)"/) || [])[1] || 0);
    const last = Number((body.match(/"LastPlayed"\s+"(\d+)"/) || [])[1] || 0);
    if (!playtime && !last) continue;
    out[appid] = {
      playtime_min: playtime,
      playtime_2weeks_min: played2w,
      last_played: last > 90000 ? last : null, // 86400 = "aldrig" sentinel
    };
  }
  return out;
}

export async function getLocalLibrary() {
  // 1) Merge playtime across every localconfig (native + bottles): take max.
  const merged = {};
  for (const p of localConfigPaths()) {
    let txt;
    try {
      txt = await fsp.readFile(p, "utf8");
    } catch {
      continue;
    }
    for (const [appid, v] of Object.entries(parseLocalConfig(txt))) {
      const cur = merged[appid];
      if (!cur) merged[appid] = { ...v };
      else {
        cur.playtime_min = Math.max(cur.playtime_min, v.playtime_min);
        cur.playtime_2weeks_min = Math.max(
          cur.playtime_2weeks_min,
          v.playtime_2weeks_min
        );
        cur.last_played = Math.max(cur.last_played || 0, v.last_played || 0) || null;
      }
    }
  }

  // 2) Names: installed manifests first, then storemeta cache.
  const names = new Map();
  try {
    for (const g of await getSteamInstalledGames()) names.set(g.appid, g.name);
  } catch {}
  try {
    for (const g of await getCrossoverInstalledGames()) {
      if (!names.has(g.appid)) names.set(g.appid, g.name);
    }
  } catch {}

  const games = Object.entries(merged).map(([id, v]) => {
    const appid = Number(id);
    const meta = getMeta(appid);
    return {
      appid,
      name: names.get(appid) || meta?.name || `App ${appid}`,
      playtime_forever_min: v.playtime_min,
      playtime_forever_hours: Math.round((v.playtime_min / 60) * 10) / 10,
      playtime_2weeks_min: v.playtime_2weeks_min,
      playtime_2weeks_hours: Math.round((v.playtime_2weeks_min / 60) * 10) / 10,
      last_played_unix: v.last_played,
      header_image: headerImage(appid),
      library_capsule: libraryCapsule(appid),
    };
  });
  games.sort((a, b) => b.playtime_forever_min - a.playtime_forever_min);
  return { game_count: games.length, games, mode: "local" };
}

export function localSteamAvailable() {
  return localConfigPaths().length > 0;
}
