// ============================================================================
//  Синхронизация с ботом через веб-API (phase 2). Вход по Telegram, единый
//  профиль (оценки + модель вкуса) для сайта и бота. Если apiBaseUrl пуст —
//  всё выключено, сайт работает только на localStorage.
// ============================================================================
(function () {
  "use strict";
  const CFG = window.CINEMA_CONFIG || {};
  const API = (CFG.apiBaseUrl || "").replace(/\/$/, "");
  const SES = "cinema:session";
  const USR = "cinema:user";

  function token() { return localStorage.getItem(SES); }
  function authHeaders() { return { "Content-Type": "application/json", Authorization: "Bearer " + token() }; }

  const Sync = {
    enabled() { return !!API; },
    isLoggedIn() { return !!token(); },
    user() { try { return JSON.parse(localStorage.getItem(USR)); } catch (e) { return null; } },

    async login(tgUser) {
      const r = await fetch(API + "/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tgUser),
      });
      if (!r.ok) throw new Error("auth_failed");
      const d = await r.json();
      localStorage.setItem(SES, d.token);
      localStorage.setItem(USR, JSON.stringify(d.user || {}));
      await this.pushLocal();   // слить локальные оценки сайта в аккаунт
      await this.pull();        // подтянуть единый профиль
    },

    logout() {
      localStorage.removeItem(SES);
      localStorage.removeItem(USR);
    },

    async pushLocal() {
      if (!this.isLoggedIn()) return;
      let ratings = {}, movies = {};
      try { ratings = JSON.parse(localStorage.getItem("cinema:ratings") || "{}"); } catch (e) {}
      try { movies = JSON.parse(localStorage.getItem("cinema:movies") || "{}"); } catch (e) {}
      if (!Object.keys(ratings).length) return;
      try {
        await fetch(API + "/api/profile", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ ratings, movies }),
        });
      } catch (e) {}
    },

    async pull() {
      if (!this.isLoggedIn()) return null;
      let r;
      try {
        r = await fetch(API + "/api/profile", { headers: { Authorization: "Bearer " + token() } });
      } catch (e) { return null; }
      if (r.status === 401) { this.logout(); return null; }
      const d = await r.json();
      localStorage.setItem("cinema:ratings", JSON.stringify(d.ratings || {}));
      localStorage.setItem("cinema:taste", JSON.stringify(d.taste_weights || {}));
      let movies = {};
      try { movies = JSON.parse(localStorage.getItem("cinema:movies") || "{}"); } catch (e) {}
      (d.liked || []).forEach((m) => {
        if (m && m.key) movies[m.key] = { id: m.key, title: m.title, year: m.year, poster: m.poster, genres: m.genres, free: m.free };
      });
      localStorage.setItem("cinema:movies", JSON.stringify(movies));
      return d;
    },

    // Отправить одну оценку на сервер (модель вкуса обновится в аккаунте)
    sendRate(movie, liked) {
      if (!this.isLoggedIn()) return;
      fetch(API + "/api/rate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ movie: movie, value: liked ? 1 : -1 }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && d.taste_weights) localStorage.setItem("cinema:taste", JSON.stringify(d.taste_weights)); })
        .catch(() => {});
    },
  };

  window.Sync = Sync;
})();
