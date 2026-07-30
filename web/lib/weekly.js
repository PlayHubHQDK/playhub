// Ugentlig spille-opsummering som macOS-notifikation.
//
// Steam udstiller kun "sidste 2 uger", så vi laver rigtige uge-tal selv:
// et snapshot af playtime_forever per spil gemmes, og efter 7 dage er
// differencen præcis ugens spilletid. Derefter nyt snapshot.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getOwnedGames } from "../../mcp-server/steam.js";
import { getLocalLibrary } from "./localsteam.js";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "..", "cache", "weekly.json");
const WEEK_MS = 7 * 24 * 3600_000;
const CHECK_MS = 6 * 3600_000;

let state = { snapshotAt: 0, playtimes: {} };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
} catch {}
async function save() {
  await fsp.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fsp.writeFile(STATE_FILE, JSON.stringify(state));
}

async function library() {
  return process.env.STEAM_API_KEY && process.env.STEAM_ID
    ? await getOwnedGames()
    : await getLocalLibrary();
}

function diffs(games) {
  const out = [];
  for (const g of games) {
    const before = state.playtimes[g.appid] ?? null;
    if (before === null) continue; // nyt spil i biblioteket — tælles fra næste uge
    const d = g.playtime_forever_min - before;
    if (d > 0) out.push({ name: g.name, minutes: d });
  }
  return out.sort((a, b) => b.minutes - a.minutes);
}

async function snapshot(games) {
  state.playtimes = Object.fromEntries(games.map((g) => [g.appid, g.playtime_forever_min]));
  state.snapshotAt = Date.now();
  await save();
}

async function macNotify(title, message) {
  const escq = (s) => String(s).replace(/"/g, '\\"');
  await execFileP("osascript", [
    "-e",
    `display notification "${escq(message)}" with title "${escq(title)}" sound name "Glass"`,
  ]).catch(() => {});
}

const fmtH = (min) => (Math.round((min / 60) * 10) / 10).toLocaleString();

export async function weeklyCheck() {
  const { games } = await library();
  if (!state.snapshotAt) {
    await snapshot(games); // første kørsel: bare et nulpunkt, ingen notifikation
    return { started: true };
  }
  if (Date.now() - state.snapshotAt < WEEK_MS) {
    return { pending: true, days_left: Math.ceil((state.snapshotAt + WEEK_MS - Date.now()) / 86_400_000) };
  }
  const d = diffs(games);
  const total = d.reduce((s, x) => s + x.minutes, 0);
  if (total > 0) {
    const top = d[0];
    await macNotify(
      "PlayHub — your week in games",
      `${fmtH(total)} h played · most: ${top.name} (${fmtH(top.minutes)} h)`
    );
  }
  await snapshot(games);
  return { notified: total > 0, total_minutes: total, top: d.slice(0, 3) };
}

// Forhåndsvisning uden at nulstille snapshottet (til UI/verifikation).
export async function weeklyPreview() {
  const { games } = await library();
  if (!state.snapshotAt) {
    await snapshot(games);
    return { started: true, since: new Date(state.snapshotAt).toISOString() };
  }
  const d = diffs(games);
  return {
    since: new Date(state.snapshotAt).toISOString(),
    total_minutes: d.reduce((s, x) => s + x.minutes, 0),
    games: d.slice(0, 8),
  };
}

export function startWeeklySummary() {
  setTimeout(() => weeklyCheck().catch(() => {}), 120_000).unref();
  setInterval(() => weeklyCheck().catch(() => {}), CHECK_MS).unref();
}
