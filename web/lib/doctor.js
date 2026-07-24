// Bottle Doctor: health checks for a CrossOver bottle, plus auto-fixes for
// known issues. The UE5 launcher fix is the productized version of a real
// debugging session: UE bootstrap launchers version-check the VC++ runtime
// DLLs, but Wine prefers its own builtin stubs for the msvcp140 family, so
// the check fails with "component(s) required" even though the runtime is
// installed. Fix: per-exe DllOverrides = native,builtin.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BOTTLES_ROOT, listBottles, cleanBottleTemp } from "./crossover.js";

const execFileP = promisify(execFile);
const HOME = os.homedir();

const VC_DLLS = [
  "msvcp140", "msvcp140_1", "msvcp140_2", "msvcp140_atomic_wait",
  "msvcp140_codecvt_ids", "vcruntime140", "vcruntime140_1",
  "vcruntime140_threads", "concrt140",
];

function wineBin() {
  return [
    path.join(HOME, "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine"),
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine",
  ].find((p) => fs.existsSync(p));
}

async function dirSize(dir) {
  let bytes = 0;
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
      if (e.isDirectory()) await walk(full, depth + 1);
      else if (e.isFile()) bytes += (await fsp.stat(full).catch(() => ({ size: 0 }))).size;
    }
  }
  await walk(dir, 0);
  return bytes;
}

// Find UE-style games: root launcher exe + Engine/ dir in the install folder.
async function findUeLaunchers(bottlePath) {
  const common = path.join(
    bottlePath,
    "drive_c/Program Files (x86)/Steam/steamapps/common"
  );
  const found = [];
  let games = [];
  try {
    games = await fsp.readdir(common, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const g of games) {
    if (!g.isDirectory()) continue;
    const gameDir = path.join(common, g.name);
    if (!fs.existsSync(path.join(gameDir, "Engine"))) continue;
    let entries = [];
    try {
      entries = await fsp.readdir(gameDir);
    } catch {
      continue;
    }
    const rootExe = entries.find((f) => f.endsWith(".exe"));
    if (rootExe) found.push({ game: g.name, exe: rootExe });
  }
  return found;
}

function hasOverrides(userReg, exe) {
  const key = `AppDefaults\\\\${exe.replace(/\./g, "\\.")}`;
  const re = new RegExp(`AppDefaults\\\\\\\\${exe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\\\\\\DllOverrides`, "i");
  return re.test(userReg) && /msvcp140/.test(userReg.split(exe)[1]?.slice(0, 800) || "");
}

export async function runDoctor(bottleName) {
  const bottlePath = path.join(BOTTLES_ROOT, bottleName);
  if (!fs.existsSync(path.join(bottlePath, "drive_c"))) {
    throw new Error(`Bottle not found: ${bottleName}`);
  }
  const checks = [];
  const add = (id, status, message, fix) =>
    checks.push({ id, status, message, ...(fix ? { fix } : {}) });

  // 1) CrossOver wine CLI til stede
  add(
    "wine",
    wineBin() ? "ok" : "fail",
    wineBin() ? "CrossOver CLI found" : "CrossOver.app not found in /Applications or ~/Applications"
  );

  // 2) VC++ runtime registreret
  let systemReg = "";
  try {
    systemReg = await fsp.readFile(path.join(bottlePath, "system.reg"), "utf8");
  } catch {}
  const vcInstalled = /VC\\\\Runtimes\\\\x64\][\s\S]{0,200}"Installed"=dword:00000001/.test(systemReg);
  add(
    "vcredist",
    vcInstalled ? "ok" : "warn",
    vcInstalled
      ? "VC++ 2015-2022 runtime registered"
      : "VC++ runtime not registered — many games need it (Steam usually installs it on first launch)"
  );

  // 3) Ægte MS-DLL'er vs Wine-stubs
  let stubCount = 0;
  for (const dll of VC_DLLS.slice(0, 4)) {
    const f = path.join(bottlePath, "drive_c/windows/system32", dll + ".dll");
    try {
      const buf = await fsp.readFile(f);
      if (buf.includes(Buffer.from("Wine builtin"))) stubCount++;
    } catch {
      stubCount++;
    }
  }
  add(
    "vcdlls",
    stubCount === 0 ? "ok" : "warn",
    stubCount === 0
      ? "Native Microsoft VC++ DLLs present"
      : `${stubCount} VC++ DLLs are Wine stubs — run the VC++ redist installer in the bottle`
  );

  // 4) MSync
  let cxconf = "";
  try {
    cxconf = await fsp.readFile(path.join(bottlePath, "cxbottle.conf"), "utf8");
  } catch {}
  const msync = /"WINEMSYNC"\s*=\s*"1"/.test(cxconf);
  add("msync", msync ? "ok" : "info", msync ? "MSync enabled (fast synchronization)" : "MSync not explicitly enabled");

  // 5) D3DMetal i brug (har bottlen d3dmetal-caches?)
  const { bottles } = await listBottles();
  const me = bottles.find((b) => b.name === bottleName);
  const d3dm = me ? me.caches.filter((c) => c.type === "d3dmetal" && c.file_count > 0).length : 0;
  add(
    "d3dmetal",
    d3dm > 0 ? "ok" : "info",
    d3dm > 0
      ? `D3DMetal active — ${d3dm} shader cache(s) built`
      : "No D3DMetal caches yet — run a DX11/DX12 game once"
  );

  // 6) Temp-størrelse
  const tempBytes =
    (await dirSize(path.join(bottlePath, "drive_c/users/crossover/AppData/Local/Temp"))) +
    (await dirSize(path.join(bottlePath, "drive_c/windows/temp")));
  add(
    "temp",
    tempBytes > 500 * 1048576 ? "warn" : "ok",
    `Temp folders: ${(tempBytes / 1048576).toFixed(0)} MB` +
      (tempBytes > 500 * 1048576 ? " — consider cleaning" : ""),
    tempBytes > 500 * 1048576 ? "clean_temp" : undefined
  );

  // 7) UE5-launchere uden DLL-overrides (det klassiske "component(s) required"-problem)
  let userReg = "";
  try {
    userReg = await fsp.readFile(path.join(bottlePath, "user.reg"), "utf8");
  } catch {}
  const ueLaunchers = await findUeLaunchers(bottlePath);
  const missing = ueLaunchers.filter((u) => !hasOverrides(userReg, u.exe));
  if (ueLaunchers.length) {
    add(
      "ue5",
      missing.length ? "warn" : "ok",
      missing.length
        ? `${missing.length} Unreal Engine launcher(s) without VC++ DLL overrides (${missing
            .map((m) => m.game)
            .join(", ")}) — can cause the "component(s) required" error on launch`
        : `Unreal Engine launchers OK (${ueLaunchers.length} checked)`,
      missing.length ? "ue5_overrides" : undefined
    );
  }

  return { bottle: bottleName, checks };
}

export async function applyFix(bottleName, fixId) {
  const bottlePath = path.join(BOTTLES_ROOT, bottleName);
  if (!fs.existsSync(path.join(bottlePath, "drive_c"))) {
    throw new Error(`Bottle not found: ${bottleName}`);
  }
  if (fixId === "clean_temp") {
    return await cleanBottleTemp(bottleName);
  }
  if (fixId === "ue5_overrides") {
    const wine = wineBin();
    if (!wine) throw new Error("CrossOver.app was not found.");
    let userReg = "";
    try {
      userReg = await fsp.readFile(path.join(bottlePath, "user.reg"), "utf8");
    } catch {}
    const launchers = (await findUeLaunchers(bottlePath)).filter(
      (u) => !hasOverrides(userReg, u.exe)
    );
    const fixed = [];
    for (const l of launchers) {
      for (const dll of VC_DLLS) {
        await execFileP(wine, [
          "--bottle", bottleName,
          "reg", "add",
          `HKCU\\Software\\Wine\\AppDefaults\\${l.exe}\\DllOverrides`,
          "/v", dll, "/t", "REG_SZ", "/d", "native,builtin", "/f",
        ]).catch(() => {});
      }
      fixed.push(l.game);
    }
    return { fixed };
  }
  throw new Error(`Unknown fix: ${fixId}`);
}
