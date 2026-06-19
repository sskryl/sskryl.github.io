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
  const ARCHIVE_IMG = "https://archive.org/services/img/";
  const ARCHIVE_EMBED = "https://archive.org/embed/";

  let catalog = { genres: [], movies: [] };
  let genreMap = new Map(); // id -> {name, slug}

  // ----- Нормализация локального фильма -------------------------------------
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
      free: !!m.archiveId,
    };
  }

  // ----- Нормализация фильма из TMDB ----------------------------------------
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

  // ----- Публичный API ------------------------------------------------------
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
      const g = genreMap.get(id);
      return g ? g.name : "";
    },

    genreNames(ids, limit = 3) {
      return (ids || [])
        .map((id) => this.genreName(id))
        .filter(Boolean)
        .slice(0, limit);
    },

    findGenreBySlug(slug) {
      return catalog.genres.find((g) => g.slug === slug) || null;
    },

    // Бесплатные (встраиваемые) фильмы — всегда из локального каталога
    getFreeMovies() {
      return catalog.movies.map(normLocal).filter((m) => m.free);
    },

    // Популярное: TMDB при наличии ключа, иначе локальный каталог
    async getPopular(page = 1) {
      if (this.hasTmdb()) {
        const data = await tmdbFetch("/movie/popular", { page });
        return { results: data.results.map(normTmdb), totalPages: data.total_pages };
      }
      const all = catalog.movies.map(normLocal);
      return { results: all, totalPages: 1 };
    },

    async getByGenre(genreId, page = 1) {
      if (this.hasTmdb()) {
        const data = await tmdbFetch("/discover/movie", {
          with_genres: genreId,
          sort_by: "popularity.desc",
          "vote_count.gte": 50,
          page,
        });
        return { results: data.results.map(normTmdb), totalPages: data.total_pages };
      }
      const all = catalog.movies
        .map(normLocal)
        .filter((m) => m.genres.includes(Number(genreId)));
      return { results: all, totalPages: 1 };
    },

    async search(query, page = 1) {
      const q = query.trim();
      if (!q) return { results: [], totalPages: 1 };
      if (this.hasTmdb()) {
        const data = await tmdbFetch("/search/movie", { query: q, page });
        return { results: data.results.map(normTmdb), totalPages: data.total_pages };
      }
      const low = q.toLowerCase();
      const all = catalog.movies
        .map(normLocal)
        .filter(
          (m) =>
            m.title.toLowerCase().includes(low) ||
            m.originalTitle.toLowerCase().includes(low)
        );
      return { results: all, totalPages: 1 };
    },

    async getMovie(id) {
      if (String(id).startsWith("tmdb:")) {
        const tmdbId = id.slice(5);
        const data = await tmdbFetch("/movie/" + tmdbId, {
          append_to_response: "videos,credits",
        });
        const movie = normTmdb(data);
        // Режиссёр
        if (data.credits && data.credits.crew) {
          const dir = data.credits.crew.find((c) => c.job === "Director");
          if (dir) movie.director = dir.name;
        }
        // Трейлер (YouTube)
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
          const data = await tmdbFetch("/movie/" + movie.tmdbId + "/similar", { page: 1 });
          return data.results.map(normTmdb).slice(0, 12);
        } catch (e) {
          return [];
        }
      }
      // Локально: фильмы с пересечением жанров
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
