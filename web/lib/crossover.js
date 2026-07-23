// CrossOver bottle discovery + D3DMetal shader-cache backup/restore.
//
// Where the D3DMetal shader cache actually lives (verified on this machine,
// CrossOver 26 / macOS 27):
//   $DARWIN_USER_CACHE_DIR/d3dm/<ExeName>.exe/shaders.cache/<GPUFamily>/*.bin
// i.e. NOT inside the bottle. Entries are keyed by Windows executable name,
// so we attribute each entry to a bottle by checking which bottle contains
// that .exe under its drive_c.
//
// We also report the in-bottle Steam shadercache (steamapps/shadercache) when
// present, since Steam-in-CrossOver setups use it too. Chromium/CEF caches
// (htmlcache) are deliberately excluded — they're browser caches, not shader
// caches.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const HOME = os.homedir();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CROSSOVER_ROOT = path.join(
  HOME,
  "Library/Application Support/CrossOver"
);
export const BOTTLES_ROOT = path.join(CROSSOVER_ROOT, "Bottles");
export const BACKUP_ROOT = path.join(__dirname, "..", "backups");

let cachedDarwinCacheDir = null;
export async function darwinCacheDir() {
  if (cachedDarwinCacheDir) return cachedDarwinCacheDir;
  const { stdout } = await execFileP("getconf", ["DARWIN_USER_CACHE_DIR"]);
  cachedDarwinCacheDir = stdout.trim();
  return cachedDarwinCacheDir;
}

export async function d3dmRoot() {
  return path.join(await darwinCacheDir(), "d3dm");
}

async function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  let newestMtime = 0;
  async function walk(d, depth) {
    if (depth > 8) return;
    let ents;
    try {
      ents = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else if (e.isFile()) {
        files += 1;
        try {
          const st = await fsp.stat(full);
          bytes += st.size;
          if (st.mtimeMs > newestMtime) newestMtime = st.mtimeMs;
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(dir, 0);
  return {
    file_count: files,
    size_bytes: bytes,
    last_modified: newestMtime ? new Date(newestMtime).toISOString() : null,
  };
}

// Does this bottle contain an executable with the given name?
// Uses `find -print -quit` for an early-exit search.
async function bottleHasExe(bottlePath, exeName) {
  const driveC = path.join(bottlePath, "drive_c");
  try {
    const { stdout } = await execFileP("find", [
      driveC,
      "-name",
      exeName,
      "-type",
      "f",
      "-print",
      "-quit",
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// List all D3DMetal cache entries (one per exe) with stats.
async function listD3dmEntries() {
  const root = await d3dmRoot();
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    out.push({ exe: e.name, path: full, ...(await dirStats(full)) });
  }
  return out;
}

// In-bottle Steam shadercache (steamapps/shadercache/<appid>), if any.
async function steamShaderCaches(bottlePath) {
  const results = [];
  const scRoot = path.join(
    bottlePath,
    "drive_c/Program Files (x86)/Steam/steamapps/shadercache"
  );
  let entries = [];
  try {
    entries = await fsp.readdir(scRoot, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(scRoot, e.name);
    results.push({
      type: "steam",
      label: `Steam shadercache (appid ${e.name})`,
      path: full,
      ...(await dirStats(full)),
    });
  }
  return results;
}

// Map Steam appid -> D3DMetal cache stats, by locating each cache entry's
// exe inside the game's install dir. Positive matches are memoized.
const exeToAppid = new Map();

export async function getShaderCacheByAppid() {
  const result = {};
  const entries = (await listD3dmEntries()).filter((e) => e.file_count > 0);
  if (!entries.length) return result;

  let bottles = [];
  try {
    bottles = (await fsp.readdir(BOTTLES_ROOT, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return result;
  }

  for (const bottle of bottles) {
    const appsDir = path.join(
      BOTTLES_ROOT,
      bottle,
      "drive_c/Program Files (x86)/Steam/steamapps"
    );
    let manifests = [];
    try {
      manifests = (await fsp.readdir(appsDir)).filter((f) =>
        /^appmanifest_\d+\.acf$/.test(f)
      );
    } catch {
      continue;
    }
    for (const mf of manifests) {
      let appid = null;
      let installdir = null;
      try {
        const txt = await fsp.readFile(path.join(appsDir, mf), "utf8");
        appid = Number((txt.match(/"appid"\s+"(\d+)"/) || [])[1]);
        installdir = (txt.match(/"installdir"\s+"([^"]+)"/) || [])[1];
      } catch {
        continue;
      }
      if (!appid || !installdir) continue;
      const gameDir = path.join(appsDir, "common", installdir);
      for (const entry of entries) {
        const memo = exeToAppid.get(entry.exe);
        let match = memo === appid;
        if (memo === undefined) {
          try {
            const { stdout } = await execFileP("find", [
              gameDir,
              "-name",
              entry.exe,
              "-type",
              "f",
              "-print",
              "-quit",
            ]);
            match = stdout.trim().length > 0;
            if (match) exeToAppid.set(entry.exe, appid);
          } catch {
            match = false;
          }
        }
        if (match) {
          result[appid] = {
            exe: entry.exe,
            size_bytes: entry.size_bytes,
            file_count: entry.file_count,
            last_modified: entry.last_modified,
          };
        }
      }
    }
  }
  return result;
}

export async function listBottles() {
  let entries = [];
  try {
    entries = await fsp.readdir(BOTTLES_ROOT, { withFileTypes: true });
  } catch {
    return { root_exists: fs.existsSync(CROSSOVER_ROOT), bottles: [] };
  }
  const bottleNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !n.startsWith("."));

  const d3dmEntries = await listD3dmEntries();
  const claimed = new Set();

  const bottles = [];
  for (const name of bottleNames) {
    const bottlePath = path.join(BOTTLES_ROOT, name);
    const isBottle =
      fs.existsSync(path.join(bottlePath, "drive_c")) ||
      fs.existsSync(path.join(bottlePath, "cxbottle.conf"));
    if (!isBottle) continue;

    const caches = [];
    for (const entry of d3dmEntries) {
      if (await bottleHasExe(bottlePath, entry.exe)) {
        claimed.add(entry.exe);
        caches.push({
          type: "d3dmetal",
          label: `D3DMetal: ${entry.exe}`,
          path: entry.path,
          file_count: entry.file_count,
          size_bytes: entry.size_bytes,
          last_modified: entry.last_modified,
        });
      }
    }
    caches.push(...(await steamShaderCaches(bottlePath)));

    bottles.push({
      name,
      path: bottlePath,
      caches,
      has_cache: caches.some((c) => c.file_count > 0),
      backups: await listBackups(name),
    });
  }
  bottles.sort((a, b) => a.name.localeCompare(b.name));

  // D3DMetal entries whose exe wasn't found in any bottle (e.g. deleted games).
  const unclaimed = d3dmEntries
    .filter((e) => !claimed.has(e.exe))
    .map((e) => ({
      type: "d3dmetal",
      label: `D3DMetal: ${e.exe}`,
      path: e.path,
      file_count: e.file_count,
      size_bytes: e.size_bytes,
      last_modified: e.last_modified,
    }));

  return {
    root_exists: true,
    d3dm_root: await d3dmRoot(),
    bottles,
    unclaimed_caches: unclaimed,
  };
}

function safeName(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function listBackups(bottleName) {
  const dir = path.join(BACKUP_ROOT, safeName(bottleName));
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const backups = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const manifestPath = path.join(dir, e.name, "manifest.json");
    try {
      const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
      backups.push({ id: e.name, ...manifest });
    } catch {
      /* skip incomplete backup */
    }
  }
  backups.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return backups;
}

// Back up every detected shader-cache dir for a bottle.
export async function backupShaderCache(bottleName, { auto = false } = {}) {
  const { bottles } = await listBottles();
  const bottle = bottles.find((b) => b.name === bottleName);
  if (!bottle) throw new Error(`Bottle not found: ${bottleName}`);
  const caches = bottle.caches.filter((c) => c.file_count > 0);
  if (!caches.length) {
    throw new Error(
      `No shader cache with content detected for "${bottleName}". Run a game once with D3DMetal, then try again.`
    );
  }

  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const destRoot = path.join(BACKUP_ROOT, safeName(bottleName), id);
  await fsp.mkdir(destRoot, { recursive: true });

  const items = [];
  for (let i = 0; i < caches.length; i++) {
    const cache = caches[i];
    const subdir = `cache_${i}_${safeName(path.basename(cache.path))}`;
    const dest = path.join(destRoot, subdir);
    await fsp.cp(cache.path, dest, { recursive: true });
    items.push({
      subdir,
      type: cache.type,
      label: cache.label,
      original_path: cache.path,
      file_count: cache.file_count,
      size_bytes: cache.size_bytes,
    });
  }

  const manifest = {
    bottle: bottleName,
    created_at: new Date().toISOString(),
    auto,
    items,
    total_files: items.reduce((s, x) => s + x.file_count, 0),
    total_bytes: items.reduce((s, x) => s + x.size_bytes, 0),
  };
  await fsp.writeFile(
    path.join(destRoot, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  return { id, ...manifest };
}

// Safe bottle cleanup: empties Windows/Wine temp dirs inside the bottle.
// Refuses to run while any Wine process is alive (files could be in use).
const TEMP_RELPATHS = [
  "drive_c/windows/temp",
  "drive_c/users/crossover/Temp",
  "drive_c/users/crossover/AppData/Local/Temp",
];

async function wineIsRunning() {
  try {
    const { stdout } = await execFileP("pgrep", ["-if", "wineserver|wineloader|wine64-preloader"]);
    return stdout.trim().length > 0;
  } catch {
    return false; // pgrep exits 1 when no match
  }
}

export async function cleanBottleTemp(bottleName) {
  const bottlePath = path.join(BOTTLES_ROOT, bottleName);
  if (!fs.existsSync(path.join(bottlePath, "drive_c"))) {
    throw new Error(`Bottle not found: ${bottleName}`);
  }
  if (await wineIsRunning()) {
    throw new Error(
      "Wine processes are still running (a game or Steam in the bottle). Close them first and try again."
    );
  }

  let freedBytes = 0;
  let removedFiles = 0;
  const cleaned = [];
  for (const rel of TEMP_RELPATHS) {
    const dir = path.join(bottlePath, rel);
    let entries = [];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      continue; // temp dir doesn't exist in this bottle
    }
    let dirBytes = 0;
    let dirFiles = 0;
    for (const name of entries) {
      const target = path.join(dir, name);
      const stats = await dirOrFileSize(target);
      try {
        await fsp.rm(target, { recursive: true, force: true });
        dirBytes += stats.bytes;
        dirFiles += stats.files;
      } catch {
        /* locked/protected file — skip */
      }
    }
    freedBytes += dirBytes;
    removedFiles += dirFiles;
    cleaned.push({ dir: rel, freed_bytes: dirBytes, files_removed: dirFiles });
  }
  return {
    bottle: bottleName,
    freed_bytes: freedBytes,
    files_removed: removedFiles,
    cleaned,
  };
}

async function dirOrFileSize(target) {
  let bytes = 0;
  let files = 0;
  try {
    const st = await fsp.stat(target);
    if (st.isFile()) return { bytes: st.size, files: 1 };
    if (!st.isDirectory()) return { bytes: 0, files: 0 };
    const ents = await fsp.readdir(target, { withFileTypes: true });
    for (const e of ents) {
      const sub = await dirOrFileSize(path.join(target, e.name));
      bytes += sub.bytes;
      files += sub.files;
    }
  } catch {
    /* ignore */
  }
  return { bytes, files };
}

// Clear the D3DMetal shader caches for a bottle (to free disk space).
// Guards: no running Wine processes, and at least one backup must exist.
export async function clearShaderCache(bottleName) {
  if (await wineIsRunning()) {
    throw new Error(
      "Wine processes are still running (a game or Steam in the bottle). Close them first and try again."
    );
  }
  const backups = await listBackups(bottleName);
  if (!backups.length) {
    throw new Error("Take a backup first — clearing without a backup means recompiling from scratch.");
  }
  const { bottles } = await listBottles();
  const bottle = bottles.find((b) => b.name === bottleName);
  if (!bottle) throw new Error(`Bottle not found: ${bottleName}`);
  let freed = 0;
  let cleared = 0;
  for (const cache of bottle.caches) {
    if (cache.type !== "d3dmetal" || cache.file_count === 0) continue;
    freed += cache.size_bytes;
    cleared += 1;
    const entries = await fsp.readdir(cache.path).catch(() => []);
    for (const name of entries) {
      await fsp.rm(path.join(cache.path, name), { recursive: true, force: true });
    }
  }
  return { bottle: bottleName, caches_cleared: cleared, freed_bytes: freed };
}

// Restore a specific backup (or the latest) back to its original locations.
export async function restoreShaderCache(bottleName, backupId) {
  const backups = await listBackups(bottleName);
  if (!backups.length) throw new Error(`No backups exist for "${bottleName}".`);
  const backup = backupId
    ? backups.find((b) => b.id === backupId)
    : backups[0];
  if (!backup) throw new Error(`Backup not found: ${backupId}`);

  const backupRoot = path.join(BACKUP_ROOT, safeName(bottleName), backup.id);
  const restored = [];
  for (const item of backup.items) {
    const src = path.join(backupRoot, item.subdir);
    if (!fs.existsSync(src)) continue;
    await fsp.rm(item.original_path, { recursive: true, force: true });
    await fsp.mkdir(path.dirname(item.original_path), { recursive: true });
    await fsp.cp(src, item.original_path, { recursive: true });
    restored.push(item.original_path);
  }
  return {
    bottle: bottleName,
    restored_from: backup.id,
    restored_paths: restored,
  };
}
