// ═══════════════════════════════════════════════════════════
// ONBOARDING.JS — Kai-begroeting, checklist en interactieve rondleiding
// voor nieuwe gebruikers op het dashboard.
//
// Vereist dat kronr.js al geladen is en kronrInit() al is uitgevoerd
// (SALON, SALON_ID, sb moeten bestaan).
// ═══════════════════════════════════════════════════════════

function onboardingStorageKey(naam) { return 'kronr_onboarding_' + naam + '_' + SALON_ID; }

// ── Checklist: status ophalen ──
async function haalOnboardingStatus() {
  const [dienstenRes, klantenRes, afsprakenRes] = await Promise.all([
    sb.from('diensten').select('id', { count: 'exact', head: true }).eq('salon_id', SALON_ID),
    sb.from('klanten').select('id', { count: 'exact', head: true }).eq('salon_id', SALON_ID),
    sb.from('afspraken').select('id', { count: 'exact', head: true }).eq('salon_id', SALON_ID),
  ]);

  return {
    profiel: !!(SALON.logo_url || SALON.adres),
    dienst: (dienstenRes.count || 0) > 0,
    klant: (klantenRes.count || 0) > 0,
    afspraak: (afsprakenRes.count || 0) > 0,
  };
}

const ONBOARDING_STAPPEN = [
  { key: 'profiel', label: 'Vul je salonprofiel aan', sub: 'Logo en adres, zodat klanten je herkennen', href: 'instellingen.html' },
  { key: 'dienst', label: 'Voeg je eerste dienst toe', sub: 'Wat bied je aan, en voor welke prijs?', href: 'diensten.html' },
  { key: 'klant', label: 'Voeg je eerste klant toe', sub: 'Of wacht tot je eerste online boeking binnenkomt', href: 'klanten.html' },
  { key: 'afspraak', label: 'Plan je eerste afspraak in', sub: 'Zelf inplannen, of via je boekingslink laten binnenkomen', href: 'agenda.html' },
];

// ── Checklist: widget renderen ──
async function toonOnboardingChecklist() {
  if (localStorage.getItem(onboardingStorageKey('checklist_verborgen')) === '1') return;

  const status = await haalOnboardingStatus();
  const openstaand = ONBOARDING_STAPPEN.filter(s => !status[s.key]);
  if (!openstaand.length) return; // alles al gedaan, niks te tonen

  const voltooid = ONBOARDING_STAPPEN.length - openstaand.length;
  const kaart = document.createElement('div');
  kaart.id = 'onboarding-checklist';
  kaart.style.cssText = 'grid-column:1/-1;background:var(--white);border:1px solid var(--bd);border-radius:12px;padding:20px 22px;margin-bottom:16px;';
  kaart.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="font-size:13.5px;font-weight:600;color:var(--ink);">Zet je salon in ${ONBOARDING_STAPPEN.length} stappen klaar (${voltooid}/${ONBOARDING_STAPPEN.length})</div>
      <button onclick="verbergOnboardingChecklist()" style="background:none;border:none;color:var(--mu);cursor:pointer;font-size:12px;">Verbergen</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${ONBOARDING_STAPPEN.map(s => `
        <a href="${s.href}" style="display:flex;align-items:center;gap:12px;text-decoration:none;padding:8px;border-radius:8px;transition:background .15s;" onmouseover="this.style.background='var(--iv)'" onmouseout="this.style.background='none'">
          <div style="width:20px;height:20px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;${status[s.key] ? 'background:var(--gd);' : 'border:1.5px solid var(--bd);'}">
            ${status[s.key] ? '<svg width="11" height="11" fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
          <div>
            <div style="font-size:13px;font-weight:500;color:${status[s.key] ? 'var(--mu)' : 'var(--ink)'};${status[s.key] ? 'text-decoration:line-through;' : ''}">${s.label}</div>
            <div style="font-size:11.5px;color:var(--mu);">${s.sub}</div>
          </div>
        </a>
      `).join('')}
    </div>`;

  const content = document.querySelector('.content');
  const trialBanner = document.getElementById('trial-banner');
  if (content) {
    if (trialBanner && trialBanner.style.display !== 'none') {
      trialBanner.insertAdjacentElement('afterend', kaart);
    } else {
      content.insertBefore(kaart, content.firstChild.nextSibling);
    }
  }
}

function verbergOnboardingChecklist() {
  localStorage.setItem(onboardingStorageKey('checklist_verborgen'), '1');
  const el = document.getElementById('onboarding-checklist');
  if (el) el.remove();
}

// ── Kai-begroeting (alleen bij de allereerste keer op het dashboard) ──
function toonKaiBegroeting() {
  if (localStorage.getItem(onboardingStorageKey('kai_gezien')) === '1') return;
  localStorage.setItem(onboardingStorageKey('kai_gezien'), '1');

  const overlay = document.createElement('div');
  overlay.id = 'kai-begroeting-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(15,13,11,.5);display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML = `
    <div style="background:var(--white);border-radius:16px;max-width:420px;width:100%;padding:32px;text-align:center;">
      <img src="images/kai-mascotte.png" alt="Kai" style="width:64px;height:64px;object-fit:contain;margin:0 auto 18px;">
      <h2 style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--ink);margin-bottom:10px;">Hoi! Ik ben Kai.</h2>
      <p style="font-size:14px;color:var(--mu);line-height:1.6;margin-bottom:24px;">Welkom bij Kronr. Laat ik je in een korte rondleiding laten zien waar alles staat -- duurt hooguit een minuutje.</p>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="sluitKaiBegroeting()" style="padding:12px 20px;background:none;border:1px solid var(--bd);border-radius:8px;font-size:13px;color:var(--mu);cursor:pointer;font-family:inherit;">Later</button>
        <button onclick="sluitKaiBegroeting();startRondleiding();" style="padding:12px 22px;background:var(--ink);color:var(--white);border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Start rondleiding</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function sluitKaiBegroeting() {
  const el = document.getElementById('kai-begroeting-overlay');
  if (el) el.remove();
}

// ── Interactieve rondleiding ──
const RONDLEIDING_STAPPEN = [
  { selector: '.si[href="agenda.html"], .mob-item[href="agenda.html"]', titel: 'Agenda', tekst: 'Hier zie je al je afspraken. Nieuwe boekingen (ook online) komen hier automatisch binnen.' },
  { selector: '.si[href="klanten.html"], .mob-item[href="klanten.html"]', titel: 'Klanten', tekst: 'Alle klantgegevens, behandelhistorie en notities op één plek.' },
  { selector: '.si[href="kassa.html"], .mob-item[href="kassa.html"]', titel: 'Kassa', tekst: 'Reken hier snel af, inclusief pin, contant en cadeaubonnen.' },
  { selector: '.si[href="diensten.html"], .mob-item[href="diensten.html"]', titel: 'Diensten', tekst: 'Beheer hier je behandelingen, prijzen en duur.' },
  { selector: '.si[href="instellingen.html"], .mob-item[href="instellingen.html"]', titel: 'Instellingen', tekst: 'Salonprofiel, boekingswidget, abonnement -- alles wat je verder kunt aanpassen.' },
];

let rondleidingIndex = 0;

function startRondleiding() {
  rondleidingIndex = 0;
  toonRondleidingStap();
}

function elementIsWerkelijkZichtbaar(el) {
  if (el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  // offsetParent alleen zegt dat het element niet display:none is -- een
  // element kan nog steeds volledig BUITEN BEELD staan (bv. het mobiele
  // menu dat dicht staat via left:-100%). Dat telt hier niet als zichtbaar.
  return r.width > 0 && r.height > 0 &&
    r.right > 0 && r.left < window.innerWidth &&
    r.bottom > 0 && r.top < window.innerHeight;
}

function vindZichtbareStapElement(selector) {
  const kandidaten = document.querySelectorAll(selector);
  for (const el of kandidaten) {
    if (elementIsWerkelijkZichtbaar(el)) return el;
  }
  return null;
}

async function toonRondleidingStap() {
  sluitRondleidingStap();
  if (rondleidingIndex >= RONDLEIDING_STAPPEN.length) return;

  const stap = RONDLEIDING_STAPPEN[rondleidingIndex];
  let el = vindZichtbareStapElement(stap.selector);

  // Geen enkele kandidaat écht zichtbaar? Op mobiel staat het menu dan
  // waarschijnlijk dicht -- open het (dezelfde functie als de hamburger-
  // knop) en wacht de schuif-animatie af voordat we opnieuw meten.
  if (!el && typeof openSB === 'function' && document.getElementById('sb')) {
    openSB();
    await new Promise(r => setTimeout(r, 300));
    el = vindZichtbareStapElement(stap.selector);
  }

  if (!el) { rondleidingIndex++; return toonRondleidingStap(); }

  const rect = el.getBoundingClientRect();

  const overlay = document.createElement('div');
  overlay.id = 'rondleiding-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9997;';
  document.body.appendChild(overlay);

  const highlight = document.createElement('div');
  highlight.style.cssText = `position:fixed;top:${rect.top - 4}px;left:${rect.left - 4}px;width:${rect.width + 8}px;height:${rect.height + 8}px;border:2px solid var(--gd);border-radius:8px;z-index:9998;pointer-events:none;box-shadow:0 0 0 4000px rgba(15,13,11,.55);`;
  overlay.appendChild(highlight);

  // Tooltip binnen de viewport houden: probeer rechts, val terug op
  // onder het element, en klem in beide gevallen binnen de schermranden.
  const tooltipBreedte = 240, tooltipMarge = 16;
  let tooltipLeft, tooltipTop;
  if (rect.right + tooltipMarge + tooltipBreedte < window.innerWidth) {
    tooltipLeft = rect.right + tooltipMarge;
    tooltipTop = rect.top;
  } else {
    tooltipLeft = Math.max(tooltipMarge, Math.min(rect.left, window.innerWidth - tooltipBreedte - tooltipMarge));
    tooltipTop = rect.bottom + 12;
  }
  // Verticaal ook binnen het scherm klemmen (tooltip is ong. 160px hoog)
  tooltipTop = Math.max(tooltipMarge, Math.min(tooltipTop, window.innerHeight - 180));

  const tooltip = document.createElement('div');
  tooltip.style.cssText = `position:fixed;top:${tooltipTop}px;left:${tooltipLeft}px;z-index:9999;background:var(--white);border-radius:10px;padding:16px 18px;max-width:${tooltipBreedte}px;box-shadow:0 12px 32px rgba(15,13,11,.15);`;
  tooltip.innerHTML = `
    <div style="font-size:10px;color:var(--gd);font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Stap ${rondleidingIndex + 1} van ${RONDLEIDING_STAPPEN.length}</div>
    <div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:6px;">${stap.titel}</div>
    <div style="font-size:12.5px;color:var(--mu);line-height:1.5;margin-bottom:14px;">${stap.tekst}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <button onclick="stopRondleiding()" style="background:none;border:none;color:var(--mu);font-size:11.5px;cursor:pointer;font-family:inherit;">Overslaan</button>
      <button onclick="volgendeRondleidingStap()" style="padding:8px 16px;background:var(--ink);color:var(--white);border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">${rondleidingIndex === RONDLEIDING_STAPPEN.length - 1 ? 'Klaar' : 'Volgende'}</button>
    </div>`;
  overlay.appendChild(tooltip);
}

function sluitRondleidingStap() {
  const el = document.getElementById('rondleiding-overlay');
  if (el) el.remove();
}

function volgendeRondleidingStap() {
  rondleidingIndex++;
  toonRondleidingStap();
}

function stopRondleiding() {
  sluitRondleidingStap();
}

// ── Alles samen opstarten ──
async function initOnboarding() {
  await toonOnboardingChecklist();
  toonKaiBegroeting();
}
