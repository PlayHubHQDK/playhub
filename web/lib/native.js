// Discover "native Mac games" two ways:
//  1) Steam games installed on this Mac (scan steamapps across all libraries).
//  2) Apps in /Applications whose LSApplicationCategoryType is a game category.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const HOME = os.homedir();

const STEAM_ROOT = path.join(
  HOME,
  "Library/Application Support/Steam"
);

// --- tiny VDF/ACF parser (quoted "key" "value" + nested { } blocks) ---
function parseVdf(text) {
  const root = {};
  const stack = [root];
  let key = null;
  const tokenRe = /"((?:[^"\\]|\\.)*)"|\{|\}/g;
  let m;
  while ((m = tokenRe.exec(text))) {
    const tok = m[0];
    if (tok === "{") {
      const obj = {};
      stack[stack.length - 1][key] = obj;
      stack.push(obj);
      key = null;
    } else if (tok === "}") {
      stack.pop();
      key = null;
    } else {
      const val = m[1];
      if (key === null) {
        key = val;
      } else {
        stack[stack.length - 1][key] = val;
        key = null;
      }
    }
  }
  return root;
}

function steamLibraryPaths() {
  const libFile = path.join(STEAM_ROOT, "steamapps", "libraryfolders.vdf");
  const paths = new Set([STEAM_ROOT]);
  try {
    const parsed = parseVdf(fs.readFileSync(libFile, "utf8"));
    const folders = parsed.libraryfolders || {};
    for (const v of Object.values(folders)) {
      if (v && typeof v === "object" && v.path) paths.add(v.path);
    }
  } catch {
    /* default only */
  }
  return [...paths];
}

export async function getSteamInstalledGames() {
  const games = [];
  for (const lib of steamLibraryPaths()) {
    const appsDir = path.join(lib, "steamapps");
    let entries = [];
    try {
      entries = await fsp.readdir(appsDir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const parsed = parseVdf(
          await fsp.readFile(path.join(appsDir, f), "utf8")
        );
        const app = parsed.AppState || {};
        if (!app.appid) continue;
        const installDir = path.join(appsDir, "common", app.installdir || "");
        let installed = false;
        try {
          installed = fs.statSync(installDir).isDirectory();
        } catch {
          /* not installed on disk */
        }
        games.push({
          source: "steam",
          appid: Number(app.appid),
          name: app.name || app.installdir || `App ${app.appid}`,
          install_dir: installDir,
          installed,
          size_bytes: Number(app.SizeOnDisk || 0),
          header_image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${app.appid}/header.jpg`,
        });
      } catch {
        /* skip malformed manifest */
      }
    }
  }
  games.sort((a, b) => a.name.localeCompare(b.name));
  return games;
}

// Read one app's Info.plist as JSON via plutil (robust for binary plists).
async function readInfoPlist(appPath) {
  const plist = path.join(appPath, "Contents", "Info.plist");
  try {
    const { stdout } = await execFileP("plutil", [
      "-convert",
      "json",
      "-o",
      "-",
      plist,
    ]);
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

const GAME_CATEGORY_RE = /app-category\.(.*-)?games?$/i;

export async function getNativeAppGames(appsDir = "/Applications") {
  let entries = [];
  try {
    entries = await fsp.readdir(appsDir);
  } catch {
    return [];
  }
  const apps = entries.filter((e) => e.endsWith(".app"));
  const results = await Promise.all(
    apps.map(async (name) => {
      const appPath = path.join(appsDir, name);
      const info = await readInfoPlist(appPath);
      if (!info) return null;
      const category = info.LSApplicationCategoryType || "";
      if (!GAME_CATEGORY_RE.test(category)) return null;
      const icon = info.CFBundleIconFile
        ? path.join(appPath, "Contents", "Resources", info.CFBundleIconFile)
        : null;
      return {
        source: "application",
        name:
          info.CFBundleDisplayName ||
          info.CFBundleName ||
          name.replace(/\.app$/, ""),
        app_path: appPath,
        category,
        bundle_id: info.CFBundleIdentifier || null,
        version: info.CFBundleShortVersionString || null,
        icon_path: icon && fs.existsSync(icon) ? icon : null,
      };
    })
  );
  return results.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

// Steam games installed inside CrossOver bottles (Windows Steam).
export async function getCrossoverInstalledGames() {
  const bottlesRoot = path.join(
    HOME,
    "Library/Application Support/CrossOver/Bottles"
  );
  let bottles = [];
  try {
    bottles = (await fsp.readdir(bottlesRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const games = [];
  for (const bottle of bottles) {
    const appsDir = path.join(
      bottlesRoot,
      bottle,
      "drive_c/Program Files (x86)/Steam/steamapps"
    );
    let entries = [];
    try {
      entries = await fsp.readdir(appsDir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!/^appmanifest_\d+\.acf$/.test(f)) continue;
      try {
        const parsed = parseVdf(
          await fsp.readFile(path.join(appsDir, f), "utf8")
        );
        const app = parsed.AppState || {};
        if (!app.appid) continue;
        games.push({
          appid: Number(app.appid),
          name: app.name || `App ${app.appid}`,
          bottle,
        });
      } catch {
        /* skip malformed */
      }
    }
  }
  return games;
}

export async function getNativeGames() {
  const [steam, apps] = await Promise.all([
    getSteamInstalledGames(),
    getNativeAppGames(),
  ]);
  return {
    steam_installed: steam,
    applications: apps,
  };
}
