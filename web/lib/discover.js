// "Køb-idéer": discover games the user does NOT own, matched to their genre
// profile. Candidate pool comes from SteamSpy's per-genre popularity lists
// (cached 24h); DKK prices + Metacritic are enriched in the background via
// Steam appdetails (cached 24h).

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "discover.json");
const GENRE_TTL = 24 * 3600_000;
const PRICE_TTL = 24 * 3600_000;
const TOP_PER_GENRE = 300;

let cache = { genres: {}, details: {} };
try {
  cache = { genres: {}, details: {}, ...JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) };
} catch {
  /* empty */
}
let dirty = false;
async function persist() {
  if (!dirty) return;
  dirty = false;
  await fsp.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fsp.writeFile(CACHE_FILE, JSON.stringify(cache));
}
setInterval(persist, 30_000).unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGenreList(genre) {
  const hit = cache.genres[genre];
  if (hit && Date.now() - hit.fetchedAt < GENRE_TTL) return hit.apps;
  const res = await fetch(
    `https://steamspy.com/api.php?request=genre&genre=${encodeURIComponent(genre)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`SteamSpy ${genre} HTTP ${res.status}`);
  const j = await res.json();
  // Behold kun top N efter antal positive anmeldelser (popularitets-proxy).
  const apps = Object.values(j)
    .map((a) => ({
      appid: a.appid,
      name: a.name,
      positive: a.positive || 0,
      negative: a.negative || 0,
      owners: a.owners || "",
    }))
    .filter((a) => a.name && a.positive + a.negative >= 500)
    .sort((a, b) => b.positive - a.positive)
    .slice(0, TOP_PER_GENRE);
  cache.genres[genre] = { fetchedAt: Date.now(), apps };
  dirty = true;
  return apps;
}

// Baggrunds-kø til DKK-pris/Metacritic via appdetails.
let detailQueue = [];
let detailRunning = false;
function enqueueDetails(appids) {
  const now = Date.now();
  const missing = appids.filter((id) => {
    const d = cache.details[id];
    return (
      !d ||
      now - d.fetchedAt > PRICE_TTL ||
      (!d.missing && (d.mac_native === undefined || d.pc_req_ram_gb === undefined))
    );
  });
  detailQueue = [...new Set([...detailQueue, ...missing])];
  if (!detailRunning && detailQueue.length) runDetailQueue();
}
async function runDetailQueue() {
  detailRunning = true;
  try {
    while (detailQueue.length) {
      const id = detailQueue.shift();
      try {
        const res = await fetch(
          `https://store.steampowered.com/api/appdetails?appids=${id}&cc=dk&l=english&filters=price_overview,metacritic,genres,release_date,basic,platforms,pc_requirements`
        );
        if (res.status === 429) {
          detailQueue.unshift(id);
          await sleep(60_000);
          continue;
        }
        const j = await res.json();
        const d = j?.[id];
        cache.details[id] = {
          fetchedAt: Date.now(),
          ...(d?.success && d.data
            ? {
                price_dkk: d.data.price_overview
                  ? d.data.price_overview.final / 100
                  : d.data.is_free
                  ? 0
                  : null,
                price_currency: d.data.price_overview?.currency || null,
                discount_pct: d.data.price_overview?.discount_percent || 0,
                mac_native: Boolean(d.data.platforms?.mac),
                pc_req_ram_gb: (() => {
                  const t = String(d.data.pc_requirements?.minimum || "").replace(/<[^>]+>/g, " ");
                  const m = t.match(/Memory:\s*([\d.]+)\s*(GB|MB)/i) || t.match(/([\d.]+)\s*GB\s*RAM/i);
                  return m
                    ? Math.round((Number(m[1]) / (String(m[2] || "GB").toUpperCase() === "MB" ? 1024 : 1)) * 10) / 10
                    : null;
                })(),
                metacritic: d.data.metacritic?.score ?? null,
                genres: (d.data.genres || []).map((g) => g.description),
                release_year:
                  Number(
                    (d.data.release_date?.date || "").match(/\d{4}/)?.[0]
                  ) || null,
                short_description: d.data.short_description || null,
              }
            : { missing: true }),
        };
        dirty = true;
      } catch {
        /* spring over — prøves igen efter TTL */
      }
      await sleep(1600);
    }
  } finally {
    detailRunning = false;
    persist().catch(() => {});
  }
}

export async function discover(ownedAppids, profile, { limit = 18 } = {}) {
  const owned = new Set(ownedAppids);
  const topGenres = Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([g]) => g)
    .filter((g) => g !== "Indie"); // "Indie" er for bred som opslagsgenre
  if (!topGenres.length) return { recommendations: [], genres_used: [] };

  // Hent genre-lister (cached; sekventielt af hensyn til SteamSpy).
  const byApp = new Map();
  for (const genre of topGenres) {
    let apps = [];
    try {
      apps = await fetchGenreList(genre);
    } catch {
      continue;
    }
    for (const a of apps) {
      if (owned.has(a.appid)) continue;
      const e = byApp.get(a.appid) || { ...a, matched_genres: [] };
      e.matched_genres.push(genre);
      byApp.set(a.appid, e);
    }
    await sleep(1000);
  }

  const scored = [];
  for (const a of byApp.values()) {
    const total = a.positive + a.negative;
    const posRatio = total ? a.positive / total : 0;
    if (posRatio < 0.7) continue; // kun godt modtagne spil som købs-idéer
    const genreScore = a.matched_genres.reduce(
      (s, g) => s + (profile[g] || 0),
      0
    );
    const volume = Math.min(1, Math.log10(total + 1) / 5);
    scored.push({
      ...a,
      review_positive_pct: Math.round(posRatio * 100),
      score: Math.round(genreScore * posRatio * (0.4 + 0.6 * volume) * 1000) / 1000,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  // Berig med DKK-pris/MC i baggrunden; vedhæft det vi allerede har.
  enqueueDetails(top.map((t) => t.appid));
  const now = Date.now();
  let enriched = 0;
  for (const t of top) {
    const d = cache.details[t.appid];
    if (d && !d.missing && now - d.fetchedAt < PRICE_TTL) {
      t.price_dkk = d.price_dkk;
      t.price_currency = d.price_currency || "EUR";
      t.discount_pct = d.discount_pct;
      t.metacritic = d.metacritic;
      t.mac_native = d.mac_native ?? null;
      t.pc_req_ram_gb = d.pc_req_ram_gb ?? null;
      t.genres = d.genres || [];
      t.release_year = d.release_year;
      t.short_description = d.short_description;
      enriched++;
    }
    t.header_image = `https://cdn.cloudflare.steamstatic.com/steam/apps/${t.appid}/header.jpg`;
    t.store_url = `https://store.steampowered.com/app/${t.appid}`;
    delete t.positive;
    delete t.negative;
  }
  return {
    recommendations: top,
    genres_used: topGenres,
    prices_enriched: enriched,
    prices_pending: top.length - enriched,
  };
}
