// GameHub web interface (Part 2).
// Local Express server — dark gamer dashboard.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";

// PlayHub requires Node 18+ (built-in fetch).
if (typeof fetch !== "function") {
  console.error(
    "PlayHub requires Node.js 18 or newer (built-in fetch). Current version: " +
      process.version
  );
  process.exit(1);
}

import { getOwnedGames, getAchievements } from "../mcp-server/steam.js";
import {
  getNativeGames,
  getSteamInstalledGames,
  getCrossoverInstalledGames,
} from "./lib/native.js";
import {
  listBottles,
  backupShaderCache,
  restoreShaderCache,
  getShaderCacheByAppid,
  cleanBottleTemp,
  clearShaderCache,
  rewarmBottle,
  pruneBackups,
  backupsTotalBytes,
  CROSSOVER_ROOT,
} from "./lib/crossover.js";
import { startAutoBackup, getAutoBackupStatus } from "./lib/autobackup.js";
import { hltbLookup } from "./lib/hltb.js";
import {
  enqueueEnrichment,
  getEnrichmentStatus,
  getMeta,
  REVIEW_LEVELS_DA,
} from "./lib/storemeta.js";
import { recommend, buildGenreProfile } from "./lib/recommend.js";
import { discover } from "./lib/discover.js";
import { getDeals } from "./lib/deals.js";
import { getVersionInfo } from "./lib/version.js";
import { getCompatCached, enqueueCompat } from "./lib/maccompat.js";
import { getLocalLibrary, localSteamAvailable } from "./lib/localsteam.js";
import { getAnticheat } from "./lib/anticheat.js";
import { runDoctor, applyFix } from "./lib/doctor.js";
import { getWishlist, setTarget, checkPriceAlerts, startPriceAlertWatch } from "./lib/wishlist.js";
import { getYearReview, getAchievementHunt } from "./lib/yearreview.js";
import { getMachine, expectation } from "./lib/machine.js";
import { getPerfReports, reportsFor } from "./lib/perfdata.js";
import {
  isConfigured,
  resolveSteamId,
  validateCreds,
  saveEnv,
} from "./lib/setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Serve native app icons (converts .icns to png on the fly via sips).
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
const execFileP = promisify(execFile);

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  });

// App config (UI language etc.) — persisted per machine.
const CONFIG_FILE = path.join(__dirname, "cache", "config.json");
let appConfig = { lang: "en" };
try {
  appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
} catch {
  /* defaults */
}
async function saveAppConfig() {
  await fs.promises.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
}

// Launch options per spil (persisteret)
const LAUNCHOPTS_FILE = path.join(__dirname, "cache", "launchopts.json");
let launchOpts = {};
try {
  launchOpts = JSON.parse(fs.readFileSync(LAUNCHOPTS_FILE, "utf8"));
} catch {}
async function saveLaunchOpts() {
  await fs.promises.mkdir(path.dirname(LAUNCHOPTS_FILE), { recursive: true });
  await fs.promises.writeFile(LAUNCHOPTS_FILE, JSON.stringify(launchOpts, null, 2));
}

app.get("/api/launchopts/:appid", (req, res) => {
  res.json({ opts: launchOpts[req.params.appid] || "" });
});
app.post("/api/launchopts/:appid", (req, res) => {
  const opts = String(req.body?.opts || "").slice(0, 200).trim();
  if (opts) launchOpts[req.params.appid] = opts;
  else delete launchOpts[req.params.appid];
  saveLaunchOpts().catch(() => {});
  res.json({ ok: true, opts });
});

// Bottle Doctor + auto-fixes
app.get(
  "/api/crossover/doctor/:bottle",
  wrap(async (req, res) => {
    res.json(await runDoctor(req.params.bottle));
  })
);
app.post(
  "/api/crossover/fix",
  wrap(async (req, res) => {
    const { bottle, fix } = req.body || {};
    if (!bottle || !fix) return res.status(400).json({ error: "Missing 'bottle'/'fix'." });
    res.json(await applyFix(bottle, fix));
  })
);

// Prune gamle backups
app.post(
  "/api/crossover/prune",
  wrap(async (req, res) => {
    const { bottle, keep } = req.body || {};
    if (!bottle) return res.status(400).json({ error: "Missing 'bottle'." });
    res.json(await pruneBackups(bottle, Math.max(1, Number(keep) || 3)));
  })
);

// Wishlist + prisalarmer
app.get(
  "/api/wishlist",
  wrap(async (req, res) => {
    res.json(await getWishlist());
  })
);
app.post("/api/wishlist/target", (req, res) => {
  const { appid, target } = req.body || {};
  if (!Number.isInteger(Number(appid))) return res.status(400).json({ error: "bad appid" });
  res.json(setTarget(Number(appid), target));
});
app.post(
  "/api/wishlist/check",
  wrap(async (req, res) => {
    res.json(await checkPriceAlerts());
  })
);

app.get(
  "/api/yearreview",
  wrap(async (req, res) => {
    res.json(await getYearReview());
  })
);
app.get(
  "/api/achievement-hunt",
  wrap(async (req, res) => {
    res.json(await getAchievementHunt());
  })
);

// --- First-run setup ---
app.get("/api/setup/status", (req, res) => {
  res.json({ configured: isConfigured() });
});

app.post(
  "/api/setup/validate",
  wrap(async (req, res) => {
    const { steamKey, steamIdInput } = req.body || {};
    if (!steamKey || !steamIdInput) {
      return res.status(400).json({ error: "missing_fields" });
    }
    try {
      const steamId = await resolveSteamId(steamKey.trim(), steamIdInput);
      const result = await validateCreds(steamKey.trim(), steamId);
      res.json(result);
    } catch (err) {
      res.json({ valid: false, error: String(err.message || err) });
    }
  })
);

app.post(
  "/api/setup/save",
  wrap(async (req, res) => {
    const { steamKey, steamId, itadKey, lang, mode } = req.body || {};
    if (mode === "local") {
      if (!localSteamAvailable()) {
        return res.status(400).json({ error: "No local Steam installation found on this Mac." });
      }
      await saveEnv({ mode: "local", itadKey: (itadKey || "").trim() || undefined });
    } else {
      if (!steamKey || !/^\d{17}$/.test(String(steamId || ""))) {
        return res.status(400).json({ error: "missing_fields" });
      }
      await saveEnv({
        steamKey: steamKey.trim(),
        steamId: String(steamId),
        itadKey: (itadKey || "").trim() || undefined,
      });
    }
    if (lang && ["en", "da"].includes(lang)) {
      appConfig.lang = lang;
      saveAppConfig().catch(() => {});
    }
    res.json({ ok: true });
  })
);

app.post(
  "/api/update",
  wrap(async (req, res) => {
    const repoRoot = path.join(__dirname, "..");
    if (!fs.existsSync(path.join(repoRoot, ".git"))) {
      return res.status(400).json({ error: "Not a git checkout — update manually." });
    }
    try {
      const { stdout } = await execFileP("git", ["pull", "--ff-only"], { cwd: repoRoot });
      const changed = !/Already up to date/i.test(stdout);
      if (changed) {
        // Geninstallér afhængigheder hvis lock-filer ændrede sig (best effort)
        await execFileP("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
          cwd: path.join(repoRoot, "web"),
        }).catch(() => {});
        await execFileP("npm", ["install", "--silent", "--no-audit", "--no-fund"], {
          cwd: path.join(repoRoot, "mcp-server"),
        }).catch(() => {});
      }
      res.json({ ok: true, updated: changed });
      if (changed) {
        // launchd (KeepAlive) genstarter serveren med den nye kode.
        setTimeout(() => process.exit(0), 600);
      }
    } catch (err) {
      res.status(500).json({
        error:
          "git pull failed — local changes? Update manually with: git pull. (" +
          String(err.message || err).split("\n")[0] +
          ")",
      });
    }
  })
);

app.get(
  "/api/version",
  wrap(async (req, res) => {
    res.json(await getVersionInfo());
  })
);

app.get(
  "/api/machine",
  wrap(async (req, res) => {
    res.json(await getMachine());
  })
);

app.get("/api/config", (req, res) => {
  res.json({ ...appConfig, app_name: "PlayHub" });
});
app.post("/api/config", (req, res) => {
  const { lang } = req.body || {};
  if (lang && ["en", "da"].includes(lang)) appConfig.lang = lang;
  saveAppConfig().catch(() => {});
  res.json({ ...appConfig, app_name: "PlayHub" });
});

app.get(
  "/api/steam/library",
  wrap(async (req, res) => {
    const useApi = Boolean(process.env.STEAM_API_KEY && process.env.STEAM_ID);
    if (!useApi && process.env.STEAM_MODE !== "local") {
      return res.status(400).json({ error: "Not configured yet — complete the setup wizard." });
    }
    const [data, macInstalled, crossoverInstalled, cacheByAppid] =
      await Promise.all([
        useApi ? getOwnedGames() : getLocalLibrary(),
        getSteamInstalledGames(),
        getCrossoverInstalledGames(),
        getShaderCacheByAppid(),
      ]);
    const macSet = new Set(
      macInstalled.filter((g) => g.installed).map((g) => g.appid)
    );
    const xoMap = new Map(
      crossoverInstalled.map((g) => [g.appid, g.bottle])
    );
    for (const g of data.games) {
      g.installed_on = macSet.has(g.appid)
        ? "mac"
        : xoMap.has(g.appid)
        ? "crossover"
        : null;
      if (g.installed_on === "crossover") {
        g.bottle = xoMap.get(g.appid);
        g.shader_cache = cacheByAppid[g.appid] || null;
      }
    }
    // Kick off (or refresh) background store-metadata enrichment,
    // and attach whatever metadata is already cached.
    enqueueEnrichment(data.games.map((g) => g.appid));
    const mac = await getMachine();
    const perfAll = await getPerfReports();
    const windowsOnly = [];
    for (const g of data.games) {
      const meta = getMeta(g.appid);
      // Platform + CrossOver-kompatibilitet
      g.mac_native = meta?.mac_native ?? null; // null = ikke beriget endnu
      g.controller_support = meta?.controller_support ?? null; // "full" | "partial" | null
      // Ydelse på DENNE Mac: kalibreret forventning + egne beviser + community
      g.perf_expectation = expectation(
        { ...g, genres: meta?.genres, release_year: meta?.release_year },
        mac
      );
      g.proven_on_this_mac = Boolean(
        g.installed_on && (g.shader_cache?.size_bytes > 0 || g.playtime_forever_min > 0)
      );
      g.perf_reports = reportsFor(g.appid, mac, perfAll);
      if (g.mac_native === false) {
        windowsOnly.push(g.name);
        const compat = getCompatCached(g.name);
        if (compat) {
          g.crossover_rating = compat.rating;
          g.crossover_url = compat.url;
        }
        const ac = getAnticheat(g.appid, g.name);
        if (ac) g.anticheat = ac;
      }
      if (meta?.review_score_desc) {
        g.review_score_desc = meta.review_score_desc;
        g.review_score_desc_da =
          REVIEW_LEVELS_DA[meta.review_score_desc] || meta.review_score_desc;
        g.review_positive_pct = meta.total_reviews
          ? Math.round((meta.total_positive / meta.total_reviews) * 100)
          : null;
        g.metacritic = meta.metacritic ?? null;
      }
    }
    enqueueCompat(windowsOnly);
    data.mode = useApi ? "api" : "local";
    // Installed games first, then by playtime within each group.
    data.games.sort((a, b) => {
      const ai = a.installed_on ? 0 : 1;
      const bi = b.installed_on ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return b.playtime_forever_min - a.playtime_forever_min;
    });
    res.json(data);
  })
);

app.get(
  "/api/native-games",
  wrap(async (req, res) => {
    res.json(await getNativeGames());
  })
);

// Viste stier skal ikke afsløre brugernavnet (fx i screenshots) — forkort
// hjemmemappen til ~ i alt hvad UI'et viser. Kun til visning; handlinger
// bruger bottle-/backup-navne, aldrig disse strenge.
function tidyPaths(value) {
  const home = os.homedir();
  return JSON.parse(JSON.stringify(value).replaceAll(home, "~"));
}

app.get(
  "/api/crossover/bottles",
  wrap(async (req, res) => {
    const data = await listBottles();
    const cachesTotal = data.bottles.reduce(
      (s, b) => s + b.caches.reduce((x, c) => x + c.size_bytes, 0),
      0
    );
    res.json(tidyPaths({
      ...data,
      crossover_root: CROSSOVER_ROOT,
      autobackup: getAutoBackupStatus(),
      caches_total_bytes: cachesTotal,
      backups_total_bytes: await backupsTotalBytes(),
    }));
  })
);

app.post(
  "/api/crossover/backup",
  wrap(async (req, res) => {
    const { bottle } = req.body || {};
    if (!bottle) return res.status(400).json({ error: "Missing 'bottle'." });
    res.json(await backupShaderCache(bottle));
  })
);

app.post(
  "/api/crossover/restore",
  wrap(async (req, res) => {
    const { bottle, backupId } = req.body || {};
    if (!bottle) return res.status(400).json({ error: "Missing 'bottle'." });
    res.json(await restoreShaderCache(bottle, backupId));
  })
);

// Launch a game: native via steam:// URL, CrossOver via wine into the bottle.
const CROSSOVER_WINE = [
  path.join(os.homedir(), "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine"),
  "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
].find((p) => fs.existsSync(p));

app.post(
  "/api/launch",
  wrap(async (req, res) => {
    const { appid, target, bottle } = req.body || {};
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid appid." });
    }
    if (target === "mac") {
      const steamApp = [
        "/Applications/Steam.app",
        path.join(os.homedir(), "Applications/Steam.app"),
      ].find((p) => fs.existsSync(p));
      if (!steamApp) {
        return res.status(500).json({ error: "Steam doesn't seem to be installed on this Mac." });
      }
      const optsMac = launchOpts[String(id)];
      await execFileP("open", [
        optsMac
          ? `steam://run/${id}//${encodeURIComponent(optsMac)}/`
          : `steam://rungameid/${id}`,
      ]);
      return res.json({ ok: true, method: "steam-url" });
    }
    if (target === "crossover") {
      if (!CROSSOVER_WINE) {
        return res.status(500).json({ error: "CrossOver.app was not found." });
      }
      if (!bottle || /[^A-Za-z0-9 ._-]/.test(bottle)) {
        return res.status(400).json({ error: "Invalid bottle name." });
      }
      // Auto-rewarm: gendan manglende/forringede shader-caches fra backup
      // inden launch (sekunder i stedet for minutters genkompilering).
      const rewarm = await rewarmBottle(bottle).catch(() => null);
      // Fire-and-forget: booting Steam in the bottle can take a while.
      const child = spawn(
        CROSSOVER_WINE,
        [
          "--bottle", bottle,
          "C:\\Program Files (x86)\\Steam\\steam.exe",
          "-applaunch", String(id),
          ...(launchOpts[String(id)] ? launchOpts[String(id)].split(/\s+/) : []),
        ],
        { detached: true, stdio: "ignore" }
      );
      child.unref();
      return res.json({ ok: true, method: "crossover", bottle, rewarm });
    }
    res.status(400).json({ error: "target must be 'mac' or 'crossover'." });
  })
);

app.get(
  "/api/recommendations",
  wrap(async (req, res) => {
    const data = await getOwnedGames();
    const [macInstalled, crossoverInstalled] = await Promise.all([
      getSteamInstalledGames(),
      getCrossoverInstalledGames(),
    ]);
    const macSet = new Set(
      macInstalled.filter((g) => g.installed).map((g) => g.appid)
    );
    const xoMap = new Map(crossoverInstalled.map((g) => [g.appid, g.bottle]));
    for (const g of data.games) {
      g.installed_on = macSet.has(g.appid)
        ? "mac"
        : xoMap.has(g.appid)
        ? "crossover"
        : null;
      if (g.installed_on === "crossover") g.bottle = xoMap.get(g.appid);
    }
    res.json({
      ...recommend(data.games),
      enrichment: getEnrichmentStatus(),
    });
  })
);

app.get(
  "/api/discover",
  wrap(async (req, res) => {
    const data = await getOwnedGames();
    const profile = {};
    for (const p of Object.entries(buildGenreProfile(data.games))) {
      profile[p[0]] = p[1];
    }
    res.json(
      await discover(
        data.games.map((g) => g.appid),
        profile
      )
    );
  })
);

app.post(
  "/api/deals",
  wrap(async (req, res) => {
    const pairs = (req.body?.games || [])
      .filter((g) => Number.isInteger(g.appid) && g.appid > 0)
      .slice(0, 30)
      .map((g) => ({ appid: g.appid, title: String(g.title || "").slice(0, 120) }));
    if (!pairs.length) return res.status(400).json({ error: "Missing 'games'." });
    res.json(await getDeals(pairs));
  })
);

app.get(
  "/api/hltb",
  wrap(async (req, res) => {
    const name = String(req.query.name || "").slice(0, 200);
    if (!name) return res.status(400).json({ error: "Missing 'name'." });
    try {
      res.json(await hltbLookup(name));
    } catch (err) {
      // Unofficial API — degrade gracefully instead of 500.
      res.json({ found: false, error: String(err.message || err) });
    }
  })
);

app.get(
  "/api/steam/achievements/:appid",
  wrap(async (req, res) => {
    const id = Number(req.params.appid);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "bad appid" });
    }
    if (!process.env.STEAM_API_KEY) {
      return res.json({
        appid: id,
        success: false,
        error: "Achievements require a Steam Web API key — add one to .env (STEAM_API_KEY).",
        achievements: [],
      });
    }
    res.json(await getAchievements({ appid: id }));
  })
);

app.post(
  "/api/crossover/clearcache",
  wrap(async (req, res) => {
    const { bottle } = req.body || {};
    if (!bottle) return res.status(400).json({ error: "Missing 'bottle'." });
    res.json(await clearShaderCache(bottle));
  })
);

app.post(
  "/api/crossover/clean",
  wrap(async (req, res) => {
    const { bottle } = req.body || {};
    if (!bottle) return res.status(400).json({ error: "Missing 'bottle'." });
    res.json(await cleanBottleTemp(bottle));
  })
);

// Artwork lookup for games missing on the classic CDN (new releases use
// hashed store_item_assets URLs only discoverable via the appdetails API).
const ARTWORK_CACHE_FILE = path.join(__dirname, "cache", "artwork.json");
let artworkCache = {};
try {
  artworkCache = JSON.parse(fs.readFileSync(ARTWORK_CACHE_FILE, "utf8"));
} catch {
  /* start empty */
}
async function saveArtworkCache() {
  await fs.promises.mkdir(path.dirname(ARTWORK_CACHE_FILE), { recursive: true });
  await fs.promises.writeFile(
    ARTWORK_CACHE_FILE,
    JSON.stringify(artworkCache, null, 2)
  );
}

app.get(
  "/api/steam/artwork/:appid",
  wrap(async (req, res) => {
    const id = Number(req.params.appid);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "bad appid" });
    if (artworkCache[id]) return res.json(artworkCache[id]);
    const r = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`
    );
    if (!r.ok) return res.status(502).json({ error: `appdetails HTTP ${r.status}` });
    const j = await r.json();
    const data = j?.[id]?.data || {};
    const art = {
      header_image: data.header_image || null,
      capsule_image: data.capsule_image || null,
    };
    artworkCache[id] = art;
    saveArtworkCache().catch(() => {});
    res.json(art);
  })
);

// Native app icon as PNG (icns -> png via macOS `sips`).
const ICON_CACHE = path.join(os.tmpdir(), "gamehub-icons");
fs.mkdirSync(ICON_CACHE, { recursive: true });
app.get(
  "/api/icon",
  wrap(async (req, res) => {
    const icns = req.query.path;
    if (!icns || typeof icns !== "string" || !icns.endsWith(".icns")) {
      return res.status(400).end();
    }
    if (!fs.existsSync(icns)) return res.status(404).end();
    const out = path.join(
      ICON_CACHE,
      Buffer.from(icns).toString("base64url") + ".png"
    );
    if (!fs.existsSync(out)) {
      try {
        await execFileP("sips", ["-s", "format", "png", "-Z", "128", icns, "--out", out]);
      } catch {
        return res.status(404).end();
      }
    }
    res.type("png").sendFile(out);
  })
);

const PORT = process.env.PORT || 4173;
const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`PlayHub running at http://127.0.0.1:${PORT}`);
  startAutoBackup();
  startPriceAlertWatch();
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use — is PlayHub already running? ` +
        "Set PORT in .env to use a different port."
    );
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
