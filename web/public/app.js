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
    if (tab.dataset.target === "recs" && !recsLoaded) loadRecommendations();
    if (tab.dataset.target === "discover" && !discoverLoaded) loadDiscover();
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
    $("#library-count").textContent = `${data.game_count || 0} ${t("games")}`;
    if (!libraryGames.length) {
      grid.innerHTML = `<div class="empty">${t(
        "Your Steam library looks empty. If you own games, your Steam profile's “Game details” privacy setting is probably not set to Public."
      )}<br><a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener" style="color:var(--accent)">${t(
        "Open Steam privacy settings"
      )} ↗</a></div>`;
      return;
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
  const recent = games
    .filter((g) => g.playtime_2weeks_min > 0)
    .sort((a, b) => b.playtime_2weeks_min - a.playtime_2weeks_min);
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
          <span>🔥 ${fmtHours(g.playtime_2weeks_hours)} · ${t("total")} ${fmtHours(
        g.playtime_forever_hours
      )}</span>
        </div>
      </div>`;
    })
    .join("");
}

function renderLibrary(games) {
  const grid = $("#library-grid");
  if (libraryFilter === "installed") {
    games = games.filter((g) => g.installed_on);
  } else if (libraryFilter === "native") {
    games = games.filter((g) => g.mac_native === true);
  } else if (libraryFilter === "windows") {
    games = games.filter((g) => g.mac_native === false);
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
      return `
      <div class="cover ${g.installed_on ? "is-installed" : ""}" data-appid="${
        g.appid
      }" data-name="${esc(g.name)}">
        ${badge}
        ${playBtn}
        <div class="fallback">${esc(g.name)}</div>
        <img loading="lazy" src="${g.library_capsule}" alt="" data-appid="${g.appid}"
             data-stage="capsule" onerror="coverError(this, '${g.header_image}')" />
        <div class="overlay">
          <div class="title">${esc(g.name)}</div>
          <span class="playtime ${zero ? "zero" : ""}">⏱ ${fmtHours(
        g.playtime_forever_hours
      )}</span>
          ${platformChip(g)}
          ${cacheChip(g)}
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
function platformChip(g) {
  if (g.mac_native === true) {
    return `<span class="platform-chip native" title="${t("Runs natively on macOS")}"> Mac</span>`;
  }
  if (g.mac_native === false) {
    const r = g.crossover_rating || "unknown";
    const label = t(RATING_LABEL[r] || "Unknown");
    return `<span class="platform-chip xo rating-${r}" title="${t(
      "CrossOver compatibility: {0} (community data from AppleGamingWiki)",
      label
    )}">🍷 ${label}</span>`;
  }
  return ""; // ukendt endnu (berigelse i gang)
}

// Shader-cache chip for CrossOver games.
function cacheChip(g) {
  if (g.installed_on !== "crossover") return "";
  if (g.shader_cache && g.shader_cache.size_bytes > 0) {
    return `<span class="cache-chip warm" title="${t(
      "D3DMetal shader cache: {0} files ({1})",
      g.shader_cache.file_count,
      esc(g.shader_cache.exe)
    )}">${t("⚡ cache {0}", fmtBytes(g.shader_cache.size_bytes))}</span>`;
  }
  return `<span class="cache-chip cold" title="${t(
    "No D3DMetal cache yet — first launch compiles shaders"
  )}">${t("❄︎ no cache")}</span>`;
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
        "📡 Enriching library with Steam data in the background: <strong>{0}/{1}</strong> reviews · <strong>{2}/{3}</strong> Metacritic/genres — recommendations improve over time.",
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

$("#recs-reload").addEventListener("click", loadRecommendations);
$("#recs-grid").addEventListener("click", (e) => {
  const card = e.target.closest(".rec-card[data-appid]");
  if (card) openAchievements(Number(card.dataset.appid), card.dataset.name);
});

// --- Buy ideas ---
async function loadDiscover() {
  const grid = $("#discover-grid");
  try {
    const data = await api("/api/discover");
    if (!data.recommendations.length) {
      grid.innerHTML = `<div class="empty">${t(
        "No ideas yet — the taste profile needs library enrichment. Try again shortly."
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
            <p class="rec-why">${t("Matches {0}", r.matched_genres.map(esc).join(", "))}${
          r.release_year ? ` · ${r.release_year}` : ""
        } · ${t("Steam store ↗")}</p>
            <p class="deal-line" data-appid="${r.appid}"></p>
          </div>
        </a>`;
      })
      .join("");
    discoverLoaded = true;
    if (data.prices_pending > 0) {
      toast(t("{0} prices still loading — press ↻ shortly.", data.prices_pending), "ok");
    }
    loadDeals(data.recommendations);
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
          '💡 Cross-store price comparison: add a free <a {0}>ITAD key</a> as ITAD_API_KEY in .env.',
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
          `<a href="${d.ig_url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Instant Gaming 💰 <small>${t(
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
$("#discover-reload").addEventListener("click", loadDiscover);

// --- HowLongToBeat ---
let hltbRequestId = 0;
async function loadHltb(appid, name) {
  const reqId = ++hltbRequestId;
  const box = $("#hltb-box");
  try {
    const h = await api(`/api/hltb?name=${encodeURIComponent(name)}`);
    if (reqId !== hltbRequestId) return;
    if (!h.found || !h.main_h) {
      box.hidden = true;
      return;
    }
    const game = libraryGames.find((g) => g.appid === appid);
    const myH = game ? game.playtime_forever_hours : 0;
    const pct = h.main_h ? Math.min(999, Math.round((myH / h.main_h) * 100)) : null;
    box.innerHTML = `
      <span class="hltb-title">⏱ HowLongToBeat</span>
      <span class="hltb-stat"><strong>${fmtHours(h.main_h)}</strong> Main</span>
      ${h.plus_h ? `<span class="hltb-stat"><strong>${fmtHours(h.plus_h)}</strong> Main+Extra</span>` : ""}
      ${h.completionist_h ? `<span class="hltb-stat"><strong>${fmtHours(h.completionist_h)}</strong> 100%</span>` : ""}
      ${
        myH > 0 && pct !== null
          ? `<span class="hltb-me">${t("Your time: {0} ≈ {1}% of Main", fmtHours(myH), pct)}</span>`
          : ""
      }
      <a class="hltb-link" href="${h.url}" target="_blank" rel="noopener">hltb ↗</a>`;
    box.hidden = false;
  } catch {
    if (reqId === hltbRequestId) box.hidden = true;
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
  $("#ach-title").textContent = name;
  $("#ach-progress").hidden = true;
  $("#hltb-box").hidden = true;
  const gameMeta = libraryGames.find((g) => g.appid === appid);
  const metaEl = $("#ach-meta");
  if (gameMeta && (gameMeta.review_score_desc || gameMeta.metacritic)) {
    metaEl.innerHTML =
      (gameMeta.review_score_desc
        ? `<span class="review-level ${reviewClass(gameMeta.review_positive_pct)}">${t(
            "Steam: {0}",
            esc(t(gameMeta.review_score_desc))
          )}${
            gameMeta.review_positive_pct !== null &&
            gameMeta.review_positive_pct !== undefined
              ? ` ${t("({0}% positive)", gameMeta.review_positive_pct)}`
              : ""
          }</span>`
        : "") +
      (gameMeta.metacritic
        ? `<span class="mc-badge ${
            gameMeta.metacritic >= 75 ? "good" : gameMeta.metacritic >= 50 ? "mid" : "bad"
          }">Metacritic ${gameMeta.metacritic}</span>`
        : "");
    metaEl.hidden = false;
  } else {
    metaEl.hidden = true;
  }
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
    const row = (x) => `
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
          unlocked.map(row).join("")
        : "") +
      (locked.length
        ? `<h4 class="ach-section">${t("Missing ({0})", locked.length)}</h4>` +
          locked.map(row).join("")
        : "");
  } catch (err) {
    $("#ach-body").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

// Clicks in the library panel: play buttons + covers (achievements).
$("#library").addEventListener("click", async (e) => {
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
        ? t("Starting via CrossOver (bottle: {0}) — first start can take a while…", r.bottle)
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
    renderSteamInstalled(data.steam_installed || []);
    renderApps(data.applications || []);
  } catch (err) {
    $("#native-steam").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    $("#native-apps").innerHTML = "";
  }
}

function renderSteamInstalled(games) {
  const el = $("#native-steam");
  if (!games.length) {
    el.innerHTML = `<div class="empty">${t("No Steam games installed locally.")}</div>`;
    return;
  }
  el.innerHTML = games
    .map(
      (g) => `
      <div class="card">
        <img class="thumb" loading="lazy" src="${g.header_image}"
             onerror="this.style.display='none'" alt="" />
        <div class="info">
          <h4>${esc(g.name)}</h4>
          <p>${g.size_bytes ? fmtBytes(g.size_bytes) : "—"}</p>
          <span class="tag ${g.installed ? "installed" : "not-installed"}">${
        g.installed ? t("installed") : t("not on disk")
      }</span>
        </div>
      </div>`
    )
    .join("");
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
          "🤖 Auto-backup: <strong>active</strong> — checks every {0} min, backs up after {1} min of quiet",
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
          return `<div class="cache-line">📁 ${esc(c.label)}<br><span class="dim">${esc(
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
            `<div class="backup-item"><span>🗄 ${new Date(bk.created_at).toLocaleString(
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
    "💾 Back up shader cache"
  )}</button>
        <button class="btn" data-act="restore" ${b.backups.length ? "" : "disabled"}>${t(
    "♻️ Restore latest"
  )}</button>
        <button class="btn" data-act="clean">${t("🧹 Clean bottle temp")}</button>
      </div>
      ${backups}
    </div>`;
}

$("#crossover-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const bottle = btn.closest(".bottle").dataset.bottle;
  const act = btn.dataset.act;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = t("Working…");
  try {
    if (act === "backup") {
      const r = await api("/api/crossover/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bottle }),
      });
      toast(t("Backup created: {0} files ({1}).", r.total_files, fmtBytes(r.total_bytes)), "ok");
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
      )}</span></div>`;

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

// --- Update banner ---
async function checkForUpdate() {
  try {
    const v = await api("/api/version");
    if (!v.update_available) return;
    const banner = document.createElement("div");
    banner.className = "update-banner";
    banner.innerHTML = `${t("New version available: {0} (you have {1})", "v" + v.latest, "v" + v.current)} <a href="${v.releases_url}" target="_blank" rel="noopener">${t("See what's new ↗")}</a> <button class="update-dismiss" aria-label="Dismiss">✕</button>`;
    banner.querySelector(".update-dismiss").addEventListener("click", () => banner.remove());
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
    </div>`;
  overlay.hidden = false;

  $("#setup-lang-select").addEventListener("change", (e) => setLang(e.target.value));

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

// --- Boot ---
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
  loadLibrary();
  loadNative();
  loadCrossover();
  checkForUpdate();
  // Deep-link til fane via #hash (fx /#crossover)
  const hashTab = location.hash.slice(1);
  if (hashTab) {
    const tab = document.querySelector(`.tab[data-target="${hashTab}"]`);
    if (tab) tab.click();
  }
})();
