// ============================================================================
//  Интеграция с Telegram Mini Apps: запуск сайта как приложения внутри Telegram.
//  Если открыто не в Telegram — ничего не делает.
// ============================================================================
(function () {
  "use strict";
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData && !tg.platform) return;

  try {
    tg.ready();
    tg.expand();
    document.documentElement.classList.add("in-telegram");

    // Тема — под текущую тему Telegram (свет/тьма)
    function applyTgTheme() {
      if (tg.colorScheme) {
        try { localStorage.setItem("cinema:theme", tg.colorScheme); } catch (e) {}
        document.documentElement.setAttribute("data-theme", tg.colorScheme);
      }
      if (tg.setHeaderColor) { try { tg.setHeaderColor("bg_color"); } catch (e) {} }
      if (tg.setBackgroundColor) { try { tg.setBackgroundColor("bg_color"); } catch (e) {} }
    }
    applyTgTheme();
    if (tg.onEvent) tg.onEvent("themeChanged", applyTgTheme);

    // Кнопка «Назад» Telegram — на всех экранах, кроме главной
    var BB = tg.BackButton;
    function syncBackButton() {
      if (!BB) return;
      var h = location.hash || "#/";
      if (h === "#/" || h === "") BB.hide();
      else BB.show();
    }
    if (BB && BB.onClick) {
      BB.onClick(function () {
        if (history.length > 1) history.back();
        else location.hash = "#/";
      });
      window.addEventListener("hashchange", syncBackButton);
      syncBackButton();
    }

    // Прокидываем данные пользователя Telegram дальше (для бесшовного входа)
    window.TG = {
      webApp: tg,
      initData: tg.initData || "",
      user: (tg.initDataUnsafe && tg.initDataUnsafe.user) || null,
    };
  } catch (e) {
    // молча — сайт работает и без Telegram
  }
})();
