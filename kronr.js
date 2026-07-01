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

// Verberg pagina direct zodat er geen flits is
document.documentElement.style.opacity = '0';

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
