// CrossOver compatibility ratings from AppleGamingWiki (community data).
// Matching is by game name (AGW has no Steam appid field), with graceful
// "unknown" when a game has no page. Cached on disk for 30 days.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "maccompat.json");
const TTL = 30 * 24 * 3600_000;
const UA = "PlayHub/0.1 (github.com/PlayHubHQDK/playhub)";
const API = "https://www.applegamingwiki.com/w/api.php";

// AGW crossover-værdier -> normaliserede tiers.
const TIER = {
  perfect: "perfect",
  playable: "playable",
  runs: "runs",
  menu: "broken",
  unplayable: "broken",
  crashes: "broken",
  na: "unknown",
  unknown: "unknown",
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

function normName(name) {
  return String(name)
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const key = (name) => normName(name).toLowerCase();

// AGW lukkede for Cargo-forespørgsler i 2026 ("permissiondenied"), så vi
// læser {{Compatibility/macOS}}-skabelonen direkte fra sidens wikitext.
async function fetchWikitext(pageName) {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(
    pageName
  )}&redirects=1&format=json`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`AGW HTTP ${res.status}`);
  const j = await res.json();
  if (j?.error) throw new Error(`AGW ${j.error.code}`);
  const page = Object.values(j?.query?.pages || {})[0];
  if (!page || "missing" in page || "invalid" in page) return null;
  const text = page.revisions?.[0]?.slots?.main?.["*"] || "";
  return { page: page.title, text };
}

function templateField(block, field) {
  const m = block.match(new RegExp(`^\\|\\s*${field}\\s*=\\s*([^\\n]*)`, "mi"));
  return m ? m[1].trim() : "";
}

async function agwLookup(pageName) {
  const wiki = await fetchWikitext(pageName);
  if (!wiki) return null;
  const start = wiki.text.indexOf("{{Compatibility/macOS");
  if (start < 0) return null;
  // Ingen afgrænsning af skabelonens slutning: noter kan indeholde
  // fler-linjers ref-skabeloner, så første match efter starten vinder.
  const block = wiki.text.slice(start);
  return {
    page: wiki.page,
    crossover: (templateField(block, "crossover").match(/^\w*/) || [""])[0],
    parallels: (templateField(block, "parallels").match(/^\w*/) || [""])[0],
    crossoverNote: cleanWikiText(templateField(block, "crossover notes")) || null,
  };
}

// Forklaringsnote ("hvorfor virker det ikke") fra sidens wikitext.
function cleanWikiText(s) {
  return String(s)
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*$/g, "") // uafsluttet ref i slutningen
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function fetchCompat(name) {
  const clean = normName(name);
  // Prøv eksakt navn, dernæst uden kolon-undertitel-varianter.
  const candidates = [clean];
  if (clean.includes(":")) candidates.push(clean.split(":")[0].trim());
  for (const c of candidates) {
    try {
      const hit = await agwLookup(c);
      if (hit) {
        const raw = (hit.crossover || "unknown").toLowerCase();
        const rating = TIER[raw] || "unknown";
        // Kun broken/runs har brug for et "hvorfor".
        const note = ["broken", "runs"].includes(rating) ? hit.crossoverNote : null;
        return {
          rating,
          raw,
          note,
          page: hit.page,
          url: `https://www.applegamingwiki.com/wiki/${encodeURIComponent(
            hit.page.replace(/ /g, "_")
          )}`,
        };
      }
    } catch {
      return null; // netværksfejl — prøv igen senere (cacher ikke)
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { rating: "unknown", raw: null, page: null, url: null };
}

// Synkront opslag fra cache (bruges af library-endpointet).
export function getCompatCached(name) {
  const hit = cache[key(name)];
  if (hit && Date.now() - hit.fetchedAt < TTL) return hit.data;
  return null;
}

// Baggrunds-kø: slå kompatibilitet op for Windows-only spil, throttlet.
let queue = [];
let running = false;

export function enqueueCompat(names) {
  const now = Date.now();
  const missing = names
    .map(normName)
    .filter((n) => {
      const hit = cache[key(n)];
      if (!hit || now - hit.fetchedAt > TTL) return true;
      return (
        ["broken", "runs"].includes(hit.data?.rating) && hit.data?.note === undefined
      );
    });
  queue = [...new Set([...queue, ...missing])];
  if (!running && queue.length) runQueue();
}

async function runQueue() {
  running = true;
  try {
    while (queue.length) {
      const name = queue.shift();
      const data = await fetchCompat(name);
      if (data) {
        cache[key(name)] = { fetchedAt: Date.now(), data };
        dirty = true;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    running = false;
  }
}
