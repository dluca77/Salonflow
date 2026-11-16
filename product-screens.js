(() => {
  const image = document.getElementById("backoffice-screen"),
    link = document.getElementById("screen-link"),
    caption = document.getElementById("screen-caption");
  const screens = {
    agenda: {
      src: "/images/backoffice/agenda.png",
      width: 1440,
      height: 740,
      alt: "Echte Kronr-agenda met weekweergave, datumknoppen en medewerkerfilter; zonder afspraken in beeld",
      caption: "Agenda · weekoverzicht met dag-, week- en maandkeuze.",
    },
    kassa: {
      src: "/images/backoffice/kassa.png",
      width: 1228,
      height: 900,
      alt: "Echte Kronr-kassa met diensten, producten, bonoverzicht en betaalwijzen; lege bon zonder klantgegevens",
      caption: "Kassa · diensten, producten en een bon met betaalwijzen.",
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
