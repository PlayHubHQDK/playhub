// PlayHub i18n. English strings are canonical (used directly in markup/code);
// each language below maps English -> translation. Adding a language later =
// one new dictionary object here + an entry in LANGS.

const LANGS = { en: "English", da: "Dansk" };

const DICT = {
  da: {
    // Tabs & panel titles
    "Steam Library": "Steam-bibliotek",
    "On This Mac": "På denne Mac",
    "CrossOver Tools": "CrossOver-værktøjer",
    "Stats": "Statistik",
    "For You": "Anbefalinger",
    "Buy Ideas": "Køb-idéer",
    "Xbox": "Xbox",
    "Games on this Mac": "Spil på denne Mac",
    "CrossOver bottles": "CrossOver-bottles",
    "Playtime stats": "Spilletids-statistik",
    "Recommendations from your own library": "Anbefalinger fra dit eget bibliotek",
    "Buy ideas — games you don't own yet": "Køb-idéer — spil du ikke ejer endnu",

    // Library
    "All": "Alle",
    "Installed": "Installeret",
    "Search library…": "Søg i biblioteket…",
    "games": "spil",
    "No games match.": "Ingen spil matcher.",
    "Could not load Steam library.": "Kunne ikke hente Steam-bibliotek.",
    "Recently played (last 2 weeks)": "Senest spillet (sidste 2 uger)",
    "Full library": "Hele biblioteket",
    "total": "i alt",
    "✓ Installed": "✓ Installeret",
    "✓ CrossOver": "✓ CrossOver",
    "Start {0}": "Start {0}",
    "Starting via Steam…": "Starter via Steam…",
    "Starting via CrossOver (bottle: {0}) — first start can take a while…":
      "Starter via CrossOver (bottle: {0}) — første start kan tage lidt tid…",
    "⚡ cache {0}": "⚡ cache {0}",
    "❄︎ no cache": "❄︎ ingen cache",
    "D3DMetal shader cache: {0} files ({1})": "D3DMetal shader-cache: {0} filer ({1})",
    "No D3DMetal cache yet — first launch compiles shaders":
      "Ingen D3DMetal-cache endnu — første start kompilerer shaders",

    // Native Mac
    "Installed via Steam": "Installeret via Steam",
    "Apps in /Applications (game category)": "Apps i /Applications (spil-kategori)",
    "No Steam games installed locally.": "Ingen Steam-spil installeret lokalt.",
    "No apps in /Applications with a game category.": "Ingen apps i /Applications med spil-kategori.",
    "installed": "installeret",
    "not on disk": "ikke på disk",

    // CrossOver
    "CrossOver doesn't seem to be installed.": "CrossOver ser ikke ud til at være installeret.",
    "Expected: ~/Library/Application Support/CrossOver": "Forventet: ~/Library/Application Support/CrossOver",
    "No CrossOver bottles found yet.": "Ingen CrossOver-bottles fundet endnu.",
    "Create a bottle in CrossOver and it will appear here.": "Opret en bottle i CrossOver, så dukker den op her.",
    "cache folder(s)": "cache-mappe(r)",
    "No D3DMetal shader cache found yet — run a game in the bottle first.":
      "Ingen D3DMetal shader-cache fundet endnu — kør et spil i bottlen først.",
    "files": "filer",
    "last modified": "senest",
    "Back up shader cache": "Backup shader-cache",
    "Restore latest": "Gendan seneste",
    "Clean bottle temp": "Ryd op i bottle",
    "Backups:": "Backups:",
    "auto": "auto",
    "Working…": "Arbejder…",
    "Backup created: {0} files ({1}).": "Backup taget: {0} filer ({1}).",
    "Restored from {0} ({1} folder(s)).": "Gendannet fra {0} ({1} mappe(r)).",
    "Cleaned up: {0} freed ({1} files).": "Ryddet op: {0} frigjort ({1} filer).",
    "Clean temporary files in bottle \"{0}\"?\nOnly Windows/Wine temp folders are emptied — games and saves are untouched.":
      "Ryd op i midlertidige filer i bottlen \"{0}\"?\nSletter kun indholdet af Windows/Wine temp-mapper — spil og gemte data røres ikke.",
    "Auto-backup: <strong>active</strong> — checks every {0} min, backs up after {1} min of quiet":
      "Auto-backup: <strong>aktiv</strong> — tjekker hvert {0}. min, backupper efter {1} min ro",
    "latest": "seneste",
    "no auto-backup yet": "ingen auto-backup endnu",
    "error": "fejl",

    // Stats
    "Total playtime": "Samlet spilletid",
    "{0} hours": "{0} timer",
    "≈ {0} days": "≈ {0} døgn",
    "Games played": "Spil spillet",
    "{0} of {1}": "{0} af {1}",
    "{0}% of library": "{0}% af biblioteket",
    "Most played": "Mest spillede",
    "Last 2 weeks": "Sidste 2 uger",
    "{0} different games": "{0} forskellige spil",
    "Top 10 most played": "Top 10 mest spillede",
    "Football Manager through the years": "Football Manager gennem årene",
    "Show as table (top 20)": "Vis som tabel (top 20)",
    "Game": "Spil",
    "Hours": "Timer",
    "Share": "Andel",
    "Calculating…": "Beregner…",
    "0 h": "0 t",
    "{0} h": "{0} t",
    "{0} min": "{0} min",

    // Detalje-visning
    "Platform": "Platform",
    "Playtime": "Spilletid",
    "Shader cache": "Shader-cache",
    "Reviews": "Anmeldelser",
    "last played": "sidst spillet",
    "Launch": "Start",

    // Achievements modal
    "Fetching achievements…": "Henter achievements…",
    "This game has no achievements.": "Dette spil har ingen achievements.",
    "Unlocked ({0})": "Låst op ({0})",
    "Missing ({0})": "Mangler ({0})",
    "Steam: {0}": "Steam: {0}",
    "({0}% positive)": "({0}% positive)",
    "Your time: {0} ≈ {1}% of Main": "Din tid: {0} ≈ {1}% af Main",

    // Review levels (Steam)
    "Overwhelmingly Positive": "Overvældende positive",
    "Very Positive": "Meget positive",
    "Positive": "Positive",
    "Mostly Positive": "Mest positive",
    "Mixed": "Blandede",
    "Mostly Negative": "Mest negative",
    "Negative": "Negative",
    "Very Negative": "Meget negative",
    "Overwhelmingly Negative": "Overvældende negative",

    // Recommendations
    "↻ Refresh": "↻ Opdater",
    "Your taste profile:": "Din smagsprofil:",
    "Because you play {0}": "Fordi du spiller {0}",
    "Broadly recommended": "Bredt anbefalet",
    "Computing recommendations…": "Beregner anbefalinger…",
    "No recommendations yet — wait for enrichment to progress and press ↻ Refresh.":
      "Ingen anbefalinger endnu — vent til berigelsen er kommet lidt længere, og tryk ↻ Opdater.",
    "Enriching library with Steam data in the background: <strong>{0}/{1}</strong> reviews · <strong>{2}/{3}</strong> Metacritic/genres — recommendations improve over time.":
      "Beriger biblioteket med Steam-data i baggrunden: <strong>{0}/{1}</strong> anmeldelser · <strong>{2}/{3}</strong> Metacritic/genrer — anbefalingerne bliver bedre efterhånden.",
    "{0}% positive": "{0}% positive",

    // Buy ideas
    "Popular, well-reviewed games matched to your taste profile. Prices load progressively (Steam bills in € in Denmark) — press ↻ if some are missing.":
      "Populære og godt anmeldte spil matchet mod din smagsprofil. Priser hentes løbende (Steam afregner i € i Danmark) — tryk ↻ hvis nogle mangler.",
    "Finding buy ideas… (first time takes ~15 s)": "Finder køb-idéer… (første gang tager det ~15 sek.)",
    "No ideas yet — the taste profile needs library enrichment. Try again shortly.":
      "Ingen idéer endnu — smagsprofilen kræver at biblioteks-berigelsen er i gang. Prøv igen om lidt.",
    "Matches {0}": "Matcher {0}",
    "Steam store ↗": "Steam-butik ↗",
    "Free": "Gratis",
    "price loading…": "pris henter…",
    "Best price: ": "Bedste pris: ",
    "at": "hos",
    "(grey market)": "(grå marked)",
    "{0} prices still loading — press ↻ shortly.": "{0} priser hentes stadig — tryk ↻ om lidt.",
    "Cross-store price comparison: add a free <a {0}>ITAD key</a> as ITAD_API_KEY in .env.":
      "Prissammenligning på tværs af butikker: tilføj en gratis <a {0}>ITAD-nøgle</a> som ITAD_API_KEY i .env.",
    "Links marked 💰 are affiliate links — we may earn a commission.":
      "Links markeret 💰 er reklamelinks — vi kan tjene kommission.",

    // Xbox
    "Stream Game Pass games directly in the browser.": "Stream Game Pass-spil direkte i browseren.",
    "Remote play from your own Xbox console.": "Fjernspil fra din egen Xbox-konsol.",

    // Lokal tilstand & ryd cache
    "Or skip the key — use local Steam data only (installed & played games; no achievements)":
      "Eller spring nøglen over — brug kun lokal Steam-data (installerede & spillede spil; ingen achievements)",
    "Local mode — reading your Steam installation ({0} games this Mac has seen). Add a free API key via .env (STEAM_API_KEY + STEAM_ID) for your full library and achievements.":
      "Lokal tilstand — læser din Steam-installation ({0} spil denne Mac har set). Tilføj en gratis API-nøgle i .env (STEAM_API_KEY + STEAM_ID) for hele biblioteket og achievements.",
    "No local Steam installation found on this Mac.": "Ingen lokal Steam-installation fundet på denne Mac.",
    "Achievements require a Steam Web API key — add one to .env (STEAM_API_KEY).":
      "Achievements kræver en Steam Web API-nøgle — tilføj en i .env (STEAM_API_KEY).",
    "Clear shader cache": "Ryd shader-cache",
    "Frees disk space. Requires a backup first — restore brings the cache back instantly.":
      "Frigør diskplads. Kræver en backup først — gendan henter cachen tilbage med det samme.",
    "Clear the D3DMetal shader caches for \"{0}\"?\nYou have a backup, so you can restore instantly — but without restoring, next launch recompiles shaders.":
      "Ryd D3DMetal shader-caches for \"{0}\"?\nDu har en backup, så du kan gendanne med det samme — men uden gendannelse genkompilerer næste start shaders.",
    "Cleared {0} cache folder(s) — {1} freed.": "Ryddede {0} cache-mappe(r) — {1} frigjort.",
    "Take a backup first — clearing without a backup means recompiling from scratch.":
      "Tag en backup først — rydning uden backup betyder genkompilering fra bunden.",

    // Server-fejl (kendte beskeder oversættes; ukendte vises som de er)
    "Wine processes are still running (a game or Steam in the bottle). Close them first and try again.":
      "Der kører stadig Wine-processer (spil eller Steam i bottlen). Luk dem først, og prøv igen.",
    "Steam doesn't seem to be installed on this Mac.": "Steam ser ikke ud til at være installeret på denne Mac.",
    "CrossOver.app was not found.": "CrossOver.app blev ikke fundet.",
    "Not configured yet — complete the setup wizard.": "Ikke konfigureret endnu — gennemfør opsætningsguiden.",
    "Your Steam library looks empty. If you own games, your Steam profile's “Game details” privacy setting is probably not set to Public.":
      "Dit Steam-bibliotek ser tomt ud. Hvis du ejer spil, er din Steam-profils “Spiloplysninger” formentlig ikke sat til Offentlig.",
    "Open Steam privacy settings": "Åbn Steams privatlivsindstillinger",

    // Platform & CrossOver-kompatibilitet
    "Mac native": "Mac native",
    "Needs CrossOver": "Kræver CrossOver",
    "Runs natively on macOS": "Kører native på macOS",
    "CrossOver compatibility: {0} (community data from AppleGamingWiki)":
      "CrossOver-kompatibilitet: {0} (community-data fra AppleGamingWiki)",
    "Perfect": "Perfekt",
    "Playable": "Spilbart",
    "Runs with issues": "Kører med problemer",
    "Doesn't work": "Virker ikke",
    "Unknown": "Ukendt",
    "Your Mac": "Din Mac",
    "Why:": "Hvorfor:",
    "\u26d4 Won't work": "\u26d4 Virker ikke",
    "\ud83e\uddf9 Hide": "\ud83e\uddf9 Skjul",
    "Library": "Bibliotek",
    "\ud83e\uddf9 Hide from library": "\ud83e\uddf9 Skjul fra biblioteket",
    "Show in library again": "Vis i biblioteket igen",
    "Hidden \u2014 find it under \ud83e\uddf9 Junk.": "Skjult \u2014 find det under \ud83e\uddf9 Rod.",
    "Shown in library again.": "Vises i biblioteket igen.",
    "\ud83e\uddf9 Junk": "\ud83e\uddf9 Rod",
    "\ud83c\udfb2 Tonight?": "\ud83c\udfb2 I aften?",
    "How much time do you have?": "Hvor lang tid har du?",
    "2 hours": "2 timer",
    "Long night": "Lang aften",
    "Your current game": "Dit aktuelle spil",
    "Reliable fun": "Sikker vinder",
    "Never started \u2014 tonight?": "Aldrig startet \u2014 i aften?",
    "No suggestions \u2014 play something first!": "Ingen forslag \u2014 spil noget f\u00f8rst!",
    "not installed": "ikke installeret",
    "Play": "Spil",
    "Backlog (HLTB main story)": "Backlog (HLTB main story)",
    "estimating\u2026 ({0} games)": "estimerer\u2026 ({0} spil)",
    "{0} unplayed games": "{0} uspillede spil",
    "Discover": "Opdag",
    "\u2713 Runs well on your Mac": "\u2713 K\u00f8rer godt p\u00e5 din Mac",
    "No confirmed good fits yet \u2014 compatibility data is still loading. Try again shortly.":
      "Ingen bekr\u00e6ftede match endnu \u2014 kompatibilitetsdata indl\u00e6ses stadig. Pr\u00f8v igen om lidt.",
    "From your own library": "Fra dit eget bibliotek",
    "Other games on this Mac (/Applications)": "Andre spil p\u00e5 denne Mac (/Applications)",
    "fanless": "uden bl\u00e6ser",
    "On your Mac": "P\u00e5 din Mac",
    "Runs on your Mac": "K\u00f8rer p\u00e5 din Mac",
    "Easy for your Mac": "Let for din Mac",
    "Should run well on your Mac": "B\u00f8r k\u00f8re fint p\u00e5 din Mac",
    "Heavy \u2014 expect lowered settings": "Tungt \u2014 forvent lavere settings",
    "Borderline on your Mac": "Gr\u00e6nsetilf\u00e6lde p\u00e5 din Mac",
    "fanless: may throttle in long sessions": "uden bl\u00e6ser: kan throttle i lange sessioner",
    "8 GB RAM is tight": "8 GB RAM er i underkanten",
    "{0} community reports": "{0} community-rapporter",
    "Report how it runs": "Rapport\u00e9r hvordan det k\u00f8rer",
    "\ud83c\udfae Controller": "\ud83c\udfae Controller",
    "Full controller support": "Fuld controller-support",
    "Partial controller support": "Delvis controller-support",
    "Controller": "Controller",

    "Shader cache restored from backup ({0}) — launching without recompile…":
      "Shader-cache gendannet fra backup ({0}) — starter uden genkompilering…",

    // Year card + hunt
    "Your year in gaming": "Dit \u00e5r i spil",
    "Download as PNG": "Download som PNG",
    "Achievement hunt \u2014 easiest unlocks you're missing": "Achievement-jagt \u2014 dine nemmeste manglende",
    "No easy unlocks found \u2014 impressive completion!": "Ingen nemme achievements fundet \u2014 imponerende gennemf\u00f8rsel!",

    // Wishlist
    "Your Steam wishlist is empty.": "Din Steam-\u00f8nskeliste er tom.",
    "Your wishlist ({0}) - set a target price to get a macOS alert":
      "Din \u00f8nskeliste ({0}) - s\u00e6t en m\u00e5lpris og f\u00e5 en macOS-besked",
    "target": "m\u00e5lpris",
    "Target saved - you will get a macOS notification when the price drops.":
      "M\u00e5lpris gemt - du f\u00e5r en macOS-notifikation, n\u00e5r prisen falder.",

    // Doctor, prune, launch options
    "Run Bottle Doctor": "K\u00f8r Bottle Doctor",
    "Fix it": "Fix det",
    "Done": "F\u00e6rdig",
    "Fixed: {0}": "Fixet: {0}",
    "Disk: live caches {0} \u00b7 backups {1}": "Disk: aktive caches {0} \u00b7 backups {1}",
    "Prune old backups (keep 3)": "Ryd gamle backups (behold 3)",
    "Delete all but the 3 newest backups for \"{0}\"?": "Slet alle undtagen de 3 nyeste backups for \"{0}\"?",
    "Pruned {0} backup(s) \u2014 {1} freed.": "Ryddede {0} backup(s) \u2014 {1} frigjort.",
    "Launch options": "Launch options",
    "Save": "Gem",
    "Launch options saved.": "Launch options gemt.",

    // Anticheat
    "Anticheat": "Anticheat",
    "Community data from AreWeAntiCheatYet (Linux/Proton; CrossOver is typically the same or stricter)":
      "Community-data fra AreWeAntiCheatYet (Linux/Proton; CrossOver er typisk det samme eller strengere)",
    "Anticheat: {0} - likely will not work under CrossOver":
      "Anticheat: {0} - virker sandsynligvis ikke under CrossOver",

    // Update banner
    "New version available: {0} (you have {1})": "Ny version tilgængelig: {0} (du har {1})",
    "See what's new ↗": "Se nyhederne ↗",
    "Update now": "Opdatér nu",
    "Updating…": "Opdaterer…",
    "Already up to date": "Allerede opdateret",
    "Update installed - restarting PlayHub…": "Opdatering installeret - genstarter PlayHub…",
    "Not a git checkout - update manually.": "Ikke et git-checkout - opdatér manuelt.",

    // Setup wizard
    "Welcome to PlayHub": "Velkommen til PlayHub",
    "Language": "Sprog",
    "PlayHub needs your Steam Web API key and SteamID to read your library. Everything runs and stays on your Mac.":
      "PlayHub skal bruge din Steam Web API-nøgle og dit SteamID for at læse dit bibliotek. Alt kører og bliver på din Mac.",
    "Steam Web API key": "Steam Web API-nøgle",
    "Get a free key here": "Hent en gratis nøgle her",
    "SteamID, profile URL or vanity name": "SteamID, profil-URL eller brugernavn",
    "Find your SteamID": "Find dit SteamID",
    "Note: your Steam profile's “Game details” must be set to Public.":
      "Bemærk: din Steam-profils “Spiloplysninger” skal være sat til Offentlig.",
    "ITAD API key (optional — enables cross-store price comparison)":
      "ITAD API-nøgle (valgfri — giver prissammenligning på tværs af butikker)",
    "Validate & continue": "Validér og fortsæt",
    "Checking…": "Tjekker…",
    "Hi {0}! Found {1} games in your library.": "Hej {0}! Fandt {1} spil i dit bibliotek.",
    "The key works, but your game library looks private. Set “Game details” to Public in Steam's privacy settings — or continue anyway.":
      "Nøglen virker, men dit spilbibliotek ser privat ud. Sæt “Spiloplysninger” til Offentlig i Steams privatlivsindstillinger — eller fortsæt alligevel.",
    "Save & start PlayHub": "Gem og start PlayHub",
    "The API key was rejected by Steam — check it and try again.":
      "API-nøglen blev afvist af Steam — tjek den og prøv igen.",
    "Could not find that SteamID/profile.": "Kunne ikke finde det SteamID / den profil.",
    "Validation failed: {0}": "Validering fejlede: {0}",
    "Both fields are required.": "Begge felter skal udfyldes.",
  },
};

// ?lang=xx overrides everything (useful for screenshots/testing).
const URL_LANG = new URLSearchParams(location.search).get("lang");
let CURRENT_LANG =
  (URL_LANG && LANGS[URL_LANG] ? URL_LANG : null) ||
  localStorage.getItem("playhub_lang") ||
  null;

function detectLang() {
  if (CURRENT_LANG) return CURRENT_LANG;
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("da") ? "da" : "en";
}

window.getLang = () => CURRENT_LANG || detectLang();

window.setLang = async (lang) => {
  localStorage.setItem("playhub_lang", lang);
  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
  } catch {
    /* server-sync er best effort */
  }
  location.reload();
};

// t("Hello {0}", name) — looks up translation, then substitutes {n} params.
window.t = (key, ...args) => {
  const lang = window.getLang();
  let s = lang === "en" ? key : (DICT[lang] || {})[key] || key;
  for (let i = 0; i < args.length; i++) {
    s = s.split(`{${i}}`).join(args[i]);
  }
  return s;
};

// Translate static markup: elements with data-i18n use their own text as key;
// data-i18n-placeholder translates the placeholder attribute.
window.applyStaticI18n = () => {
  if (window.getLang() === "en") return;
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.dataset.i18nKey || el.textContent.trim();
    el.dataset.i18nKey = key; // remember original English key
    el.textContent = window.t(key);
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = el.dataset.i18nPlaceholderKey || el.placeholder;
    el.dataset.i18nPlaceholderKey = key;
    el.placeholder = window.t(key);
  }
};

window.I18N_LANGS = LANGS;
