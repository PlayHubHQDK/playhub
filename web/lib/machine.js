// Mac hardware profile + honest per-game performance expectations.
//
// There is no public per-Mac-model FPS database, so we never invent numbers.
// Instead: detect exactly what this Mac is (chip, variant, RAM, fanless) and
// translate the data we already have (native/CrossOver rating, genres, year)
// into a calibrated expectation with honest wording.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

let cached = null;

export async function getMachine() {
  if (cached) return cached;
  try {
    const { stdout } = await execFileP("system_profiler", [
      "SPHardwareDataType",
      "SPDisplaysDataType",
      "-json",
    ]);
    const j = JSON.parse(stdout);
    const hw = j.SPHardwareDataType?.[0] || {};
    const gpu = j.SPDisplaysDataType?.[0] || {};
    const chip = hw.chip_type || null; // "Apple M4"
    const name = hw.machine_name || ""; // "MacBook Air"
    const ram_gb = parseInt(hw.physical_memory) || null; // "16 GB"
    const gpu_cores = Number(gpu.sppci_cores) || null;
    const m = (chip || "").match(/M(\d+)\s*(Pro|Max|Ultra)?/i);
    const gen = m ? Number(m[1]) : null;
    const variant = m?.[2] || "base";
    const fanless = /MacBook Air/i.test(name);
    // Groft ydelses-tier: generation + variant; bruges kun til at vælge
    // forsigtige tekst-labels, aldrig til at love FPS.
    const variantScore = { base: 0, Pro: 1.5, Max: 3, Ultra: 4.5 }[variant] ?? 0;
    const tier = gen ? gen + variantScore : null;
    cached = {
      chip,
      gen,
      variant,
      device: name || null,
      ram_gb,
      gpu_cores,
      fanless,
      tier,
      label: chip
        ? `${name} · ${chip}${gpu_cores ? ` (${gpu_cores} GPU)` : ""}${
            ram_gb ? ` · ${ram_gb} GB` : ""
          }${fanless ? " · fanless" : ""}`
        : null,
    };
  } catch {
    cached = { chip: null, gen: null, variant: null, device: null, ram_gb: null, gpu_cores: null, fanless: false, tier: null, label: null };
  }
  return cached;
}

// Hvor tungt er spillet, groft: 0 = let, 1 = mellem, 2 = tungt.
export function gameWeight(g) {
  const genres = (g.genres || []).map((s) => String(s).toLowerCase());
  if (genres.includes("indie") || genres.includes("casual")) return 0;
  // Systemkrav som signal: lavt minimum-RAM frikender lette spil (fx 2D
  // managerspil), højt dømmer tunge. Mellemkrav (5-11 GB) siger ikke nok —
  // minimumskrav er ofte lave selv for tunge 3D-spil — så dér afgør årstal.
  const y = g.release_year || null;
  const yearWeight = !y ? 1 : y >= 2020 ? 2 : y >= 2015 ? 1 : 0;
  if (g.pc_req_ram_gb != null) {
    if (g.pc_req_ram_gb <= 4) return 0;
    if (g.pc_req_ram_gb >= 12) return 2;
    return Math.max(1, yearWeight);
  }
  return yearWeight;
}

// -> { level: easy|good|heavy|edge, notes } eller null hvis vi ikke ved nok.
export function expectation(g, mac) {
  if (!mac?.tier) return null;
  const w = gameWeight(g);
  const notes = [];
  let level;
  if (w === 0) level = "easy";
  else if (w === 1) level = mac.tier >= 2.5 ? "easy" : "good";
  else {
    // Tung, moderne titel: native er billigere end oversættelseslag.
    if (mac.tier >= 5) level = "good";
    else if (mac.tier >= 3) level = g.mac_native ? "good" : "heavy";
    else level = g.mac_native ? "heavy" : "edge";
    if (mac.fanless) notes.push("fanless_throttle");
    if (mac.ram_gb && mac.ram_gb <= 8) {
      level = "edge";
      notes.push("low_ram");
    }
  }
  return { level, notes };
}
