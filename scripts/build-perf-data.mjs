#!/usr/bin/env node
// Compiles perf-report issues into docs/data/reports.json (the community
// performance "database" served by GitHub Pages). Run by GitHub Actions.

const REPO = process.env.GITHUB_REPOSITORY || "PlayHubHQDK/playhub";
const TOKEN = process.env.GITHUB_TOKEN;

async function fetchIssues() {
  const issues = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/issues?labels=perf-report&state=open&per_page=100&page=${page}`,
      { headers: { Accept: "application/vnd.github+json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) } }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    issues.push(...batch);
    if (batch.length < 100) break;
  }
  return issues;
}

// Issue-form bodies look like: "### Game\n\nDAVE THE DIVER\n\n### Steam App ID\n\n1868140\n..."
function parseBody(body) {
  const out = {};
  const parts = String(body || "").split(/^### /m).filter(Boolean);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    if (nl === -1) continue;
    const key = p.slice(0, nl).trim().toLowerCase();
    const value = p.slice(nl).replace(/_No response_/g, "").trim();
    out[key] = value;
  }
  return out;
}

const issues = await fetchIssues();
const reports = [];
for (const i of issues) {
  const f = parseBody(i.body);
  const appid = Number(f["steam app id"]);
  const rating = (f["how does it run?"] || "").split(" ")[0].replace(/[^a-z]/gi, "").toLowerCase();
  if (!appid || !["perfect", "good", "playable", "bad"].includes(rating)) continue;
  const chip = f["chip"] || "";
  const m = chip.match(/M(\d+)\s*(Pro|Max|Ultra)?/i);
  reports.push({
    appid,
    game: f["game"] || null,
    device: f["mac model"] || null,
    chip,
    chip_gen: m ? Number(m[1]) : null,
    variant: m?.[2] || "base",
    ram_gb: parseInt(f["ram (gb)"]) || null,
    via: f["running via"] || null,
    rating,
    fps: f["rough fps (optional)"] || null,
    reported_at: i.created_at,
    issue: i.number,
  });
}

const fs = await import("node:fs/promises");
await fs.mkdir("docs/data", { recursive: true });
await fs.writeFile(
  "docs/data/reports.json",
  JSON.stringify({ generated: new Date().toISOString(), count: reports.length, reports }, null, 1)
);
console.log(`Wrote ${reports.length} reports from ${issues.length} issues.`);
