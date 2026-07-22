// ═══════════════════════════════════════════════════════════
// KRONR MONEYBIRD PROXY
// Cloudflare Worker — koppelt een salon's eigen Moneybird-account
// (OAuth) en synchroniseert kassa-betalingen als facturen.
// ═══════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = ['https://kronr.nl', 'https://www.kronr.nl'];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Alleen POST toegestaan' }), { status: 405, headers });
    }

    if (url.pathname === '/create-oauth-link') return handleCreateOauthLink(request, env, headers);
    if (url.pathname === '/exchange-oauth-code') return handleExchangeOauthCode(request, env, headers);

    if (url.pathname === '/sync-betaling') {
      // BELANGRIJK: kassa.html roept dit endpoint 'fire and forget' aan
      // (geen await, geen keepalive) en gaat direct door naar de volgende
      // stap (bon tonen, nieuwe pagina). Zonder ctx.waitUntil() kan
      // Cloudflare deze Worker halverwege afbreken zodra de browser de
      // verbinding sluit -- nog vóórdat de factuur is aangemaakt of zelfs
      // vóórdat een foutmelding kon worden opgeslagen. Door de eigenlijke
      // verwerking in ctx.waitUntil() te zetten, blijft de Worker op de
      // achtergrond draaien totdat hij echt klaar is, ongeacht of de
      // client nog verbonden is.
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Ongeldige JSON' }), { status: 400, headers });
      }
      ctx.waitUntil(handleSyncBetalingAchtergrond(body, env));
      return new Response(JSON.stringify({ accepted: true }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Onbekend endpoint' }), { status: 404, headers });
  },
};

async function supabaseQuery(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase-fout: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function berekenVerloopdatum(expiresIn) {
  const seconden = Number(expiresIn);
  const geldig = Number.isFinite(seconden) && seconden > 0 ? seconden : 10 * 365 * 24 * 3600;
  return new Date(Date.now() + geldig * 1000).toISOString();
}

async function handleCreateOauthLink(request, env, headers) {
  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: 'Ongeldige JSON' }), { status: 400, headers });
  }
  const { salon_id, return_url } = body;
  if (!salon_id || !return_url) {
    return new Response(JSON.stringify({ error: 'salon_id en return_url zijn verplicht' }), { status: 400, headers });
  }
  const authUrl = new URL('https://moneybird.com/oauth/authorize');
  authUrl.searchParams.set('client_id', env.MONEYBIRD_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', return_url);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'sales_invoices bank settings');
  authUrl.searchParams.set('state', salon_id);
  return new Response(JSON.stringify({ url: authUrl.toString() }), { headers });
}

async function handleExchangeOauthCode(request, env, headers) {
  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ error: 'Ongeldige JSON' }), { status: 400, headers });
  }
  const { salon_id, code } = body;
  if (!salon_id || !code) {
    return new Response(JSON.stringify({ error: 'salon_id en code zijn verplicht' }), { status: 400, headers });
  }
  const redirectUri = 'https://kronr.nl/instellingen/?moneybird_return=1';
  try {
    const tokenRes = await fetch('https://moneybird.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MONEYBIRD_CLIENT_ID,
        client_secret: env.MONEYBIRD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return new Response(JSON.stringify({ error: 'Moneybird-koppeling mislukt', detail: tokenData }), { status: 502, headers });
    }
    const adminsRes = await fetch('https://moneybird.com/api/v2/administrations.json', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const admins = await adminsRes.json();
    const administrationId = admins?.[0]?.id;
    if (!administrationId) {
      return new Response(JSON.stringify({ error: 'Geen Moneybird-administratie gevonden op dit account' }), { status: 502, headers });
    }
    await supabaseQuery(env, 'boekhouding_tokens', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        salon_id,
        provider: 'moneybird',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        verloopt_op: berekenVerloopdatum(tokenData.expires_in),
      }),
    });
    await supabaseQuery(env, `salons?id=eq.${salon_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        boekhouding_provider: 'moneybird',
        moneybird_administration_id: administrationId,
        boekhouding_laatste_sync_fout: null,
      }),
    });
    return new Response(JSON.stringify({ success: true, administration_id: administrationId }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}

async function haalGeldigToken(env, salon_id) {
  const salonRows = await supabaseQuery(env, `salons?id=eq.${salon_id}&select=moneybird_administration_id,boekhouding_provider`);
  const salon = salonRows?.[0];
  if (!salon || salon.boekhouding_provider !== 'moneybird') {
    throw new Error('Deze salon heeft geen Moneybird-koppeling');
  }
  const tokenRows = await supabaseQuery(env, `boekhouding_tokens?salon_id=eq.${salon_id}&select=access_token,refresh_token,verloopt_op`);
  const token = tokenRows?.[0];
  if (!token) throw new Error('Geen opgeslagen Moneybird-token gevonden voor deze salon');

  if (new Date(token.verloopt_op) >= new Date()) {
    return { accessToken: token.access_token, administrationId: salon.moneybird_administration_id };
  }

  const refreshRes = await fetch('https://moneybird.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MONEYBIRD_CLIENT_ID,
      client_secret: env.MONEYBIRD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshRes.ok || !refreshed.access_token) {
    await supabaseQuery(env, `salons?id=eq.${salon_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        boekhouding_provider: 'geen',
        boekhouding_laatste_sync_fout: 'Koppeling verlopen, koppel opnieuw',
        boekhouding_laatste_sync_fout_op: new Date().toISOString(),
      }),
    });
    throw new Error('Moneybird-koppeling verlopen, opnieuw koppelen vereist');
  }
  await supabaseQuery(env, `boekhouding_tokens?salon_id=eq.${salon_id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      verloopt_op: berekenVerloopdatum(refreshed.expires_in),
    }),
  });
  return { accessToken: refreshed.access_token, administrationId: salon.moneybird_administration_id };
}

async function haalOfMaakKassaKlantContact(accessToken, administrationId) {
  const zoekRes = await fetch(
    `https://moneybird.com/api/v2/${administrationId}/contacts.json?query=Kassaklant`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const gevonden = await zoekRes.json();
  if (zoekRes.ok && Array.isArray(gevonden)) {
    const match = gevonden.find(c => c.company_name === 'Kassaklant');
    if (match) return match.id;
  }
  const maakRes = await fetch(
    `https://moneybird.com/api/v2/${administrationId}/contacts.json`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: { company_name: 'Kassaklant' } }),
    }
  );
  const nieuw = await maakRes.json();
  if (!maakRes.ok || !nieuw.id) throw new Error('Kon geen "Kassaklant"-contact aanmaken in Moneybird');
  return nieuw.id;
}

// ── Btw-tarief opzoeken (met caching) ──
// KERN VAN DE FIX: zonder tax_rate_id expliciet mee te geven, gebruikt
// Moneybird zijn eigen standaardgedrag en telt 21% BOVENOP de meegegeven
// prijs, ook als die al inclusief btw was. Deze functie zoekt het echte
// 21%-verkooptarief van de eigen Moneybird-administratie op.
//
// Caching: btw-tarieven veranderen vrijwel nooit, dus we hoeven dit niet
// bij elke synchronisatie opnieuw bij Moneybird op te vragen -- dat kostte
// een extra API-call per transactie en kon bij snel-achter-elkaar
// synchroniseren tegen Moneybird's rate-limit aanlopen (mogelijk de
// oorzaak van incidenteel mislukte syncs). Gebruikt Cloudflare's Cache
// API, dus geen nieuwe databasekolom of migratie nodig.
async function haalTaxRatesMetRetry(administrationId, accessToken) {
  let laatsteFout;
  for (let poging = 1; poging <= 2; poging++) {
    const res = await fetch(
      `https://moneybird.com/api/v2/${administrationId}/tax_rates.json`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const tarieven = await res.json();
      if (Array.isArray(tarieven)) return tarieven;
      laatsteFout = `Onverwacht antwoord (geen lijst): ${JSON.stringify(tarieven).slice(0, 200)}`;
    } else {
      const tekst = await res.text();
      laatsteFout = `HTTP ${res.status}: ${tekst.slice(0, 200)}`;
    }
    if (poging === 1) await new Promise(r => setTimeout(r, 800)); // korte pauze, dan één herprobeer-poging
  }
  throw new Error(`Kon btw-tarieven niet ophalen uit Moneybird (${laatsteFout})`);
}

async function haalBtwTarieven(accessToken, administrationId) {
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.interne-kronr-cache/btw-tarieven/${administrationId}`);

  const cached = await cache.match(cacheKey);
  if (cached) return await cached.json();

  const tarieven = await haalTaxRatesMetRetry(administrationId, accessToken);

  const kandidaten21 = tarieven.filter(t => Number(t.percentage) === 21);
  const tarief21 = kandidaten21.find(t => t.tax_rate_type === 'sales_invoice') || kandidaten21[0];
  if (!tarief21) throw new Error('Geen 21%-btw-tarief gevonden in deze Moneybird-administratie');

  // Fooi is niet btw-plichtig. Moneybird past echter, als een regel
  // helemaal geen tax_rate_id heeft, kennelijk alsnog het algemene
  // tarief van de factuur toe i.p.v. de regel als vrijgesteld te
  // behandelen -- daarom expliciet een 0%-tarief opzoeken en dat aan
  // fooi-regels meegeven, in plaats van tax_rate_id gewoon weg te laten.
  const kandidaten0 = tarieven.filter(t => Number(t.percentage) === 0);
  const tarief0 = kandidaten0.find(t => t.tax_rate_type === 'sales_invoice') || kandidaten0[0];

  const resultaat = { btw21: tarief21.id, btw0: tarief0 ? tarief0.id : null };

  const response = new Response(JSON.stringify(resultaat), {
    headers: { 'Cache-Control': 'max-age=86400' }, // 24 uur -- ruim genoeg, tarieven wijzigen vrijwel nooit
  });
  await cache.put(cacheKey, response);

  return resultaat;
}

async function handleSyncBetalingAchtergrond(body, env) {
  const { salon_id, betaling_id } = body || {};
  if (!salon_id || !betaling_id) {
    console.error('sync-betaling: salon_id en betaling_id zijn verplicht', body);
    return;
  }

  try {
    const { accessToken, administrationId } = await haalGeldigToken(env, salon_id);

    const betalingRows = await supabaseQuery(env, `betalingen?id=eq.${betaling_id}&select=bedrag,datum`);
    const betaling = betalingRows?.[0];
    if (!betaling) throw new Error('Betaling niet gevonden');

    // Prijzen komen binnen als het daadwerkelijk betaalde bedrag
    // (dus inclusief btw). Reken om naar excl.-btw + geef het echte
    // tarief mee, zodat Moneybird niet nogmaals btw optelt.
    //
    // Uitzondering: fooi ('type'==='fooi') is een vrijwillige gift aan
    // het personeel, geen vergoeding voor een dienst/product -- daar
    // hoort geen btw over berekend te worden. BELANGRIJK: Moneybird past,
    // als een regel HELEMAAL GEEN tax_rate_id heeft, het algemene tarief
    // van de rest van de factuur toe i.p.v. de regel als vrijgesteld te
    // zien -- daarom expliciet het 0%-tarief meegeven, niet gewoon
    // weglaten.
    const { btw21, btw0 } = await haalBtwTarieven(accessToken, administrationId);
    const naarExclBtw = (bedragInclBtw) => Math.round((bedragInclBtw / 1.21) * 100) / 100;

    const verkoopItems = await supabaseQuery(env, `verkoop_items?betaling_id=eq.${betaling_id}&select=naam,prijs,aantal,type`);
    const regels = (verkoopItems && verkoopItems.length)
      ? verkoopItems.map(i => (
          i.type === 'fooi'
            ? { description: i.naam, price: i.prijs, amount: i.aantal, ...(btw0 ? { tax_rate_id: btw0 } : {}) }
            : { description: i.naam, price: naarExclBtw(i.prijs), amount: i.aantal, tax_rate_id: btw21 }
        ))
      : [{
          description: 'Kassa-verkoop',
          price: naarExclBtw(betaling.bedrag),
          amount: 1,
          tax_rate_id: btw21,
        }];

    // Afrondingscorrectie: elke belaste regel apart afronden op de cent
    // kan er samen net naast het daadwerkelijk betaalde bedrag uitkomen
    // (bv. €85,00 wordt €84,99 in Moneybird). Zoek de dichtstbijzijnde
    // prijs voor de laatste BELASTE regel die het totaal (na Moneybird's
    // eigen btw-herberekening, plus de onbelaste fooi-regels erbovenop)
    // zo dicht mogelijk bij het betaalde bedrag brengt. Let op: bij
    // sommige "ronde" bedragen bestaat er wiskundig geen 2-decimalen-
    // prijs die exact terugrekent bij 21% btw -- in die (zeldzame)
    // gevallen is 1 cent verschil het best haalbare resultaat.
    const berekenTotaal = (rs) => rs.reduce((som, r) =>
      som + (r.tax_rate_id === btw21 ? Math.round(r.price * r.amount * 1.21 * 100) / 100 : r.price * r.amount), 0);
    const belasteRegels = regels.filter(r => r.tax_rate_id === btw21);
    if (Math.round((betaling.bedrag - berekenTotaal(regels)) * 100) !== 0 && belasteRegels.length) {
      const laatsteRegel = belasteRegels[belasteRegels.length - 1];
      const basisPrijs = laatsteRegel.price;
      let besteStap = 0, kleinsteVerschil = Infinity;
      for (let stap = -5; stap <= 5; stap++) {
        laatsteRegel.price = Math.round((basisPrijs + stap * 0.01) * 100) / 100;
        const verschil = Math.abs(betaling.bedrag - berekenTotaal(regels));
        if (verschil < kleinsteVerschil) { kleinsteVerschil = verschil; besteStap = stap; }
      }
      laatsteRegel.price = Math.round((basisPrijs + besteStap * 0.01) * 100) / 100;
    }

    const datum = (betaling.datum || new Date().toISOString()).slice(0, 10);
    const contactId = await haalOfMaakKassaKlantContact(accessToken, administrationId);

    const invoiceRes = await fetch(
      `https://moneybird.com/api/v2/${administrationId}/external_sales_invoices.json`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_sales_invoice: {
            contact_id: contactId,
            reference: betaling_id,
            date: datum,
            currency: 'EUR',
            details_attributes: regels,
            payments_attributes: [{ payment_date: datum, price: betaling.bedrag }],
          },
        }),
      }
    );
    const invoice = await invoiceRes.json();

    if (!invoiceRes.ok || !invoice.id) {
      await supabaseQuery(env, `betalingen?id=eq.${betaling_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ boekhouding_sync_status: 'mislukt' }),
      });
      await supabaseQuery(env, `salons?id=eq.${salon_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          boekhouding_laatste_sync_fout: `Factuur aanmaken in Moneybird mislukt (HTTP ${invoiceRes.status}: ${JSON.stringify(invoice).slice(0, 200)})`,
          boekhouding_laatste_sync_fout_op: new Date().toISOString(),
        }),
      });
      return;
    }

    await supabaseQuery(env, `betalingen?id=eq.${betaling_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ boekhouding_sync_status: 'gesynchroniseerd', moneybird_factuur_id: String(invoice.id) }),
    });
  } catch (err) {
    try {
      await supabaseQuery(env, `betalingen?id=eq.${betaling_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ boekhouding_sync_status: 'mislukt' }),
      });
      await supabaseQuery(env, `salons?id=eq.${salon_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          boekhouding_laatste_sync_fout: err.message,
          boekhouding_laatste_sync_fout_op: new Date().toISOString(),
        }),
      });
    } catch (e2) { /* opslaan van de foutmelding zelf mislukt */ }

    console.error('sync-betaling mislukt:', err.message);
  }
}
