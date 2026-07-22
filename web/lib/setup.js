// First-run setup: validate Steam credentials and write the .env file.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, "..", "..", ".env");

export function isConfigured() {
  return Boolean(process.env.STEAM_API_KEY && process.env.STEAM_ID);
}

// Accepts: 17-digit steamid64, a /profiles/<id> URL, a /id/<vanity> URL,
// or a bare vanity name. Returns a steamid64 or throws.
export async function resolveSteamId(apiKey, input) {
  const raw = String(input || "").trim();
  const profileMatch = raw.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileMatch) return profileMatch[1];
  if (/^\d{17}$/.test(raw)) return raw;

  const vanityMatch = raw.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  const vanity = vanityMatch ? vanityMatch[1] : raw;
  const res = await fetch(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(
      apiKey
    )}&vanityurl=${encodeURIComponent(vanity)}`
  );
  if (res.status === 403) throw new Error("invalid_key");
  if (!res.ok) throw new Error(`steam_http_${res.status}`);
  const j = await res.json();
  if (j?.response?.success === 1) return j.response.steamid;
  throw new Error("steamid_not_found");
}

export async function validateCreds(apiKey, steamId) {
  // 1) Key + id check via GetPlayerSummaries
  const res = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(
      apiKey
    )}&steamids=${encodeURIComponent(steamId)}`
  );
  if (res.status === 403) throw new Error("invalid_key");
  if (!res.ok) throw new Error(`steam_http_${res.status}`);
  const j = await res.json();
  const player = j?.response?.players?.[0];
  if (!player) throw new Error("steamid_not_found");

  // 2) Library visibility check via GetOwnedGames
  let gameCount = null;
  try {
    const r2 = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(
        apiKey
      )}&steamid=${encodeURIComponent(steamId)}&include_appinfo=0&format=json`
    );
    if (r2.ok) {
      const j2 = await r2.json();
      gameCount = j2?.response?.game_count ?? null;
    }
  } catch {
    /* visibility unknown */
  }

  return {
    valid: true,
    steamid: steamId,
    persona_name: player.personaname || null,
    avatar: player.avatarmedium || null,
    game_count: gameCount,
    games_visible: typeof gameCount === "number" && gameCount > 0,
  };
}

// Write credentials into .env, preserving any other existing lines.
export async function saveEnv({ steamKey, steamId, itadKey }) {
  let lines = [];
  try {
    lines = fs.readFileSync(ENV_FILE, "utf8").split("\n");
  } catch {
    lines = [
      "# PlayHub configuration",
      "PORT=4173",
      "",
      "# Affiliate slots (leave empty until partner programs approve)",
      "AFFILIATE_SUFFIX_HUMBLE=",
      "AFFILIATE_SUFFIX_FANATICAL=",
      "AFFILIATE_SUFFIX_GMG=",
      "AFFILIATE_IG_REF=",
    ];
  }

  const set = (key, value) => {
    if (value === undefined || value === null) return;
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
    process.env[key] = value;
  };

  set("STEAM_API_KEY", steamKey);
  set("STEAM_ID", steamId);
  if (itadKey) set("ITAD_API_KEY", itadKey);

  await fsp.writeFile(ENV_FILE, lines.join("\n").replace(/\n{3,}$/, "\n") + (lines[lines.length - 1] === "" ? "" : "\n"));
  return true;
}
