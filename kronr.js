// ═══════════════════════════════════════
// KRONR.JS — Gedeelde Supabase logica
// ═══════════════════════════════════════
const SB_URL = 'https://pscybcirexnltqvziixt.supabase.co';
const SB_KEY = 'sb_publishable_9cyuoATNMTImTp207rTHaA_sXGi5fm6';

// ── "Onthoud mij" ────────────────────────────────────────────────────────
// De voorkeur zelf staat altijd in localStorage (klein, niet gevoelig) en
// bepaalt of de eigenlijke sessie in localStorage (blijft na sluiten browser)
// of sessionStorage (weg zodra de browser/tab dicht gaat) wordt bewaard.
// Alle pagina's maken hun eigen client aan via dit bestand, dus moeten
// allemaal dezelfde opslag-adapter gebruiken om elkaars sessie te vinden.
function kronrStorage() {
  function backing() {
    return localStorage.getItem('kronr_remember') !== '0' ? window.localStorage : window.sessionStorage;
  }
  return {
    getItem: (key) => backing().getItem(key),
    setItem: (key, value) => backing().setItem(key, value),
    removeItem: (key) => backing().removeItem(key),
  };
}

const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { storage: kronrStorage(), persistSession: true, autoRefreshToken: true }
});
let SALON_ID = null;
let SESSION_USER = null;
let SALON = null;
let LOCATIES = [];
let HUIDIGE_LOCATIE_ID = null;

// Verberg pagina direct zodat er geen flits is
document.documentElement.style.opacity = '0';

function locatieStorageKey(salonId) { return 'kronr_locatie_' + salonId; }

// ── Proefperiode-check ──
// Alleen relevant voor het gratis plan; zodra een salon een betaald
// pakket heeft is er nooit sprake van vergrendeling.
function isProefperiodeVerlopen(salon) {
  if (!salon || salon.plan !== 'free') return false;
  const aangemaakt = salon.created_at ? new Date(salon.created_at) : new Date();
  const dagenGeleden = Math.floor((new Date() - aangemaakt) / (1000 * 60 * 60 * 24));
  return dagenGeleden >= 14;
}

function toonVergrendelScherm() {
  const overlay = document.createElement('div');
  overlay.id = 'kronr-vergrendel-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#faf8f4;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,sans-serif;';
  overlay.innerHTML = `
    <div style="max-width:420px;text-align:center;">
      <div style="width:56px;height:56px;border-radius:50%;background:#f5ede0;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
        <svg width="26" height="26" fill="none" stroke="#8c6d3f" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      </div>
      <h1 style="font-family:'Playfair Display',serif;font-size:26px;font-weight:700;color:#0f0d0b;margin-bottom:12px;">Je proefperiode is verlopen</h1>
      <p style="font-size:14.5px;color:#6b6058;line-height:1.6;margin-bottom:28px;">Je 14 dagen gratis zijn voorbij. Kies een pakket om Kronr te blijven gebruiken -- je gegevens staan gewoon klaar, er gaat niets verloren.</p>
      <a href="instellingen.html#abonnement" style="display:inline-block;background:#0f0d0b;color:#faf8f4;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">Bekijk pakketten</a>
      <div style="margin-top:20px;">
        <a href="#" onclick="uitloggen();return false;" style="font-size:13px;color:#a09890;text-decoration:underline;">Uitloggen</a>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function wisselLocatie(id) {
  try { localStorage.setItem(locatieStorageKey(SALON_ID), id); } catch (e) {}
  window.location.reload();
}

function renderLocatieSwitcher() {
  if (LOCATIES.length < 2) return; // geen switcher nodig voor 1 locatie -- geen UI-rommel voor de meeste salons

  const huidige = LOCATIES.find(l => l.id === HUIDIGE_LOCATIE_ID);
  const optiesHtml = LOCATIES.map(l =>
    `<option value="${l.id}"${l.id === HUIDIGE_LOCATIE_ID ? ' selected' : ''}>${l.naam}</option>`
  ).join('');

  const switcherHtml = `
    <div class="kronr-locatie-switcher" style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:5px;">Locatie</div>
      <select onchange="wisselLocatie(this.value)" style="width:100%;padding:7px 8px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:12px;font-family:'Inter',sans-serif;">
        ${optiesHtml}
      </select>
    </div>`;

  const sidebar = document.querySelector('aside.sidebar');
  if (sidebar && !sidebar.querySelector('.kronr-locatie-switcher')) {
    sidebar.insertAdjacentHTML('afterbegin', switcherHtml);
  }
  const mobSidebar = document.getElementById('sb');
  if (mobSidebar && !mobSidebar.querySelector('.kronr-locatie-switcher')) {
    const mobLogo = mobSidebar.querySelector('.mob-logo');
    if (mobLogo) mobLogo.insertAdjacentHTML('afterend', switcherHtml);
  }
}

async function kronrInit(callback) {
  try {
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    SESSION_USER = session.user;

    // Zoek salon
    let { data: salon, error } = await sb.from('salons')
      .select('*')
      .eq('owner_id', session.user.id)
      .single();

    // Salon bestaat nog niet? Maak aan op basis van user metadata
    if (!salon) {
      const meta = session.user.user_metadata || {};
      const naam = meta.bedrijf_naam || meta.full_name || 'Mijn Salon';
      const type = meta.type_bedrijf || 'Kapper';
      const { data: nieuw } = await sb.from('salons').insert({
        owner_id: session.user.id,
        naam,
        type_bedrijf: type,
        email: session.user.email,
        plan: 'free'
      }).select().single();
      salon = nieuw;
    }

    if (!salon) {
      // Salon aanmaken mislukt, log uit en stuur naar login
      await sb.auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    SALON_ID = salon.id;
    SALON = salon;

    // ── Proefperiode-vergrendeling ──
    // Na 14 dagen op het gratis plan wordt alles op slot gezet, behalve
    // instellingen.html (waar iemand alsnog een pakket kan kiezen).
    if (isProefperiodeVerlopen(salon) && !window.location.pathname.endsWith('instellingen.html')) {
      toonVergrendelScherm();
      return; // callback (de eigenlijke paginalogica) draait bewust niet
    }

    // Locaties ophalen en de huidige bepalen (uit localStorage, of de
    // eerste actieve als er nog geen voorkeur is/de vorige niet meer bestaat)
    const { data: locaties } = await sb.from('locaties').select('*').eq('salon_id', SALON_ID).eq('actief', true).order('naam');
    LOCATIES = locaties || [];
    let opgeslagenLocatieId = null;
    try { opgeslagenLocatieId = localStorage.getItem(locatieStorageKey(SALON_ID)); } catch (e) {}
    HUIDIGE_LOCATIE_ID = LOCATIES.find(l => l.id === opgeslagenLocatieId)?.id || LOCATIES[0]?.id || null;
    renderLocatieSwitcher();

    // Update sidebar
    document.querySelectorAll('.salon-naam').forEach(el => el.textContent = salon.naam);
    document.querySelectorAll('.salon-plan').forEach(el => el.textContent = salon.plan === 'free' ? 'Gratis plan' : 'Pro plan');
    const init = salon.naam.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    document.querySelectorAll('.sca, .salon-init').forEach(el => el.textContent = init);
    if (salon.logo_url) {
      document.querySelectorAll('.salon-logo-img').forEach(el => { el.src = salon.logo_url; el.style.display = 'block'; });
      document.querySelectorAll('.salon-init').forEach(el => el.style.display = 'none');
    }

    // Callback uitvoeren
    if (callback) await callback();

  } catch(e) {
    console.error('kronrInit fout:', e);
  } finally {
    // Altijd pagina zichtbaar maken, ook bij fout
    document.documentElement.style.opacity = '1';
  }
}

async function uitloggen() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

// Kleine helper: past het locatie-filter alleen toe als er daadwerkelijk
// een huidige locatie bekend is (bv. nog niet zo als de migratie nog niet
// gedraaid is voor deze salon) -- voorkomt dat een .eq('locatie_id', null)
// per ongeluk alles wegfiltert.
function metLocatie(query) {
  return HUIDIGE_LOCATIE_ID ? query.eq('locatie_id', HUIDIGE_LOCATIE_ID) : query;
}
