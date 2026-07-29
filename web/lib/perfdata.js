// Community performance reports.
//
// Reports live as GitHub issues (label perf-report) on the main repo. A
// GitHub Action compiles them into docs/data/reports.json which GitHub Pages
// serves — that file is our "database". Free, transparent, no server.

const DATA_URL = "https://playhubhqdk.github.io/playhub/data/reports.json";
const TTL = 24 * 3600_000;

let cache = { at: 0, data: null };

export async function getPerfReports() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  try {
    const res = await fetch(DATA_URL, { headers: { Accept: "application/json" } });
    if (res.ok) {
      cache = { at: Date.now(), data: await res.json() };
    }
  } catch {
    /* offline / ikke publiceret endnu — stille */
  }
  return cache.data;
}

function tally(reports) {
  const t = {};
  for (const r of reports) t[r.rating] = (t[r.rating] || 0) + 1;
  return t;
}

// Rapporter for ét spil, med undergruppe for samme chip-generation.
export function reportsFor(appid, mac, all) {
  const rs = (all?.reports || []).filter((r) => r.appid === Number(appid));
  if (!rs.length) return null;
  const sameGen = mac?.gen ? rs.filter((r) => r.chip_gen === mac.gen) : [];
  return {
    total: rs.length,
    summary: tally(rs),
    same_gen: sameGen.length,
    same_gen_summary: tally(sameGen),
  };
}
