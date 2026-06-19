// ============================================================================
//  Рекламные слоты: Google AdSense ИЛИ свои баннеры ИЛИ заглушка.
//  Управляется блоком `ads` в config.js. Слоты помечаются «Реклама».
// ============================================================================
(function () {
  "use strict";
  const CFG = (window.CINEMA_CONFIG || {}).ads || {};
  let headInjected = false;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  const Ads = {
    enabled() { return !!CFG.enabled; },

    init() {
      if (!this.enabled() || !CFG.adsenseClient || headInjected) return;
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(CFG.adsenseClient);
      document.head.appendChild(s);
      headInjected = true;
    },

    // HTML рекламного слота. placement: "home" | "catalog" | "detail"
    slot(placement) {
      if (!this.enabled()) return "";
      const label = `<span class="adslot__label">${esc(CFG.label || "Реклама")}</span>`;

      if (CFG.adsenseClient) {
        const slotId = (CFG.adsenseSlots || {})[placement] || "";
        return `<div class="adslot adslot--adsense">${label}
          <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(CFG.adsenseClient)}"
            ${slotId ? `data-ad-slot="${esc(slotId)}"` : ""} data-ad-format="auto"
            data-full-width-responsive="true"></ins></div>`;
      }

      const banners = CFG.banners || [];
      if (banners.length) {
        const b = banners[Math.floor(Math.random() * banners.length)];
        return `<div class="adslot adslot--house">${label}
          <a href="${esc(b.link || "#")}" target="_blank" rel="noopener sponsored">
            <img src="${esc(b.image)}" alt="${esc(b.alt || "Реклама")}" loading="lazy"></a></div>`;
      }

      if (CFG.showPlaceholder) {
        return `<div class="adslot adslot--ph">${label}
          <div class="adslot__ph">Здесь может быть ваша реклама<br><small>AdSense или свой баннер — настраивается в config.js</small></div></div>`;
      }
      return "";
    },

    // Активировать вставленные AdSense-блоки
    activate() {
      if (!this.enabled() || !CFG.adsenseClient) return;
      document.querySelectorAll(".adslot--adsense ins.adsbygoogle:not([data-done])").forEach((ins) => {
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          ins.setAttribute("data-done", "1");
        } catch (e) {}
      });
    },
  };

  window.Ads = Ads;
})();
