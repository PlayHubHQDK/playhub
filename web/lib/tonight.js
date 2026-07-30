// "Hvad skal jeg spille i aften?" — tre forslag fra brugerens EGET bibliotek,
// afstemt efter hvor lang tid de har. Bruger kun data vi allerede har:
// spilletid, installeret-status, genrer (storemeta) og HLTB-cachen.

import { getMeta } from "./storemeta.js";
import { hltbCached } from "./hltb.js";

const SHORT_GENRES = /casual|indie|arcade|puzzle|platformer|racing|sports/i;

function minutesBand(minutes) {
  if (minutes <= 60) return "short";
  if (minutes <= 150) return "medium";
  return "long";
}

// -> { comfort, quick, backlog } — op til tre forslag med begrundelse.
export function tonightPicks(games, minutes = 90) {
  const band = minutesBand(minutes);
  const installed = games.filter((g) => g.installed_on);
  const pool = installed.length >= 5 ? installed : games;

  const enriched = pool.map((g) => {
    const meta = getMeta(g.appid) || {};
    const hltb = hltbCached(g.name);
    return {
      ...g,
      genres: meta.genres || [],
      main_h: hltb?.found ? hltb.main_h : null,
    };
  });

  // 1) Comfort pick: det du faktisk spiller for tiden.
  const comfort =
    [...enriched].sort((a, b) => b.playtime_2weeks_min - a.playtime_2weeks_min)[0]
      ?.playtime_2weeks_min > 0
      ? [...enriched].sort((a, b) => b.playtime_2weeks_min - a.playtime_2weeks_min)[0]
      : [...enriched].sort((a, b) => (b.last_played_unix || 0) - (a.last_played_unix || 0))[0];

  // 2) Quick fun: passer til tiden — korte genrer ved korte aftener,
  //    ellers dine mest spillede der ikke er comfort-picket.
  let quick = null;
  if (band === "short") {
    quick = enriched
      .filter((g) => g !== comfort)
      .filter((g) => g.genres.some((x) => SHORT_GENRES.test(x)) || (g.main_h && g.main_h <= 8))
      .sort((a, b) => b.playtime_forever_min - a.playtime_forever_min)[0];
  } else {
    quick = enriched
      .filter((g) => g !== comfort && g.playtime_forever_min > 300)
      .sort((a, b) => (b.last_played_unix || 0) - (a.last_played_unix || 0))[1];
  }

  // 3) Backlog-mod: noget du ejer men aldrig har startet — helst installeret,
  //    og ved lange aftener gerne noget stort.
  const backlogPool = enriched
    .filter((g) => g.playtime_forever_min < 60 && g !== comfort && g !== quick)
    .filter((g) => !/demo|soundtrack|test|server/i.test(g.name));
  let backlog =
    band === "long"
      ? backlogPool.sort((a, b) => (b.main_h || 0) - (a.main_h || 0))[0]
      : backlogPool
          .filter((g) => !g.main_h || g.main_h <= (band === "short" ? 8 : 20))
          .sort((a, b) => (b.main_h ? 1 : 0) - (a.main_h ? 1 : 0))[0] || backlogPool[0];

  const strip = (g, reason) =>
    g
      ? {
          appid: g.appid,
          name: g.name,
          installed_on: g.installed_on || null,
          bottle: g.bottle || null,
          playtime_forever_hours: g.playtime_forever_hours,
          main_h: g.main_h,
          header_image: g.header_image,
          reason,
        }
      : null;

  return {
    minutes,
    picks: [
      strip(comfort, "comfort"),
      strip(quick, "quick"),
      strip(backlog, "backlog"),
    ].filter(Boolean),
  };
}
