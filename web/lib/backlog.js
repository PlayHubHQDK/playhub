// Backlog i timer: dine uspillede spil målt i HowLongToBeat "Main Story".
//
// HLTB slås op i en langsom baggrundskø (2,5 s mellem opslag — uofficielt
// API) og caches 7 dage i hltb-modulet. Endpointet svarer med det, der er
// beregnet indtil nu + hvor mange der mangler, så UI'et kan vise fremdrift.

import { hltbLookup } from "./hltb.js";

const DELAY_MS = 2500;

let queue = [];
let running = false;
const status = { scanned: 0, total: 0 };

// name -> { main_h } | { found: false } (i process-hukommelse; disk-cache i hltb.js)
const results = new Map();

function enqueue(names) {
  const missing = names.filter((n) => !results.has(n));
  queue = [...new Set([...queue, ...missing])];
  status.total = results.size + queue.length;
  if (!running && queue.length) runQueue();
}

async function runQueue() {
  running = true;
  try {
    while (queue.length) {
      const name = queue.shift();
      try {
        // hltbLookup rammer kun netværket ved cache-miss (7d TTL).
        results.set(name, await hltbLookup(name));
      } catch {
        results.set(name, { found: false });
      }
      status.scanned = results.size;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  } finally {
    running = false;
  }
}

// Uspillet = under 1 times spilletid. En påbegyndt aften tæller som spillet.
export function backlogGames(games) {
  return games.filter(
    (g) => g.playtime_forever_min < 60 && !/demo|soundtrack|test|server/i.test(g.name)
  );
}

export function getBacklog(games) {
  const backlog = backlogGames(games);
  enqueue(backlog.map((g) => g.name));

  let hours = 0;
  let estimated = 0;
  const heaviest = [];
  for (const g of backlog) {
    const r = results.get(g.name);
    if (!r?.found || !r.main_h) continue;
    hours += r.main_h;
    estimated++;
    heaviest.push({ name: g.name, main_h: r.main_h });
  }
  heaviest.sort((a, b) => b.main_h - a.main_h);

  return {
    backlog_games: backlog.length,
    estimated_games: estimated,
    pending: backlog.length - estimated,
    total_main_hours: Math.round(hours),
    days: Math.round(hours / 24),
    heaviest: heaviest.slice(0, 5),
  };
}
