// Steam store metadata enrichment: review summary (appreviews) +
// Metacritic/genres (appdetails). Both are fetched slowly in the background
// with disk caching, so the store API rate limits are respected.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "storemeta.json");

// Refresh review data after 14 days; details (genres/MC) after 60 days.
const REVIEW_TTL = 14 * 24 * 3600_000;
const DETAILS_TTL = 60 * 24 * 3600_000;
const REVIEW_DELAY_MS = 400;   // ~2.5 req/s
const DETAILS_DELAY_MS = 1600; // appdetails is stricter (~200/5min)

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
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

const status = {
  total: 0,
  reviews_done: 0,
  details_done: 0,
  running: false,
  last_error: null,
};

function entry(appid) {
  return (cache[appid] ||= {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchReviewSummary(appid) {
  const res = await fetch(
    `https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&language=all&purchase_type=all`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`appreviews ${appid} HTTP ${res.status}`);
  const j = await res.json();
  const q = j?.query_summary;
  if (!q) return { missing: true };
  return {
    review_score: q.review_score ?? null, // 0-9
    review_score_desc: q.review_score_desc || null, // engelsk tekst
    total_positive: q.total_positive || 0,
    total_negative: q.total_negative || 0,
    total_reviews: q.total_reviews || 0,
  };
}

async function fetchDetails(appid) {
  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=dk`,
    { headers: { Accept: "application/json" } }
  );
  if (res.status === 429) throw new Error("appdetails rate limit (429)");
  if (!res.ok) throw new Error(`appdetails ${appid} HTTP ${res.status}`);
  const j = await res.json();
  const d = j?.[appid];
  if (!d?.success || !d.data) return { missing: true };
  // Minimum-RAM fra systemkravene — det bedste enkelt-signal for hvor
  // tungt et spil reelt er (genre+årstal gætter alt for groft).
  const reqText = String(d.data.pc_requirements?.minimum || d.data.mac_requirements?.minimum || "")
    .replace(/<[^>]+>/g, " ");
  const reqMatch = reqText.match(/Memory:\s*([\d.]+)\s*(GB|MB)/i) || reqText.match(/([\d.]+)\s*GB\s*RAM/i);
  const pc_req_ram_gb = reqMatch
    ? Math.round(Number(reqMatch[1]) / (String(reqMatch[2] || "GB").toUpperCase() === "MB" ? 1024 : 1) * 10) / 10
    : null;
  return {
    name: d.data.name || null,
    pc_req_ram_gb,
    mac_native: Boolean(d.data.platforms?.mac),
    metacritic: d.data.metacritic?.score ?? null,
    metacritic_url: d.data.metacritic?.url || null,
    genres: (d.data.genres || []).map((g) => g.description),
    controller_support: d.data.controller_support || null, // "full" | "partial" | null
    short_description: d.data.short_description || null,
    release_year:
      Number((d.data.release_date?.date || "").match(/\d{4}/)?.[0]) || null,
  };
}

let queue = [];
let running = false;

// Enrich the given appids in the background. Reviews first (fast, most
// valuable), then details. Safe to call repeatedly.
export function enqueueEnrichment(appids) {
  queue = [...new Set(appids)];
  status.total = queue.length;
  if (!running) runQueue();
}

async function runQueue() {
  running = true;
  status.running = true;
  const now = Date.now();
  try {
    // Pass 1: review summaries
    for (const id of queue) {
      const e = entry(id);
      if (e.reviews && now - (e.reviews_at || 0) < REVIEW_TTL) {
        status.reviews_done++;
        continue;
      }
      try {
        e.reviews = await fetchReviewSummary(id);
        e.reviews_at = Date.now();
        dirty = true;
        status.reviews_done++;
      } catch (err) {
        status.last_error = String(err.message || err);
      }
      await sleep(REVIEW_DELAY_MS);
    }
    // Pass 2: appdetails (metacritic + genrer)
    for (const id of queue) {
      const e = entry(id);
      if (
        e.details &&
        now - (e.details_at || 0) < DETAILS_TTL &&
        (e.details.missing ||
          (e.details.mac_native !== undefined &&
            e.details.name !== undefined &&
            e.details.controller_support !== undefined &&
            e.details.pc_req_ram_gb !== undefined))
      ) {
        status.details_done++;
        continue;
      }
      try {
        e.details = await fetchDetails(id);
        e.details_at = Date.now();
        dirty = true;
        status.details_done++;
      } catch (err) {
        status.last_error = String(err.message || err);
        if (String(err).includes("429")) await sleep(60_000); // back off
      }
      await sleep(DETAILS_DELAY_MS);
    }
  } finally {
    running = false;
    status.running = false;
    await persist();
  }
}

export function getEnrichmentStatus() {
  // Recount done from cache so restarts show correct progress.
  const now = Date.now();
  let r = 0;
  let d = 0;
  for (const id of queue) {
    const e = cache[id];
    if (e?.reviews && now - (e.reviews_at || 0) < REVIEW_TTL) r++;
    if (e?.details && now - (e.details_at || 0) < DETAILS_TTL) d++;
  }
  return { ...status, reviews_done: r, details_done: d };
}

export function getMeta(appid) {
  const e = cache[appid];
  if (!e) return null;
  return { ...(e.reviews || {}), ...(e.details || {}) };
}

export function getAllMeta() {
  const out = {};
  for (const [id, e] of Object.entries(cache)) {
    out[id] = { ...(e.reviews || {}), ...(e.details || {}) };
  }
  return out;
}

// Danske navne for Steams anmeldelsesniveauer.
export const REVIEW_LEVELS_DA = {
  "Overwhelmingly Positive": "Overvældende positive",
  "Very Positive": "Meget positive",
  "Positive": "Positive",
  "Mostly Positive": "Mest positive",
  "Mixed": "Blandede",
  "Mostly Negative": "Mest negative",
  "Negative": "Negative",
  "Very Negative": "Meget negative",
  "Overwhelmingly Negative": "Overvældende negative",
};
