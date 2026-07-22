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
    const { steamKey, steamId, itadKey, lang } = req.body || {};
    if (!steamKey || !/^\d{17}$/.test(String(steamId || ""))) {
      return res.status(400).json({ error: "missing_fields" });
    }
    await saveEnv({
      steamKey: steamKey.trim(),
      steamId: String(steamId),
      itadKey: (itadKey || "").trim() || undefined,
    });
    if (lang && ["en", "da"].includes(lang)) {
      appConfig.lang = lang;
      saveAppConfig().catch(() => {});
    }
    res.json({ ok: true });
  })
);

app.get(
  "/api/version",
  wrap(async (req, res) => {
    res.json(await getVersionInfo());
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
    if (!process.env.STEAM_API_KEY || !process.env.STEAM_ID) {
      return res.status(400).json({ error: "Not configured yet — complete the setup wizard." });
    }
    const [data, macInstalled, crossoverInstalled, cacheByAppid] =
      await Promise.all([
        getOwnedGames(),
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
    const windowsOnly = [];
    for (const g of data.games) {
      const meta = getMeta(g.appid);
      // Platform + CrossOver-kompatibilitet
      g.mac_native = meta?.mac_native ?? null; // null = ikke beriget endnu
      if (g.mac_native === false) {
        windowsOnly.push(g.name);
        const compat = getCompatCached(g.name);
        if (compat) {
          g.crossover_rating = compat.rating;
          g.crossover_url = compat.url;
        }
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

app.get(
  "/api/crossover/bottles",
  wrap(async (req, res) => {
    const data = await listBottles();
    res.json({
      ...data,
      crossover_root: CROSSOVER_ROOT,
      autobackup: getAutoBackupStatus(),
    });
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
      await execFileP("open", [`steam://rungameid/${id}`]);
      return res.json({ ok: true, method: "steam-url" });
    }
    if (target === "crossover") {
      if (!CROSSOVER_WINE) {
        return res.status(500).json({ error: "CrossOver.app was not found." });
      }
      if (!bottle || /[^A-Za-z0-9 ._-]/.test(bottle)) {
        return res.status(400).json({ error: "Invalid bottle name." });
      }
      // Fire-and-forget: booting Steam in the bottle can take a while.
      const child = spawn(
        CROSSOVER_WINE,
        [
          "--bottle", bottle,
          "C:\\Program Files (x86)\\Steam\\steam.exe",
          "-applaunch", String(id),
        ],
        { detached: true, stdio: "ignore" }
      );
      child.unref();
      return res.json({ ok: true, method: "crossover", bottle });
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
    res.json(await getAchievements({ appid: id }));
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
