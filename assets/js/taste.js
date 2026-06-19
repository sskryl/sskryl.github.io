// ============================================================================
//  Модель вкуса в браузере (порт bot/taste.py). Логистическая регрессия (SGD):
//  веса обновляются после каждой оценки. Профиль (оценки, веса, психотест)
//  хранится в localStorage. Полностью клиентская, без бэкенда.
// ============================================================================
(function () {
  "use strict";
  const RKEY = "cinema:ratings"; // { id: 1 | -1 }
  const TKEY = "cinema:taste";   // веса { feature: w }
  const MKEY = "cinema:movies";  // кэш метаданных { id: {...} }
  const QKEY = "cinema:quiz";    // { archetype, scores }
  const LR = 0.35, L2 = 0.002;
  const NOW = new Date().getFullYear();

  function load(k, def) {
    try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  function era(year) {
    const y = +year;
    if (!y) return null;
    if (y < 1970) return "era:classic";
    return "era:" + Math.floor(y / 10) * 10 + "s";
  }
  function features(m) {
    const f = { bias: 1 };
    (m.genres || []).forEach((g) => (f["g:" + g] = 1));
    const e = era(m.year);
    if (e) f[e] = 1;
    if (+m.year >= NOW - 2) f["recent"] = 1;
    return f;
  }
  function dot(w, f) { let s = 0; for (const k in f) s += (w[k] || 0) * f[k]; return s; }
  function score(w, m) { return dot(w || {}, features(m)); }
  function predict(w, m) { const z = Math.max(-20, Math.min(20, score(w, m))); return 1 / (1 + Math.exp(-z)); }

  function cacheMovie(m) {
    const movies = load(MKEY, {});
    movies[m.id] = { id: m.id, title: m.title, year: m.year, poster: m.poster,
                     genres: m.genres, rating: m.rating, free: m.free };
    save(MKEY, movies);
  }

  const Taste = {
    getRatings() { return load(RKEY, {}); },
    getWeights() { return load(TKEY, {}); },
    getQuiz() { return load(QKEY, null); },
    ratedIds() { return new Set(Object.keys(this.getRatings())); },
    isRated(id) { return String(id) in this.getRatings(); },

    rate(movie, liked) {
      const ratings = this.getRatings();
      ratings[movie.id] = liked ? 1 : -1;
      save(RKEY, ratings);
      cacheMovie(movie);
      const w = this.getWeights();
      const f = features(movie);
      const err = (liked ? 1 : 0) - predict(w, movie);
      for (const k in f) w[k] = (w[k] || 0) * (1 - L2) + LR * err * f[k];
      save(TKEY, w);
    },

    score(movie) { return score(this.getWeights(), movie); },
    rank(movies) { const w = this.getWeights(); return movies.slice().sort((a, b) => score(w, b) - score(w, a)); },

    liked() {
      const r = this.getRatings(), m = load(MKEY, {});
      return Object.keys(r).filter((id) => r[id] > 0).map((id) => m[id]).filter(Boolean);
    },
    stats() {
      const r = this.getRatings();
      let l = 0, d = 0;
      for (const id in r) r[id] > 0 ? l++ : d++;
      return { liked: l, disliked: d, total: l + d };
    },

    setQuiz(archetypeKey, scores) {
      save(QKEY, { archetype: archetypeKey, scores });
      const w = this.getWeights();
      const vals = Object.values(scores);
      const mx = vals.length ? Math.max.apply(null, vals) : 0;
      if (mx) for (const g in scores) w["g:" + g] = (w["g:" + g] || 0) + scores[g] / mx;
      save(TKEY, w);
    },

    topGenres(n) {
      const w = this.getWeights();
      return Object.keys(w)
        .filter((k) => k.indexOf("g:") === 0 && w[k] > 0)
        .sort((a, b) => w[b] - w[a])
        .map((k) => +k.slice(2))
        .slice(0, n);
    },

    hasProfile() { return Object.keys(this.getRatings()).length > 0 || !!this.getQuiz(); },
    reset() { [RKEY, TKEY, MKEY, QKEY].forEach((k) => localStorage.removeItem(k)); },
  };

  window.Taste = Taste;
})();
