// Steam wishlist + price alerts.
// Wishlist via IWishlistService (public endpoint). Names resolved lazily
// through SteamSpy (keyless, cached forever). Prices via the existing ITAD
// deals module. Alerts fire a macOS notification when a game's best price
// drops to/below the user's target (deduped: only re-notifies on a lower
// price than last notified).

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getDeals } from "./deals.js";
import { getMeta } from "./storemeta.js";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, "..", "cache", "wishlist.json");
const WISHLIST_TTL = 6 * 3600_000;
const ALERT_INTERVAL = 12 * 3600_000;

let store = { fetchedAt: 0, items: [], names: {}, targets: {}, notified: {} };
try {
  store = { ...store, ...JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) };
} catch {}
let dirty = false;
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fsp
    .mkdir(path.dirname(CACHE_FILE), { recursive: true })
    .then(() => fsp.writeFile(CACHE_FILE, JSON.stringify(store)))
    .catch(() => {});
}, 20_000).unref();

async function fetchWishlist(steamId) {
  const res = await fetch(
    `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${encodeURIComponent(steamId)}`
  );
  if (!res.ok) throw new Error(`wishlist HTTP ${res.status}`);
  const j = await res.json();
  return (j?.response?.items || []).map((i) => ({
    appid: i.appid,
    priority: i.priority || 0,
    date_added: i.date_added || null,
  }));
}

// Navne-opløsning i baggrunden (SteamSpy, keyless, 1/s).
let nameQueue = [];
let nameRunning = false;
function enqueueNames(appids) {
  const missing = appids.filter((id) => !store.names[id]);
  nameQueue = [...new Set([...nameQueue, ...missing])];
  if (!nameRunning && nameQueue.length) runNameQueue();
}
async function runNameQueue() {
  nameRunning = true;
  try {
    while (nameQueue.length) {
      const id = nameQueue.shift();
      // Prøv først storemeta (gratis hvis allerede beriget)
      const meta = getMeta(id);
      if (meta?.name) {
        store.names[id] = meta.name;
        dirty = true;
        continue;
      }
      try {
        const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${id}`);
        if (res.ok) {
          const j = await res.json();
          if (j?.name) {
            store.names[id] = j.name;
            dirty = true;
          }
        }
      } catch {}
      // SteamSpy kender ikke helt nye/uudgivne spil — fald tilbage til Steams appdetails.
      if (!store.names[id]) {
        try {
          const res = await fetch(
            `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`
          );
          if (res.ok) {
            const j = await res.json();
            const name = j?.[id]?.data?.name;
            if (name) {
              store.names[id] = name;
              dirty = true;
            }
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1600));
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
  } finally {
    nameRunning = false;
  }
}

export async function getWishlist() {
  const steamId = process.env.STEAM_ID;
  if (!steamId) return { enabled: false, reason: "no_steamid" };

  if (Date.now() - store.fetchedAt > WISHLIST_TTL) {
    try {
      store.items = await fetchWishlist(steamId);
      store.fetchedAt = Date.now();
      dirty = true;
    } catch {
      /* behold gammel liste */
    }
  }
  const items = [...store.items].sort((a, b) => a.priority - b.priority || b.date_added - a.date_added);
  enqueueNames(items.map((i) => i.appid));

  // Priser fra ITAD (cached 12t i deals-modulet)
  const pairs = items.slice(0, 30).map((i) => ({
    appid: i.appid,
    title: store.names[i.appid] || String(i.appid),
  }));
  let deals = {};
  try {
    const d = await getDeals(pairs);
    if (d.enabled) deals = d.deals || {};
  } catch {}

  return {
    enabled: true,
    items: items.slice(0, 30).map((i) => {
      const best = deals[i.appid]?.best || null;
      const target = store.targets[i.appid] ?? null;
      return {
        appid: i.appid,
        name: store.names[i.appid] || `App ${i.appid}`,
        header_image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${i.appid}/header.jpg`,
        best,
        target,
        alert: Boolean(target !== null && best && typeof best.price_dkk === "number" && best.price_dkk <= target),
      };
    }),
    total: store.items.length,
  };
}

export function setTarget(appid, target) {
  if (target === null || target === "" || isNaN(Number(target))) {
    delete store.targets[appid];
    delete store.notified[appid];
  } else {
    store.targets[appid] = Number(target);
  }
  dirty = true;
  return { ok: true, target: store.targets[appid] ?? null };
}

async function macNotify(title, message) {
  const escq = (s) => String(s).replace(/"/g, '\\"');
  await execFileP("osascript", [
    "-e",
    `display notification "${escq(message)}" with title "${escq(title)}" sound name "Glass"`,
  ]).catch(() => {});
}

export async function checkPriceAlerts() {
  const wl = await getWishlist();
  if (!wl.enabled) return { alerts: 0 };
  let fired = 0;
  for (const item of wl.items) {
    if (!item.alert || !item.best) continue;
    const last = store.notified[item.appid];
    if (typeof last === "number" && item.best.price_dkk >= last) continue; // allerede varslet
    await macNotify(
      "PlayHub price alert",
      `${item.name}: ${item.best.price_dkk} ${item.best.price_currency || "EUR"} at ${item.best.shop} (target ${store.targets[item.appid]})`
    );
    store.notified[item.appid] = item.best.price_dkk;
    dirty = true;
    fired++;
  }
  return { alerts: fired };
}

export function startPriceAlertWatch() {
  // Første tjek kort efter opstart, derefter hver 12. time.
  setTimeout(() => checkPriceAlerts().catch(() => {}), 90_000).unref();
  setInterval(() => checkPriceAlerts().catch(() => {}), ALERT_INTERVAL).unref();
}
