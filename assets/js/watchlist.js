// ============================================================================
//  Watchlist — список «Хочу посмотреть» (localStorage).
// ============================================================================
(function () {
  "use strict";
  var KEY = "cinema:watchlist";
  var LIMIT = 300;

  function all() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT))); } catch (e) {}
  }
  function has(id) {
    id = String(id);
    return all().some(function (m) { return String(m.id) === id; });
  }
  function add(movie) {
    if (!movie || movie.id == null) return false;
    var list = all();
    var id = String(movie.id);
    if (list.some(function (m) { return String(m.id) === id; })) return false;
    list.unshift({
      id: movie.id, title: movie.title, year: movie.year, rating: movie.rating,
      genres: movie.genres, poster: movie.poster, free: movie.free,
    });
    save(list);
    return true;
  }
  function remove(id) {
    id = String(id);
    save(all().filter(function (m) { return String(m.id) !== id; }));
  }
  function toggle(movie) {
    if (has(movie.id)) { remove(movie.id); return false; }
    add(movie);
    return true;
  }
  function count() { return all().length; }

  window.Watchlist = { all: all, has: has, add: add, remove: remove, toggle: toggle, count: count };
})();
