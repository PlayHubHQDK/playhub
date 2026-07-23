// Anticheat status from AreWeAntiCheatYet (community data).
// Note: AWACY tracks Linux/Proton — but anticheat behaviour under
// CrossOver/Wine on Mac is typically the same or stricter, so it works
// well as a warning signal. Source credited in the UI.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "anticheat.json");
const TTL = 7 * 24 * 3600_000;
const URL =
  "https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json";

let cache = null; // { fetchedAt, byAppid: {}, byName: {} }
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
} catch {
  /* none */
}

const norm = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const res = await fetch(URL);
    if (!res.ok) return;
    const games = await res.json();
    const byAppid = {};
    const byName = {};
    for (const g of games) {
      const entry = {
        status: g.status, // Supported | Running | Planned | Broken | Denied
        anticheats: g.anticheats || [],
        url: g.slug ? `https://areweanticheatyet.com/game/${g.slug}` : null,
      };
      if (g.storeIds?.steam) byAppid[g.storeIds.steam] = entry;
      byName[norm(g.name)] = entry;
    }
    cache = { fetchedAt: Date.now(), byAppid, byName };
    await fsp.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fsp.writeFile(CACHE_FILE, JSON.stringify(cache));
  } catch {
    /* offline — behold gammel cache */
  } finally {
    refreshing = false;
  }
}

export function getAnticheat(appid, name) {
  if (!cache || Date.now() - cache.fetchedAt > TTL) {
    refresh(); // baggrund; svar med det vi har
  }
  if (!cache) return null;
  return cache.byAppid[String(appid)] || cache.byName[norm(name)] || null;
}
