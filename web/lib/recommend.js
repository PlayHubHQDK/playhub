// Recommendation engine: suggests unplayed/barely-played games from the
// user's own library, based on their genre profile (weighted by playtime)
// combined with review quality and Metacritic.

import { getMeta, REVIEW_LEVELS_DA } from "./storemeta.js";

// sqrt-dæmpning så 1.010 timer FM ikke æder hele profilen.
export function buildGenreProfile(games) {
  const weights = {};
  let total = 0;
  for (const g of games) {
    const meta = getMeta(g.appid);
    if (!meta?.genres?.length || g.playtime_forever_min < 120) continue;
    const w = Math.sqrt(g.playtime_forever_min / 60);
    for (const genre of meta.genres) {
      weights[genre] = (weights[genre] || 0) + w;
      total += w;
    }
  }
  if (total > 0) for (const k of Object.keys(weights)) weights[k] /= total;
  return weights;
}

export function recommend(games, { limit = 12 } = {}) {
  const profile = buildGenreProfile(games);
  const profileGenres = Object.keys(profile);

  const candidates = [];
  for (const g of games) {
    if (g.playtime_forever_min >= 120) continue; // allerede spillet (>2 t)
    if (/\b(demo|playtest|beta|soundtrack)\b/i.test(g.name)) continue;
    const meta = getMeta(g.appid);
    if (!meta || meta.missing) continue;

    // Genre-match: gennemsnitlig profilvægt over spillets genrer.
    const genres = meta.genres || [];
    let match = 0;
    const matched = [];
    for (const genre of genres) {
      if (profile[genre]) {
        match += profile[genre];
        matched.push(genre);
      }
    }
    if (genres.length) match /= Math.sqrt(genres.length);

    // Kvalitet: Wilson-agtig andel positive + volumen-dæmpning.
    const totalReviews = meta.total_reviews || 0;
    const posRatio = totalReviews
      ? meta.total_positive / totalReviews
      : 0.5;
    const volume = Math.min(1, Math.log10(totalReviews + 1) / 4); // 10k reviews ≈ 1.0
    const quality = posRatio * (0.5 + 0.5 * volume);

    const mc = meta.metacritic ? meta.metacritic / 100 : null;

    // Samlet: genre-match er kernen, kvalitet ganger, MC giver bonus.
    const score =
      (0.15 + match) * quality * (mc ? 0.85 + 0.3 * mc : 1);

    candidates.push({
      appid: g.appid,
      name: g.name,
      playtime_forever_min: g.playtime_forever_min,
      header_image: g.header_image,
      library_capsule: g.library_capsule,
      installed_on: g.installed_on || null,
      bottle: g.bottle || null,
      score: Math.round(score * 1000) / 1000,
      matched_genres: matched.slice(0, 3),
      genres: genres.slice(0, 4),
      review_score_desc: meta.review_score_desc || null,
      review_score_desc_da:
        REVIEW_LEVELS_DA[meta.review_score_desc] || meta.review_score_desc,
      review_positive_pct: totalReviews
        ? Math.round((meta.total_positive / totalReviews) * 100)
        : null,
      total_reviews: totalReviews,
      metacritic: meta.metacritic || null,
      release_year: meta.release_year || null,
      short_description: meta.short_description || null,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    profile: Object.entries(profile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre, w]) => ({ genre, weight: Math.round(w * 100) })),
    recommendations: candidates.slice(0, limit),
    candidates_considered: candidates.length,
  };
}
