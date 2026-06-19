// ============================================================================
//  UI-слой: генерация разметки (карточки, сетки, hero, страница фильма, плеер)
//  и работа с историей просмотров через localStorage.
// ============================================================================
(function () {
  "use strict";

  const HISTORY_KEY = "cinema:history";
  const HISTORY_LIMIT = 18;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ----- Постер с graceful-fallback ----------------------------------------
  function poster(movie) {
    if (movie.poster) {
      // При ошибке загрузки показываем название (через alt/textContent —
      // безопасно для названий с кавычками и апострофами).
      return `<img src="${esc(movie.poster)}" alt="${esc(movie.title)}" loading="lazy"
        onerror="this.parentNode.classList.add('card__poster--empty');this.parentNode.textContent=this.alt;" />`;
    }
    return "";
  }

  // ----- Карточка фильма -----------------------------------------------------
  function card(movie) {
    const genres = Api.genreNames(movie.genres, 2).join(" • ");
    const hasPoster = !!movie.poster;
    const ratingBadge = movie.rating
      ? `<span class="card__rating">★ ${esc(movie.rating)}</span>`
      : "";
    const freeBadge = movie.free ? `<span class="card__free">free</span>` : "";
    return `
      <article class="card" data-movie="${esc(movie.id)}" tabindex="0" role="button" aria-label="${esc(
      movie.title
    )}">
        <div class="card__poster ${hasPoster ? "" : "card__poster--empty"}">
          ${hasPoster ? poster(movie) : esc(movie.title)}
          ${ratingBadge}${freeBadge}
          <div class="card__overlay">
            <span class="card__genres">${esc(genres)}</span>
          </div>
          <span class="card__play">▶</span>
        </div>
        <div class="card__body">
          <h3 class="card__title">${esc(movie.title)}</h3>
          <p class="card__meta">${esc(movie.year || "")}${
      genres ? " · " + esc(genres) : ""
    }</p>
        </div>
      </article>`;
  }

  function grid(movies) {
    if (!movies || !movies.length) return empty("Ничего не найдено");
    return `<div class="grid">${movies.map(card).join("")}</div>`;
  }

  function section(title, movies, link) {
    if (!movies || !movies.length) return "";
    const head = `
      <div class="section__head">
        <h2 class="section__title">${esc(title)}</h2>
        ${link ? `<a class="section__link" href="${esc(link)}">Все →</a>` : ""}
      </div>`;
    return `<section class="section">${head}${grid(movies)}</section>`;
  }

  function hero(movie) {
    if (!movie) return "";
    const bg = movie.backdrop || movie.poster || "";
    const genres = Api.genreNames(movie.genres, 3).join(" • ");
    return `
      <section class="hero" style="background-image:url('${esc(bg)}')">
        <div class="hero__body">
          <span class="hero__badge">${movie.free ? "Смотреть бесплатно" : "Рекомендуем"}</span>
          <h1 class="hero__title">${esc(movie.title)}</h1>
          <div class="hero__meta">
            ${movie.year ? `<span>${esc(movie.year)}</span>` : ""}
            ${movie.rating ? `<span>★ ${esc(movie.rating)}</span>` : ""}
            ${genres ? `<span>${esc(genres)}</span>` : ""}
          </div>
          <p class="hero__overview">${esc(movie.overview)}</p>
          <div class="hero__actions">
            <button class="btn btn--lg" data-movie="${esc(movie.id)}">▶ Смотреть</button>
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
          <p>Пройдите психологический тест в нашем Telegram-боте — он подберёт фильмы под ваше настроение и характер.</p>
        </div>
        <a class="btn btn--tg" href="${esc(url)}" target="_blank" rel="noopener">🤖 Пройти психотест</a>
      </div>`;
  }

  function empty(message, emoji) {
    return `<div class="empty"><div class="empty__emoji">${emoji || "🍿"}</div><p>${esc(
      message
    )}</p></div>`;
  }

  // ----- Плеер ---------------------------------------------------------------
  function player(movie) {
    if (movie.archiveId) {
      return `<div class="player"><iframe src="${esc(
        Api.archiveEmbed(movie.archiveId)
      )}" allowfullscreen allow="encrypted-media" referrerpolicy="no-referrer"></iframe></div>`;
    }
    if (movie.trailerYt) {
      return `<div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${esc(
        movie.trailerYt
      )}" allowfullscreen allow="encrypted-media; picture-in-picture"></iframe></div>`;
    }
    return `
      <div class="player">
        <div class="player__placeholder">
          <div style="font-size:46px">🎬</div>
          <p>Этот фильм защищён авторским правом, поэтому мы не размещаем его у себя.
          Здесь доступны метаданные, а смотреть его можно на легальных стриминговых сервисах.</p>
        </div>
      </div>`;
  }

  // ----- Страница (модальное окно) фильма ------------------------------------
  function detail(movie, similar) {
    const genres = Api.genreNames(movie.genres, 6)
      .map((g) => `<span class="badge">${esc(g)}</span>`)
      .join("");
    const facts = [];
    if (movie.year) facts.push(`<li><b>Год:</b> ${esc(movie.year)}</li>`);
    if (movie.country) facts.push(`<li><b>Страна:</b> ${esc(movie.country)}</li>`);
    if (movie.director) facts.push(`<li><b>Режиссёр:</b> ${esc(movie.director)}</li>`);
    if (movie.runtime) facts.push(`<li><b>Длительность:</b> ${esc(movie.runtime)} мин</li>`);
    if (movie.originalTitle)
      facts.push(`<li><b>Оригинал:</b> ${esc(movie.originalTitle)}</li>`);

    const similarBlock =
      similar && similar.length
        ? `<div class="detail" style="padding-top:0">${section("Похожие фильмы", similar)}</div>`
        : "";

    return `
      ${player(movie)}
      <div class="detail">
        <div class="detail__head">
          <div class="detail__poster">${
            movie.poster ? poster(movie) : `<div class="card__poster--empty" style="aspect-ratio:2/3;display:flex;align-items:center;justify-content:center">${esc(
              movie.title
            )}</div>`
          }</div>
          <div class="detail__info">
            <h2 class="detail__title">${esc(movie.title)}</h2>
            <div class="detail__orig">${esc(movie.originalTitle || "")}</div>
            <div class="detail__badges">
              ${movie.rating ? `<span class="badge badge--rating">★ ${esc(movie.rating)}</span>` : ""}
              ${movie.free ? `<span class="badge badge--free">✓ Доступно бесплатно</span>` : ""}
              ${genres}
            </div>
            <p class="detail__overview">${esc(movie.overview || "Описание недоступно.")}</p>
            <ul class="detail__facts">${facts.join("")}</ul>
          </div>
        </div>
      </div>
      ${similarBlock}`;
  }

  // ----- История просмотров (localStorage) -----------------------------------
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
      id: movie.id,
      title: movie.title,
      year: movie.year,
      rating: movie.rating,
      genres: movie.genres,
      poster: movie.poster,
      free: movie.free,
    });
    hist = hist.slice(0, HISTORY_LIMIT);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    } catch (e) {}
  }

  window.UI = {
    card,
    grid,
    section,
    hero,
    tgBanner,
    empty,
    detail,
    getHistory,
    addToHistory,
    esc,
  };
})();
