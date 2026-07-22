// Automatic D3DMetal shader-cache backup.
//
// Design goals: near-zero background cost.
//  - Every POLL_MS (default 5 min) we stat-walk the d3dm cache dirs only
//    (a handful of directories, ~10 files total) — no bottle scanning.
//  - A cache is backed up only when it has CHANGED since the last backup
//    AND has been quiet for QUIET_MS (default 10 min) — i.e. never while
//    a game is actively compiling shaders.
//  - Old automatic backups are pruned (keep newest KEEP_AUTO per bottle);
//    manual backups are never pruned.

import fsp from "node:fs/promises";
import path from "node:path";
import {
  d3dmRoot,
  listBottles,
  backupShaderCache,
  listBackups,
  BACKUP_ROOT,
} from "./crossover.js";

const POLL_MS = Number(process.env.GAMEHUB_AB_POLL_MS || 5 * 60_000);
const QUIET_MS = Number(process.env.GAMEHUB_AB_QUIET_MS || 10 * 60_000);
const KEEP_AUTO = Number(process.env.GAMEHUB_AB_KEEP || 5);

const status = {
  enabled: true,
  poll_minutes: Math.round(POLL_MS / 6000) / 10,
  quiet_minutes: Math.round(QUIET_MS / 6000) / 10,
  last_check: null,
  last_backup: null,
  last_backup_bottle: null,
  last_error: null,
};

// path -> { size, mtime, changedAt }
const seen = new Map();
// path -> signature at the time of the last completed backup
const backedUp = new Map();

async function dirSignature(dir) {
  let size = 0;
  let mtime = 0;
  let files = 0;
  async function walk(d, depth) {
    if (depth > 6) return;
    let ents;
    try {
      ents = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile()) {
        try {
          const st = await fsp.stat(full);
          size += st.size;
          files += 1;
          if (st.mtimeMs > mtime) mtime = st.mtimeMs;
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(dir, 0);
  return { size, mtime, files };
}

async function pruneAutoBackups(bottleName) {
  const backups = await listBackups(bottleName);
  const auto = backups.filter((b) => b.auto);
  for (const old of auto.slice(KEEP_AUTO)) {
    const dir = path.join(
      BACKUP_ROOT,
      bottleName.replace(/[^A-Za-z0-9._-]/g, "_"),
      old.id
    );
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function tick() {
  status.last_check = new Date().toISOString();
  try {
    const root = await d3dmRoot();
    let entries = [];
    try {
      entries = (await fsp.readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => path.join(root, e.name));
    } catch {
      return; // no d3dm dir yet
    }

    const now = Date.now();
    const dueForBackup = [];

    for (const dir of entries) {
      const sig = await dirSignature(dir);
      if (sig.files === 0) continue;
      const prev = seen.get(dir);
      if (!prev || prev.size !== sig.size || prev.mtime !== sig.mtime) {
        // Changed since last poll — (re)start the quiet timer.
        seen.set(dir, { ...sig, changedAt: now });
        continue;
      }
      // Unchanged since last poll. Quiet long enough?  Newer than last backup?
      const quietFor = now - (prev.changedAt ?? 0);
      const lastBk = backedUp.get(dir);
      const alreadyBackedUp =
        lastBk && lastBk.size === sig.size && lastBk.mtime === sig.mtime;
      // Also require the files themselves to be older than QUIET_MS,
      // so we don't re-backup ancient caches on server restart.
      const fileQuiet = now - sig.mtime;
      if (!alreadyBackedUp && quietFor >= QUIET_MS && fileQuiet >= QUIET_MS) {
        // On fresh start (no changedAt observed), only back up if the cache
        // isn't already covered by an existing backup — handled below via
        // manifest comparison in markExistingBackups().
        dueForBackup.push({ dir, sig });
      }
    }

    if (!dueForBackup.length) return;

    // Map changed cache dirs to bottles (the only expensive step; runs
    // rarely — only when something actually needs backing up).
    const { bottles } = await listBottles();
    const bottlesToBackup = new Set();
    for (const { dir } of dueForBackup) {
      const owner = bottles.find((b) =>
        b.caches.some((c) => c.path === dir)
      );
      if (owner && owner.has_cache) bottlesToBackup.add(owner.name);
    }

    for (const name of bottlesToBackup) {
      const result = await backupShaderCache(name, { auto: true });
      status.last_backup = result.created_at;
      status.last_backup_bottle = name;
      console.log(
        `[autobackup] ${name}: ${result.total_files} filer, ${result.total_bytes} bytes`
      );
      await pruneAutoBackups(name);
    }
    for (const { dir, sig } of dueForBackup) {
      backedUp.set(dir, { size: sig.size, mtime: sig.mtime });
    }
    status.last_error = null;
  } catch (err) {
    status.last_error = String(err.message || err);
    console.error("[autobackup]", err);
  }
}

// Seed `backedUp` from existing backup manifests so a server restart
// doesn't trigger a redundant backup of an unchanged cache.
async function markExistingBackups() {
  try {
    const { bottles } = await listBottles();
    for (const b of bottles) {
      const latest = b.backups[0];
      if (!latest) continue;
      for (const item of latest.items) {
        const sig = await dirSignature(item.original_path);
        if (sig.files > 0 && sig.size === item.size_bytes) {
          backedUp.set(item.original_path, {
            size: sig.size,
            mtime: sig.mtime,
          });
        }
      }
    }
  } catch {
    /* best effort */
  }
}

export function getAutoBackupStatus() {
  return status;
}

export function startAutoBackup() {
  markExistingBackups().then(() => {
    tick();
    setInterval(tick, POLL_MS).unref();
  });
  console.log(
    `[autobackup] aktiv — tjekker hvert ${status.poll_minutes} min, backupper efter ${status.quiet_minutes} min ro`
  );
}
