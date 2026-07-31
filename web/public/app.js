// PlayHub front-end logic. All user-facing strings are English (canonical)
// wrapped in t() — translations live in i18n.js.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const LOCALE = getLang() === "da" ? "da-DK" : "en-GB";

// --- Language switcher + static translation ---
applyStaticI18n();
{
  const sel = $("#lang-select");
  for (const [code, label] of Object.entries(I18N_LANGS)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = getLang();
  sel.addEventListener("change", () => setLang(sel.value));
}

// --- Tabs ---
let recsLoaded = false;
let discoverLoaded = false;
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("active"));
    $$(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("#" + tab.dataset.target).classList.add("active");
    if (tab.dataset.target === "discover") {
      if (!recsLoaded) loadRecommendations();
      if (!discoverLoaded) loadDiscover();
    }
  });
});

// --- Toast ---
let toastTimer;
function toast(msg, kind = "ok") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 4000);
}

function fmtBytes(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtPrice(amount, currency) {
  if (amount === 0) return t("Free");
  if (typeof amount !== "number") return null;
  try {
    return amount.toLocaleString(LOCALE, {
      style: "currency",
      currency: currency || "EUR",
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    });
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
}
function fmtHours(h) {
  if (!h) return t("{0} h", 0);
  if (h < 1) return t("{0} min", Math.round(h * 60));
  return t("{0} h", h.toLocaleString(LOCALE));
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// --- Steam library ---
let libraryGames = [];
let libraryFilter = "all";

async function loadLibrary() {
  const grid = $("#library-grid");
  try {
    const data = await api("/api/steam/library");
    libraryGames = data.games || [];
    try {
      hiddenMap = await api("/api/hidden");
    } catch {}
    for (const g of libraryGames) {
      const ov = hiddenMap[g.appid];
      g._junk = ov === "hide" || (JUNK_RE.test(g.name) && ov !== "show");
    }
    $("#library-count").textContent = `${
      libraryGames.filter((g) => !g._junk).length
    } ${t("games")}`;
    if (!libraryGames.length) {
      grid.innerHTML = `<div class="empty">${t(
        "Your Steam library looks empty. If you own games, your Steam profile's “Game details” privacy setting is probably not set to Public."
      )}<br><a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener" style="color:var(--accent)">${t(
        "Open Steam privacy settings"
      )} ↗</a></div>`;
      return;
    }
    if (data.mode === "local") {
      let note = $("#local-mode-note");
      if (!note) {
        note = document.createElement("div");
        note.id = "local-mode-note";
        note.className = "autobackup-status";
        $("#library .panel-head").after(note);
      }
      note.innerHTML = t(
        "Local mode — reading your Steam installation ({0} games this Mac has seen). Add a free API key via .env (STEAM_API_KEY + STEAM_ID) for your full library and achievements.",
        data.game_count
      );
    }
    renderRecent(libraryGames);
    renderLibrary(libraryGames);
    renderStats(libraryGames);
  } catch (err) {
    grid.innerHTML = `<div class="empty">${t("Could not load Steam library.")}<br><small>${esc(
      t(err.message)
    )}</small></div>`;
  }
}

// Cover fallback chain: capsule (old CDN) → header (old CDN) →
// appdetails artwork via our server (new hashed CDN) → text fallback.
window.coverError = function (img, headerUrl) {
  const stage = img.dataset.stage;
  if (stage === "capsule") {
    img.dataset.stage = "header";
    img.src = headerUrl;
    return;
  }
  if (stage === "header") {
    img.dataset.stage = "artwork";
    fetch(`/api/steam/artwork/${img.dataset.appid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((art) => {
        if (art && art.header_image) img.src = art.header_image;
        else img.style.display = "none";
      })
      .catch(() => (img.style.display = "none"));
    return;
  }
  img.style.display = "none";
};

function renderRecent(games) {
  let recent = games
    .filter((g) => g.playtime_2weeks_min > 0)
    .sort((a, b) => b.playtime_2weeks_min - a.playtime_2weeks_min);
  if (!recent.length) {
    // Lokal tilstand har ikke 2-ugers tal — brug LastPlayed i stedet.
    const cutoff = Date.now() / 1000 - 14 * 86400;
    recent = games
      .filter((g) => g.last_played_unix && g.last_played_unix > cutoff)
      .sort((a, b) => b.last_played_unix - a.last_played_unix);
  }
  const section = $("#recent-section");
  if (!recent.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $("#recent-row").innerHTML = recent
    .map((g) => {
      const playBtn = g.installed_on
        ? `<button class="play-btn" data-appid="${g.appid}" data-target="${
            g.installed_on
          }" data-bottle="${esc(g.bottle || "")}" title="${t("Start {0}", esc(g.name))}">▶</button>`
        : "";
      return `
      <div class="recent-card" data-appid="${g.appid}" data-name="${esc(g.name)}">
        ${playBtn}
        <img loading="lazy" src="${g.header_image}" alt="" data-appid="${g.appid}"
             data-stage="header" onerror="coverError(this, '${g.header_image}')" />
        <div class="recent-info">
          <strong>${esc(g.name)}</strong>
          <span>${fmtHours(g.playtime_2weeks_hours)} · ${t("total")} ${fmtHours(
        g.playtime_forever_hours
      )}</span>
        </div>
      </div>`;
    })
    .join("");
}

// Ting der støjer i tal og anbefalinger: demoer, soundtracks, servere m.m.
const JUNK_RE = /\b(demo|soundtrack|ost|beta|playtest|dedicated server|sdk|benchmark|trailer|artbook|dlc)\b/i;
let hiddenMap = {};

function renderLibrary(games) {
  const grid = $("#library-grid");
  if (libraryFilter === "installed") {
    games = games.filter((g) => g.installed_on);
  } else if (libraryFilter === "native") {
    games = games.filter((g) => g.mac_native === true);
  } else if (libraryFilter === "windows") {
    games = games.filter((g) => g.mac_native === false);
  } else if (libraryFilter === "controller") {
    games = games.filter((g) => g.controller_support === "full");
  }
  if (libraryFilter === "junk") {
    games = games.filter((g) => g._junk || JUNK_RE.test(g.name));
  } else {
    games = games.filter((g) => !g._junk);
  }
  if (!games.length) {
    grid.innerHTML = `<div class="empty">${t("No games match.")}</div>`;
    return;
  }
  grid.innerHTML = games
    .map((g) => {
      const zero = g.playtime_forever_min === 0;
      const badge =
        g.installed_on === "mac"
          ? `<span class="install-badge mac">${t("✓ Installed")}</span>`
          : g.installed_on === "crossover"
          ? `<span class="install-badge xo">${t("✓ CrossOver")}</span>`
          : "";
      const playBtn = g.installed_on
        ? `<button class="play-btn" data-appid="${g.appid}" data-target="${
            g.installed_on
          }" data-bottle="${esc(g.bottle || "")}" title="${t("Start {0}", esc(g.name))}">▶</button>`
        : "";
      const junkBtn =
        libraryFilter === "junk"
          ? `<button class="btn junk-toggle" data-appid="${g.appid}" data-next="${
              g._junk ? "show" : "hide"
            }">${g._junk ? t("Show in library again") : t("🧹 Hide")}</button>`
          : "";
      return `
      <div class="cover ${g.installed_on ? "is-installed" : ""}" data-appid="${
        g.appid
      }" data-name="${esc(g.name)}">
        ${badge}
        ${playBtn}
        ${junkBtn}
        <div class="fallback">${esc(g.name)}</div>
        <img loading="lazy" src="${g.library_capsule}" alt="" data-appid="${g.appid}"
             data-stage="capsule" onerror="coverError(this, '${g.header_image}')" />
        <div class="overlay">
          <div class="title">${esc(g.name)}</div>
          <div class="ov-row"><span class="playtime ${zero ? "zero" : ""}">${fmtHours(
        g.playtime_forever_hours
      )}</span><span>${acChip(g) || platformChip(g)}</span></div>
        </div>
      </div>`;
    })
    .join("");
}

// Platform/kompatibilitets-chip:  native eller 🍷 CrossOver-rating.
const RATING_LABEL = {
  perfect: "Perfect",
  playable: "Playable",
  runs: "Runs with issues",
  broken: "Doesn't work",
  unknown: "Unknown",
};
function acChip(g) {
  if (!g.anticheat) return "";
  const st = g.anticheat.status;
  if (st !== "Denied" && st !== "Broken") return "";
  return `<span class="platform-chip xo rating-broken" title="${t(
    "Anticheat: {0} - likely will not work under CrossOver",
    st
  )}">AC:${st.toUpperCase()}</span>`;
}
function platformChip(g) {
  if (g.mac_native === true) {
    return `<span class="platform-chip native" title="${t("Runs natively on macOS")}">NATIVE</span>`;
  }
  if (g.mac_native === false) {
    const r = g.crossover_rating || "unknown";
    const label = t(RATING_LABEL[r] || "Unknown");
    const short = r === "unknown" ? "XO:?" : `XO:${label}`;
    return `<span class="platform-chip xo rating-${r}" title="${t(
      "CrossOver compatibility: {0} (community data from AppleGamingWiki)",
      label
    )}">${short}</span>`;
  }
  return ""; // ukendt endnu (berigelse i gang)
}

// ASCII shader-cache bar (terminal signature) for CrossOver games.
function asciiBar(bytes) {
  if (!bytes) return "[" + "\u2591".repeat(10) + "]";
  const mb = bytes / 1048576;
  const filled = Math.max(1, Math.min(10, Math.round((Math.log10(mb + 1) / 3) * 10)));
  return "[" + "\u2593".repeat(filled) + "\u2591".repeat(10 - filled) + "]";
}

$$(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    libraryFilter = chip.dataset.filter;
    const q = $("#library-search").value.toLowerCase().trim();
    renderLibrary(
      q
        ? libraryGames.filter((g) => g.name.toLowerCase().includes(q))
        : libraryGames
    );
  });
});

$("#library-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderLibrary(
    q ? libraryGames.filter((g) => g.name.toLowerCase().includes(q)) : libraryGames
  );
});

// --- Recommendations ---
async function loadRecommendations() {
  const grid = $("#recs-grid");
  try {
    const data = await api("/api/recommendations");
    const en = data.enrichment;
    const statusEl = $("#recs-status");
    if (en && en.running && en.total) {
      statusEl.hidden = false;
      statusEl.innerHTML = t(
        "Enriching library with Steam data in the background: <strong>{0}/{1}</strong> reviews · <strong>{2}/{3}</strong> Metacritic/genres — recommendations improve over time.",
        en.reviews_done,
        en.total,
        en.details_done,
        en.total
      );
    } else {
      statusEl.hidden = true;
    }
    $("#recs-profile").innerHTML = data.profile.length
      ? `<span class="dim-label">${t("Your taste profile:")}</span> ` +
        data.profile
          .map(
            (p) => `<span class="genre-chip">${esc(p.genre)} ${p.weight}%</span>`
          )
          .join("")
      : "";
    if (!data.recommendations.length) {
      grid.innerHTML = `<div class="empty">${t(
        "No recommendations yet — wait for enrichment to progress and press ↻ Refresh."
      )}</div>`;
      return;
    }
    grid.innerHTML = data.recommendations
      .map((r) => {
        const mc = r.metacritic
          ? `<span class="mc-badge ${
              r.metacritic >= 75 ? "good" : r.metacritic >= 50 ? "mid" : "bad"
            }">${r.metacritic}</span>`
          : "";
        const review = r.review_score_desc
          ? `<span class="review-level ${reviewClass(r.review_positive_pct)}">${esc(
              t(r.review_score_desc)
            )}${r.review_positive_pct !== null ? ` · ${r.review_positive_pct}%` : ""}</span>`
          : "";
        const why = r.matched_genres.length
          ? t("Because you play {0}", r.matched_genres.map(esc).join(", "))
          : t("Broadly recommended");
        return `
        <div class="rec-card" data-appid="${r.appid}" data-name="${esc(r.name)}">
          <img loading="lazy" src="${r.header_image}" alt="" data-appid="${r.appid}"
               data-stage="header" onerror="coverError(this, '${r.header_image}')" />
          <div class="rec-body">
            <div class="rec-title-row">
              <h4>${esc(r.name)}</h4>${mc}
            </div>
            ${review}
            <p class="rec-why">${why}${r.release_year ? ` · ${r.release_year}` : ""}</p>
          </div>
        </div>`;
      })
      .join("");
    recsLoaded = true;
  } catch (err) {
    grid.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function reviewClass(pct) {
  if (pct === null || pct === undefined) return "";
  if (pct >= 80) return "pos";
  if (pct >= 50) return "mixed";
  return "neg";
}

$("#recs-reload").addEventListener("click", () => {
  loadRecommendations();
  loadDiscover();
});
$("#recs-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".rec-card[data-appid]");
  if (card) openAchievements(Number(card.dataset.appid), card.dataset.name);
});

// --- Wishlist + prisalarmer ---
async function loadWishlist() {
  let box = document.getElementById("wishlist-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "wishlist-box";
    document.querySelector("#discover .discover-note").after(box);
  }
  try {
    const wl = await api("/api/wishlist");
    if (!wl.enabled) {
      box.innerHTML = "";
      return;
    }
    if (!wl.items.length) {
      box.innerHTML = `<div class="empty">${t("Your Steam wishlist is empty.")}</div>`;
      return;
    }
    box.innerHTML =
      `<h3 class="subhead">${t("Your wishlist ({0}) - set a target price to get a macOS alert", wl.total)}</h3>` +
      `<div class="wl-table">` +
      wl.items
        .map(
          (w) => `
        <div class="wl-row ${w.alert ? "wl-alert" : ""}" data-appid="${w.appid}">
          <span class="wl-name">${w.alert ? "[ALERT] " : ""}${esc(w.name)}</span>
          <span class="wl-price">${
            w.best && typeof w.best.price_dkk === "number"
              ? `${fmtPrice(w.best.price_dkk, w.best.price_currency)} <span class="dim">${t("at")} ${esc(w.best.shop)}</span>`
              : `<span class="dim">${t("price loading…")}</span>`
          }</span>
          <span class="wl-target"><input type="number" step="0.5" min="0" placeholder="${t("target")}" value="${
            w.target ?? ""
          }" data-appid="${w.appid}" class="wl-input" /></span>
        </div>`
        )
        .join("") +
      `</div>`;
    for (const inp of box.querySelectorAll(".wl-input")) {
      inp.addEventListener("change", async () => {
        try {
          await api("/api/wishlist/target", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appid: Number(inp.dataset.appid), target: inp.value === "" ? null : Number(inp.value) }),
          });
          toast(t("Target saved - you will get a macOS notification when the price drops."), "ok");
        } catch (err) {
          toast(t(err.message), "err");
        }
      });
    }
  } catch {
    box.innerHTML = "";
  }
}

// --- Buy ideas ---
let discoverData = [];
let discoverFilter = "all";

$$(".discover-filters .filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    $$(".discover-filters .filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    discoverFilter = chip.dataset.dfilter;
    renderDiscoverCards();
    loadDeals(discoverData);
  });
});

function renderDiscoverCards() {
  const grid = $("#discover-grid");
  let list = discoverData;
  if (discoverFilter === "fit") {
    list = list.filter((r) => r.mac_fit === true);
    if (!list.length) {
      grid.innerHTML = `<div class="empty">${t(
        "No confirmed good fits yet — compatibility data is still loading. Try again shortly."
      )}</div>`;
      return;
    }
  }
  if (!list.length) {
    grid.innerHTML = `<div class="empty">${t(
      "No ideas yet — the taste profile needs library enrichment. Try again shortly."
    )}</div>`;
    return;
  }
  grid.innerHTML = list
    .map((r) => {
        const mc = r.metacritic
          ? `<span class="mc-badge ${
              r.metacritic >= 75 ? "good" : r.metacritic >= 50 ? "mid" : "bad"
            }">${r.metacritic}</span>`
          : "";
        const priceStr = fmtPrice(r.price_dkk, r.price_currency);
        const price =
          r.price_dkk === 0
            ? `<span class="price-tag free">${t("Free")}</span>`
            : priceStr
            ? `<span class="price-tag">${priceStr}${
                r.discount_pct ? ` <em class="discount">−${r.discount_pct}%</em>` : ""
              }</span>`
            : `<span class="price-tag dim">${t("price loading…")}</span>`;
        return `
        <a class="rec-card discover-card" data-appid="${r.appid}" href="${
          r.store_url
        }" target="_blank" rel="noopener">
          <img loading="lazy" src="${r.header_image}" alt=""
               onerror="this.style.display='none'" />
          <div class="rec-body">
            <div class="rec-title-row">
              <h4>${esc(r.name)}</h4>${mc}
            </div>
            <span class="review-level ${reviewClass(r.review_positive_pct)}">${t(
          "{0}% positive",
          r.review_positive_pct
        )}</span>
            ${price}
            <span>${acChip(r) || platformChip(r)}</span>
            <p class="rec-why">${t("Matches {0}", r.matched_genres.map(esc).join(", "))}${
          r.release_year ? ` · ${r.release_year}` : ""
        } · ${t("Steam store ↗")}</p>
            <p class="deal-line" data-appid="${r.appid}"></p>
          </div>
        </a>`;
      })
      .join("");
}

async function loadDiscover() {
  loadWishlist();
  const grid = $("#discover-grid");
  try {
    const data = await api("/api/discover");
    discoverData = data.recommendations || [];
    renderDiscoverCards();
    discoverLoaded = true;
    if (data.prices_pending > 0) {
      toast(t("{0} prices still loading — press ↻ shortly.", data.prices_pending), "ok");
    }
    loadDeals(discoverData);
  } catch (err) {
    grid.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

// Best prices from IsThereAnyDeal (if ITAD_API_KEY is set in .env).
async function loadDeals(recs) {
  try {
    const data = await api("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        games: recs.map((r) => ({ appid: r.appid, title: r.name })),
      }),
    });
    if (!data.enabled) {
      $(".discover-note").innerHTML +=
        ` <span class="dim-label">${t(
          'Cross-store price comparison: add a free <a {0}>ITAD key</a> as ITAD_API_KEY in .env.',
          'href="https://isthereanydeal.com/apps/" target="_blank" rel="noopener" style="color:var(--accent)"'
        )}</span>`;
      return;
    }
    if (data.affiliates_active) {
      $(".discover-note").innerHTML +=
        ` <span class="dim-label">${t(
          "Links marked 💰 are affiliate links — we may earn a commission."
        )}</span>`;
    }
    for (const [appid, d] of Object.entries(data.deals || {})) {
      const line = document.querySelector(`.deal-line[data-appid="${appid}"]`);
      if (!line) continue;
      const parts = [];
      if (d.best && typeof d.best.price_dkk === "number") {
        parts.push(
          `${t("Best price: ")}<a href="${d.best.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><strong>${fmtPrice(
            d.best.price_dkk,
            d.best.price_currency
          )}</strong> ${t("at")} ${esc(d.best.shop)}${d.best.affiliate ? " 💰" : ""} ↗</a>`
        );
      }
      if (d.ig_url) {
        parts.push(
          `<a href="${d.ig_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Instant Gaming${d.ig_affiliate ? " 💰" : ""} <small>${t(
            "(grey market)"
          )}</small> ↗</a>`
        );
      }
      if (parts.length) line.innerHTML = parts.join(" · ");
    }
  } catch {
    /* price comparison is optional */
  }
}


// --- HowLongToBeat (fylder HLTB-rækken i detalje-visningen) ---
let hltbRequestId = 0;
async function loadHltb(appid, name) {
  const reqId = ++hltbRequestId;
  try {
    const h = await api(`/api/hltb?name=${encodeURIComponent(name)}`);
    if (reqId !== hltbRequestId) return;
    const rowEl = $("#gd-hltb-row");
    if (!rowEl || !h.found || !h.main_h) return;
    const game = libraryGames.find((g) => g.appid === appid);
    const myH = game ? game.playtime_forever_hours : 0;
    const pct = h.main_h ? Math.min(999, Math.round((myH / h.main_h) * 100)) : null;
    $("#gd-hltb").innerHTML =
      `Main <strong>${fmtHours(h.main_h)}</strong>` +
      (h.plus_h ? ` · +Extra ${fmtHours(h.plus_h)}` : "") +
      (h.completionist_h ? ` · 100% ${fmtHours(h.completionist_h)}` : "") +
      (myH > 0 && pct !== null
        ? ` · <span class="hltb-me">${t("Your time: {0} ≈ {1}% of Main", fmtHours(myH), pct)}</span>`
        : "") +
      ` <a href="${h.url}" target="_blank" rel="noopener">hltb ↗</a>`;
    rowEl.hidden = false;
  } catch {
    /* valgfri */
  }
}

// --- Achievements modal ---
const achModal = $("#ach-modal");
function closeAchModal() {
  achModal.hidden = true;
}
$("#ach-close").addEventListener("click", closeAchModal);
achModal.addEventListener("click", (e) => {
  if (e.target === achModal) closeAchModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !achModal.hidden) closeAchModal();
});

async function openAchievements(appid, name) {
  const g = libraryGames.find((x) => x.appid === appid) || { appid, name };
  $("#ach-title").textContent = name;

  // Banner
  const banner = $("#gd-banner");
  banner.hidden = false;
  banner.onerror = () => {
    banner.onerror = () => (banner.hidden = true);
    fetch(`/api/steam/artwork/${appid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((art) => {
        if (art && art.header_image) banner.src = art.header_image;
        else banner.hidden = true;
      })
      .catch(() => (banner.hidden = true));
  };
  banner.src =
    g.header_image ||
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

  // Info-rækker (terminal-tabel)
  const rows = [];
  const row = (label, valueHtml) =>
    rows.push(
      `<div class="gd-row"><span class="gd-label">${label}</span><span class="gd-value">${valueHtml}</span></div>`
    );

  if (g.mac_native === true) {
    row(t("Platform"), `<span class="platform-chip native">NATIVE</span>`);
  } else if (g.mac_native === false) {
    const r = g.crossover_rating || "unknown";
    const label = t(RATING_LABEL[r] || "Unknown");
    row(
      t("Platform"),
      `<span class="platform-chip xo rating-${r}">XO:${
        r === "unknown" ? "?" : label
      }</span>${
        g.crossover_url
          ? ` <a href="${g.crossover_url}" target="_blank" rel="noopener">AGW ↗</a>`
          : ""
      }`
    );
  }

  if (g.controller_support) {
    row(
      t("Controller"),
      g.controller_support === "full"
        ? `<span class="platform-chip pad">PAD:FULL</span> ${t("Full controller support")}`
        : `<span class="platform-chip pad partial">PAD:PART</span> ${t("Partial controller support")}`
    );
  }

  // Skjul/vis i biblioteket (junk-regex kan overstyres per spil)
  {
    const isJunk = g._junk;
    row(
      t("Library"),
      `<button class="btn" id="gd-hide-btn" data-appid="${g.appid}" data-next="${
        isJunk ? "show" : "hide"
      }">${isJunk ? t("Show in library again") : t("🧹 Hide from library")}</button>`
    );
    setTimeout(() => {
      $("#gd-hide-btn")?.addEventListener("click", async (ev) => {
        const btn = ev.target;
        try {
          await api("/api/hidden", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appid: Number(btn.dataset.appid), state: btn.dataset.next }),
          });
          toast(btn.dataset.next === "hide" ? t("Hidden — find it under 🧹 Junk.") : t("Shown in library again."), "ok");
          loadLibrary();
          achModal.hidden = true;
        } catch (err) {
          toast(t(err.message), "err");
        }
      });
    }, 0);
  }

  // Ydelse på din Mac: egne beviser > community-rapporter > kalibreret gæt
  {
    const parts = [];
    if (g.proven_on_this_mac) {
      parts.push(
        `<span class="perf-chip proven">✓ ${t("Runs on your Mac")}</span> ${fmtHours(
          g.playtime_forever_hours || 0
        )}${g.shader_cache?.size_bytes ? " · shader cache ✓" : ""}`
      );
    } else if (g.perf_expectation) {
      const LVL = {
        easy: ["easy", t("Easy for your Mac")],
        good: ["good", t("Should run well on your Mac")],
        heavy: ["heavy", t("Heavy — expect lowered settings")],
        edge: ["edge", t("Borderline on your Mac")],
      }[g.perf_expectation.level];
      let note = "";
      if (g.perf_expectation.notes?.includes("fanless_throttle"))
        note += " · " + t("fanless: may throttle in long sessions");
      if (g.perf_expectation.notes?.includes("low_ram")) note += " · " + t("8 GB RAM is tight");
      if (LVL) parts.push(`<span class="perf-chip ${LVL[0]}">${LVL[1]}</span>${note}`);
    }
    if (g.perf_reports?.total) {
      const s = g.perf_reports.same_gen
        ? g.perf_reports.same_gen_summary
        : g.perf_reports.summary;
      const sum = Object.entries(s)
        .map(([k, v]) => `${v}× ${k}`)
        .join(", ");
      parts.push(
        `<span class="dim">${t("{0} community reports", g.perf_reports.total)}${
          g.perf_reports.same_gen ? ` (M${MACHINE?.gen}: ${sum})` : ` (${sum})`
        }</span>`
      );
    }
    if (MACHINE?.chip) {
      const u = new URL("https://github.com/PlayHubHQDK/playhub/issues/new");
      u.searchParams.set("template", "performance-report.yml");
      u.searchParams.set("title", `[perf] ${g.name}`);
      u.searchParams.set("game", g.name);
      u.searchParams.set("appid", String(g.appid));
      u.searchParams.set("device", MACHINE.device || "");
      u.searchParams.set("chip", MACHINE.chip);
      u.searchParams.set("ram", String(MACHINE.ram_gb || ""));
      parts.push(
        `<a href="${u.href}" target="_blank" rel="noopener">${t("Report how it runs")} ↗</a>`
      );
    }
    if (parts.length) row(t("On your Mac"), parts.join("<br>"));
  }

  if (g.anticheat) {
    const st = g.anticheat.status;
    const cls = st === "Denied" || st === "Broken" ? "neg" : st === "Planned" ? "mixed" : "pos";
    row(
      t("Anticheat"),
      `<span class="review-level ${cls}" style="margin:0">${esc(st.toUpperCase())}</span> ${esc(
        (g.anticheat.anticheats || []).join(", ")
      )}${
        g.anticheat.url
          ? ` <a href="${g.anticheat.url}" target="_blank" rel="noopener" title="${t(
              "Community data from AreWeAntiCheatYet (Linux/Proton; CrossOver is typically the same or stricter)"
            )}">AWACY</a>`
          : ""
      }`
    );
  }

  row(
    t("Installed"),
    g.installed_on === "mac"
      ? "MAC"
      : g.installed_on === "crossover"
      ? `CROSSOVER${g.bottle ? " · " + esc(g.bottle) : ""}`
      : "—"
  );

  const lp = g.last_played_unix
    ? ` · ${t("last played")} ${new Date(g.last_played_unix * 1000).toLocaleDateString(LOCALE)}`
    : "";
  row(t("Playtime"), `${fmtHours(g.playtime_forever_hours || 0)}${lp}`);

  if (g.shader_cache && g.shader_cache.size_bytes) {
    row(
      t("Shader cache"),
      `<span class="cache-chip" style="margin:0;display:inline">${asciiBar(
        g.shader_cache.size_bytes
      )} ${fmtBytes(g.shader_cache.size_bytes)}</span>`
    );
  }

  if (g.review_score_desc || g.metacritic) {
    row(
      t("Reviews"),
      (g.review_score_desc
        ? `<span class="review-level ${reviewClass(g.review_positive_pct)}" style="margin:0">${esc(
            t(g.review_score_desc)
          )}${
            g.review_positive_pct !== null && g.review_positive_pct !== undefined
              ? ` · ${g.review_positive_pct}%`
              : ""
          }</span>`
        : "") +
        (g.metacritic
          ? ` <span class="mc-badge ${
              g.metacritic >= 75 ? "good" : g.metacritic >= 50 ? "mid" : "bad"
            }">MC ${g.metacritic}</span>`
          : "")
    );
  }

  rows.push(
    `<div class="gd-row" id="gd-hltb-row" hidden><span class="gd-label">HLTB</span><span class="gd-value" id="gd-hltb"></span></div>`
  );
  if (g.installed_on) {
    rows.push(
      `<div class="gd-row"><span class="gd-label">${t("Launch options")}</span><span class="gd-value gd-opts"><input id="gd-opts-input" type="text" placeholder="-dx11 -windowed …" spellcheck="false" /><button class="btn" id="gd-opts-save">${t("Save")}</button></span></div>`
    );
  }
  $("#gd-info").innerHTML = rows.join("");
  const optsInput = $("#gd-opts-input");
  if (optsInput) {
    api(`/api/launchopts/${g.appid}`).then((r) => (optsInput.value = r.opts || "")).catch(() => {});
    $("#gd-opts-save").addEventListener("click", async () => {
      try {
        await api(`/api/launchopts/${g.appid}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opts: optsInput.value }),
        });
        toast(t("Launch options saved."), "ok");
      } catch (err) {
        toast(t(err.message), "err");
      }
    });
  }

  // Handlinger
  const acts = [];
  if (g.installed_on) {
    acts.push(`<button class="btn primary" id="gd-launch">▶ ${t("Launch")}</button>`);
  }
  acts.push(
    `<a class="btn" href="https://store.steampowered.com/app/${appid}" target="_blank" rel="noopener">${t(
      "Steam store ↗"
    )}</a>`
  );
  $("#gd-actions").innerHTML = acts.join("");
  const lb = $("#gd-launch");
  if (lb) {
    lb.addEventListener("click", async () => {
      lb.disabled = true;
      try {
        const r = await api("/api/launch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appid: g.appid,
            target: g.installed_on,
            bottle: g.bottle || undefined,
          }),
        });
        toast(
      r.method === "crossover"
        ? (r.rewarm && r.rewarm.restored && r.rewarm.restored.length
            ? t("Shader cache restored from backup ({0}) — launching without recompile…", fmtBytes(r.rewarm.restored.reduce((s, x) => s + x.bytes, 0)))
            : t("Starting via CrossOver (bottle: {0}) — first start can take a while…", r.bottle))
        : t("Starting via Steam…"),
      "ok"
    );
      } catch (err) {
        toast(t(err.message), "err");
      } finally {
        setTimeout(() => (lb.disabled = false), 3000);
      }
    });
  }

  $("#ach-progress").hidden = true;
  $("#ach-body").innerHTML = `<div class="loading">${t("Fetching achievements…")}</div>`;
  achModal.hidden = false;
  loadHltb(appid, name);
  try {
    const a = await api(`/api/steam/achievements/${appid}`);
    if (!a.success || !a.total) {
      $("#ach-body").innerHTML = `<div class="empty">${esc(
        a.error || t("This game has no achievements.")
      )}</div>`;
      return;
    }
    $("#ach-progress").hidden = false;
    $("#ach-bar-fill").style.width = `${a.percent_complete}%`;
    $("#ach-pct").textContent = `${a.unlocked}/${a.total} · ${a.percent_complete}%`;
    const unlocked = a.achievements
      .filter((x) => x.achieved)
      .sort((x, y) => (y.unlock_time_unix || 0) - (x.unlock_time_unix || 0));
    const locked = a.achievements.filter((x) => !x.achieved);
    const achRow = (x) => `
      <div class="ach-row ${x.achieved ? "unlocked" : "locked"}">
        ${
          x.icon
            ? `<img class="ach-icon" loading="lazy" src="${x.icon}" alt="" onerror="this.style.visibility='hidden'">`
            : `<div class="ach-icon"></div>`
        }
        <div class="ach-info">
          <strong>${esc(x.name)}</strong>
          ${x.description ? `<p>${esc(x.description)}</p>` : ""}
        </div>
        <span class="ach-date">${
          x.achieved && x.unlock_time_unix
            ? new Date(x.unlock_time_unix * 1000).toLocaleDateString(LOCALE)
            : "🔒"
        }</span>
      </div>`;
    $("#ach-body").innerHTML =
      (unlocked.length
        ? `<h4 class="ach-section">${t("Unlocked ({0})", unlocked.length)}</h4>` +
          unlocked.map(achRow).join("")
        : "") +
      (locked.length
        ? `<h4 class="ach-section">${t("Missing ({0})", locked.length)}</h4>` +
          locked.map(achRow).join("")
        : "");
  } catch (err) {
    $("#ach-body").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

// --- "Hvad skal jeg spille i aften?" ---
const TONIGHT_REASON = {
  comfort: "Your current game",
  quick: "Reliable fun",
  backlog: "Never started — tonight?",
};
$("#tonight-btn").addEventListener("click", () => {
  const box = $("#tonight-box");
  box.hidden = !box.hidden;
  if (!box.hidden && !$("#tonight-grid").children.length) loadTonight(120);
});
$$("#tonight-box [data-mins]").forEach((chip) =>
  chip.addEventListener("click", () => {
    $$("#tonight-box [data-mins]").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    loadTonight(Number(chip.dataset.mins));
  })
);
async function loadTonight(minutes) {
  const grid = $("#tonight-grid");
  grid.innerHTML = `<div class="loading">…</div>`;
  try {
    const d = await api(`/api/tonight?minutes=${minutes}`);
    if (!d.picks.length) {
      grid.innerHTML = `<div class="empty">${t("No suggestions — play something first!")}</div>`;
      return;
    }
    grid.innerHTML = d.picks
      .map(
        (p) => `
      <div class="card tonight-card" data-appid="${p.appid}" data-name="${esc(p.name)}">
        <img class="thumb" loading="lazy" src="${p.header_image}" onerror="this.style.display='none'" alt="" />
        <div class="info">
          <span class="tonight-reason">${t(TONIGHT_REASON[p.reason] || "")}</span>
          <h4>${esc(p.name)}</h4>
          <p>${fmtHours(p.playtime_forever_hours || 0)}${
          p.main_h ? ` · HLTB ${p.main_h} h` : ""
        }${p.installed_on ? "" : ` · ${t("not installed")}`}</p>
          ${
            p.installed_on
              ? `<button class="play-btn tonight-play" data-appid="${p.appid}" data-target="${p.installed_on}" data-bottle="${esc(
                  p.bottle || ""
                )}">▶ ${t("Play")}</button>`
              : ""
          }
        </div>
      </div>`
      )
      .join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty">${esc(t(err.message))}</div>`;
  }
}

// Clicks in the library panel: play buttons + covers (achievements).
$("#library").addEventListener("click", async (e) => {
  const jt = e.target.closest(".junk-toggle");
  if (jt) {
    e.stopPropagation();
    const appid = Number(jt.dataset.appid);
    const next = jt.dataset.next;
    try {
      await api("/api/hidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appid, state: next }),
      });
      hiddenMap[appid] = next;
      const g = libraryGames.find((x) => x.appid === appid);
      if (g) g._junk = next === "hide" || (JUNK_RE.test(g.name) && next !== "show");
      $("#library-count").textContent = `${
        libraryGames.filter((x) => !x._junk).length
      } ${t("games")}`;
      const q = $("#library-search").value.toLowerCase().trim();
      renderLibrary(
        q ? libraryGames.filter((x) => x.name.toLowerCase().includes(q)) : libraryGames
      );
      renderStats(libraryGames);
    } catch (err) {
      toast(t(err.message), "err");
    }
    return;
  }
  const btn = e.target.closest(".play-btn");
  if (!btn) {
    const cover = e.target.closest(".cover[data-appid], .recent-card[data-appid]");
    if (cover) openAchievements(Number(cover.dataset.appid), cover.dataset.name);
    return;
  }
  e.stopPropagation();
  btn.disabled = true;
  try {
    const r = await api("/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appid: Number(btn.dataset.appid),
        target: btn.dataset.target,
        bottle: btn.dataset.bottle || undefined,
      }),
    });
    toast(
      r.method === "crossover"
        ? (r.rewarm && r.rewarm.restored && r.rewarm.restored.length
            ? t("Shader cache restored from backup ({0}) — launching without recompile…", fmtBytes(r.rewarm.restored.reduce((s, x) => s + x.bytes, 0)))
            : t("Starting via CrossOver (bottle: {0}) — first start can take a while…", r.bottle))
        : t("Starting via Steam…"),
      "ok"
    );
  } catch (err) {
    toast(t(err.message), "err");
  } finally {
    setTimeout(() => (btn.disabled = false), 3000);
  }
});

// --- Native games ---
async function loadNative() {
  try {
    const data = await api("/api/native-games");
    renderApps(data.applications || []);
  } catch (err) {
    $("#native-apps").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function renderApps(apps) {
  const el = $("#native-apps");
  if (!apps.length) {
    el.innerHTML = `<div class="empty">${t(
      "No apps in /Applications with a game category."
    )}</div>`;
    return;
  }
  el.innerHTML = apps
    .map((a) => {
      const thumb = a.icon_path
        ? `<img class="thumb" loading="lazy" src="/api/icon?path=${encodeURIComponent(
            a.icon_path
          )}" onerror="this.outerHTML='<div class=\\'thumb mono\\'>🎮</div>'" alt="" />`
        : `<div class="thumb mono">🎮</div>`;
      return `
      <div class="card">
        ${thumb}
        <div class="info">
          <h4>${esc(a.name)}</h4>
          <p>${esc(a.version ? "v" + a.version : a.bundle_id || "")}</p>
          <span class="tag">${esc(a.category.replace("public.app-category.", ""))}</span>
        </div>
      </div>`;
    })
    .join("");
}

// --- CrossOver ---
async function loadCrossover() {
  const el = $("#crossover-list");
  try {
    const data = await api("/api/crossover/bottles");
    $("#crossover-root").textContent = data.crossover_root || "";
    const ab = data.autobackup;
    $("#autobackup-status").innerHTML = ab
      ? t(
          "Auto-backup: <strong>active</strong> — checks every {0} min, backs up after {1} min of quiet",
          ab.poll_minutes,
          ab.quiet_minutes
        ) +
        (ab.last_backup
          ? ` · ${t("latest")}: ${new Date(ab.last_backup).toLocaleString(LOCALE)} (${esc(
              ab.last_backup_bottle || ""
            )})`
          : ` · ${t("no auto-backup yet")}`) +
        (ab.last_error ? ` · <span class="ab-err">${t("error")}: ${esc(ab.last_error)}</span>` : "")
      : "";
    const econ = document.getElementById("cache-econ") || (() => {
      const d = document.createElement("div");
      d.id = "cache-econ";
      d.className = "autobackup-status";
      $("#autobackup-status").after(d);
      return d;
    })();
    econ.innerHTML =
      t("Disk: live caches {0} · backups {1}", fmtBytes(data.caches_total_bytes || 0), fmtBytes(data.backups_total_bytes || 0)) +
      ` <button class="btn" id="prune-btn" style="margin-left:0.6rem">${t("Prune old backups (keep 3)")}</button>`;
    document.getElementById("prune-btn").addEventListener("click", async () => {
      const bottle = data.bottles[0]?.name;
      if (!bottle) return;
      if (!confirm(t("Delete all but the 3 newest backups for \"{0}\"?", bottle))) return;
      try {
        const r = await api("/api/crossover/prune", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bottle, keep: 3 }),
        });
        toast(t("Pruned {0} backup(s) — {1} freed.", r.deleted, fmtBytes(r.freed_bytes)), "ok");
        loadCrossover();
      } catch (err) {
        toast(t(err.message), "err");
      }
    });
    renderBottles(data);
  } catch (err) {
    el.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function renderBottles(data) {
  const el = $("#crossover-list");
  if (!data.root_exists) {
    el.innerHTML = `<div class="empty">${t(
      "CrossOver doesn't seem to be installed."
    )}<br><small>${t("Expected: ~/Library/Application Support/CrossOver")}</small></div>`;
    return;
  }
  if (!data.bottles.length) {
    el.innerHTML = `<div class="empty">${t("No CrossOver bottles found yet.")}<br><small>${t(
      "Create a bottle in CrossOver and it will appear here."
    )}</small></div>`;
    return;
  }
  el.innerHTML = data.bottles.map(bottleHtml).join("");
}

function bottleHtml(b) {
  const on = b.has_cache;
  const caches = b.caches.length
    ? b.caches
        .map((c) => {
          const mod = c.last_modified
            ? ` · ${t("last modified")} ${new Date(c.last_modified).toLocaleString(LOCALE)}`
            : "";
          return `<div class="cache-line">${esc(c.label)}<br><span class="dim">${esc(
            c.path
          )}</span><br><span class="dim">${c.file_count} ${t("files")} · ${fmtBytes(
            c.size_bytes
          )}${mod}</span></div>`;
        })
        .join("")
    : `<div class="cache-line dim">${t(
        "No D3DMetal shader cache found yet — run a game in the bottle first."
      )}</div>`;

  const backups = b.backups.length
    ? `<div class="backups"><strong>${t("Backups:")}</strong>${b.backups
        .map(
          (bk) =>
            `<div class="backup-item"><span>${new Date(bk.created_at).toLocaleString(
              LOCALE
            )}</span>${bk.auto ? `<span class="tag auto-tag">${t("auto")}</span>` : ""}<span class="dim">${
              bk.total_files
            } ${t("files")} · ${fmtBytes(bk.total_bytes)}</span></div>`
        )
        .join("")}</div>`
    : "";

  return `
    <div class="bottle" data-bottle="${esc(b.name)}">
      <div class="bottle-head">
        <h3><span class="status-dot ${on ? "on" : "off"}"></span>${esc(b.name)}</h3>
        <span class="badge">${b.caches.length} ${t("cache folder(s)")}</span>
      </div>
      <div class="meta">${esc(b.path)}</div>
      ${caches}
      <div class="actions">
        <button class="btn primary" data-act="backup" ${b.has_cache ? "" : "disabled"}>${t(
    "Back up shader cache"
  )}</button>
        <button class="btn" data-act="restore" ${b.backups.length ? "" : "disabled"}>${t(
    "Restore latest"
  )}</button>
        <button class="btn" data-act="clean">${t("Clean bottle temp")}</button>
        <button class="btn" data-act="doctor">${t("Run Bottle Doctor")}</button>
        <button class="btn" data-act="clearcache" ${
          b.has_cache && b.backups.length ? "" : "disabled"
        } title="${t("Frees disk space. Requires a backup first — restore brings the cache back instantly.")}">${t(
    "Clear shader cache"
  )}</button>
      </div>
      ${backups}
    </div>`;
}

$("#crossover-list").addEventListener("click", async (e) => {
  const fixBtn = e.target.closest(".doc-fix");
  if (fixBtn) {
    fixBtn.disabled = true;
    fixBtn.textContent = t("Working…");
    try {
      const r = await api("/api/crossover/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle: fixBtn.dataset.bottle, fix: fixBtn.dataset.fix }),
      });
      toast(
        r.fixed
          ? t("Fixed: {0}", r.fixed.join(", ") || "-")
          : t("Cleaned up: {0} freed ({1} files).", fmtBytes(r.freed_bytes || 0), r.files_removed || 0),
        "ok"
      );
      fixBtn.textContent = t("Done");
    } catch (err) {
      toast(t(err.message), "err");
      fixBtn.disabled = false;
      fixBtn.textContent = t("Fix it");
    }
    return;
  }
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const bottle = btn.closest(".bottle").dataset.bottle;
  const act = btn.dataset.act;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = t("Working…");
  try {
    if (act === "doctor") {
      const r = await api(`/api/crossover/doctor/${encodeURIComponent(bottle)}`);
      const box = btn.closest(".bottle").querySelector(".doctor-results") || (() => {
        const d = document.createElement("div");
        d.className = "doctor-results";
        btn.closest(".actions").after(d);
        return d;
      })();
      box.innerHTML = r.checks
        .map(
          (c) =>
            `<div class="doc-line doc-${c.status}">[${c.status.toUpperCase()}] ${esc(c.message)}${
              c.fix
                ? ` <button class="btn doc-fix" data-fix="${c.fix}" data-bottle="${esc(bottle)}">${t("Fix it")}</button>`
                : ""
            }</div>`
        )
        .join("");
      btn.disabled = false;
      btn.textContent = label;
      return;
    }
    if (act === "backup") {
      const r = await api("/api/crossover/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle }),
      });
      toast(t("Backup created: {0} files ({1}).", r.total_files, fmtBytes(r.total_bytes)), "ok");
    } else if (act === "clearcache") {
      if (
        !confirm(
          t(
            'Clear the D3DMetal shader caches for "{0}"?\nYou have a backup, so you can restore instantly — but without restoring, next launch recompiles shaders.',
            bottle
          )
        )
      ) {
        btn.disabled = false;
        btn.textContent = label;
        return;
      }
      const r = await api("/api/crossover/clearcache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle }),
      });
      toast(t("Cleared {0} cache folder(s) — {1} freed.", r.caches_cleared, fmtBytes(r.freed_bytes)), "ok");
    } else if (act === "clean") {
      if (
        !confirm(
          t(
            'Clean temporary files in bottle "{0}"?\nOnly Windows/Wine temp folders are emptied — games and saves are untouched.',
            bottle
          )
        )
      ) {
        btn.disabled = false;
        btn.textContent = label;
        return;
      }
      const r = await api("/api/crossover/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle }),
      });
      toast(t("Cleaned up: {0} freed ({1} files).", fmtBytes(r.freed_bytes), r.files_removed), "ok");
    } else {
      const r = await api("/api/crossover/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle }),
      });
      toast(t("Restored from {0} ({1} folder(s)).", r.restored_from, r.restored_paths.length), "ok");
    }
    await loadCrossover();
  } catch (err) {
    toast(t(err.message), "err");
    btn.disabled = false;
    btn.textContent = label;
  }
});

// --- Stats ---
const chartTip = document.createElement("div");
chartTip.className = "chart-tip";
chartTip.hidden = true;
document.body.appendChild(chartTip);

function showTip(e, html) {
  chartTip.innerHTML = html;
  chartTip.hidden = false;
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const r = chartTip.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
  chartTip.style.left = x + "px";
  chartTip.style.top = y + "px";
}
function hideTip() {
  chartTip.hidden = true;
}

function renderStats(games) {
  games = games.filter((g) => !g._junk);
  const played = games.filter((g) => g.playtime_forever_min > 0);
  const totalMin = played.reduce((s, g) => s + g.playtime_forever_min, 0);
  const totalH = Math.round(totalMin / 60);
  const top = [...played].sort((a, b) => b.playtime_forever_min - a.playtime_forever_min);
  const most = top[0];

  $("#stats-tiles").innerHTML = `
    <div class="stat-tile"><span class="stat-label">${t("Total playtime")}</span>
      <strong>${t("{0} hours", totalH.toLocaleString(LOCALE))}</strong>
      <span class="stat-sub">${t("≈ {0} days", Math.round(totalH / 24).toLocaleString(LOCALE))}</span></div>
    <div class="stat-tile"><span class="stat-label">${t("Games played")}</span>
      <strong>${t("{0} of {1}", played.length, games.length)}</strong>
      <span class="stat-sub">${t("{0}% of library", Math.round((played.length / games.length) * 100))}</span></div>
    <div class="stat-tile"><span class="stat-label">${t("Most played")}</span>
      <strong>${most ? esc(most.name) : "—"}</strong>
      <span class="stat-sub">${most ? fmtHours(most.playtime_forever_hours) : ""}</span></div>
    <div class="stat-tile"><span class="stat-label">${t("Last 2 weeks")}</span>
      <strong>${fmtHours(
        Math.round((games.reduce((s, g) => s + g.playtime_2weeks_min, 0) / 60) * 10) / 10
      )}</strong>
      <span class="stat-sub">${t(
        "{0} different games",
        games.filter((g) => g.playtime_2weeks_min > 0).length
      )}</span></div>
    ${
      MACHINE?.label
        ? `<div class="stat-tile"><span class="stat-label">${t("Your Mac")}</span>
      <strong>${esc(MACHINE.chip)}${MACHINE.gpu_cores ? ` (${MACHINE.gpu_cores} GPU)` : ""}</strong>
      <span class="stat-sub">${esc(MACHINE.device || "")} · ${MACHINE.ram_gb} GB${MACHINE.fanless ? ` · ${t("fanless")}` : ""}</span></div>`
        : ""
    }`;
  // renderStats erstatter fliserne — gendan backlog-flisen hvis den var i gang
  if (statsExtrasLoaded) loadBacklog();

  const top10 = top.slice(0, 10);
  const maxMin = top10[0]?.playtime_forever_min || 1;
  $("#chart-top10").innerHTML = top10
    .map(
      (g) => `
    <div class="hbar-row" data-tip="${esc(g.name)} — ${fmtHours(g.playtime_forever_hours)}">
      <span class="hbar-name">${esc(g.name)}</span>
      <div class="hbar-track"><div class="hbar-fill" style="width:${
        (g.playtime_forever_min / maxMin) * 100
      }%"></div></div>
      <span class="hbar-value">${fmtHours(g.playtime_forever_hours)}</span>
    </div>`
    )
    .join("");

  const fm = played
    .map((g) => {
      const m = g.name.match(/^Football Manager (\d{2,4})$/);
      if (!m) return null;
      let year = Number(m[1]);
      if (year < 100) year += 2000;
      return { year, hours: g.playtime_forever_hours };
    })
    .filter(Boolean)
    .sort((a, b) => a.year - b.year);
  const fmMax = Math.max(...fm.map((f) => f.hours), 1);
  $("#chart-fm").innerHTML = fm
    .map(
      (f) => `
    <div class="vbar-col" data-tip="FM ${f.year} — ${fmtHours(f.hours)}">
      <span class="vbar-value">${Math.round(f.hours)}</span>
      <div class="vbar-fill" style="height:${(f.hours / fmMax) * 100}%"></div>
      <span class="vbar-label">${String(f.year).slice(2)}</span>
    </div>`
    )
    .join("");

  $("#stats-table").innerHTML =
    `<tr><th>#</th><th>${t("Game")}</th><th>${t("Hours")}</th><th>${t("Share")}</th></tr>` +
    top
      .slice(0, 20)
      .map(
        (g, i) =>
          `<tr><td>${i + 1}</td><td>${esc(g.name)}</td><td>${fmtHours(
            g.playtime_forever_hours
          )}</td><td>${((g.playtime_forever_min / totalMin) * 100).toFixed(1)}%</td></tr>`
      )
      .join("");

  for (const el of $$("#stats [data-tip]")) {
    el.addEventListener("mousemove", (e) => showTip(e, esc(el.dataset.tip)));
    el.addEventListener("mouseleave", hideTip);
  }
}

// Vis kørende version diskret i topbaren (godt til fejlrapporter)
api("/api/version").then((v) => {
  const el = document.createElement("span");
  el.className = "version-tag";
  el.textContent = "v" + v.current;
  document.querySelector(".brand").appendChild(el);
}).catch(() => {});

// --- Update banner ---
async function checkForUpdate() {
  try {
    const v = await api("/api/version");
    if (!v.update_available) return;
    const banner = document.createElement("div");
    banner.className = "update-banner";
    // Brew/package installs can't git pull — point to the right update path instead.
    const action =
      v.install_method === "git"
        ? `<button class="btn primary" id="update-now">${t("Update now")}</button>`
        : v.install_method === "brew"
        ? `<code>brew upgrade playhub</code>`
        : "";
    banner.innerHTML = `${t("New version available: {0} (you have {1})", "v" + v.latest, "v" + v.current)} <a href="${v.releases_url}" target="_blank" rel="noopener">${t("See what's new ↗")}</a> ${action} <button class="update-dismiss" aria-label="Dismiss">✕</button>`;
    banner.querySelector(".update-dismiss").addEventListener("click", () => banner.remove());
    banner.querySelector("#update-now")?.addEventListener("click", async (e) => {
      const b = e.target;
      b.disabled = true;
      b.textContent = t("Updating…");
      try {
        const r = await api("/api/update", { method: "POST" });
        if (!r.updated) {
          b.textContent = t("Already up to date");
          return;
        }
        toast(t("Update installed - restarting PlayHub…"), "ok");
        const oldVersion = v.current;
        const poll = setInterval(async () => {
          try {
            const nv = await api("/api/version");
            if (nv.current !== oldVersion) {
              clearInterval(poll);
              location.reload();
            }
          } catch {}
        }, 1500);
      } catch (err) {
        b.disabled = false;
        b.textContent = t("Update now");
        toast(t(err.message), "err");
      }
    });
    document.querySelector("main").prepend(banner);
  } catch {
    /* stille */
  }
}

// --- First-run setup wizard ---
function showSetupWizard() {
  const overlay = $("#setup-overlay");
  const langOptions = Object.entries(I18N_LANGS)
    .map(
      ([code, label]) =>
        `<option value="${code}" ${code === getLang() ? "selected" : ""}>${label}</option>`
    )
    .join("");
  overlay.innerHTML = `
    <div class="modal setup-card">
      <div class="setup-head">
        <span class="logo">🎮</span>
        <h2>${t("Welcome to PlayHub")}</h2>
        <label class="setup-lang">${t("Language")}
          <select id="setup-lang-select">${langOptions}</select>
        </label>
      </div>
      <p class="setup-intro">${t(
        "PlayHub needs your Steam Web API key and SteamID to read your library. Everything runs and stays on your Mac."
      )}</p>
      <label class="setup-field">
        <span>${t("Steam Web API key")} · <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener">${t(
    "Get a free key here"
  )} ↗</a></span>
        <input id="setup-key" type="text" autocomplete="off" spellcheck="false" placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" />
      </label>
      <label class="setup-field">
        <span>${t("SteamID, profile URL or vanity name")} · <a href="https://steamid.io" target="_blank" rel="noopener">${t(
    "Find your SteamID"
  )} ↗</a></span>
        <input id="setup-id" type="text" autocomplete="off" spellcheck="false" placeholder="7656119… / steamcommunity.com/id/…" />
      </label>
      <p class="setup-hint">${t("Note: your Steam profile's “Game details” must be set to Public.")}</p>
      <label class="setup-field">
        <span>${t("ITAD API key (optional — enables cross-store price comparison)")} · <a href="https://isthereanydeal.com/apps/" target="_blank" rel="noopener">isthereanydeal.com ↗</a></span>
        <input id="setup-itad" type="text" autocomplete="off" spellcheck="false" placeholder="" />
      </label>
      <div id="setup-result" class="setup-result" hidden></div>
      <div class="actions">
        <button id="setup-validate" class="btn primary">${t("Validate & continue")}</button>
        <button id="setup-save" class="btn primary" hidden>${t("Save & start PlayHub")}</button>
      </div>
      <button id="setup-local" class="setup-skip">${t(
        "Or skip the key — use local Steam data only (installed & played games; no achievements)"
      )}</button>
    </div>`;
  overlay.hidden = false;

  $("#setup-lang-select").addEventListener("change", (e) => setLang(e.target.value));

  $("#setup-local").addEventListener("click", async () => {
    try {
      await api("/api/setup/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "local",
          itadKey: $("#setup-itad").value.trim() || undefined,
          lang: getLang(),
        }),
      });
      location.reload();
    } catch (err) {
      const resultEl2 = $("#setup-result");
      resultEl2.hidden = false;
      resultEl2.className = "setup-result err";
      resultEl2.textContent = t(err.message);
    }
  });

  let validated = null;
  const resultEl = $("#setup-result");

  $("#setup-validate").addEventListener("click", async () => {
    const steamKey = $("#setup-key").value.trim();
    const steamIdInput = $("#setup-id").value.trim();
    if (!steamKey || !steamIdInput) {
      resultEl.hidden = false;
      resultEl.className = "setup-result err";
      resultEl.textContent = t("Both fields are required.");
      return;
    }
    const btn = $("#setup-validate");
    btn.disabled = true;
    btn.textContent = t("Checking…");
    try {
      const r = await api("/api/setup/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamKey, steamIdInput }),
      });
      resultEl.hidden = false;
      if (r.valid) {
        validated = { steamKey, steamId: r.steamid };
        if (r.games_visible) {
          resultEl.className = "setup-result ok";
          resultEl.innerHTML = `${
            r.avatar ? `<img src="${r.avatar}" alt="" class="setup-avatar">` : ""
          }${t("Hi {0}! Found {1} games in your library.", esc(r.persona_name || ""), r.game_count)}`;
        } else {
          resultEl.className = "setup-result warn";
          resultEl.textContent = t(
            "The key works, but your game library looks private. Set “Game details” to Public in Steam's privacy settings — or continue anyway."
          );
        }
        $("#setup-save").hidden = false;
      } else {
        validated = null;
        $("#setup-save").hidden = true;
        resultEl.className = "setup-result err";
        resultEl.textContent =
          r.error === "invalid_key"
            ? t("The API key was rejected by Steam — check it and try again.")
            : r.error === "steamid_not_found"
            ? t("Could not find that SteamID/profile.")
            : t("Validation failed: {0}", r.error || "?");
      }
    } catch (err) {
      resultEl.hidden = false;
      resultEl.className = "setup-result err";
      resultEl.textContent = t("Validation failed: {0}", err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = t("Validate & continue");
    }
  });

  $("#setup-save").addEventListener("click", async () => {
    if (!validated) return;
    const btn = $("#setup-save");
    btn.disabled = true;
    try {
      await api("/api/setup/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validated,
          itadKey: $("#setup-itad").value.trim() || undefined,
          lang: getLang(),
        }),
      });
      location.reload();
    } catch (err) {
      btn.disabled = false;
      resultEl.hidden = false;
      resultEl.className = "setup-result err";
      resultEl.textContent = err.message;
    }
  });
}

// --- Year card + achievement hunt (Stats-fanen, lazy) ---
let statsExtrasLoaded = false;
$$(".tab").forEach((t2) =>
  t2.addEventListener("click", () => {
    if (t2.dataset.target === "stats" && !statsExtrasLoaded) {
      statsExtrasLoaded = true;
      loadYearCard();
      loadHunt();
      loadBacklog();
    }
  })
);

// Backlog målt i HowLongToBeat-timer. Estimaterne beregnes i en langsom
// baggrundskø, så flisen opdaterer sig selv indtil alle spil er slået op.
let backlogTimer = null;
async function loadBacklog() {
  try {
    const b = await api("/api/backlog");
    let tile = document.getElementById("backlog-tile");
    if (!tile) {
      tile = document.createElement("div");
      tile.id = "backlog-tile";
      tile.className = "stat-tile";
      $("#stats-tiles").appendChild(tile);
    }
    const est = `${b.estimated_games}/${b.backlog_games}`;
    tile.innerHTML = `<span class="stat-label">${t("Backlog (HLTB main story)")}</span>
      <strong>${t("{0} hours", b.total_main_hours.toLocaleString(LOCALE))}</strong>
      <span class="stat-sub">${t("≈ {0} days", b.days.toLocaleString(LOCALE))} · ${
        b.pending > 0 ? t("estimating… ({0} games)", est) : t("{0} unplayed games", b.backlog_games)
      }</span>`;
    tile.title = (b.heaviest || [])
      .map((h) => `${h.name}: ${h.main_h} h`)
      .join("\n");
    if (b.pending > 0 && !backlogTimer) {
      backlogTimer = setInterval(loadBacklog, 45_000);
    } else if (b.pending === 0 && backlogTimer) {
      clearInterval(backlogTimer);
      backlogTimer = null;
    }
  } catch {
    /* backlog er pynt — fejl vises ikke */
  }
}

function cLine(ctx, x, y, text, color, size, bold) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? "700 " : ""}${size}px "SF Mono", Menlo, monospace`;
  ctx.fillText(text, x, y);
}

async function loadYearCard() {
  try {
    const d = await api("/api/yearreview");
    const c = $("#year-card");
    const ctx = c.getContext("2d");
    // Baggrund + scanlines
    ctx.fillStyle = "#070b07";
    ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "rgba(180,255,180,0.02)";
    for (let y = 0; y < 630; y += 3) ctx.fillRect(0, y, 1200, 1);
    // Ramme
    ctx.strokeStyle = "#2c522c";
    ctx.strokeRect(24, 24, 1152, 582);
    // Header
    cLine(ctx, 60, 92, "PLAYHUB_", "#4ef04e", 40, true);
    cLine(ctx, 60, 130, `// YOUR ${d.year} IN GAMING`, "#5a8a5a", 22);
    // Nøgletal
    let y = 200;
    cLine(ctx, 60, y, `GAMES PLAYED ${d.year}`, "#5a8a5a", 17); y += 34;
    cLine(ctx, 60, y, String(d.games_played_this_year), "#4ef04e", 44, true); y += 56;
    if (d.achievements_this_year !== null) {
      cLine(ctx, 60, y, `ACHIEVEMENTS UNLOCKED ${d.year}`, "#5a8a5a", 17); y += 34;
      cLine(ctx, 60, y, String(d.achievements_this_year), "#4ef04e", 44, true); y += 56;
    }
    cLine(ctx, 60, y, "LIFETIME", "#5a8a5a", 17); y += 30;
    cLine(ctx, 60, y, `${d.lifetime_hours.toLocaleString()} HOURS · ${d.library_size} GAMES` +
      (d.most_played ? ` · TOP: ${d.most_played.name.toUpperCase().slice(0, 24)} (${d.most_played.hours}H)` : ""),
      "#c4ecc4", 19, true);
    // Roster (højre kolonne)
    let ry = 200;
    cLine(ctx, 640, ry, `THIS YEAR'S ROSTER`, "#5a8a5a", 17); ry += 34;
    for (const g of d.roster) {
      cLine(ctx, 640, ry, `> ${g.name.slice(0, 34)}`, "#c4ecc4", 19); ry += 30;
    }
    if (d.achievements_per_game.length) {
      ry += 14;
      cLine(ctx, 640, ry, "MOST ACHIEVEMENTS", "#5a8a5a", 15); ry += 26;
      for (const a of d.achievements_per_game) {
        cLine(ctx, 640, ry, `${a.name.slice(0, 28)}: +${a.unlocked}`, "#4ef04e", 17); ry += 26;
      }
    }
    // Footer
    cLine(ctx, 60, 572, "playhubhqdk.github.io/playhub", "#5a8a5a", 16);
    cLine(ctx, 980, 572, `${d.year} (so far)`, "#5a8a5a", 16);

    $("#year-download").addEventListener("click", () => {
      c.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `playhub-${d.year}.png`;
        a.click();
      });
    });
  } catch (err) {
    $("#year-card").insertAdjacentHTML("afterend", `<div class="empty">${esc(t(err.message))}</div>`);
  }
}

async function loadHunt() {
  const el = $("#hunt-list");
  try {
    const h = await api("/api/achievement-hunt");
    if (!h.enabled) {
      el.innerHTML = `<div class="empty">${esc(t(h.reason || ""))}</div>`;
      return;
    }
    if (!h.hunt.length) {
      el.innerHTML = `<div class="empty">${t("No easy unlocks found — impressive completion!")}</div>`;
      return;
    }
    el.innerHTML = h.hunt
      .map(
        (x) => `
      <div class="hunt-row">
        <span class="hunt-pct">${x.global_pct}%</span>
        <span class="hunt-info"><strong>${esc(x.name)}</strong> <span class="dim">· ${esc(x.game)}</span>${
          x.description ? `<br><span class="dim">${esc(x.description)}</span>` : ""
        }</span>
      </div>`
      )
      .join("");
  } catch (err) {
    el.innerHTML = `<div class="empty">${esc(t(err.message))}</div>`;
  }
}

// --- Boot ---
let MACHINE = null;
(async () => {
  try {
    const s = await api("/api/setup/status");
    if (!s.configured) {
      showSetupWizard();
      return;
    }
  } catch {
    /* server nede — lad de normale kald vise fejl */
  }
  try {
    MACHINE = await api("/api/machine");
  } catch {}
  loadLibrary();
  loadNative();
  loadCrossover();
  checkForUpdate();
  // Deep-link til fane via #hash (fx /#crossover). Gamle fane-navne mappes.
  const HASH_ALIAS = { native: "library", recs: "discover", xbox: "library" };
  const resolveTab = (h) =>
    document.querySelector(`.tab[data-target="${HASH_ALIAS[h] || h}"]`);
  const hashTab = location.hash.slice(1);
  if (hashTab) {
    const tab = resolveTab(hashTab);
    if (tab) tab.click();
  }
  window.addEventListener("hashchange", () => {
    const t2 = resolveTab(location.hash.slice(1));
    if (t2) t2.click();
  });
})();
