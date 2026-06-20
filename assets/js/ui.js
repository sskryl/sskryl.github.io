// ============================================================================
//  UI-слой: карточки, ряды-карусели, hero-слайдер, страница фильма, скелетоны,
//  история просмотров (localStorage).
// ============================================================================
(function () {
  "use strict";

  const HISTORY_KEY = "cinema:history";
  const HISTORY_LIMIT = 20;

  // Реестр отрисованных фильмов — чтобы по id с карточки достать объект
  // (нужно для оценки ❤️/👎 прямо на карточке).
  const reg = new Map();
  function register(m) { if (m && m.id != null) reg.set(String(m.id), m); }

  function ratedState(id) {
    if (!window.Taste) return 0;
    return window.Taste.getRatings()[id] || 0;
  }
  function quickRate(movie) {
    const st = ratedState(movie.id);
    return `
      <div class="card__quick">
        <button class="card__qbtn card__qbtn--no ${st === -1 ? "is-on" : ""}" data-card-rate="dislike" data-rid="${esc(movie.id)}" aria-label="Не нравится">👎</button>
        <button class="card__qbtn card__qbtn--yes ${st === 1 ? "is-on" : ""}" data-card-rate="like" data-rid="${esc(movie.id)}" aria-label="Нравится">❤</button>
      </div>`;
  }

  function inList(id) {
    return !!(window.Watchlist && window.Watchlist.has(id));
  }
  function bookmarkBtn(movie) {
    const on = inList(movie.id);
    return `<button class="card__bm ${on ? "is-on" : ""}" data-watch="${esc(movie.id)}" aria-label="Хочу посмотреть" title="Хочу посмотреть">${on ? "🔖" : "＋"}</button>`;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function poster(movie) {
    if (movie.poster) {
      return `<img src="${esc(movie.poster)}" alt="${esc(movie.title)}" loading="lazy"
        onerror="this.parentNode.classList.add('card__poster--empty');this.parentNode.textContent=this.alt;" />`;
    }
    return "";
  }

  // ----- Карточка ------------------------------------------------------------
  function card(movie) {
    register(movie);
    const genres = Api.genreNames(movie.genres, 2).join(" • ");
    const hasPoster = !!movie.poster;
    const ratingBadge = movie.rating ? `<span class="card__rating">★ ${esc(movie.rating)}</span>` : "";
    const freeBadge = movie.free ? `<span class="card__free">free</span>` : "";
    const rated = ratedState(movie.id) ? "card--rated" : "";
    return `
      <article class="card ${rated}" data-movie="${esc(movie.id)}" tabindex="0" role="button" aria-label="${esc(movie.title)}">
        <div class="card__poster ${hasPoster ? "" : "card__poster--empty"}">
          ${hasPoster ? poster(movie) : esc(movie.title)}
          ${ratingBadge}${freeBadge}
          ${bookmarkBtn(movie)}
          <div class="card__overlay">
            <span class="card__play">▶</span>
            <span class="card__genres">${esc(genres)}</span>
          </div>
          ${quickRate(movie)}
        </div>
        <div class="card__body">
          <h3 class="card__title">${esc(movie.title)}</h3>
          <p class="card__meta">${esc(movie.year || "")}${genres ? " · " + esc(genres) : ""}</p>
        </div>
      </article>`;
  }

  function grid(movies) {
    if (!movies || !movies.length) return empty("Ничего не найдено");
    return `<div class="grid">${movies.map(card).join("")}</div>`;
  }

  // ----- Ряд-карусель --------------------------------------------------------
  function row(title, movies, link, icon) {
    if (!movies || !movies.length) return "";
    return `
      <section class="rowsec">
        <div class="rowsec__head">
          <h2 class="rowsec__title">${icon ? esc(icon) + " " : ""}${esc(title)}</h2>
          ${link ? `<a class="rowsec__link" href="${esc(link)}">Все →</a>` : ""}
        </div>
        <div class="rowsec__wrap">
          <button class="rowsec__arrow rowsec__arrow--left" aria-label="Назад" data-scroll="-1">‹</button>
          <div class="rowsec__track">${movies.map(card).join("")}</div>
          <button class="rowsec__arrow rowsec__arrow--right" aria-label="Вперёд" data-scroll="1">›</button>
        </div>
      </section>`;
  }

  function section(title, movies, link) {
    if (!movies || !movies.length) return "";
    return `<section class="section">
      <div class="section__head"><h2 class="section__title">${esc(title)}</h2>
      ${link ? `<a class="section__link" href="${esc(link)}">Все →</a>` : ""}</div>
      ${grid(movies)}</section>`;
  }

  // ----- Hero-слайдер --------------------------------------------------------
  function heroSlider(movies) {
    if (!movies || !movies.length) return "";
    const slides = movies
      .map((m, i) => {
        const bg = m.backdrop || m.poster || "";
        const genres = Api.genreNames(m.genres, 3).join(" • ");
        return `
        <div class="hero__slide ${i === 0 ? "is-active" : ""}" data-slide="${i}" style="background-image:url('${esc(bg)}')">
          <div class="hero__body">
            <span class="hero__badge">${m.free ? "Смотреть бесплатно" : "В тренде"}</span>
            <h1 class="hero__title">${esc(m.title)}</h1>
            <div class="hero__meta">
              ${m.year ? `<span>${esc(m.year)}</span>` : ""}
              ${m.rating ? `<span>★ ${esc(m.rating)}</span>` : ""}
              ${genres ? `<span>${esc(genres)}</span>` : ""}
            </div>
            <p class="hero__overview">${esc(m.overview)}</p>
            <div class="hero__actions"><button class="btn btn--lg" data-movie="${esc(m.id)}">▶ Смотреть</button></div>
          </div>
        </div>`;
      })
      .join("");
    const dots = movies
      .map((_, i) => `<button class="hero__dot ${i === 0 ? "is-active" : ""}" data-dot="${i}" aria-label="Слайд ${i + 1}"></button>`)
      .join("");
    return `<section class="hero" id="hero">${slides}<div class="hero__dots">${dots}</div></section>`;
  }

  function onboarding() {
    return `
      <section class="onb">
        <div class="onb__main">
          <h2 class="onb__title">Не знаешь, что посмотреть?</h2>
          <p class="onb__sub">Подберём фильм под твоё настроение за 10 секунд. Бесплатно и без регистрации.</p>
          <div class="onb__cta">
            <a class="btn btn--lg" href="#/taste">🎛 Подобрать за 10 секунд</a>
            <a class="btn btn--ghost btn--lg" href="#/swipe">🎬 Листать фильмы</a>
          </div>
        </div>
        <div class="onb__steps">
          <div class="onb__step"><span class="onb__num">1</span><b>Настрой вкус</b><span>ползунки или свайпы</span></div>
          <div class="onb__step"><span class="onb__num">2</span><b>Оценивай</b><span>❤️ / 👎 на лету</span></div>
          <div class="onb__step"><span class="onb__num">3</span><b>Смотри</b><span>личная подборка</span></div>
        </div>
      </section>`;
  }

  // Продуктовый hero, объединённый с разделом «Новинки»
  function hero2(novinki) {
    const moods = [
      { e: "😂", t: "Посмеяться", h: "#/catalog/genre/35" },
      { e: "😱", t: "Испугаться", h: "#/catalog/genre/27" },
      { e: "❤️", t: "Влюбиться", h: "#/catalog/genre/10749" },
      { e: "🕵️", t: "Подумать", h: "#/catalog/genre/9648" },
      { e: "🚀", t: "В другой мир", h: "#/catalog/genre/878" },
    ]
      .map((m) => `<a class="mood" href="${m.h}">${m.e} ${esc(m.t)}</a>`)
      .join("");
    const items = (novinki || []).filter((m) => m.poster).slice(0, 12);
    const strip = items.map(card).join("");
    return `
      <section class="hero2">
        <div class="hero2__inner">
          <div class="hero2__text">
            <span class="hero2__badge">🍷 персональный подбор кино</span>
            <h1 class="hero2__title">Твой личный <span class="hero2__accent">кино-сомелье</span></h1>
            <p class="hero2__sub">Подберём фильм точно под твой вкус: ИИ учится на твоих оценках и предлагает именно то, что зайдёт. Без бесконечного скролла.</p>
            <div class="hero2__moods">${moods}</div>
            <div class="hero2__cta">
              <a class="btn btn--lg" href="#/match">🎯 Собрать кинопрофиль</a>
              <a class="btn btn--ghost btn--lg" href="#/swipe">🎬 Листать фильмы</a>
            </div>
            <div class="hero2__trust"><span>🧠 учится на твоём вкусе</span><span>🆓 бесплатно</span><span>⚡ без регистрации</span></div>
          </div>
          <div class="hero2__new">
            <div class="hero2__new-head"><span>🆕 Новинки</span><a href="#/catalog?sort=release_date.desc">Все →</a></div>
            <div class="hero2__new-strip">${strip}</div>
          </div>
        </div>
      </section>`;
  }

  // Персональный фильм-герой категории (высокий шанс понравиться)
  function featuredHero(movie, ctx) {
    register(movie);
    const bg = movie.backdrop || movie.poster || "";
    const genres = Api.genreNames(movie.genres, 3).join(" • ");
    const on = inList(movie.id);
    return `
      <section class="fhero" style="background-image:url('${esc(bg)}')">
        <div class="fhero__scrim"></div>
        <div class="container fhero__in">
          <span class="fhero__badge">✨ Высокий шанс понравиться${ctx ? " · " + esc(ctx) : ""}</span>
          <h1 class="fhero__title">${esc(movie.title)}</h1>
          <div class="fhero__meta">
            ${movie.year ? `<span>${esc(movie.year)}</span>` : ""}
            ${movie.rating ? `<span>★ ${esc(movie.rating)}</span>` : ""}
            ${genres ? `<span>${esc(genres)}</span>` : ""}
          </div>
          <p class="fhero__overview">${esc(movie.overview || "")}</p>
          <div class="fhero__actions">
            <button class="btn btn--lg" data-movie="${esc(movie.id)}">▶ Смотреть</button>
            <button class="fhero__icon" data-card-rate="like" data-rid="${esc(movie.id)}" title="Нравится">❤️</button>
            <button class="fhero__icon" data-card-rate="dislike" data-rid="${esc(movie.id)}" title="Не то">👎</button>
            <button class="fhero__icon ${on ? "is-on" : ""}" data-watch="${esc(movie.id)}" title="В список">${on ? "🔖" : "＋"}</button>
            <button class="fhero__icon" data-refeat title="Показать другой">🔄</button>
          </div>
        </div>
      </section>`;
  }

  function tgBanner() {
    const url = (window.CINEMA_CONFIG && window.CINEMA_CONFIG.telegramBotUrl) || "#";
    return `
      <div class="tg-banner">
        <div class="tg-banner__emoji">🧠🎬</div>
        <div class="tg-banner__text">
          <h3>Не знаете, что посмотреть?</h3>
          <p>Наш Telegram-бот подберёт фильмы под ваше настроение — психотест + «Тиндер» с памятью вкуса.</p>
        </div>
        <a class="btn btn--tg" href="${esc(url)}" target="_blank" rel="noopener">🤖 Открыть бота</a>
      </div>`;
  }

  // Тематические подборки — первоклассные сущности (свои страницы #/collection/:key)
  const COLLECTIONS = [
    { key: "scifi", emoji: "🚀", title: "Космос и будущее", subtitle: "Фантастика, космос и иные миры", q: { genre: 878 } },
    { key: "horror", emoji: "😱", title: "Хоррор-ночь", subtitle: "Ужасы, чтобы пощекотать нервы", q: { genre: 27 } },
    { key: "love", emoji: "❤️", title: "Про любовь", subtitle: "Мелодрамы и романтика", q: { genre: 10749 } },
    { key: "mystery", emoji: "🕵️", title: "Загадки и детективы", subtitle: "Триллеры и расследования", q: { genre: 9648 } },
    { key: "family", emoji: "👨‍👩‍👧", title: "Семейный вечер", subtitle: "Для просмотра всей семьёй", q: { genre: 10751 } },
    { key: "comedy", emoji: "😂", title: "Чтобы посмеяться", subtitle: "Комедии на вечер", q: { genre: 35 } },
    { key: "anime", emoji: "🎌", title: "Аниме", subtitle: "Японская анимация", q: { genre: "anime" } },
    { key: "toons", emoji: "🧸", title: "Мультфильмы", subtitle: "Анимация для всех возрастов", q: { genre: 16 } },
  ];
  function collectionList() { return COLLECTIONS; }
  function collection(key) { return COLLECTIONS.find(function (c) { return c.key === key; }); }

  function collectionCards(prefGenres) {
    let list = COLLECTIONS.slice();
    if (prefGenres && prefGenres.length) {
      const pref = prefGenres.map(String);
      const liked = (c) => pref.indexOf(String(c.q.genre)) >= 0;
      list = list.filter(liked).concat(list.filter((c) => !liked(c)));
    }
    return `<div class="collections">${list.map(
      (c) => `<a class="coll coll--${c.key}" href="#/collection/${c.key}"><span class="coll__e">${c.emoji}</span><span class="coll__b"><span class="coll__t">${esc(c.title)}</span><span class="coll__s">${esc(c.subtitle || "")}</span></span></a>`
    ).join("")}</div>`;
  }

  // «Подбор как стержень» — лента сценариев подбора
  function pickerBand() {
    const items = [
      { h: "#/match", e: "🎯", t: "Точный подбор", d: "свайпы + дуэли → кинопрофиль" },
      { h: "#/taste", e: "🎛", t: "По настроению", d: "нужный фильм за 10 секунд" },
      { h: "#/swipe", e: "🎬", t: "Тиндер", d: "листай и оценивай постеры" },
    ];
    return `<section class="pickers">${items.map(
      (i) => `<a class="picker" href="${i.h}"><span class="picker__e">${i.e}</span><span class="picker__b"><span class="picker__t">${esc(i.t)}</span><span class="picker__d">${esc(i.d)}</span></span><span class="picker__go">→</span></a>`
    ).join("")}</section>`;
  }

  // Компактный список для сайдбара (как «Сейчас смотрят» на hdrezka)
  function sidebarList(title, movies, icon) {
    if (!movies || !movies.length) return "";
    const items = movies
      .map((m, i) => `
        <a class="sbitem" data-movie="${esc(m.id)}">
          <span class="sbitem__n">${i + 1}</span>
          <div class="sbitem__p">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</div>
          <div class="sbitem__b">
            <span class="sbitem__t">${esc(m.title)}</span>
            <span class="sbitem__m">${esc(m.year || "")}${m.rating ? ` · ★ ${esc(m.rating)}` : ""}</span>
          </div>
        </a>`)
      .join("");
    return `<div class="sbblock"><h3 class="sbblock__h">${icon ? esc(icon) + " " : ""}${esc(title)}</h3>${items}</div>`;
  }

  function empty(message, emoji) {
    return `<div class="empty"><div class="empty__emoji">${emoji || "🍿"}</div><p>${esc(message)}</p></div>`;
  }

  // ----- Скелетоны -----------------------------------------------------------
  function skeletonCards(n) {
    return Array.from({ length: n })
      .map(() => `<div class="skel-card"><div class="skel skel-card__poster"></div><div class="skel skel-card__line"></div></div>`)
      .join("");
  }
  function skeletonRow(title) {
    return `<section class="rowsec"><div class="rowsec__head"><h2 class="rowsec__title">${esc(title)}</h2></div>
      <div class="rowsec__wrap"><div class="rowsec__track">${skeletonCards(8)}</div></div></section>`;
  }
  function skeletonHome() {
    return `<div class="skel skel-hero"></div>${skeletonRow("Загрузка…")}${skeletonRow("Загрузка…")}`;
  }
  function skeletonGrid() {
    return `<div class="grid">${skeletonCards(12)}</div>`;
  }

  // ----- Плеер ---------------------------------------------------------------
  function player(movie) {
    if (movie.archiveId) {
      return `<div class="player"><iframe src="${esc(Api.archiveEmbed(movie.archiveId))}" allowfullscreen allow="encrypted-media" referrerpolicy="no-referrer"></iframe></div>`;
    }
    if (movie.trailerYt) {
      return `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${esc(movie.trailerYt)}" allowfullscreen allow="encrypted-media; picture-in-picture"></iframe></div>`;
    }
    return `<div class="player"><div class="player__placeholder"><div style="font-size:46px">🎬</div>
      <p>Этот фильм защищён авторским правом — мы не размещаем его у себя. Здесь только метаданные;
      смотреть можно на легальных стримингах.</p></div></div>`;
  }

  // ----- Актёры --------------------------------------------------------------
  function castRow(cast) {
    if (!cast || !cast.length) return "";
    const items = cast
      .map((c) => `
        <div class="cast__item">
          <div class="cast__photo">${c.photo ? `<img src="${esc(c.photo)}" alt="${esc(c.name)}" loading="lazy">` : "🎭"}</div>
          <div class="cast__name">${esc(c.name)}</div>
          <div class="cast__role">${esc(c.character || "")}</div>
        </div>`)
      .join("");
    return `<div class="detail"><h3 class="detail__subh">В ролях</h3><div class="cast">${items}</div></div>`;
  }

  // ----- Страница фильма -----------------------------------------------------
  function detail(movie, similar) {
    register(movie);
    const st = ratedState(movie.id);
    const genres = Api.genreNames(movie.genres, 6).map((g) => `<span class="badge">${esc(g)}</span>`).join("");
    const facts = [];
    if (movie.year) facts.push(`<li><b>Год:</b> ${esc(movie.year)}</li>`);
    if (movie.country) facts.push(`<li><b>Страна:</b> ${esc(movie.country)}</li>`);
    if (movie.director) facts.push(`<li><b>Режиссёр:</b> ${esc(movie.director)}</li>`);
    if (movie.runtime) facts.push(`<li><b>Длительность:</b> ${esc(movie.runtime)} мин</li>`);
    if (movie.originalTitle) facts.push(`<li><b>Оригинал:</b> ${esc(movie.originalTitle)}</li>`);

    const banner = movie.backdrop
      ? `<div class="detail__banner" style="background-image:url('${esc(movie.backdrop)}')"></div>`
      : "";
    const similarBlock = similar && similar.length
      ? `<div class="detail">${row("Похожие фильмы", similar)}</div>` : "";

    return `
      ${player(movie)}
      ${banner}
      <div class="detail">
        <div class="detail__head">
          <div class="detail__poster">${movie.poster ? poster(movie) : `<div class="card__poster--empty" style="aspect-ratio:2/3;display:flex;align-items:center;justify-content:center">${esc(movie.title)}</div>`}</div>
          <div class="detail__info">
            <h2 class="detail__title">${esc(movie.title)}</h2>
            <div class="detail__orig">${esc(movie.originalTitle || "")}</div>
            <div class="detail__badges">
              ${movie.rating ? `<span class="badge badge--rating">★ ${esc(movie.rating)}</span>` : ""}
              ${movie.free ? `<span class="badge badge--free">✓ Бесплатно</span>` : ""}
              ${genres}
            </div>
            <div class="detail__rate">
              <button class="detail__rbtn detail__rbtn--yes ${st === 1 ? "is-on" : ""}" data-card-rate="like" data-rid="${esc(movie.id)}">❤️ Нравится</button>
              <button class="detail__rbtn detail__rbtn--no ${st === -1 ? "is-on" : ""}" data-card-rate="dislike" data-rid="${esc(movie.id)}">👎 Не нравится</button>
              <button class="detail__rbtn detail__rbtn--watch ${inList(movie.id) ? "is-on" : ""}" data-watch="${esc(movie.id)}">${inList(movie.id) ? "🔖 В списке" : "＋ Хочу посмотреть"}</button>
              <button class="detail__rbtn" data-share="${esc(movie.title)}">🔗 Поделиться</button>
            </div>
            <p class="detail__overview">${esc(movie.overview || "Описание недоступно.")}</p>
            <ul class="detail__facts">${facts.join("")}</ul>
          </div>
        </div>
      </div>
      ${castRow(movie.cast)}
      ${window.Ads ? `<div class="detail">${Ads.slot("detail")}</div>` : ""}
      ${similarBlock}`;
  }

  // ----- История -------------------------------------------------------------
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function addToHistory(movie) {
    let hist = getHistory().filter((m) => m.id !== movie.id);
    hist.unshift({
      id: movie.id, title: movie.title, year: movie.year, rating: movie.rating,
      genres: movie.genres, poster: movie.poster, free: movie.free,
    });
    hist = hist.slice(0, HISTORY_LIMIT);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(hist)); } catch (e) {}
  }

  window.UI = {
    card, grid, row, section, heroSlider, hero2, featuredHero, tgBanner, onboarding, empty,
    collectionCards, collectionList, collection, pickerBand, sidebarList,
    skeletonHome, skeletonGrid, skeletonRow,
    detail, getHistory, addToHistory, esc,
    movie: (id) => reg.get(String(id)),
  };
})();
