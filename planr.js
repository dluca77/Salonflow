// ═══════════════════════════════════════
// PLANR.JS — Gedeelde Supabase logica
// ═══════════════════════════════════════
const SB_URL = 'https://pscybcirexnltqvziixt.supabase.co';
const SB_KEY = 'sb_publishable_9cyuoATNMTImTp207rTHaA_sXGi5fm6';
const sb = window.supabase.createClient(SB_URL, SB_KEY);
let SALON_ID = null;
let SESSION_USER = null;

// Auth check + salon laden, daarna callback uitvoeren
async function planrInit(callback) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  SESSION_USER = session.user;
  const { data: salon, error } = await sb.from('salons').select('*').eq('owner_id', session.user.id).single();
  if (error || !salon) { window.location.href = 'login.html'; return; }
  SALON_ID = salon.id;
  // Naam in sidebar updaten
  document.querySelectorAll('.salon-naam').forEach(el => el.textContent = salon.naam);
  document.querySelectorAll('.salon-plan').forEach(el => el.textContent = salon.plan === 'free' ? 'Gratis plan' : 'Pro plan');
  const initials = salon.naam.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  document.querySelectorAll('.sca').forEach(el => el.textContent = initials);
  if (callback) await callback();
}

// Uitloggen
async function uitloggen() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}
