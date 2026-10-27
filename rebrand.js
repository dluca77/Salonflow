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
  const scene = document.getElementById("product-scene"),
    play = document.getElementById("scene-play");
  const steps = [...document.querySelectorAll("[data-scene-step]")];
  const titles = [
    "Lisa boekt online",
    "Een plek in jouw agenda",
    "Afspraak netjes afgerond",
  ];
  const subtitles = [
    "Knippen & styling · woensdag 11:00",
    "Woensdag 11:00 · ingepland bij Julia",
    "Voorbeeldbetaling · € 72,00 ontvangen",
  ];
  let step = 0,
    timer = null;
  function setStage(next) {
    step = next;
    scene.dataset.stage = String(next);
    steps.forEach((button, i) =>
      button.setAttribute("aria-pressed", String(i === next)),
    );
    document.getElementById("scene-count").innerHTML =
      `${next === 0 ? "08" : "09"}<span>vandaag</span>`;
    document.getElementById("scene-revenue").innerHTML =
      `€ ${next === 2 ? "712" : "640"}<span>voorbeeld</span>`;
    document.getElementById("scene-toast-title").textContent = titles[next];
    document.getElementById("scene-toast-sub").textContent = subtitles[next];
  }
  function stop() {
    clearInterval(timer);
    timer = null;
    play.textContent = "▶";
    play.setAttribute("aria-label", "Voorbeeld afspelen");
  }
  function start() {
    stop();
    if (step === 2) setStage(0);
    play.textContent = "Ⅱ";
    play.setAttribute("aria-label", "Voorbeeld pauzeren");
    timer = setInterval(() => {
      setStage(step + 1);
      if (step === 2) stop();
    }, 3200);
  }
  steps.forEach((button, i) =>
    button.addEventListener("click", () => {
      stop();
      setStage(i);
    }),
  );
  play.addEventListener("click", () => (timer ? stop() : start()));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let played = false;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) {
          stop();
          continue;
        }
        if (!played && !reduced.matches) {
          played = true;
          start();
        }
      }
    },
    { threshold: 0.6 },
  );
  observer.observe(scene);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) stop();
  });
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
