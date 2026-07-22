// Version info + update check against GitHub Releases.
// Works silently when the repo is private/unreachable — no banner, no errors.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = "PlayHubHQDK/playhub";
const CHECK_INTERVAL = 24 * 3600_000;

let current = "0.0.0";
try {
  current = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
  ).version;
} catch {
  /* keep default */
}

let latest = null;
let lastCheck = 0;

function newer(a, b) {
  // true if a > b (semver-light)
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

async function checkLatest() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) return; // privat repo / offline → stille
    const j = await res.json();
    latest = String(j.tag_name || "").replace(/^v/, "") || null;
  } catch {
    /* offline — ligegyldigt */
  }
  lastCheck = Date.now();
}

export async function getVersionInfo() {
  if (Date.now() - lastCheck > CHECK_INTERVAL) await checkLatest();
  return {
    current,
    latest,
    update_available: Boolean(latest && newer(latest, current)),
    releases_url: `https://github.com/${REPO}/releases`,
  };
}
