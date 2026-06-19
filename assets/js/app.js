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

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function highlightNav() {
    const hash = location.hash || "#/";
    document.querySelectorAll(".nav__link").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("href") === hash);
    });
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

    let html = "";
    html += UI.heroSlider((trend.length ? trend : free).slice(0, 5));
    html += '<div class="container">';
    html += UI.tgBanner();

    const history = UI.getHistory();
    if (history.length) html += UI.row("Вы недавно смотрели", history.slice(0, 16), null, "🕑");
    html += UI.row("В тренде на этой неделе", trend.slice(0, 18), "#/catalog", "🔥");
    html += UI.row("Новинки", val(fresh).slice(0, 18), "#/catalog?sort=release_date.desc", "🆕");
    html += UI.row("Смотреть бесплатно", free.slice(0, 18), "#/free", "🆓");
    html += UI.row("Топ рейтинга", val(top).slice(0, 18), "#/catalog?sort=vote_average.desc", "⭐");
    html += "</div>";

    appEl.innerHTML = html;

    // Жанровые ряды догружаем после основной отрисовки
    const container = appEl.querySelector(".container");
    for (const gid of [27, 16, 878]) {
      try {
        const g = await Api.getByGenre(gid, 1);
        if (g.results.length) {
          container.insertAdjacentHTML(
            "beforeend",
            UI.row(Api.genreName(gid), g.results.slice(0, 18), "#/catalog/genre/" + gid)
          );
        }
      } catch (e) {}
    }

    document.getElementById("year").textContent = new Date().getFullYear();
    startHero();
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
      <div id="list-grid">${UI.skeletonGrid()}</div>
      <div class="load-more" id="load-more-wrap"></div></div>`;
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
    appEl.innerHTML = listShell(title, subtitle, genreChips(genre), filterControls());
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

  // ------------------------------------------------------------- РОУТЕР
  function router() {
    highlightNav();
    const hash = location.hash || "#/";
    const path = hash.split("?")[0];
    const query = parseQuery(hash);
    const parts = path.replace(/^#\//, "").split("/").filter(Boolean);
    if (parts.length === 0) return renderHome();
    if (parts[0] === "catalog" && parts[1] === "genre") return renderCatalog(parts[2], query);
    if (parts[0] === "catalog") return renderCatalog(null, query);
    if (parts[0] === "free") return renderFree();
    if (parts[0] === "search") return renderSearch(decodeURIComponent(parts.slice(1).join("/")));
    return renderHome();
  }

  // ------------------------------------------------------------- ИНИЦИАЛИЗАЦИЯ
  function initChrome() {
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

    const burger = document.getElementById("burger");
    const nav = document.getElementById("nav");
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      searchForm.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.classList.contains("nav__link")) {
        nav.classList.remove("is-open");
        searchForm.classList.remove("is-open");
      }
    });

    document.body.addEventListener("click", (e) => {
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
    window.addEventListener("hashchange", router);
    router();
  }

  start();
})();
