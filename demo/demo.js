/* A connected walkthrough of supported workflows, deliberately isolated from production. */
(() => {
  const model = window.KronrDemo,
    screen = document.getElementById("screen"),
    guide = document.getElementById("guide"),
    status = document.getElementById("demo-status");
  const money = (n) =>
    new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(n / 100);
  let state = model.initial(),
    tab = "boeken";
  const descriptions = {
    boeken: [
      "01 / ONLINE BOEKEN",
      "Van wens naar afspraak.",
      "Kies een voorbeeldtijd voor Lisa. Na bevestiging staat dezelfde afspraak in de agenda.",
    ],
    agenda: [
      "02 / AGENDA",
      "Een wijziging? Meteen overzicht.",
      "Verplaats Lisa naar een andere voorbeeldtijd. Haar klantprofiel en bon blijven aan dezelfde afspraak gekoppeld.",
    ],
    klanten: [
      "03 / KLANTEN",
      "De voorkeur achter de afspraak.",
      "Bekijk de fictieve behandelnotitie en ga met dezelfde klant door naar de kassa.",
    ],
    kassa: [
      "04 / KASSA",
      "Een bon die je kunt volgen.",
      "Voeg een product toe en controleer het totaal. De voorbeeldbetaling verandert alleen de cijfers in deze demo.",
    ],
    rapportages: [
      "05 / RAPPORTAGES",
      "Gepland is nog niet betaald.",
      "Een afspraak telt pas mee als ontvangen bedrag nadat je de voorbeeldbetaling hebt afgerond.",
    ],
  };
  const button = (label, action, cls = "primary") =>
    `<button class="${cls}" data-action="${action}">${label}</button>`;
  const next = (label, target) =>
    `<button class="primary" data-next="${target}">${label} →</button>`;
  const empty = () =>
    `<div class="panel empty"><span class="large-icon">↗</span><h2>Begin bij Lisa’s boeking.</h2><p>Maak eerst de voorbeeldafspraak. Daarna kun je dezelfde gegevens door de hele demo volgen.</p>${next("Kies een tijd", "boeken")}</div>`;
  function times(action = "time") {
    return `<div class="times" role="group" aria-label="Beschikbare voorbeeldtijden">${model.slots.map((t) => `<button data-action="${action}" data-value="${t}" aria-pressed="${state.time === t}" ${state.paid ? "disabled" : ""}>${t}</button>`).join("")}</div>`;
  }
  function booking() {
    return `<div class="booking-layout"><div class="panel booking-card"><span class="eyebrow">STUDIO NOVA / WOENSDAG</span><h2>Een moment<br>voor Lisa.</h2><div class="line"><div><strong>Knippen & styling</strong><small>Julia · 60 minuten</small></div><strong>${money(7200)}</strong></div><p class="label">Kies een voorbeeldtijd</p>${times()}<div class="demo-person"><span class="avatar">LV</span><div><strong>Lisa de Vries</strong><small>Fictieve klant · geen contactgegevens nodig</small></div></div>${state.booked ? `<p class="success">✓ ${state.paid ? "Afgerond" : "Geboekt"} in de demo · ${state.time}</p>${next("Bekijk de agenda", "agenda")}` : button("Bevestig voorbeeldboeking →", "book")}<p class="fineprint">Er wordt geen echte afspraak gemaakt of bevestiging verstuurd.</p></div><aside class="explanation"><span class="eyebrow">WAT JE HIER ZIET</span><h3>De juiste gegevens op één plek.</h3><p>De behandeling bepaalt hier de duur en prijs. De gekozen tijd en medewerker gaan mee naar de agenda.</p><div class="explain-item"><b>01</b><span>Behandeling kiezen</span></div><div class="explain-item"><b>02</b><span>Tijd en medewerker</span></div><div class="explain-item"><b>03</b><span>Afspraak in de agenda</span></div><p class="fineprint">De beschikbare tijden zijn vaste voorbeelden. De echte boekingspagina controleert de beschikbaarheid van de salon.</p></aside></div>`;
  }
  function agenda() {
    if (!state.booked) return empty();
    return `<div class="screen-heading"><div><span class="eyebrow">WOENSDAG · JULIA</span><h2>Je dag, in beeld.</h2></div><span class="pill">${state.paid ? "Afgerond" : "Bevestigd"} · demo</span></div><div class="two-columns"><div class="panel calendar"><div class="panel-head">Dagoverzicht <span>1 voorbeeldafspraak</span></div>${model.slots.map((t) => `<div class="calendar-row"><span>${t}</span><div>${t === state.time ? `<div class="appointment"><strong>Lisa de Vries</strong><span>Knippen & styling · 60 min</span><small>Julia · ${state.paid ? "Afgerond" : "Online geboekt"}</small></div>` : '<span class="available">Vrij in dit voorbeeld</span>'}</div></div>`).join("")}</div><div class="panel pad"><h3>Afspraak aanpassen</h3><p>${state.paid ? "Deze voorbeeldafspraak is afgerond. Begin opnieuw om een andere werkdag te proberen." : "Kies een andere tijd. Je ziet de afspraak meteen verplaatsen."}</p>${times()}<div class="summary-line"><span>Duur</span><strong>60 minuten</strong></div><div class="summary-line"><span>Behandeling</span><strong>${money(7200)}</strong></div>${next("Bekijk Lisa’s klantprofiel", "klanten")}</div></div>`;
  }
  function customers() {
    if (!state.booked) return empty();
    return `<div class="two-columns"><div class="panel pad"><div class="profile-head"><span class="avatar large">LV</span><div><span class="eyebrow">FICTIEF KLANTPROFIEL</span><h2>Lisa de Vries</h2></div></div><h3>Behandelnotitie</h3><blockquote>Graag de lengte behouden. Alleen de punten bijwerken en natuurlijk in model brengen.</blockquote><p class="fineprint">Voorbeeldnotitie. Voer in deze publieke demo geen echte klantgegevens in.</p></div><div class="panel pad"><h3>De afspraak van vandaag</h3><div class="summary-line"><span>Tijd</span><strong>${state.time}</strong></div><div class="summary-line"><span>Medewerker</span><strong>Julia</strong></div><div class="summary-line"><span>Behandeling</span><strong>Knippen & styling</strong></div><div class="summary-line"><span>Status</span><strong>${state.paid ? "Afgerond" : "Bevestigd"}</strong></div>${next("Open de bon van Lisa", "kassa")}</div></div>`;
  }
  function checkout() {
    if (!state.booked) return empty();
    return `<div class="screen-heading"><div><span class="eyebrow">LISA DE VRIES · ${state.time}</span><h2>De behandeling. De bon.</h2></div><span class="pill">${state.paid ? "Voorbeeld afgerond" : "Nog niet afgerekend"}</span></div><div class="two-columns"><div class="panel"><div class="panel-head">Bonoverzicht <span>Fictieve bedragen</span></div><div class="receipt-row"><span>Knippen & styling<small>Julia · 60 minuten</small></span><strong>${money(7200)}</strong></div>${state.productQuantity ? `<div class="receipt-row"><span>Verzorgende shampoo<small>${state.productQuantity} × ${money(1850)}</small></span><strong>${money(state.productQuantity * 1850)}</strong></div>` : ""}<div class="receipt-total"><span>Totaal incl. btw</span><strong>${money(model.total(state))}</strong></div><p class="fineprint pad-small">Dienst en product gebruiken hun eigen ingestelde btw-tarief in de backoffice. Deze rondleiding toont het brutototaal.</p></div><div class="panel pad">${state.paid ? `<span class="large-icon success">✓</span><h3>Voorbeeldbetaling geregistreerd.</h3><p>${money(state.receipt.cents)} · ${state.receipt.method}</p><p>Er is niets afgeschreven. Je ziet dit bedrag nu terug in de demorapportage.</p>${next("Bekijk het resultaat", "rapportages")}` : `<h3>Een product mee naar huis?</h3><div class="product-control"><div><strong>Verzorgende shampoo</strong><small>${money(1850)} per stuk</small></div><div class="quantity">${button("−", "minus", "quantity-btn")}<output aria-label="Aantal shampoo">${state.productQuantity}</output>${button("+", "plus", "quantity-btn")}</div></div><p class="label">Registreer betaalwijze (simulatie)</p><div class="times">${["Pin", "Contant"].map((m) => `<button data-action="method" data-value="${m}" aria-pressed="${state.method === m}">${m}</button>`).join("")}</div>${button("Registreer voorbeeldbetaling →", "pay")}<p class="fineprint">Geen pinapparaat, betaalverzoek of Stripe-transactie verbonden.</p>`}</div></div>`;
  }
  function reports() {
    const amount = state.receipt?.cents || 0;
    return `<div class="screen-heading"><div><span class="eyebrow">DEZE VOORBEELDWERKDAG</span><h2>De cijfers sluiten aan.</h2></div></div><div class="metrics"><div class="metric"><span>Afspraken</span><strong>${state.booked ? 1 : 0}</strong><small>${state.paid ? "Afgerond" : "In de demo geboekt"}</small></div><div class="metric"><span>Geregistreerd bedrag</span><strong>${money(amount)}</strong><small>Alleen afgeronde voorbeeldbetalingen</small></div><div class="metric"><span>Aantal betalingen</span><strong>${state.paid ? 1 : 0}</strong><small>Geen echte transacties</small></div></div><div class="panel pad"><h3>Van bedrag naar verklaring.</h3>${state.paid ? `<div class="summary-line"><span>Behandeling</span><strong>${money(7200)}</strong></div><div class="summary-line"><span>Producten · ${state.receipt.quantity} ${state.receipt.quantity === 1 ? "stuk" : "stuks"}</span><strong>${money(state.receipt.quantity * 1850)}</strong></div><div class="summary-line"><span>Geregistreerd via ${state.receipt.method}</span><strong>${money(amount)}</strong></div><p class="success">✓ Het bedrag sluit aan op Lisa’s bon.</p><p>Een boeking is een afspraak. Een geregistreerde betaling is een apart gegeven. Daarom stond hier vóór het afrekenen nog ${money(0)}.</p>` : `<p>Er is nog geen voorbeeldbetaling geregistreerd. ${state.booked ? "Lisa staat in de agenda, maar haar behandeling is nog niet afgerekend." : "Er is ook nog geen voorbeeldafspraak gemaakt."} Daarom is het geregistreerde bedrag ${money(0)}.</p>${next(state.booked ? "Ga naar de kassa" : "Begin met boeken", state.booked ? "kassa" : "boeken")}`}</div>${state.paid ? `<div class="end-note"><strong>Je hebt de hele werkdag gevolgd.</strong><p>Boeken, plannen, klantgegevens, afrekenen en rapporteren. Bespreek welke onderdelen jouw salon nodig heeft.</p><a class="primary" href="/#kennismaken">Vraag een kennismaking aan ↗</a></div>` : ""}`;
  }
  const views = {
    boeken: booking,
    agenda,
    klanten: customers,
    kassa: checkout,
    rapportages: reports,
  };
  function render(focus = false) {
    const d = descriptions[tab];
    guide.innerHTML = `<span class="eyebrow">${d[0]}</span><h2>${d[1]}</h2><p>${d[2]}</p>`;
    screen.innerHTML = views[tab]();
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    if (focus) screen.focus({ preventScroll: true });
  }
  function navigate(name, focus = true) {
    tab = views[name] ? name : "boeken";
    history.replaceState(null, "", "#" + tab);
    render(focus);
    const nav = document.querySelector(".demo-nav"),
      active = nav.querySelector(".active");
    if (nav.scrollWidth > nav.clientWidth)
      nav.scrollLeft =
        active.offsetLeft -
        nav.offsetLeft -
        (nav.clientWidth - active.offsetWidth) / 2;
  }
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.addEventListener("click", () => navigate(b.dataset.tab)));
  screen.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.next) {
      navigate(b.dataset.next);
      return;
    }
    const action = b.dataset.action;
    let message = "";
    if (action === "time") {
      state = model.reduce(state, { type: "time", value: b.dataset.value });
      message = `Voorbeeldtijd ${state.time} geselecteerd.`;
    }
    if (action === "book") {
      state = model.reduce(state, { type: "book" });
      message = `Lisa’s voorbeeldafspraak staat om ${state.time} bij Julia in de demo-agenda.`;
    }
    if (action === "plus" || action === "minus") {
      state = model.reduce(state, {
        type: "quantity",
        delta: action === "plus" ? 1 : -1,
      });
      message = `${state.productQuantity} producten op de bon. Totaal ${money(model.total(state))}.`;
    }
    if (action === "method") {
      state = model.reduce(state, { type: "method", value: b.dataset.value });
      message = `Voorbeeldbetaalwijze: ${state.method}.`;
    }
    if (action === "pay") {
      state = model.reduce(state, { type: "pay" });
      message = `Voorbeeldbetaling geregistreerd: ${money(state.receipt.cents)}. Geen echte betaling.`;
    }
    render();
    const same = screen.querySelector(
      `[data-action="${action}"]${b.dataset.value ? `[data-value="${b.dataset.value}"]` : ""}`,
    );
    if (same) same.focus({ preventScroll: true });
    else screen.focus({ preventScroll: true });
    status.textContent = message;
  });
  document.getElementById("reset-demo").addEventListener("click", () => {
    state = model.initial();
    navigate("boeken");
    status.textContent =
      "Demo opnieuw gestart. Alle voorbeeldkeuzes zijn gewist.";
  });
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
  navigate(location.hash.slice(1), false);
})();
