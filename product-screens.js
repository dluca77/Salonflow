(() => {
  const image = document.getElementById("backoffice-screen"),
    link = document.getElementById("screen-link"),
    caption = document.getElementById("screen-caption");
  const screens = {
    agenda: {
      src: "/images/backoffice/agenda-example.png",
      width: 1440,
      height: 900,
      alt: "Kronr-agenda met fictieve afspraken voor Studio Nova; duidelijk gemarkeerd als voorbeelddata",
      caption: "Agenda · een voorbeeldweek voor Studio Nova.",
    },
    kassa: {
      src: "/images/backoffice/kassa-example.png",
      width: 1440,
      height: 900,
      alt: "Kronr-kassa met fictieve behandeling en shampoo op een voorbeeldbon van 90,50 euro; geen echte betaling",
      caption: "Kassa · behandeling + product = €90,50. Voorbeeld, niet betaald.",
    },
  };
  document.querySelectorAll("[data-screen]").forEach((button) =>
    button.addEventListener("click", () => {
      const screen = screens[button.dataset.screen];
      if (!screen) return;
      image.src = screen.src;
      image.alt = screen.alt;
      image.width = screen.width;
      image.height = screen.height;
      link.href = screen.src;
      link.setAttribute(
        "aria-label",
        "Open het echte " +
          (button.dataset.screen === "agenda"
            ? "agendascherm"
            : "kassascherm") +
          " op volledig formaat",
      );
      caption.textContent = screen.caption;
      document
        .querySelectorAll("[data-screen]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    }),
  );
})();
