// HowLongToBeat lookup via their (unofficial) "bleed" API.
// Flow: GET /api/bleed/init -> {token, hpKey, hpVal}; POST /api/bleed with
// those as headers AND hpKey/hpVal echoed into the JSON body.
// Results are cached to disk for 7 days; the security token for 2 minutes.
// NOTE: unofficial API — may break when HLTB changes their frontend.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "hltb.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const BASE = "https://howlongtobeat.com";

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
} catch {
  /* empty */
}
async function saveCache() {
  await fsp.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fsp.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

let security = null; // { token, hpKey, hpVal, fetchedAt }

async function getSecurity() {
  if (security && Date.now() - security.fetchedAt < 2 * 60_000) return security;
  const res = await fetch(`${BASE}/api/bleed/init?t=${Date.now()}`, {
    headers: { "User-Agent": UA, Referer: `${BASE}/` },
  });
  if (!res.ok) throw new Error(`HLTB init HTTP ${res.status}`);
  const j = await res.json();
  security = { ...j, fetchedAt: Date.now() };
  return security;
}

function cleanName(name) {
  return name
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const norm = (s) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function searchRaw(name) {
  const sec = await getSecurity();
  const body = {
    searchType: "games",
    searchTerms: cleanName(name).split(" ").filter(Boolean),
    searchPage: 1,
    size: 5,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  body[sec.hpKey] = sec.hpVal;
  const res = await fetch(`${BASE}/api/bleed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Referer: `${BASE}/`,
      Origin: BASE,
      "x-auth-token": sec.token,
      "x-hp-key": sec.hpKey,
      "x-hp-val": sec.hpVal,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 403) {
    security = null; // token expired — one retry with fresh token
    throw new Error("HLTB 403 (token udløbet)");
  }
  if (!res.ok) throw new Error(`HLTB search HTTP ${res.status}`);
  return res.json();
}

const secToH = (s) => (s ? Math.round((s / 3600) * 10) / 10 : null);

export async function hltbLookup(name) {
  const key = norm(name);
  const hit = cache[key];
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;

  let json;
  try {
    json = await searchRaw(name);
  } catch {
    json = await searchRaw(name); // ét retry (typisk udløbet token)
  }
  const results = json?.data || [];
  // Foretræk eksakt navnematch (eller alias), ellers første resultat.
  const exact = results.find(
    (r) => norm(r.game_name) === key || norm(r.game_alias || "") === key
  );
  const g = exact || results[0] || null;
  const data = g
    ? {
        found: true,
        game_id: g.game_id,
        name: g.game_name,
        main_h: secToH(g.comp_main),
        plus_h: secToH(g.comp_plus),
        completionist_h: secToH(g.comp_100),
        url: `${BASE}/game/${g.game_id}`,
      }
    : { found: false };
  cache[key] = { fetchedAt: Date.now(), data };
  saveCache().catch(() => {});
  return data;
}

// Rent cache-opslag — rører aldrig netværket (bruges af tonight-picks).
export function hltbCached(name) {
  const hit = cache[norm(name)];
  return hit ? hit.data : null;
}
