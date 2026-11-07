/* Marketing interactions only. No customer data, API writes or payment calls. */
(() => {
  const menu = document.getElementById("mobile-menu"),
    toggle = document.getElementById("menu-toggle");
  const closeMenu = () => menu.close();
  toggle.addEventListener("click", () => {
    menu.showModal();
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  });
  menu.querySelector(".menu-close").addEventListener("click", closeMenu);
  menu
    .querySelectorAll("a")
    .forEach((a) => a.addEventListener("click", closeMenu));
  menu.addEventListener("close", () => {
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    toggle.focus();
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => {
    if (e.matches && menu.open) closeMenu();
  });
  document.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-view]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      document.querySelectorAll(".preview-panel").forEach((panel) => {
        panel.hidden = panel.id !== "panel-" + button.dataset.view;
      });
      document.getElementById("preview-label").textContent = {
        agenda: "Jouw agenda",
        klanten: "Jouw klanten",
        kassa: "Jouw kassa",
      }[button.dataset.view];
    }),
  );
  const amounts = {
    monthly: { starter: 19, pro: 39, business: 69 },
    yearly: { starter: 190, pro: 390, business: 690 },
  };
  document.querySelectorAll("[data-period]").forEach((button) =>
    button.addEventListener("click", () => {
      const period = button.dataset.period;
      document
        .querySelectorAll("[data-period]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      document
        .querySelectorAll("[data-price]")
        .forEach((el) => (el.textContent = amounts[period][el.dataset.price]));
      document
        .querySelectorAll("[data-price-unit]")
        .forEach(
          (el) =>
            (el.textContent = period === "monthly" ? "/ maand" : "/ jaar"),
        );
    }),
  );
  const params = new URLSearchParams(location.search),
    keys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ];
  document
    .querySelectorAll('a[href^="/login/"],a[href^="/demo/"]')
    .forEach((a) => {
      const url = new URL(a.href, location.origin);
      keys.forEach((key) => {
        if (params.has(key)) url.searchParams.set(key, params.get(key));
      });
      a.href = url.pathname + url.search + url.hash;
    });
  // Preserve incoming links from existing secondary pages after the redesign.
  function oldAnchor() {
    const hash = location.hash;
    const target =
      hash === "#features" || hash === "#zowerkthet"
        ? "flow"
        : hash.startsWith("#voor-wie-")
          ? "voor-wie"
          : null;
    if (target)
      document.getElementById(target).scrollIntoView({ behavior: "instant" });
  }
  oldAnchor();
  window.addEventListener("hashchange", oldAnchor);
})();
