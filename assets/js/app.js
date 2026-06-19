// ============================================================================
//  Главный модуль: роутинг (hash), рендер страниц, поиск, фильтры,
//  пагинация и модальное окно фильма.
// ============================================================================
(function () {
  "use strict";

  const CFG = window.CINEMA_CONFIG || {};
  const appEl = document.getElementById("app");
  const modalEl = document.getElementById("modal");
  const modalContentEl = document.getElementById("modal-content");

  // Контекст текущего списка (для кнопки «Загрузить ещё»)
  let list = null; // { fetch(page), page, totalPages, items, title }

  // ---------------------------------------------------------------- helpers
  function setLoading() {
    appEl.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function highlightNav() {
    const hash = location.hash || "#/";
    document.querySelectorAll(".nav__link").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("href") === hash);
    });
  }

  // ------------------------------------------------------- общий рендер списка
  function listMarkup(title, subtitle, filtersHtml) {
    return `
      <div class="page-head">
        <h1>${UI.esc(title)}</h1>
        ${subtitle ? `<p>${UI.esc(subtitle)}</p>` : ""}
      </div>
      ${filtersHtml || ""}
      <div id="list-grid"></div>
      <div class="load-more" id="load-more-wrap"></div>`;
  }

  function renderListGrid(append) {
    const gridEl = document.getElementById("list-grid");
    const moreWrap = document.getElementById("load-more-wrap");
    if (!gridEl) return;
    if (!list.items.length) {
      gridEl.innerHTML = UI.empty("По этому запросу фильмов не нашлось");
      moreWrap.innerHTML = "";
      return;
    }
    gridEl.innerHTML = UI.grid(list.items);
    if (list.page < list.totalPages) {
      moreWrap.innerHTML = `<button class="btn btn--ghost" id="load-more">Загрузить ещё</button>`;
    } else {
      moreWrap.innerHTML = "";
    }
  }

  async function loadListPage() {
    try {
      const data = await list.fetch(list.page);
      list.items = list.items.concat(data.results);
      list.totalPages = data.totalPages || 1;
      renderListGrid();
    } catch (e) {
      console.error(e);
      document.getElementById("list-grid").innerHTML = UI.empty(
        "Не удалось загрузить данные. Проверьте соединение или TMDB-ключ.",
        "⚠️"
      );
    }
  }

  // ------------------------------------------------------------------- РОУТЫ
  async function renderHome() {
    setLoading();
    const free = Api.getFreeMovies();
    const heroPick = free.length ? free[Math.floor(Math.random() * free.length)] : null;

    let html = "";
    html += UI.hero(heroPick);
    html += UI.tgBanner();

    // Продолжить просмотр
    const history = UI.getHistory();
    if (history.length) {
      html += UI.section("Вы недавно смотрели", history.slice(0, 12));
    }

    // Популярное (TMDB или локальный каталог)
    try {
      const popular = await Api.getPopular(1);
      const popTitle = Api.hasTmdb() ? "Популярное сейчас" : "В каталоге";
      html += UI.section(popTitle, popular.results.slice(0, 12), "#/catalog");
    } catch (e) {
      /* пропускаем при ошибке TMDB */
    }

    // Бесплатные фильмы
    html += UI.section("Смотреть бесплатно", free.slice(0, 12), "#/free");

    // Пара жанровых рядов
    for (const gid of [27, 878]) {
      try {
        const g = await Api.getByGenre(gid, 1);
        html += UI.section(Api.genreName(gid), g.results.slice(0, 12), "#/catalog/genre/" + gid);
      } catch (e) {}
    }

    appEl.innerHTML = html;
    document.getElementById("year").textContent = new Date().getFullYear();
    scrollTop();
  }

  function genreFiltersHtml(activeId) {
    const chips = Api.getGenres()
      .map(
        (g) =>
          `<a class="chip ${
            String(g.id) === String(activeId) ? "is-active" : ""
          }" href="#/catalog/genre/${g.id}">${UI.esc(g.name)}</a>`
      )
      .join("");
    const animeChip = `<a class="chip ${
      String(activeId) === "anime" ? "is-active" : ""
    }" href="#/catalog/genre/anime">🎌 Аниме</a>`;
    return `<div class="filters"><a class="chip ${
      !activeId ? "is-active" : ""
    }" href="#/catalog">Все</a>${chips}${animeChip}</div>`;
  }

  function renderCatalog() {
    setLoading();
    const subtitle = Api.hasTmdb()
      ? "Огромная база фильмов от TMDB. Выберите жанр или воспользуйтесь поиском."
      : "Каталог фильмов в общественном достоянии. Подключите TMDB-ключ для расширения базы.";
    appEl.innerHTML = listMarkup("Каталог фильмов", subtitle, genreFiltersHtml(null));
    list = {
      fetch: (p) => Api.getPopular(p),
      page: 1,
      totalPages: 1,
      items: [],
      title: "Каталог",
    };
    loadListPage();
    scrollTop();
  }

  function renderGenre(id) {
    setLoading();
    const name = Api.genreName(id) || "Жанр";
    appEl.innerHTML = listMarkup("Жанр: " + name, null, genreFiltersHtml(id));
    list = {
      fetch: (p) => Api.getByGenre(id, p),
      page: 1,
      totalPages: 1,
      items: [],
      title: name,
    };
    loadListPage();
    scrollTop();
  }

  function renderFree() {
    setLoading();
    const free = Api.getFreeMovies();
    appEl.innerHTML =
      listMarkup(
        "Смотреть бесплатно",
        "Фильмы в общественном достоянии — их можно смотреть прямо на сайте, легально.",
        ""
      );
    list = { fetch: null, page: 1, totalPages: 1, items: free };
    renderListGrid();
    scrollTop();
  }

  function renderSearch(query) {
    setLoading();
    appEl.innerHTML = listMarkup('Поиск: «' + query + '»', null, "");
    list = {
      fetch: (p) => Api.search(query, p),
      page: 1,
      totalPages: 1,
      items: [],
      title: "Поиск",
    };
    loadListPage();
    scrollTop();
  }

  // ------------------------------------------------------- модальное окно фильма
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

  // ------------------------------------------------------------------- РОУТЕР
  function router() {
    highlightNav();
    const hash = location.hash || "#/";
    const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);
    // parts: [] | ["catalog"] | ["catalog","genre","27"] | ["free"] | ["search","query"]
    if (parts.length === 0) return renderHome();
    if (parts[0] === "catalog" && parts[1] === "genre") return renderGenre(parts[2]);
    if (parts[0] === "catalog") return renderCatalog();
    if (parts[0] === "free") return renderFree();
    if (parts[0] === "search") return renderSearch(decodeURIComponent(parts.slice(1).join("/")));
    return renderHome();
  }

  // ----------------------------------------------------------- инициализация UI
  function initChrome() {
    // Имя сайта
    if (CFG.siteName) {
      document.title = CFG.siteName + " — бесплатный онлайн кинотеатр";
      document.querySelectorAll("[data-site-name]").forEach((el) => {
        el.textContent = CFG.siteName;
      });
    }
    // Ссылка на бота в подвале
    const tgFooter = document.getElementById("footer-tg");
    if (tgFooter && CFG.telegramBotUrl) tgFooter.href = CFG.telegramBotUrl;

    // Поиск
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

    // Бургер-меню (мобильный)
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

    // Делегирование кликов по карточкам/кнопкам с data-movie
    document.body.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-movie]");
      if (trigger) {
        openMovie(trigger.getAttribute("data-movie"));
        return;
      }
      const more = e.target.closest("#load-more");
      if (more && list && list.fetch) {
        list.page += 1;
        loadListPage();
        return;
      }
      if (e.target.closest("[data-close-modal]")) {
        closeModal();
      }
    });

    // Открытие карточки клавиатурой
    document.body.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("card")) {
        e.preventDefault();
        openMovie(e.target.getAttribute("data-movie"));
      }
      if (e.key === "Escape" && modalEl.classList.contains("is-open")) closeModal();
    });
  }

  // ----------------------------------------------------------------- старт
  async function start() {
    initChrome();
    await Api.init();
    window.addEventListener("hashchange", router);
    router();
  }

  start();
})();
