/* A local product illustration: never creates bookings or payments. */
(() => {
  const root = document.querySelector(".booking-journey");
  if (!root) return;
  let time = "11:00";
  let stage = 0;
  const action = root.querySelector("[data-journey-action]");
  const status = root.querySelector("[data-journey-status]");
  const titles = [
    "Jouw klant kiest.",
    "Jouw agenda weet het.",
    "Alles rond. Hoofd vrij.",
  ];
  const descriptions = [
    "Kies een tijd en probeer een voorbeeldboeking.",
    "Lisa staat bij Julia in de agenda. De gekozen tijd reist met de afspraak mee.",
    "Knippen & styling · € 72,00. Dit is een gesimuleerde betaling.",
  ];
  function render() {
    root.dataset.stage = stage;
    root.querySelector("[data-journey-title]").textContent = titles[stage];
    status.textContent = descriptions[stage];
    root
      .querySelectorAll("[data-chosen-time]")
      .forEach((el) => (el.textContent = time));
    root
      .querySelectorAll("[data-journey-step]")
      .forEach((el, i) =>
        el.setAttribute("aria-current", i === stage ? "step" : "false"),
      );
    root
      .querySelectorAll("[data-journey-panel]")
      .forEach((el, i) => (el.hidden = i !== stage));
    action.textContent = [
      "Boek deze voorbeeldplek →",
      "Rond het voorbeeld af →",
      "Probeer een andere tijd ↺",
    ][stage];
  }
  root.querySelectorAll("[data-time]").forEach((button) =>
    button.addEventListener("click", () => {
      time = button.dataset.time;
      root
        .querySelectorAll("[data-time]")
        .forEach((el) =>
          el.setAttribute("aria-pressed", String(el === button)),
        );
      render();
    }),
  );
  action.addEventListener("click", () => {
    stage = (stage + 1) % 3;
    render();
  });
  render();
})();
