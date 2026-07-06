# kronr-moneybird: nieuwe Cloudflare Worker (boekhoudkoppeling)

Anders dan de vorige Worker-docs: dit is een HELE NIEUWE Worker (net als
kronr-ai/kronr-stripe/kronr-mail), niet een uitbreiding van een bestaande.
Vereist eerst een Moneybird-ontwikkelaarsaccount (moneybird.com/api) om een
OAuth-app te registreren (client_id + client_secret).

**Voorwaarde:** draai eerst `db/2026-07-boekhouding-migratie.sql`.

## 1. `POST /create-oauth-link`

Request: `{"salon_id":"uuid", "return_url":"https://kronr.nl/instellingen.html?moneybird_return=1#abonnement"}`

```js
const authUrl = new URL('https://moneybird.com/oauth/authorize');
authUrl.searchParams.set('client_id', env.MONEYBIRD_CLIENT_ID);
authUrl.searchParams.set('redirect_uri', return_url);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'sales_invoices bank');
return json({ url: authUrl.toString() });
```

## 2. `POST /exchange-oauth-code`

Request: `{"salon_id":"uuid", "code":"..."}`

```js
const tokenRes = await fetch('https://moneybird.com/oauth/token', {
  method: 'POST',
  headers: {'Content-Type':'application/x-www-form-urlencoded'},
  body: new URLSearchParams({
    client_id: env.MONEYBIRD_CLIENT_ID,
    client_secret: env.MONEYBIRD_CLIENT_SECRET,
    code, grant_type: 'authorization_code',
    redirect_uri: '...', // MOET exact overeenkomen met de redirect_uri van stap 1
  }),
});
const tokenData = await tokenRes.json(); // { access_token, refresh_token, expires_in }

// Haal de administration_id op (Moneybird-accounts kunnen meerdere
// 'administraties' hebben, meestal 1 per bedrijf)
const admins = await fetch('https://moneybird.com/api/v2/administrations.json', {
  headers: { Authorization: `Bearer ${tokenData.access_token}` }
}).then(r => r.json());
const administrationId = admins[0]?.id;

// Sla het token op in de APARTE tabel (zonder RLS-policies!) via de
// service-role key -- NOOIT via de gewone client-key opslaan
await supabaseServiceRole.from('boekhouding_tokens').upsert({
  salon_id, provider: 'moneybird',
  access_token: tokenData.access_token,
  refresh_token: tokenData.refresh_token,
  verloopt_op: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
});

await supabaseServiceRole.from('salons').update({
  boekhouding_provider: 'moneybird',
  moneybird_administration_id: administrationId,
  boekhouding_laatste_sync_fout: null,
}).eq('id', salon_id);

return json({ success: true, administration_id: administrationId });
```

## 3. `POST /sync-betaling` (aangeroepen vanuit kassa.html na elke betaling)

Request: `{"salon_id":"uuid", "betaling_id":"uuid"}`

```js
// 1. Haal het token op (ververs 'm eerst als verloopt_op voorbij is --
//    zie stap 4 hieronder)
// 2. Haal de betaling + verkoop_items op
// 3. Maak een 'external sales invoice' aan in Moneybird (dit is de
//    juiste Moneybird-entiteit voor 'omzet die al betaald is', in
//    tegenstelling tot een normale factuur die nog open staat):
const invoice = await fetch(
  `https://moneybird.com/api/v2/${administrationId}/external_sales_invoices.json`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_sales_invoice: {
        contact: { company_name: 'Kassaklant' }, // geen klantgegevens bekend bij losse kassa-verkoop
        reference: betaling_id,
        date: new Date().toISOString().slice(0,10),
        currency: 'EUR',
        details_attributes: verkoopItems.map(i => ({
          description: i.naam,
          price: i.prijs,
          amount: i.aantal,
        })),
        payments_attributes: [{ payment_date: new Date().toISOString().slice(0,10), price: betaling.bedrag }],
      },
    }),
  }
).then(r => r.json());

// 4. Bij succes: betalingen.boekhouding_sync_status='gesynchroniseerd',
//    moneybird_factuur_id=invoice.id
// 5. Bij een fout (bv. token verlopen, 401): betalingen.boekhouding_sync_status='mislukt'
//    EN salons.boekhouding_laatste_sync_fout = duidelijke boodschap +
//    boekhouding_laatste_sync_fout_op = now() -- dit verschijnt automatisch
//    in instellingen.html (de foutbalk is al gebouwd, leest deze 2 velden)
```

## 4. Token-refresh

Moneybird access tokens verlopen (`expires_in`, meestal 1 uur). Voeg een
helper toe die vóór elke API-call checkt of `verloopt_op` voorbij is, en
zo ja eerst ververst:

```js
if (new Date(token.verloopt_op) < new Date()) {
  const refreshed = await fetch('https://moneybird.com/oauth/token', {
    method: 'POST',
    headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: env.MONEYBIRD_CLIENT_ID,
      client_secret: env.MONEYBIRD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  }).then(r => r.json());
  // sla refreshed.access_token/refresh_token/expires_in weer op
}
```

Als de refresh zelf faalt (bv. de koppeling is bij Moneybird ingetrokken):
zet `salons.boekhouding_provider = 'geen'` en
`boekhouding_laatste_sync_fout = 'Koppeling verlopen, koppel opnieuw'` --
de UI valt dan vanzelf terug naar de 'niet gekoppeld'-status.

## Getest

De database-migratie is echt gedraaid tegen lokale PostgreSQL, met
specifieke aandacht voor de tokens-tabel: bevestigd dat RLS zonder
policies ECHT alle toegang blokkeert (ook voor de salon-eigenaar zelf,
met volledige tabel-grants) -- alleen de service-role kan er straks bij.
De volledige frontend-flow (instellingen.html: plan-gating, koppelen,
statusweergave, foutbalk, OAuth-return; kassa.html: sync wordt wel/niet
aangeroepen afhankelijk van de koppeling) is getest met gesimuleerde
Worker-responses, inclusief een test die bevestigt dat de Stripe Connect-
en Moneybird-terugkeerafhandeling elkaar niet in de weg zitten (beide
gebruiken een `code`-query-param, maar zijn nu strikt gescheiden via hun
eigen marker-parameter). De daadwerkelijke Moneybird-API-aanroepen en de
token-refresh-logica kan ik niet vanaf hier testen.
