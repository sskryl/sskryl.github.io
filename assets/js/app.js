// ============================================================================
//  Роутинг, главная (hero-слайдер + ряды), каталог с фильтрами, модалка фильма.
// ============================================================================
(function () {
  "use strict";

  const CFG = window.CINEMA_CONFIG || {};
  const appEl = document.getElementById("app");
  const modalEl = document.getElementById("modal");
  const modalContentEl = document.getElementById("modal-content");

  let list = null;            // { fetch, page, totalPages, items }
  let filters = null;         // { genre, year, sort, minRating }
  let heroTimer = null;
  let swipeState = { pool: [], loading: false };
  let quizState = { answers: [], q: 0 };
  let tasteVals = null;
  let tasteTimer = null;
  const TASTE_SLIDERS = [
    { key: "s1", left: "🎈 Лёгкое", right: "Серьёзное 🎭", l: "Лёгкое", r: "Серьёзное" },
    { key: "s2", left: "🕰 Классика", right: "Новинки 🚀", l: "Классика", r: "Новинки" },
    { key: "s3", left: "🌍 Реализм", right: "Фантазия 🐉", l: "Реализм", r: "Фантазия" },
    { key: "s4", left: "🧘 Спокойное", right: "Динамичное ⚡", l: "Спокойное", r: "Динамичное" },
  ];
  function sliderValText(s, v) {
    if (v <= 38) return "← " + s.l;
    if (v >= 62) return s.r + " →";
    return "по центру";
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function routeKey(h) {
    if (["#/match", "#/taste", "#/swipe", "#/quiz", "#/foryou"].some((r) => h.indexOf(r) === 0)) return "podbor";
    if (h.indexOf("#/my") === 0) return "my";
    if (h.indexOf("#/cat/new") === 0) return "new";
    if (h.indexOf("#/catalog") === 0 && h.indexOf("release_date") >= 0) return "new";
    if (h.indexOf("#/catalog") === 0 || h.indexOf("#/free") === 0 || h.indexOf("#/cat/") === 0 || h.indexOf("#/collection/") === 0) return "catalog";
    if (h === "#/" || h === "") return "home";
    return "";
  }

  function highlightNav() {
    const hash = location.hash || "#/";
    const key = routeKey(hash);
    document.querySelectorAll(".nav__link").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("href") === hash);
    });
    // подсветка дропдаун-кнопок и нижнего таббара по разделу
    document.querySelectorAll(".nav__ddbtn[data-ddkey]").forEach((b) => {
      const k = b.getAttribute("data-ddkey");
      b.classList.toggle("is-active", k === key || (k === "catalog" && key === "new"));
    });
    document.querySelectorAll(".bottomnav a[data-bn]").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("data-bn") === key);
    });
  }

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
  }

  function stopHero() {
    if (heroTimer) {
      clearInterval(heroTimer);
      heroTimer = null;
    }
  }

  function startHero() {
    const hero = document.getElementById("hero");
    if (!hero) return;
    const slides = hero.querySelectorAll(".hero__slide");
    const dots = hero.querySelectorAll(".hero__dot");
    if (slides.length < 2) return;
    let idx = 0;
    const go = (n) => {
      slides[idx].classList.remove("is-active");
      if (dots[idx]) dots[idx].classList.remove("is-active");
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add("is-active");
      if (dots[idx]) dots[idx].classList.add("is-active");
    };
    stopHero();
    heroTimer = setInterval(() => go(idx + 1), 6000);
    dots.forEach((d, i) =>
      d.addEventListener("click", () => {
        go(i);
        stopHero();
        heroTimer = setInterval(() => go(idx + 1), 6000);
      })
    );
  }

  // ------------------------------------------------------------- ГЛАВНАЯ
  function shuffle(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // «Живой» hero: периодически прокручиваем веер постеров
  function startHeroFan(pool) {
    stopHero();
    const fan = document.querySelector(".hero2__fan");
    if (!fan || !pool || pool.length <= 4) return;
    let idx = 0;
    heroTimer = setInterval(() => {
      idx = (idx + 4) % pool.length;
      const slice = [];
      for (let i = 0; i < 4; i++) slice.push(pool[(idx + i) % pool.length]);
      fan.innerHTML = slice
        .map((m, i) => `<img class="hero2__poster" style="--i:${i}" src="${UI.esc(m.poster)}" alt="" loading="lazy" onerror="this.remove()">`)
        .join("");
    }, 5000);
  }

  async function renderHome() {
    stopHero();
    appEl.innerHTML = UI.skeletonHome();

    const [trending, fresh, top] = await Promise.allSettled([
      Api.getTrending(1),
      Api.getNewReleases(1),
      Api.getTopRated(1),
    ]);
    const val = (r) => (r.status === "fulfilled" ? r.value.results : []);
    const trend = val(trending);
    const free = Api.getFreeMovies();

    const freshList = (val(fresh).length ? val(fresh) : free);
    // Пул для «живого» hero — перемешиваем тренды/топ/новинки и крутим веер
    const heroPool = shuffle(dedupeById(trend.concat(val(top), freshList)).filter((m) => m.poster));
    const homeSearch = `
      <section class="homesearch">
        <form class="homesearch__form" id="home-search" role="search">
          <span class="homesearch__icon">🔍</span>
          <input class="homesearch__input" id="home-search-input" type="search" placeholder="Какой фильм найти? Введите название…" autocomplete="off" aria-label="Поиск фильма" />
          <button class="homesearch__btn" type="submit">Найти</button>
        </form>
      </section>`;

    let html = "";
    // 1) Новинки  2) Поиск  3) Hero
    html += '<div class="container home-top">';
    html += UI.row("Новинки", freshList.slice(0, 18), "#/cat/new", "🆕");
    html += homeSearch;
    html += "</div>";
    html += UI.hero2((heroPool.length ? heroPool : free).slice(0, 4));
    html += '<div class="container">';

    html += UI.pickerBand();
    html += '<div id="home-foryou"></div>';
    html += UI.tgBanner();

    // Подборки — быстрые ссылки (предпочитаемые жанры — вперёд)
    const prefGenres = Taste.hasProfile() ? Taste.topGenres(4) : null;
    html += `<section class="section"><div class="section__head"><h2 class="section__title">🎬 Подборки</h2><a class="section__link" href="#/catalog">Весь каталог →</a></div>${UI.collectionCards(prefGenres)}</section>`;

    html += UI.row("В тренде", trend.slice(0, 18), "#/cat/movies", "🔥");
    const history = UI.getHistory();
    if (history.length) html += UI.row("Вы недавно смотрели", history.slice(0, 16), null, "🕑");
    html += '<div id="home-coll"></div>';
    if (window.Ads) html += Ads.slot("home");
    html += UI.row("Смотреть бесплатно", free.slice(0, 18), "#/free", "🆓");
    html += "</div>";

    appEl.innerHTML = html;
    if (window.Ads) Ads.activate();
    startHeroFan(heroPool);

    // Тематические ряды догружаем после основной отрисовки.
    // Есть профиль — собираем ряды под топ-жанры пользователя; иначе — общие подборки.
    const collBox = document.getElementById("home-coll");
    const myGenres = Taste.hasProfile() ? Taste.topGenres(4) : [];
    if (myGenres.length) {
      for (const gid of myGenres) {
        try {
          const g = await Api.getByGenre(gid, 1);
          const ranked = Taste.rank(g.results).slice(0, 18);
          if (ranked.length && collBox) {
            collBox.insertAdjacentHTML("beforeend", UI.row("Вам понравится: " + Api.genreName(gid), ranked, "#/catalog/genre/" + gid, "🎯"));
          }
        } catch (e) {}
      }
    } else {
      for (const c of UI.collectionList().slice(0, 4)) {
        try {
          const g = await Api.discover({ ...c.q, sort: "popularity.desc", page: 1 });
          if (g.results.length && collBox) {
            collBox.insertAdjacentHTML("beforeend", UI.row(c.emoji + " " + c.title, g.results.slice(0, 18), "#/collection/" + c.key));
          }
        } catch (e) {}
      }
    }

    // Персональный ряд «Для вас» (если есть профиль)
    if (Taste.hasProfile()) {
      try {
        const pool = await buildSwipePool();
        const fy = document.getElementById("home-foryou");
        if (pool.length && fy) fy.innerHTML = UI.row("Для вас", pool.slice(0, 18), "#/foryou", "✨");
      } catch (e) {}
    }

    document.getElementById("year").textContent = new Date().getFullYear();
    scrollTop();
  }

  // ----- Страница коллекции --------------------------------------------------
  // ----- Персональный фильм-герой категории/коллекции ------------------------
  // Выбирает фильм с наибольшим прогнозом «понравится» (по модели вкуса).
  let featState = { pool: [], ctx: "", currentId: null };
  function dedupeById(arr) {
    const seen = new Set();
    return (arr || []).filter((m) => { const id = String(m.id); if (seen.has(id)) return false; seen.add(id); return true; });
  }
  function collheroHtml(o) {
    return `<div class="collhero"><div class="container collhero__in"><span class="collhero__e">${UI.esc(o.emoji)}</span><div><h1 class="collhero__t">${UI.esc(o.title)}</h1><p class="collhero__s">${UI.esc(o.subtitle || "Подборка фильмов")}</p></div></div></div>`;
  }
  function rollFeatured() {
    const rated = Taste.getRatings ? Taste.getRatings() : {};
    let pool = (featState.pool || []).filter(
      (m) => m.backdrop && !rated[String(m.id)] && String(m.id) !== String(featState.currentId)
    );
    if (Taste.hasProfile()) pool = Taste.rank(pool);
    const m = pool[0] || null;
    if (m) featState.currentId = m.id;
    return m;
  }
  function renderFeaturedInto(box) {
    if (!box) return;
    const m = rollFeatured();
    if (m) box.innerHTML = UI.featuredHero(m, featState.ctx);
  }

  function renderCollection(key) {
    stopHero();
    const c = UI.collection(key);
    if (!c) { appEl.innerHTML = `<div class="container">${UI.empty("Подборка не найдена")}</div>`; scrollTop(); return; }
    appEl.innerHTML = `
      <div id="feat-hero">${collheroHtml(c)}</div>
      <div class="container">
        ${window.Ads ? Ads.slot("catalog") : ""}
        <div id="list-grid">${UI.skeletonGrid()}</div>
        <div class="load-more" id="load-more-wrap"></div>
      </div>`;
    if (window.Ads) Ads.activate();
    list = { fetch: (p) => Api.discover({ ...c.q, sort: "popularity.desc", page: p }), page: 1, totalPages: 1, items: [] };
    loadListPage();
    // персональный фильм-герой коллекции
    Api.discover({ ...c.q, sort: "popularity.desc", page: 1 }).then((d) => {
      featState = { pool: dedupeById(d.results), ctx: c.emoji + " " + c.title, currentId: null };
      renderFeaturedInto(document.getElementById("feat-hero"));
    }).catch(() => {});
    scrollTop();
  }

  // ----- Лендинг категории (персональный герой + ряды) -----------------------
  const CATS = {
    movies: { title: "Фильмы", emoji: "🎬", genre: null, catalog: "#/catalog", kind: "showcase", extra: [28, 35, 878, 18, 12] },
    toons: { title: "Мультфильмы", emoji: "🧸", genre: 16, catalog: "#/catalog/genre/16", kind: "showcase", extra: [] },
    anime: { title: "Аниме", emoji: "🎌", genre: "anime", catalog: "#/catalog/genre/anime", kind: "showcase", extra: [] },
    new: { title: "Новинки", emoji: "🆕", genre: null, catalog: "#/catalog?sort=release_date.desc", kind: "showcase", extra: [28, 35, 878, 18, 12] },
  };
  async function renderCategory(key) {
    stopHero();
    const cat = CATS[key];
    if (!cat) return renderCatalog(null, {});
    const sep = cat.catalog.indexOf("?") >= 0 ? "&" : "?";
    appEl.innerHTML = `
      <div id="feat-hero">${collheroHtml({ emoji: cat.emoji, title: cat.title, subtitle: "Подбираем под ваш вкус…" })}</div>
      <div class="container"><div id="catland">${UI.skeletonRow()}</div>
      <div class="load-more"><a class="btn btn--lg" href="${cat.catalog}">Открыть весь каталог с фильтрами →</a></div></div>`;
    scrollTop();
    const heroBox = document.getElementById("feat-hero");
    const box = document.getElementById("catland");
    if (box) box.innerHTML = "";

    if (cat.kind === "new") {
      // Новинки: свежее в целом + свежее по жанрам
      const fresh = await Api.getNewReleases(1).then((d) => d.results).catch(() => []);
      featState = { pool: dedupeById(fresh), ctx: cat.emoji + " " + cat.title, currentId: null };
      const feat = rollFeatured();
      if (heroBox) heroBox.innerHTML = feat ? UI.featuredHero(feat, featState.ctx) : collheroHtml({ emoji: cat.emoji, title: cat.title, subtitle: "Свежие релизы" });
      if (fresh.length && box) box.insertAdjacentHTML("beforeend", UI.row("🆕 Самые свежие", fresh.slice(0, 18), cat.catalog));
      for (const gid of cat.extra) {
        try {
          const g = await Api.discover({ genre: gid, sort: "release_date.desc", page: 1 });
          if (g.results.length && box) box.insertAdjacentHTML("beforeend", UI.row("🆕 Новое: " + Api.genreName(gid), g.results.slice(0, 18), "#/catalog/genre/" + gid + "?sort=release_date.desc"));
        } catch (e) {}
      }
      return;
    }

    // showcase: популярное / новинки / топ + жанровые ряды
    const [popR, newR, topR] = await Promise.allSettled([
      Api.discover({ genre: cat.genre, sort: "popularity.desc", page: 1 }),
      Api.discover({ genre: cat.genre, sort: "release_date.desc", page: 1 }),
      Api.discover({ genre: cat.genre, sort: "vote_average.desc", page: 1 }),
    ]);
    const v = (r) => (r.status === "fulfilled" ? r.value.results : []);
    const pop = v(popR), nw = v(newR), tp = v(topR);

    featState = { pool: dedupeById(pop.concat(tp)), ctx: cat.emoji + " " + cat.title, currentId: null };
    const feat = rollFeatured();
    if (heroBox) heroBox.innerHTML = feat ? UI.featuredHero(feat, featState.ctx) : collheroHtml({ emoji: cat.emoji, title: cat.title, subtitle: "Популярное, новинки и топ" });

    const rows = [
      { t: "🔥 Популярное", data: pop, link: cat.catalog },
      { t: "🆕 Новинки", data: nw, link: cat.catalog + sep + "sort=release_date.desc" },
      { t: "⭐ Топ рейтинга", data: tp, link: cat.catalog + sep + "sort=vote_average.desc" },
    ];
    for (const r of rows) {
      if (r.data.length && box) box.insertAdjacentHTML("beforeend", UI.row(r.t, r.data.slice(0, 18), r.link));
    }
    // жанровые ряды (для «Фильмы»)
    for (const gid of cat.extra) {
      try {
        const g = await Api.discover({ genre: gid, sort: "popularity.desc", page: 1 });
        if (g.results.length && box) box.insertAdjacentHTML("beforeend", UI.row("🎬 " + Api.genreName(gid), g.results.slice(0, 18), "#/catalog/genre/" + gid));
      } catch (e) {}
    }
    scrollTop();
  }

  // ------------------------------------------------------------- КАТАЛОГ
  function genreChips(activeId) {
    const chips = Api.getGenres()
      .map(
        (g) =>
          `<a class="chip ${String(g.id) === String(activeId) ? "is-active" : ""}" href="#/catalog/genre/${g.id}">${UI.esc(g.name)}</a>`
      )
      .join("");
    const anime = `<a class="chip ${String(activeId) === "anime" ? "is-active" : ""}" href="#/catalog/genre/anime">🎌 Аниме</a>`;
    return `<div class="filters">
      <a class="chip ${!activeId ? "is-active" : ""}" href="#/catalog">Все</a>${chips}${anime}</div>`;
  }

  function filterControls() {
    const nowY = new Date().getFullYear();
    let years = '<option value="">Любой год</option>';
    for (let y = nowY; y >= 1950; y--) {
      years += `<option value="${y}" ${String(filters.year) === String(y) ? "selected" : ""}>${y}</option>`;
    }
    const sortOpt = (v, label) =>
      `<option value="${v}" ${filters.sort === v ? "selected" : ""}>${label}</option>`;
    const rateOpt = (v, label) =>
      `<option value="${v}" ${String(filters.minRating) === String(v) ? "selected" : ""}>${label}</option>`;
    return `
      <div class="controls">
        <select class="control" id="f-sort">
          ${sortOpt("popularity.desc", "🔥 По популярности")}
          ${sortOpt("release_date.desc", "🆕 По новизне")}
          ${sortOpt("vote_average.desc", "⭐ По рейтингу")}
        </select>
        <select class="control" id="f-year">${years}</select>
        <select class="control" id="f-rating">
          ${rateOpt("", "Любой рейтинг")}
          ${rateOpt("6", "★ 6+")}${rateOpt("7", "★ 7+")}${rateOpt("8", "★ 8+")}
        </select>
      </div>`;
  }

  function bindFilterControls() {
    const reload = () => {
      filters.year = document.getElementById("f-year").value;
      filters.sort = document.getElementById("f-sort").value;
      filters.minRating = document.getElementById("f-rating").value;
      list = {
        fetch: (p) => Api.discover({ ...filters, page: p }),
        page: 1,
        totalPages: 1,
        items: [],
      };
      loadListPage();
    };
    ["f-year", "f-sort", "f-rating"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", reload);
    });
  }

  function listShell(title, subtitle, filtersHtml, controlsHtml) {
    return `<div class="container">
      <div class="page-head"><h1>${UI.esc(title)}</h1>${subtitle ? `<p>${UI.esc(subtitle)}</p>` : ""}</div>
      ${filtersHtml || ""}${controlsHtml || ""}
      ${window.Ads ? Ads.slot("catalog") : ""}
      <div id="list-grid">${UI.skeletonGrid()}</div>
      <div class="load-more" id="load-more-wrap"></div></div>`;
  }

  // Каталог с боковой панелью фильтров (как на hdrezka)
  function catalogShell(title, subtitle, genre) {
    return `<div class="container">
      <div class="page-head"><h1>${UI.esc(title)}</h1>${subtitle ? `<p>${UI.esc(subtitle)}</p>` : ""}</div>
      <div class="cat">
        <aside class="cat__side">
          <div class="cat__group"><h4>Фильтр</h4>${filterControls()}</div>
          <div class="cat__group"><h4>Жанры</h4>${genreChips(genre)}</div>
        </aside>
        <div class="cat__main">
          ${window.Ads ? Ads.slot("catalog") : ""}
          <div id="list-grid">${UI.skeletonGrid()}</div>
          <div class="load-more" id="load-more-wrap"></div>
        </div>
      </div>
    </div>`;
  }

  function renderListGrid() {
    const gridEl = document.getElementById("list-grid");
    const moreWrap = document.getElementById("load-more-wrap");
    if (!gridEl) return;
    if (!list.items.length) {
      gridEl.innerHTML = UI.empty("По этому запросу фильмов не нашлось");
      moreWrap.innerHTML = "";
      return;
    }
    gridEl.innerHTML = UI.grid(list.items);
    moreWrap.innerHTML =
      list.page < list.totalPages
        ? `<button class="btn btn--ghost" id="load-more">Загрузить ещё</button>`
        : "";
  }

  async function loadListPage() {
    try {
      const data = await list.fetch(list.page);
      list.items = list.items.concat(data.results);
      list.totalPages = data.totalPages || 1;
      renderListGrid();
    } catch (e) {
      console.error(e);
      const gridEl = document.getElementById("list-grid");
      if (gridEl) gridEl.innerHTML = UI.empty("Не удалось загрузить данные. Проверьте соединение или TMDB-ключ.", "⚠️");
    }
  }

  function parseQuery(hash) {
    const qi = hash.indexOf("?");
    const out = {};
    if (qi >= 0) {
      new URLSearchParams(hash.slice(qi + 1)).forEach((v, k) => (out[k] = v));
    }
    return out;
  }

  function renderCatalog(genre, query) {
    stopHero();
    const q = query || {};
    filters = {
      genre: genre || null,
      year: q.year || "",
      sort: q.sort || "popularity.desc",
      minRating: q.rating || "",
    };
    const title = genre ? "Жанр: " + (Api.genreName(genre) || "") : "Каталог фильмов";
    const subtitle = Api.hasTmdb()
      ? "Тысячи фильмов из TMDB. Фильтруйте по жанру, году и рейтингу."
      : "Каталог public-domain фильмов. Подключите TMDB-ключ для большой базы.";
    appEl.innerHTML = catalogShell(title, subtitle, genre);
    if (window.Ads) Ads.activate();
    bindFilterControls();
    list = { fetch: (p) => Api.discover({ ...filters, page: p }), page: 1, totalPages: 1, items: [] };
    loadListPage();
    scrollTop();
  }

  function renderFree() {
    stopHero();
    appEl.innerHTML = listShell(
      "Смотреть бесплатно",
      "Фильмы в общественном достоянии — смотрите прямо на сайте, легально.",
      "", ""
    );
    list = { fetch: null, page: 1, totalPages: 1, items: Api.getFreeMovies() };
    renderListGrid();
    scrollTop();
  }

  function renderSearch(queryStr) {
    stopHero();
    appEl.innerHTML = listShell("Поиск: «" + queryStr + "»", null, "", "");
    list = { fetch: (p) => Api.search(queryStr, p), page: 1, totalPages: 1, items: [] };
    loadListPage();
    scrollTop();
  }

  // ------------------------------------------------------------- ПЕРСОНАЛИЗАЦИЯ
  async function buildSwipePool() {
    const rated = Taste.ratedIds();
    let pool = [];
    const top = Taste.topGenres(3);
    try {
      const tr = await Api.getTrending(1);
      pool = pool.concat(tr.results);
      if (top.length) {
        for (const g of top) {
          const d = await Api.discover({ genre: g, page: 1 });
          pool = pool.concat(d.results);
        }
      } else {
        const nr = await Api.getNewReleases(1);
        pool = pool.concat(nr.results);
      }
    } catch (e) {
      console.error(e);
    }
    const seen = new Set();
    const out = [];
    for (const m of pool) {
      if (!seen.has(m.id) && !rated.has(String(m.id))) {
        seen.add(m.id);
        out.push(m);
      }
    }
    return Taste.rank(out);
  }

  function swipeCardHtml(m) {
    const genres = Api.genreNames(m.genres, 3).join(" • ");
    const s = Taste.stats();
    const ov = (m.overview || "").slice(0, 240);
    return `
      <div class="swipe__counter">Оценено: ${s.total} &nbsp;❤️ ${s.liked} &nbsp;👎 ${s.disliked}</div>
      <div class="swipe__card">
        <div class="swipe__poster ${m.poster ? "" : "card__poster--empty"}" style="${m.poster ? `background-image:url('${UI.esc(m.poster)}')` : ""}">
          ${m.poster ? "" : UI.esc(m.title)}
          ${m.rating ? `<span class="card__rating">★ ${UI.esc(m.rating)}</span>` : ""}
          ${m.free ? `<span class="card__free">free</span>` : ""}
        </div>
        <div class="swipe__info">
          <h2 class="swipe__title">${UI.esc(m.title)} ${m.year ? `<span class="swipe__year">${UI.esc(m.year)}</span>` : ""}</h2>
          <p class="swipe__genres">${UI.esc(genres)}</p>
          <p class="swipe__overview">${UI.esc(ov)}${(m.overview || "").length > 240 ? "…" : ""}</p>
          <button class="btn btn--ghost swipe__details" data-movie="${UI.esc(m.id)}">ℹ️ Подробнее / смотреть</button>
        </div>
      </div>
      <div class="swipe__actions">
        <button class="swipe__btn swipe__btn--no" data-rate="dislike" aria-label="Не нравится">👎</button>
        <button class="swipe__btn swipe__btn--skip" data-skip aria-label="Пропустить">⏭</button>
        <button class="swipe__btn swipe__btn--yes" data-rate="like" aria-label="Нравится">❤️</button>
      </div>`;
  }

  function swipeFinishHtml() {
    const s = Taste.stats();
    return `<div class="empty"><div class="empty__emoji">🎉</div>
      <p>Готово! Оценено фильмов: ${s.total} (❤️ ${s.liked} · 👎 ${s.disliked}).</p>
      <div class="hero__actions" style="justify-content:center;margin-top:18px">
        <a class="btn" href="#/foryou">✨ Смотреть «Для вас»</a>
        <a class="btn btn--ghost" href="#/my">❤️ Моё</a>
      </div></div>`;
  }

  function showSwipeCard() {
    const area = document.getElementById("swipe-area");
    if (!area) return;
    area.innerHTML = swipeState.pool.length ? swipeCardHtml(swipeState.pool[0]) : swipeFinishHtml();
  }

  async function renderSwipe() {
    stopHero();
    appEl.innerHTML = `<div class="container"><div class="page-head"><h1>🎬 Подбор</h1><p>Оценивайте фильмы — модель учится на каждом ответе.</p></div><div class="swipe" id="swipe-area"><div class="loader"><div class="spinner"></div></div></div></div>`;
    swipeState.pool = await buildSwipePool();
    showSwipeCard();
    scrollTop();
  }

  async function handleRate(action) {
    const m = swipeState.pool.shift();
    if (!m) return;
    Taste.rate(m, action === "like");
    if (window.Sync) Sync.sendRate(m, action === "like");
    swipeState.pool = Taste.rank(swipeState.pool);
    showSwipeCard();
    if (swipeState.pool.length < 3 && !swipeState.loading) {
      swipeState.loading = true;
      try {
        const more = await buildSwipePool();
        const have = new Set(swipeState.pool.map((x) => x.id));
        more.forEach((x) => { if (!have.has(x.id)) swipeState.pool.push(x); });
      } catch (e) {}
      swipeState.loading = false;
      if (!document.querySelector("#swipe-area .swipe__card")) showSwipeCard();
    }
  }

  function handleSkip() {
    swipeState.pool.shift();
    showSwipeCard();
  }

  async function renderForYou() {
    stopHero();
    appEl.innerHTML = listShell("✨ Для вас", "Подобрано по вашим оценкам и психотипу", "", "");
    const gridEl = document.getElementById("list-grid");
    if (!Taste.hasProfile()) {
      gridEl.innerHTML = UI.empty("Сначала оцените фильмы в разделе «🎬 Подбор» или пройдите «🧠 Тест».", "🧭");
      document.getElementById("load-more-wrap").innerHTML = "";
      return;
    }
    const pool = await buildSwipePool();
    list = { fetch: null, page: 1, totalPages: 1, items: pool.slice(0, 30) };
    renderListGrid();
    scrollTop();
  }

  function renderMy() {
    stopHero();
    const wl = window.Watchlist ? Watchlist.all() : [];
    const liked = Taste.liked();
    const s = Taste.stats();
    let html = `<div class="container"><div class="page-head"><h1>❤️ Моё</h1><p>В списке: ${wl.length} · Оценено: ${s.total} (❤️ ${s.liked} · 👎 ${s.disliked})</p></div>`;
    if (wl.length) {
      html += `<section class="section"><div class="section__head"><h2 class="section__title">🔖 Хочу посмотреть</h2><span class="section__count">${wl.length}</span></div>${UI.grid(wl)}</section>`;
    }
    html += `<section class="section"><div class="section__head"><h2 class="section__title">❤️ Понравилось</h2></div>`;
    html += liked.length ? UI.grid(liked) : UI.empty("Пока пусто. Оцените фильмы в разделе «🎯 Подбор» или нажмите ＋ на постере, чтобы добавить в список.");
    html += `</section>`;
    html += `<div class="load-more"><button class="btn btn--ghost" data-reset>🗑 Сбросить мой профиль</button></div></div>`;
    appEl.innerHTML = html;
    scrollTop();
  }

  // ----- Психотест -----------------------------------------------------------
  function showQuizQuestion() {
    const i = quizState.q;
    const q = Quiz.QUESTIONS[i];
    const total = Quiz.QUESTIONS.length;
    appEl.innerHTML = `<div class="container quiz">
      <div class="quiz__bar"><span style="width:${(i / total) * 100}%"></span></div>
      <div class="quiz__step">Вопрос ${i + 1} / ${total}</div>
      <h1 class="quiz__q">${UI.esc(q.text)}</h1>
      <div class="quiz__opts">${q.options.map((o, idx) => `<button class="quiz__opt" data-quiz-ans="${idx}">${UI.esc(o.label)}</button>`).join("")}</div>
    </div>`;
  }

  function renderQuiz() {
    stopHero();
    quizState = { answers: [], q: 0 };
    showQuizQuestion();
    scrollTop();
  }

  function answerQuiz(optIdx) {
    quizState.answers.push([quizState.q, optIdx]);
    quizState.q += 1;
    if (quizState.q < Quiz.QUESTIONS.length) showQuizQuestion();
    else finishQuiz();
  }

  function finishQuiz() {
    const scores = Quiz.score(quizState.answers);
    const arch = Quiz.detect(scores);
    Taste.setQuiz(arch.key, scores);
    const titles = Quiz.topGenres(scores, 3).map((g) => Api.genreName(g)).filter(Boolean).join(", ");
    appEl.innerHTML = `<div class="container quiz quiz--result">
      <div class="quiz__result-emoji">✨</div>
      <h1>${UI.esc(arch.title)}</h1>
      <p class="quiz__desc">${UI.esc(arch.desc)}</p>
      <p class="quiz__genres">🎯 Любимые жанры: <b>${UI.esc(titles)}</b></p>
      <div class="hero__actions" style="justify-content:center;margin-top:8px">
        <a class="btn btn--lg" href="#/swipe">🎬 Начать подбор</a>
        <a class="btn btn--ghost" href="#/foryou">✨ Для вас</a>
      </div></div>`;
    scrollTop();
  }

  // ------------------------------------------------------------- СЛАЙДЕРЫ ВКУСА
  // Полюса каждого слайдера: какие жанры усиливает левый/правый край.
  const SLIDER_POLES = {
    s1: { low: { 35: 1, 10751: 0.8, 16: 0.6, 10749: 0.4 }, high: { 18: 1, 36: 0.7, 10752: 0.6, 80: 0.5 } },
    s3: { low: { 18: 0.8, 80: 0.8, 36: 0.6, 99: 0.6, 53: 0.5 }, high: { 14: 1, 878: 1, 12: 0.6, 16: 0.4 } },
    s4: { low: { 18: 0.7, 10749: 0.8, 99: 0.5, 10751: 0.4 }, high: { 28: 1, 53: 0.8, 12: 0.7, 27: 0.6 } },
  };

  function sliderGenreScores(v) {
    const t = (x) => (x / 100 - 0.5) * 2; // [-1..1]
    const score = {};
    ["s1", "s3", "s4"].forEach((k) => {
      const tv = t(v[k]);
      if (Math.abs(tv) < 0.05) return;
      const set = tv > 0 ? SLIDER_POLES[k].high : SLIDER_POLES[k].low;
      for (const g in set) score[g] = (score[g] || 0) + Math.abs(tv) * set[g];
    });
    return score;
  }
  function tasteEra(v) { return (v.s2 / 100 - 0.5) * 2; } // минус — классика, плюс — новинки

  async function tasteLivePool(v) {
    const gs = sliderGenreScores(v);
    const top = Object.keys(gs).map(Number).sort((a, b) => gs[b] - gs[a]).slice(0, 4);
    const t2 = tasteEra(v);
    const yr = new Date().getFullYear();
    const opts = { genreIds: top, page: 1, sort: "popularity.desc" };
    if (t2 > 0.25) opts.releaseGte = yr - 4 + "-01-01";
    else if (t2 < -0.25) { opts.releaseLte = "1995-12-31"; opts.sort = "vote_average.desc"; }
    let res = [];
    try { res = (await Api.discoverMulti(opts)).results; } catch (e) {}
    const scoreMovie = (m) => {
      let s = (m.genres || []).reduce((a, g) => a + (gs[g] || 0), 0);
      if (t2 > 0 && +m.year >= yr - 5) s += t2 * 0.8;
      if (t2 < 0 && +m.year && +m.year < 1995) s += -t2 * 0.8;
      return s + (m.rating || 0) / 20;
    };
    res.sort((a, b) => scoreMovie(b) - scoreMovie(a));
    return res.slice(0, 12);
  }

  async function updateTasteResults() {
    const box = document.getElementById("taste-results");
    if (!box) return;
    const pool = await tasteLivePool(tasteVals);
    box.innerHTML = pool.length ? UI.grid(pool) : UI.empty("Подвигай ползунки, чтобы увидеть фильмы", "🎛");
  }

  function saveTaste() {
    const gs = sliderGenreScores(tasteVals);
    const vals = Object.values(gs);
    const mx = vals.length ? Math.max.apply(null, vals) : 1;
    const delta = {};
    for (const g in gs) delta["g:" + g] = gs[g] / mx;
    const t2 = tasteEra(tasteVals);
    if (t2 > 0.15) delta["recent"] = t2;
    if (t2 < -0.15) delta["era:classic"] = -t2;
    Taste.setSliders(tasteVals, delta);
    location.hash = "#/foryou";
  }

  function renderTaste() {
    stopHero();
    tasteVals = Taste.getSliders() || { s1: 50, s2: 50, s3: 50, s4: 50 };
    const sliders = TASTE_SLIDERS.map((s) => `
      <div class="tslider">
        <div class="tslider__labels"><span>${UI.esc(s.left)}</span><span>${UI.esc(s.right)}</span></div>
        <input type="range" min="0" max="100" value="${tasteVals[s.key]}" class="tslider__input" data-slider="${s.key}" aria-label="${UI.esc(s.left)} — ${UI.esc(s.right)}">
        <div class="tslider__val" id="val-${s.key}">${UI.esc(sliderValText(s, tasteVals[s.key]))}</div>
      </div>`).join("");
    appEl.innerHTML = `<div class="container taste">
      <div class="page-head"><h1>🎛 Слайдеры вкуса</h1><p>Двигай ползунки — подборка под тобой меняется вживую. Никаких вопросов.</p></div>
      <div class="taste__sliders">${sliders}</div>
      <div class="taste__live">
        <div class="rowsec__head"><h2 class="rowsec__title">🎬 Под твоё настроение</h2></div>
        <div id="taste-results">${UI.skeletonGrid()}</div>
      </div>
      <div class="taste__save">
        <button class="btn btn--lg" id="taste-save">💾 Сохранить вкус</button>
        <a class="nav__link taste__alt" href="#/quiz">или классический тест →</a>
      </div></div>`;
    appEl.querySelectorAll(".tslider__input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const key = inp.getAttribute("data-slider");
        tasteVals[key] = +inp.value;
        const s = TASTE_SLIDERS.find((x) => x.key === key);
        const valEl = document.getElementById("val-" + key);
        if (valEl && s) valEl.textContent = sliderValText(s, +inp.value);
        clearTimeout(tasteTimer);
        tasteTimer = setTimeout(updateTasteResults, 280);
      });
    });
    const saveBtn = document.getElementById("taste-save");
    if (saveBtn) saveBtn.addEventListener("click", saveTaste);
    updateTasteResults();
    scrollTop();
  }

  // ===================== «ТОЧНЫЙ ПОДБОР» — геймифицированный мастер =========
  const MATCH_SWIPES = 8;
  const MATCH_DUELS = 6;
  let matchState = null;

  function mShell(inner) {
    appEl.innerHTML = `<div class="container match">${inner}</div>`;
    scrollTop();
  }
  function mProgress() {
    const total = MATCH_SWIPES + MATCH_DUELS;
    const done = Math.min(matchState.swipes, MATCH_SWIPES) + Math.min(matchState.duels, MATCH_DUELS);
    return Math.round((done / total) * 100);
  }
  function mBar() {
    return `<div class="match__bar"><span style="width:${mProgress()}%"></span></div>`;
  }

  function renderMatch() {
    stopHero();
    if (!matchState) matchState = { phase: "intro", pool: [], swipes: 0, duels: 0, pair: [], duelPool: [] };
    if (matchState.phase === "swipe") return mSwipeCard();
    if (matchState.phase === "duel") return mDuelPair();
    if (matchState.phase === "reveal") return mReveal();
    return mIntro();
  }

  function mIntro() {
    matchState = { phase: "intro", pool: [], swipes: 0, duels: 0, pair: [], duelPool: [] };
    mShell(`
      <div class="match__intro">
        <div class="match__emoji">🎯</div>
        <h1>Точный подбор за минуту</h1>
        <p class="match__lead">Два шага — и я соберу твой кинопрофиль. Никаких занудных вопросов.</p>
        <div class="match__steps">
          <div class="match__step"><span>1</span><b>Свайпы</b><i>оцени фильмы ❤️ / 👎</i></div>
          <div class="match__step"><span>2</span><b>Дуэли</b><i>выбери, что бы посмотрел</i></div>
        </div>
        <button class="btn btn--lg" data-match="start">Поехали →</button>
      </div>`);
  }

  async function mStart() {
    matchState.phase = "swipe";
    matchState.swipes = 0;
    mShell(`<div class="loader"><div class="spinner"></div></div>`);
    matchState.pool = await buildSwipePool();
    if (!matchState.pool.length) { mShell(UI.empty("Не удалось загрузить фильмы. Попробуй позже.", "⚠️")); return; }
    mSwipeCard();
  }

  function mSwipeCard() {
    if (!matchState.pool.length) { mStartDuels(); return; }
    const m = matchState.pool[0];
    const genres = Api.genreNames(m.genres, 3).join(" • ");
    mShell(`
      ${mBar()}
      <div class="match__hint">Шаг 1 из 2 · Оцени фильмы (${Math.min(matchState.swipes, MATCH_SWIPES)}/${MATCH_SWIPES})</div>
      <div class="swipe">
        <div class="swipe__card">
          <div class="swipe__poster ${m.poster ? "" : "card__poster--empty"}" style="${m.poster ? `background-image:url('${UI.esc(m.poster)}')` : ""}">${m.poster ? "" : UI.esc(m.title)}${m.rating ? `<span class="card__rating">★ ${UI.esc(m.rating)}</span>` : ""}</div>
          <div class="swipe__info"><h2 class="swipe__title">${UI.esc(m.title)} ${m.year ? `<span class="swipe__year">${UI.esc(m.year)}</span>` : ""}</h2><p class="swipe__genres">${UI.esc(genres)}</p></div>
        </div>
        <div class="swipe__actions">
          <button class="swipe__btn swipe__btn--no" data-mrate="dislike" aria-label="Не нравится">👎</button>
          <button class="swipe__btn swipe__btn--skip" data-mskip aria-label="Пропустить">⏭</button>
          <button class="swipe__btn swipe__btn--yes" data-mrate="like" aria-label="Нравится">❤️</button>
        </div>
      </div>`);
  }

  async function mRate(action) {
    const m = matchState.pool.shift();
    if (m) { Taste.rate(m, action === "like"); if (window.Sync) Sync.sendRate(m, action === "like"); }
    matchState.swipes++;
    matchState.pool = Taste.rank(matchState.pool);
    if (matchState.swipes >= MATCH_SWIPES) { await mStartDuels(); return; }
    if (matchState.pool.length < 2) {
      const more = await buildSwipePool();
      const have = new Set(matchState.pool.map((x) => x.id));
      more.forEach((x) => { if (!have.has(x.id)) matchState.pool.push(x); });
    }
    mSwipeCard();
  }
  function mSkip() {
    matchState.pool.shift();
    if (!matchState.pool.length) { mStartDuels(); return; }
    mSwipeCard();
  }

  async function mStartDuels() {
    matchState.phase = "duel";
    matchState.duels = 0;
    mShell(`<div class="loader"><div class="spinner"></div></div>`);
    matchState.duelPool = await buildSwipePool();
    if (matchState.duelPool.length < 2) { mReveal(); return; }
    mDuelPair();
  }

  function mDuelCard(m) {
    return `<button class="duel__card" data-mduel="${UI.esc(m.id)}">
      <div class="duel__poster ${m.poster ? "" : "card__poster--empty"}" style="${m.poster ? `background-image:url('${UI.esc(m.poster)}')` : ""}">${m.poster ? "" : UI.esc(m.title)}</div>
      <div class="duel__title">${UI.esc(m.title)} ${m.year ? `<span>${UI.esc(m.year)}</span>` : ""}</div></button>`;
  }
  function mDuelPair() {
    if (matchState.duelPool.length < 2) { mReveal(); return; }
    const a = matchState.duelPool[0], b = matchState.duelPool[1];
    matchState.pair = [a, b];
    mShell(`
      ${mBar()}
      <div class="match__hint">Шаг 2 из 2 · Что бы ты посмотрел? (${Math.min(matchState.duels, MATCH_DUELS)}/${MATCH_DUELS})</div>
      <div class="duel">${mDuelCard(a)}<div class="duel__vs">VS</div>${mDuelCard(b)}</div>
      <div style="text-align:center"><button class="btn btn--ghost duel__skip" data-mduel="skip">Оба мимо →</button></div>`);
  }

  async function mPick(key) {
    const [a, b] = matchState.pair;
    if (key !== "skip") {
      const chosen = a.id === key ? a : b;
      Taste.rate(chosen, true);
      if (window.Sync) Sync.sendRate(chosen, true);
    }
    matchState.duelPool = matchState.duelPool.filter((m) => m.id !== a.id && m.id !== b.id);
    matchState.duels++;
    if (matchState.duels >= MATCH_DUELS) { await mReveal(); return; }
    if (matchState.duelPool.length < 2) {
      const more = await buildSwipePool();
      const have = new Set(matchState.duelPool.map((x) => x.id));
      more.forEach((x) => { if (!have.has(x.id)) matchState.duelPool.push(x); });
    }
    mDuelPair();
  }

  async function mReveal() {
    matchState.phase = "reveal";
    const weights = Taste.getWeights();
    const scores = {};
    Object.keys(weights).forEach((k) => { if (k.indexOf("g:") === 0 && weights[k] > 0) scores[+k.slice(2)] = weights[k]; });
    const arch = window.Quiz && Object.keys(scores).length ? Quiz.detect(scores) : null;
    const topGenres = Taste.topGenres(3).map((g) => Api.genreName(g)).filter(Boolean);
    const eraLean = weights["recent"] > 0.4 ? "современное кино" : (weights["era:classic"] > 0.4 ? "классику" : "разные эпохи");
    const dna = topGenres.map((g, i) => `<div class="dna__seg" style="flex:${3 - i}">${UI.esc(g)}</div>`).join("");
    mShell(`
      <div class="match__reveal">
        <div class="match__emoji">✨</div>
        <h1>Твой кинопрофиль готов!</h1>
        ${arch ? `<div class="reveal__arch">${UI.esc(arch.title)}</div><p class="reveal__desc">${UI.esc(arch.desc)}</p>` : ""}
        ${topGenres.length ? `<div class="dna">${dna}</div>` : ""}
        <div class="reveal__rows">
          <div class="reveal__row"><b>🎯 Любимые жанры:</b> ${UI.esc(topGenres.join(", ") || "—")}</div>
          <div class="reveal__row"><b>🕰 Предпочитаешь:</b> ${UI.esc(eraLean)}</div>
        </div>
        <div class="hero2__cta" style="justify-content:center;margin-top:20px">
          <a class="btn btn--lg" href="#/foryou">✨ Смотреть подборку</a>
          <button class="btn btn--ghost" data-share="мой кинопрофиль">🔗 Поделиться</button>
          <button class="btn btn--ghost" data-match="restart">↻ Заново</button>
        </div>
      </div>
      <div id="match-recs"></div>`);
    mLoadRecs();
  }

  async function mLoadRecs() {
    const box = document.getElementById("match-recs");
    if (!box) return;
    box.innerHTML = `<div class="container">${UI.skeletonGrid()}</div>`;
    const pool = await buildSwipePool();
    box.innerHTML = pool.length
      ? `<div class="container"><div class="section"><div class="section__head"><h2 class="section__title">🎬 Тебе зайдёт</h2></div>${UI.grid(pool.slice(0, 12))}</div></div>`
      : "";
  }

  // ------------------------------------------------------------- МОДАЛКА
  async function openMovie(id) {
    modalEl.classList.add("is-open");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modalContentEl.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
    try {
      const movie = await Api.getMovie(id);
      if (!movie) {
        modalContentEl.innerHTML = UI.empty("Фильм не найден");
        return;
      }
      const similar = await Api.getSimilar(movie);
      modalContentEl.innerHTML = UI.detail(movie, similar);
      if (window.Ads) Ads.activate();
      UI.addToHistory(movie);
    } catch (e) {
      console.error(e);
      modalContentEl.innerHTML = UI.empty("Не удалось загрузить фильм", "⚠️");
    }
  }

  function closeModal() {
    modalEl.classList.remove("is-open");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    modalContentEl.innerHTML = "";
  }

  // Замена карточки на новую рекомендацию после оценки (тиндер-поведение везде)
  let recoPool = [];
  let recoLoading = null;
  function refillReco() {
    if (recoLoading) return recoLoading;
    recoLoading = buildSwipePool()
      .then((p) => {
        const have = new Set(recoPool.map((m) => String(m.id)));
        p.forEach((m) => { if (!have.has(String(m.id))) recoPool.push(m); });
        recoLoading = null;
      })
      .catch(() => { recoLoading = null; });
    return recoLoading;
  }
  async function nextReco() {
    if (recoPool.length < 4) await refillReco();
    recoPool = Taste.rank(recoPool); // переранжируем под обновлённый вкус
    const onPage = new Set(
      Array.prototype.map.call(document.querySelectorAll("[data-movie]"), (e) => e.getAttribute("data-movie"))
    );
    const rated = Taste.getRatings ? Taste.getRatings() : {};
    while (recoPool.length) {
      const m = recoPool.shift();
      const id = String(m.id);
      if (onPage.has(id) || rated[id]) continue;
      return m;
    }
    return null;
  }
  async function replaceCardWithReco(cardEl) {
    if (!cardEl || !cardEl.parentNode) return;
    cardEl.classList.add("card--swap");
    const m = await nextReco();
    if (!m || !cardEl.parentNode) { if (cardEl) cardEl.classList.remove("card--swap"); return; }
    const tmp = document.createElement("div");
    tmp.innerHTML = UI.card(m);
    const fresh = tmp.firstElementChild;
    if (!fresh) { cardEl.classList.remove("card--swap"); return; }
    fresh.classList.add("card--enter");
    cardEl.replaceWith(fresh);
    requestAnimationFrame(() => fresh.classList.remove("card--enter"));
  }

  // Персонализация меню: блок «Ваши жанры» в выпадашке «Подобрать»
  function applyPersonalNav() {
    const menu = document.querySelector(".nav__menu--wide");
    if (!menu) return;
    const old = menu.querySelector(".nav__personal");
    if (old) old.remove();
    if (!Taste.hasProfile()) return;
    const gids = Taste.topGenres(4).filter((g) => Api.genreName(g));
    if (!gids.length) return;
    const links = gids
      .map((g) => `<a href="#/catalog/genre/${g}" class="nav__menulink nav__personal-link">🎯 ${UI.esc(Api.genreName(g))}</a>`)
      .join("");
    menu.insertAdjacentHTML(
      "afterbegin",
      `<div class="nav__personal"><div class="nav__personal-h">★ Ваши жанры</div>${links}</div>`
    );
  }

  // ------------------------------------------------------------- РОУТЕР
  function router() {
    highlightNav();
    applyPersonalNav();
    const hash = location.hash || "#/";
    const path = hash.split("?")[0];
    const query = parseQuery(hash);
    const parts = path.replace(/^#\//, "").split("/").filter(Boolean);
    if (parts.length === 0) return renderHome();
    if (parts[0] === "collection") return renderCollection(parts[1]);
    if (parts[0] === "cat") return renderCategory(parts[1]);
    if (parts[0] === "catalog" && parts[1] === "genre") return renderCatalog(parts[2], query);
    if (parts[0] === "catalog") return renderCatalog(null, query);
    if (parts[0] === "match") return renderMatch();
    if (parts[0] === "swipe") return renderSwipe();
    if (parts[0] === "foryou") return renderForYou();
    if (parts[0] === "my") return renderMy();
    if (parts[0] === "taste") return renderTaste();
    if (parts[0] === "quiz") return renderQuiz();
    if (parts[0] === "free") return renderFree();
    if (parts[0] === "search") return renderSearch(decodeURIComponent(parts.slice(1).join("/")));
    return renderHome();
  }

  // ------------------------------------------------------------- ИНИЦИАЛИЗАЦИЯ
  function renderAuth() {
    const el = document.getElementById("auth");
    if (!el) return;
    if (!window.Sync || !Sync.enabled()) { el.innerHTML = ""; return; }
    if (Sync.isLoggedIn()) {
      const u = Sync.user() || {};
      el.innerHTML = `<div class="auth__user">
        ${u.photo ? `<img class="auth__ava" src="${UI.esc(u.photo)}" alt="" onerror="this.remove()">` : ""}
        <span class="auth__name">${UI.esc(u.name || "Профиль")}</span>
        <button class="auth__out" data-logout title="Выйти">⎋</button></div>`;
    } else {
      el.innerHTML = "";
      const botName = (window.CINEMA_CONFIG || {}).telegramBotName;
      if (!botName) return;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://telegram.org/js/telegram-widget.js?22";
      s.setAttribute("data-telegram-login", botName);
      s.setAttribute("data-size", "medium");
      s.setAttribute("data-userpic", "false");
      s.setAttribute("data-request-access", "write");
      s.setAttribute("data-onauth", "onTelegramAuth(user)");
      el.appendChild(s);
    }
  }

  window.onTelegramAuth = async function (user) {
    try {
      await Sync.login(user);
      renderAuth();
      router();
    } catch (e) {
      window.alert("Не удалось войти через Telegram. Попробуйте ещё раз.");
    }
  };

  function initChrome() {
    if (window.Ads) Ads.init();

    // Тема (светлая по умолчанию)
    applyTheme(document.documentElement.getAttribute("data-theme") || "light");
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        try { localStorage.setItem("cinema:theme", t); } catch (e) {}
        applyTheme(t);
      });
    }

    if (CFG.siteName) {
      document.title = CFG.siteName + " — бесплатный онлайн кинотеатр";
      document.querySelectorAll("[data-site-name]").forEach((el) => (el.textContent = CFG.siteName));
    }
    const tgFooter = document.getElementById("footer-tg");
    if (tgFooter && CFG.telegramBotUrl) tgFooter.href = CFG.telegramBotUrl;

    const searchForm = document.getElementById("search");
    const searchInput = document.getElementById("search-input");
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (q) {
        location.hash = "#/search/" + encodeURIComponent(q);
        document.getElementById("nav").classList.remove("is-open");
        searchForm.classList.remove("is-open");
      }
    });

    // Крупный поиск на главной (делегированно — блок перерисовывается)
    document.body.addEventListener("submit", (e) => {
      const hf = e.target.closest("#home-search");
      if (!hf) return;
      e.preventDefault();
      const inp = hf.querySelector("input");
      const q = (inp && inp.value || "").trim();
      if (q) location.hash = "#/search/" + encodeURIComponent(q);
    });

    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      searchForm.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest(".nav__ddbtn")) return; // клик по кнопке меню — открыть подменю
      if (e.target.closest(".nav__menulink") || e.target.closest(".nav__usp") || e.target.classList.contains("nav__link")) {
        nav.classList.remove("is-open");
        searchForm.classList.remove("is-open");
        document.querySelectorAll(".nav__dd.is-open").forEach((x) => x.classList.remove("is-open"));
      }
    });

    document.body.addEventListener("click", (e) => {
      // Выпадающие меню в навигации (Каталог / Подобрать)
      const ddBtn = e.target.closest("[data-dropdown]");
      if (ddBtn) {
        const dd = ddBtn.closest(".nav__dd");
        const wasOpen = dd.classList.contains("is-open");
        document.querySelectorAll(".nav__dd.is-open").forEach((x) => x.classList.remove("is-open"));
        if (!wasOpen) {
          dd.classList.add("is-open");
          ddBtn.setAttribute("aria-expanded", "true");
        } else {
          ddBtn.setAttribute("aria-expanded", "false");
        }
        return;
      }
      if (!e.target.closest(".nav__dd")) {
        document.querySelectorAll(".nav__dd.is-open").forEach((x) => x.classList.remove("is-open"));
      }

      // Мастер «Точный подбор»
      const mt = e.target.closest("[data-match]");
      if (mt) {
        const a = mt.getAttribute("data-match");
        if (a === "start") mStart();
        else if (a === "restart") { matchState = null; renderMatch(); }
        return;
      }
      const mr = e.target.closest("[data-mrate]");
      if (mr) { mRate(mr.getAttribute("data-mrate")); return; }
      if (e.target.closest("[data-mskip]")) { mSkip(); return; }
      const md = e.target.closest("[data-mduel]");
      if (md) { mPick(md.getAttribute("data-mduel")); return; }

      const rateBtn = e.target.closest("[data-rate]");
      if (rateBtn) {
        handleRate(rateBtn.getAttribute("data-rate"));
        return;
      }
      if (e.target.closest("[data-skip]")) {
        handleSkip();
        return;
      }
      const qa = e.target.closest("[data-quiz-ans]");
      if (qa) {
        answerQuiz(Number(qa.getAttribute("data-quiz-ans")));
        return;
      }
      if (e.target.closest("[data-reset]")) {
        if (window.confirm("Сбросить ваш профиль (оценки и психотип)?")) {
          Taste.reset();
          router();
        }
        return;
      }
      if (e.target.closest("[data-logout]")) {
        Sync.logout();
        renderAuth();
        router();
        return;
      }
      const sh = e.target.closest("[data-share]");
      if (sh) {
        const title = sh.getAttribute("data-share");
        const url = location.href.split("#")[0];
        const name = CFG.siteName || "Kinoflex";
        const text = `Смотри «${title}» на ${name}`;
        if (navigator.share) {
          navigator.share({ title: name, text: text, url: url }).catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text + " " + url).then(() => { sh.textContent = "✓ Скопировано"; }).catch(() => {});
        }
        return;
      }
      if (e.target.closest("[data-refeat]")) {
        renderFeaturedInto(document.getElementById("feat-hero"));
        return;
      }
      const cardRate = e.target.closest("[data-card-rate]");
      if (cardRate) {
        const id = cardRate.getAttribute("data-rid");
        const m = UI.movie(id);
        if (m) {
          const liked = cardRate.getAttribute("data-card-rate") === "like";
          Taste.rate(m, liked);
          if (window.Sync) Sync.sendRate(m, liked);
          const cardEl = cardRate.closest(".card");
          const featEl = cardRate.closest(".fhero");
          if (cardEl) {
            // Тиндер-поведение: после оценки заменяем карточку новой рекомендацией
            replaceCardWithReco(cardEl);
          } else if (featEl) {
            // Фильм-герой категории — перекатываем на следующий по вкусу
            renderFeaturedInto(document.getElementById("feat-hero"));
          } else {
            // В модалке фильма карточки нет — просто отмечаем кнопки
            document.querySelectorAll('[data-card-rate][data-rid="' + id + '"]').forEach((btn) => {
              btn.classList.toggle("is-on", (btn.getAttribute("data-card-rate") === "like") === liked);
            });
          }
        }
        return;
      }
      const watchBtn = e.target.closest("[data-watch]");
      if (watchBtn) {
        const id = watchBtn.getAttribute("data-watch");
        const m = UI.movie(id) || (window.Watchlist && Watchlist.all().find((x) => String(x.id) === String(id)));
        if (m && window.Watchlist) {
          Watchlist.toggle(m);
          const on = Watchlist.has(id);
          document.querySelectorAll("[data-watch]").forEach((b) => {
            if (b.getAttribute("data-watch") === String(id)) {
              b.classList.toggle("is-on", on);
              if (b.classList.contains("detail__rbtn--watch")) b.innerHTML = on ? "🔖 В списке" : "＋ Хочу посмотреть";
              else if (b.classList.contains("card__bm")) b.textContent = on ? "🔖" : "＋";
            }
          });
          if ((location.hash || "").indexOf("#/my") === 0) renderMy();
        }
        return;
      }
      const trigger = e.target.closest("[data-movie]");
      if (trigger) {
        openMovie(trigger.getAttribute("data-movie"));
        return;
      }
      const arrow = e.target.closest("[data-scroll]");
      if (arrow) {
        const track = arrow.parentNode.querySelector(".rowsec__track");
        if (track) track.scrollBy({ left: arrow.getAttribute("data-scroll") * track.clientWidth * 0.8, behavior: "smooth" });
        return;
      }
      const more = e.target.closest("#load-more");
      if (more && list && list.fetch) {
        list.page += 1;
        loadListPage();
        return;
      }
      if (e.target.closest("[data-close-modal]")) closeModal();
    });

    document.body.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("card")) {
        e.preventDefault();
        openMovie(e.target.getAttribute("data-movie"));
      }
      if (e.key === "Escape" && modalEl.classList.contains("is-open")) closeModal();
    });
  }

  async function start() {
    initChrome();
    await Api.init();
    if (window.Sync && Sync.enabled() && Sync.isLoggedIn()) {
      try { await Sync.pull(); } catch (e) {}
    }
    renderAuth();
    window.addEventListener("hashchange", router);
    router();
  }

  start();
})();
