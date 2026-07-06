# kronr-stripe: nieuwe routes voor klantabonnementen

Zelfde format als de vorige Worker-docs. Vereist Stripe Connect (zie
`workers/kronr-stripe-connect-routes.md`) en dat
`db/2026-07-abonnementen-migratie.sql` gedraaid is.

## 1. `POST /create-subscription-checkout`

Request:
```json
{
  "salon_id":"uuid", "plan_id":"uuid", "klant_naam":"Jan Jansen", "email":"jan@mail.nl",
  "success_url":"...", "cancel_url":"..."
}
```

Wat het moet doen:
1. Haal het plan op (`abonnement_plannen`) voor `prijs_per_maand` en
   `dienst_id`.
2. Maak een Checkout Session in **subscription-mode** op de connected
   account:

```js
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{
    price_data: {
      currency: 'eur',
      product_data: { name: plan.naam },
      unit_amount: Math.round(plan.prijs_per_maand * 100),
      recurring: { interval: 'month' },
    },
    quantity: 1,
  }],
  customer_email: email,
  success_url, cancel_url,
  metadata: { salon_id, plan_id, klant_naam },
}, { stripeAccount: connectedAccountId });
```

3. Retourneer `{"url": session.url}`.

**Nog niet aanmaken in `klant_abonnementen`** op dit punt -- dat gebeurt
pas via de webhook zodra de eerste betaling daadwerkelijk gelukt is (zie
hieronder). Anders zou een geannuleerde/mislukte checkout toch een
"actief" abonnement-record achterlaten.

## 2. Webhook: `checkout.session.completed` (mode=subscription)

```js
if (event.type === 'checkout.session.completed' && session.mode === 'subscription') {
  const { salon_id, plan_id, klant_naam } = session.metadata;
  await supabaseServiceRole.from('klant_abonnementen').insert({
    salon_id, plan_id, klant_naam,
    klant_email: session.customer_details.email,
    stripe_subscription_id: session.subscription,
    stripe_customer_id: session.customer,
    status: 'actief',
    credits_resterend: 0, // wordt in dezelfde flow hieronder opgehoogd
  });
  // Ga meteen door met de credit-toekenning hieronder voor deze eerste
  // periode (of laat het aan de losse invoice.paid-webhook over, wat
  // meestal toch vlak hierna binnenkomt voor de eerste betaling).
}
```

## 3. Webhook: `invoice.paid` (elke maandelijkse herhaling)

Dit is de plek waar credits daadwerkelijk maandelijks bijgeschreven
worden -- niet bij het aanmaken van het abonnement zelf, want anders
krijgt de klant al hun credits vooruit voor een heel jaar als ze niet
opzeggen.

```js
if (event.type === 'invoice.paid') {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;

  const { data: abo } = await supabaseServiceRole
    .from('klant_abonnementen')
    .select('id, plan_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();
  if (!abo) return;

  const { data: plan } = await supabaseServiceRole
    .from('abonnement_plannen')
    .select('credits_per_maand')
    .eq('id', abo.plan_id)
    .single();

  await supabaseServiceRole.rpc('verhoog_abonnement_credits', {
    p_abonnement_id: abo.id,
    p_aantal: plan.credits_per_maand,
  });
  // (zie hieronder voor deze RPC -- niet in de migratie opgenomen, want
  // een simpele UPDATE credits_resterend = credits_resterend + X via de
  // service-role vanuit de Worker kan ook direct, RLS geldt toch niet
  // voor de service-role. Een RPC is hier dus optioneel, maar wel zo
  // consistent met de rest van het patroon.)
```

Simpele SQL-variant zonder aparte RPC (werkt net zo goed vanuit de
Worker met de service-role key):
```sql
update klant_abonnementen
set credits_resterend = credits_resterend + <plan.credits_per_maand>
where id = '<abo.id>';
```

## 4. Webhook: `customer.subscription.deleted` (opzeggen)

```js
if (event.type === 'customer.subscription.deleted') {
  await supabaseServiceRole.from('klant_abonnementen')
    .update({ status: 'opgezegd', opgezegd_op: new Date().toISOString() })
    .eq('stripe_subscription_id', event.data.object.id);
}
```

Resterende credits blijven gewoon staan zodat de klant ze nog kan
opmaken na opzeggen (bewuste keuze, geen verrassingen voor de klant).

## 5. Opzeggen door de klant zelf

Niet in deze sessie gebouwd: een self-service opzeg-pagina/link (zoals
`annuleren.html` voor afspraken). Voor nu kan de salon-eigenaar
opzeggingen afhandelen via het Stripe-dashboard zelf, of je kunt een
vergelijkbare token-gebaseerde pagina bouwen als een latere uitbreiding.

## Getest

De database-laag (schema, RLS, en met name de ATOMISCHE credit-aftrek
via `verbruik_abonnement_credit`) is grondig getest tegen een lokaal
geïnstalleerde PostgreSQL, inclusief een ECHTE gelijktijdige race
(2 processen die tegelijk hetzelfde ene tegoed proberen te verbruiken --
precies 1 lukt, saldo blijft kloppen). De volledige frontend-flow in
boeken.html (tegoed checken/toepassen/intrekken, nieuw abonneren, de
race-condition-foutafhandeling as-if-echt) is getest met gesimuleerde
Worker-responses. De daadwerkelijke Stripe-subscription-integratie
(recurring Checkout, de 3 webhooks hierboven) kan ik niet vanaf hier
testen.
