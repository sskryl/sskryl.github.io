// ============================================================================
//  Слой данных. Объединяет локальный каталог public-domain фильмов и TMDB API
//  в единый формат Movie. Работает без TMDB-ключа (только локальный каталог).
// ============================================================================
(function () {
  "use strict";

  const CFG = window.CINEMA_CONFIG || {};
  const TMDB_KEY = (CFG.tmdbApiKey || "").trim();
  const TMDB_LANG = CFG.tmdbLanguage || "ru-RU";
  const TMDB_BASE = "https://api.themoviedb.org/3";
  const IMG_POSTER = "https://image.tmdb.org/t/p/w500";
  const IMG_BACKDROP = "https://image.tmdb.org/t/p/w1280";
  const IMG_PROFILE = "https://image.tmdb.org/t/p/w185";
  const ARCHIVE_IMG = "https://archive.org/services/img/";
  const ARCHIVE_EMBED = "https://archive.org/embed/";

  let catalog = { genres: [], movies: [] };
  let genreMap = new Map();

  function normLocal(m) {
    return {
      id: m.id,
      source: "local",
      title: m.title,
      originalTitle: m.originalTitle || "",
      year: m.year || null,
      country: m.country || "",
      genres: m.genres || [],
      rating: m.rating || null,
      runtime: m.runtime || null,
      director: m.director || "",
      overview: m.overview || "",
      poster: m.archiveId ? ARCHIVE_IMG + m.archiveId : null,
      backdrop: null,
      archiveId: m.archiveId || null,
      trailerYt: m.trailerYt || null,
      cast: [],
      free: !!m.archiveId,
    };
  }

  function normTmdb(m) {
    return {
      id: "tmdb:" + m.id,
      tmdbId: m.id,
      source: "tmdb",
      title: m.title || m.name || "",
      originalTitle: m.original_title || m.original_name || "",
      year: (m.release_date || "").slice(0, 4) || null,
      country: "",
      genres: m.genre_ids || (m.genres ? m.genres.map((g) => g.id) : []),
      rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
      runtime: m.runtime || null,
      director: "",
      overview: m.overview || "",
      poster: m.poster_path ? IMG_POSTER + m.poster_path : null,
      backdrop: m.backdrop_path ? IMG_BACKDROP + m.backdrop_path : null,
      archiveId: null,
      trailerYt: null,
      cast: [],
      free: false,
    };
  }

  async function tmdbFetch(path, params = {}) {
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("language", TMDB_LANG);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("TMDB " + res.status);
    return res.json();
  }

  function localPage(list) {
    return { results: list, totalPages: 1 };
  }

  const Api = {
    hasTmdb() {
      return TMDB_KEY.length > 0;
    },

    async init() {
      try {
        const res = await fetch("data/catalog.json", { cache: "no-cache" });
        catalog = await res.json();
      } catch (e) {
        console.error("Не удалось загрузить локальный каталог", e);
        catalog = { genres: [], movies: [] };
      }
      genreMap = new Map(catalog.genres.map((g) => [g.id, g]));
    },

    getGenres() {
      return catalog.genres;
    },

    genreName(id) {
      if (String(id) === "anime") return "Аниме";
      const g = genreMap.get(Number(id));
      return g ? g.name : "";
    },

    genreNames(ids, limit = 3) {
      return (ids || []).map((id) => this.genreName(id)).filter(Boolean).slice(0, limit);
    },

    getFreeMovies() {
      return catalog.movies.map(normLocal).filter((m) => m.free);
    },

    // ---- Готовые подборки ---------------------------------------------------
    async getTrending(page = 1) {
      if (this.hasTmdb()) {
        const d = await tmdbFetch("/trending/movie/week", { page });
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      const all = catalog.movies.map(normLocal).sort((a, b) => (b.rating || 0) - (a.rating || 0));
      return localPage(all);
    },

    async getNewReleases(page = 1) {
      if (this.hasTmdb()) {
        const today = new Date();
        const from = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        const d = await tmdbFetch("/discover/movie", {
          sort_by: "popularity.desc",
          "primary_release_date.gte": from.toISOString().slice(0, 10),
          "primary_release_date.lte": today.toISOString().slice(0, 10),
          "vote_count.gte": 30,
          page,
        });
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      const all = catalog.movies.map(normLocal).sort((a, b) => (b.year || 0) - (a.year || 0));
      return localPage(all);
    },

    async getTopRated(page = 1) {
      if (this.hasTmdb()) {
        const d = await tmdbFetch("/movie/top_rated", { page });
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      const all = catalog.movies.map(normLocal).sort((a, b) => (b.rating || 0) - (a.rating || 0));
      return localPage(all);
    },

    async getPopular(page = 1) {
      if (this.hasTmdb()) {
        const d = await tmdbFetch("/movie/popular", { page });
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      return localPage(catalog.movies.map(normLocal));
    },

    // ---- Каталог с фильтрами ------------------------------------------------
    async discover({ genre, year, sort, minRating, page = 1 } = {}) {
      const isAnime = String(genre) === "anime";
      if (this.hasTmdb()) {
        const params = { sort_by: sort || "popularity.desc", "vote_count.gte": 40, page };
        if (isAnime) {
          params.with_genres = 16;
          params.with_original_language = "ja";
        } else if (genre) {
          params.with_genres = genre;
        }
        if (year) params.primary_release_year = year;
        if (minRating) params["vote_average.gte"] = minRating;
        const d = await tmdbFetch("/discover/movie", params);
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      // Локальный режим
      let list = catalog.movies.map(normLocal);
      if (isAnime) list = [];
      else if (genre) list = list.filter((m) => m.genres.includes(Number(genre)));
      if (year) list = list.filter((m) => String(m.year) === String(year));
      if (minRating) list = list.filter((m) => (m.rating || 0) >= Number(minRating));
      if (sort === "release_date.desc") list.sort((a, b) => (b.year || 0) - (a.year || 0));
      else if (sort === "vote_average.desc") list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      return localPage(list);
    },

    async getByGenre(genreId, page = 1) {
      return this.discover({ genre: genreId, page });
    },

    // Подбор по нескольким жанрам (OR) + диапазон годов — для «Слайдеров вкуса»
    async discoverMulti({ genreIds, sort, releaseGte, releaseLte, page = 1 } = {}) {
      if (this.hasTmdb()) {
        const params = { sort_by: sort || "popularity.desc", "vote_count.gte": 40, page };
        if (genreIds && genreIds.length) params.with_genres = genreIds.join("|");
        if (releaseGte) params["primary_release_date.gte"] = releaseGte;
        if (releaseLte) params["primary_release_date.lte"] = releaseLte;
        const d = await tmdbFetch("/discover/movie", params);
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      let listm = catalog.movies.map(normLocal);
      if (genreIds && genreIds.length) listm = listm.filter((m) => m.genres.some((g) => genreIds.includes(g)));
      if (releaseGte) listm = listm.filter((m) => (m.year || 0) >= +releaseGte.slice(0, 4));
      if (releaseLte) listm = listm.filter((m) => (m.year || 0) <= +releaseLte.slice(0, 4));
      return { results: listm, totalPages: 1 };
    },

    async search(query, page = 1) {
      const q = (query || "").trim();
      if (!q) return localPage([]);
      if (this.hasTmdb()) {
        const d = await tmdbFetch("/search/movie", { query: q, page });
        return { results: d.results.map(normTmdb), totalPages: d.total_pages };
      }
      const low = q.toLowerCase();
      const all = catalog.movies
        .map(normLocal)
        .filter(
          (m) =>
            m.title.toLowerCase().includes(low) ||
            m.originalTitle.toLowerCase().includes(low)
        );
      return localPage(all);
    },

    async getMovie(id) {
      if (String(id).startsWith("tmdb:")) {
        const tmdbId = id.slice(5);
        const data = await tmdbFetch("/movie/" + tmdbId, {
          append_to_response: "videos,credits",
        });
        const movie = normTmdb(data);
        if (data.credits) {
          const dir = (data.credits.crew || []).find((c) => c.job === "Director");
          if (dir) movie.director = dir.name;
          movie.cast = (data.credits.cast || []).slice(0, 10).map((c) => ({
            name: c.name,
            character: c.character,
            photo: c.profile_path ? IMG_PROFILE + c.profile_path : null,
          }));
        }
        if (data.videos && data.videos.results) {
          const yt = data.videos.results.find(
            (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
          );
          if (yt) movie.trailerYt = yt.key;
        }
        return movie;
      }
      const raw = catalog.movies.find((m) => m.id === id);
      return raw ? normLocal(raw) : null;
    },

    async getSimilar(movie) {
      if (movie.source === "tmdb" && this.hasTmdb()) {
        try {
          const d = await tmdbFetch("/movie/" + movie.tmdbId + "/similar", { page: 1 });
          return d.results.map(normTmdb).slice(0, 12);
        } catch (e) {
          return [];
        }
      }
      return catalog.movies
        .map(normLocal)
        .filter((m) => m.id !== movie.id && m.genres.some((g) => movie.genres.includes(g)))
        .slice(0, 12);
    },

    archiveEmbed(archiveId) {
      return ARCHIVE_EMBED + archiveId;
    },
  };

  window.Api = Api;
})();
