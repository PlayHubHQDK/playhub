// Price comparison via IsThereAnyDeal (ITAD) + affiliate link decoration.
//
// ITAD requires a free API key (https://isthereanydeal.com/apps/) in .env as
// ITAD_API_KEY. Without it, price comparison is disabled and the API says so.
//
// Affiliate slots (all optional, empty by default — fill in when the partner
// programs are approved). Each is a query-string suffix appended to that
// shop's URLs:
//   AFFILIATE_SUFFIX_HUMBLE      e.g. "partner=gamehub"
//   AFFILIATE_SUFFIX_FANATICAL   e.g. "ref=gamehub"
//   AFFILIATE_SUFFIX_GMG         e.g. "tap_a=xxx&tap_s=yyy"
//   AFFILIATE_IG_REF             Instant Gaming ref tag (e.g. "gamehub").
//                                Grey market — disabled unless set.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "deals.json");
const DEALS_TTL = 12 * 3600_000;
const ITAD = "https://api.isthereanydeal.com";

// Kun officielle/autoriserede butikker fra ITAD-data.
const SHOP_WHITELIST = new Map([
  ["steam", "Steam"],
  ["humblestore", "Humble"],
  ["humble store", "Humble"],
  ["fanatical", "Fanatical"],
  ["greenmangaming", "GMG"],
  ["gamesplanet", "Gamesplanet"],
  ["gog", "GOG"],
]);

const AFFILIATE_SUFFIX = {
  Humble: process.env.AFFILIATE_SUFFIX_HUMBLE || "",
  Fanatical: process.env.AFFILIATE_SUFFIX_FANATICAL || "",
  GMG: process.env.AFFILIATE_SUFFIX_GMG || "",
};

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
} catch {
  /* empty */
}
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fsp
    .mkdir(path.dirname(CACHE_FILE), { recursive: true })
    .then(() => fsp.writeFile(CACHE_FILE, JSON.stringify(cache)))
    .catch(() => {});
}, 30_000).unref();

function decorate(shopLabel, url) {
  const suffix = AFFILIATE_SUFFIX[shopLabel];
  if (!suffix || !url) return { url, affiliate: false };
  return {
    url: url + (url.includes("?") ? "&" : "?") + suffix,
    affiliate: true,
  };
}

export function affiliatesActive() {
  return (
    Object.values(AFFILIATE_SUFFIX).some(Boolean) ||
    Boolean(process.env.AFFILIATE_IG_REF)
  );
}

export function instantGamingLink(title) {
  const ref = process.env.AFFILIATE_IG_REF;
  if (!ref) return null;
  return `https://www.instant-gaming.com/en/search/?q=${encodeURIComponent(
    title
  )}&igr=${encodeURIComponent(ref)}`;
}

async function itadLookup(key, appid) {
  const res = await fetch(
    `${ITAD}/games/lookup/v1?key=${key}&appid=${appid}`
  );
  if (!res.ok) throw new Error(`ITAD lookup HTTP ${res.status}`);
  const j = await res.json();
  return j?.found ? j.game?.id : null;
}

async function itadPrices(key, gameIds) {
  const res = await fetch(
    `${ITAD}/games/prices/v2?key=${key}&country=DK&nondeals=true&vouchers=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gameIds),
    }
  );
  if (!res.ok) throw new Error(`ITAD prices HTTP ${res.status}`);
  return res.json();
}

// Batch: appids -> {appid: {best, deals[], ig_url}}
export async function getDeals(appidTitlePairs) {
  const key = process.env.ITAD_API_KEY;
  if (!key) return { enabled: false, reason: "ITAD_API_KEY missing in .env" };

  const now = Date.now();
  const result = {};
  const toLookup = [];

  for (const { appid, title } of appidTitlePairs) {
    const hit = cache[appid];
    if (hit && now - hit.fetchedAt < DEALS_TTL) {
      result[appid] = { ...hit.data, ig_url: instantGamingLink(title) };
    } else {
      toLookup.push({ appid, title });
    }
  }

  if (toLookup.length) {
    // 1) appid -> ITAD game id
    const idMap = new Map();
    for (const { appid } of toLookup) {
      try {
        const gid = await itadLookup(key, appid);
        if (gid) idMap.set(gid, appid);
      } catch {
        /* skip */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    // 2) priser i én batch
    if (idMap.size) {
      try {
        const prices = await itadPrices(key, [...idMap.keys()]);
        for (const entry of prices || []) {
          const appid = idMap.get(entry.id);
          if (!appid) continue;
          const deals = [];
          for (const d of entry.deals || []) {
            const shopName = (d.shop?.name || "").toLowerCase().replace(/[^a-z ]/g, "");
            const label = SHOP_WHITELIST.get(shopName);
            if (!label) continue;
            const { url, affiliate } = decorate(label, d.url);
            deals.push({
              shop: label,
              price_dkk: d.price?.amount ?? null,
              price_currency: d.price?.currency || "EUR",
              regular_dkk: d.regular?.amount ?? null,
              cut_pct: d.cut || 0,
              url,
              affiliate,
            });
          }
          deals.sort((a, b) => (a.price_dkk ?? 1e9) - (b.price_dkk ?? 1e9));
          const data = { best: deals[0] || null, deals: deals.slice(0, 5) };
          cache[appid] = { fetchedAt: Date.now(), data };
          dirty = true;
          const title = toLookup.find((t) => t.appid === appid)?.title || "";
          result[appid] = { ...data, ig_url: instantGamingLink(title) };
        }
      } catch {
        /* prices batch fejlede — cache intet */
      }
    }
  }

  return { enabled: true, deals: result, affiliates_active: affiliatesActive() };
}
