// PlayHub i18n. English strings are canonical (used directly in markup/code);
// each language below maps English -> translation. Adding a language later =
// one new dictionary object here + an entry in LANGS.

const LANGS = { en: "English", da: "Dansk" };

const DICT = {
  da: {
    // Tabs & panel titles
    "Steam Library": "Steam-bibliotek",
    "Native Mac": "Native Mac",
    "CrossOver": "CrossOver",
    "Stats": "Statistik",
    "For You": "Anbefalinger",
    "Buy Ideas": "Køb-idéer",
    "Xbox": "Xbox",
    "Native Mac games": "Native Mac-spil",
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
    "🔥 Recently played (last 2 weeks)": "🔥 Senest spillet (sidste 2 uger)",
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
    "💾 Back up shader cache": "💾 Backup shader-cache",
    "♻️ Restore latest": "♻️ Gendan seneste",
    "🧹 Clean bottle temp": "🧹 Ryd op i bottle",
    "Backups:": "Backups:",
    "auto": "auto",
    "Working…": "Arbejder…",
    "Backup created: {0} files ({1}).": "Backup taget: {0} filer ({1}).",
    "Restored from {0} ({1} folder(s)).": "Gendannet fra {0} ({1} mappe(r)).",
    "Cleaned up: {0} freed ({1} files).": "Ryddet op: {0} frigjort ({1} filer).",
    "Clean temporary files in bottle \"{0}\"?\nOnly Windows/Wine temp folders are emptied — games and saves are untouched.":
      "Ryd op i midlertidige filer i bottlen \"{0}\"?\nSletter kun indholdet af Windows/Wine temp-mapper — spil og gemte data røres ikke.",
    "🤖 Auto-backup: <strong>active</strong> — checks every {0} min, backs up after {1} min of quiet":
      "🤖 Auto-backup: <strong>aktiv</strong> — tjekker hvert {0}. min, backupper efter {1} min ro",
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
    "📡 Enriching library with Steam data in the background: <strong>{0}/{1}</strong> reviews · <strong>{2}/{3}</strong> Metacritic/genres — recommendations improve over time.":
      "📡 Beriger biblioteket med Steam-data i baggrunden: <strong>{0}/{1}</strong> anmeldelser · <strong>{2}/{3}</strong> Metacritic/genrer — anbefalingerne bliver bedre efterhånden.",
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
    "💡 Cross-store price comparison: add a free <a {0}>ITAD key</a> as ITAD_API_KEY in .env.":
      "💡 Prissammenligning på tværs af butikker: tilføj en gratis <a {0}>ITAD-nøgle</a> som ITAD_API_KEY i .env.",
    "Links marked 💰 are affiliate links — we may earn a commission.":
      "Links markeret 💰 er reklamelinks — vi kan tjene kommission.",

    // Xbox
    "Stream Game Pass games directly in the browser.": "Stream Game Pass-spil direkte i browseren.",
    "Remote play from your own Xbox console.": "Fjernspil fra din egen Xbox-konsol.",

    // Server-fejl (kendte beskeder oversættes; ukendte vises som de er)
    "Wine processes are still running (a game or Steam in the bottle). Close them first and try again.":
      "Der kører stadig Wine-processer (spil eller Steam i bottlen). Luk dem først, og prøv igen.",
    "Steam doesn't seem to be installed on this Mac.": "Steam ser ikke ud til at være installeret på denne Mac.",
    "CrossOver.app was not found.": "CrossOver.app blev ikke fundet.",
    "Not configured yet — complete the setup wizard.": "Ikke konfigureret endnu — gennemfør opsætningsguiden.",
    "Your Steam library looks empty. If you own games, your Steam profile's “Game details” privacy setting is probably not set to Public.":
      "Dit Steam-bibliotek ser tomt ud. Hvis du ejer spil, er din Steam-profils “Spiloplysninger” formentlig ikke sat til Offentlig.",
    "Open Steam privacy settings": "Åbn Steams privatlivsindstillinger",

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
