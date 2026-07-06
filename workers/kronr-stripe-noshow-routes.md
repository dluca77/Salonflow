# kronr-stripe: nieuwe routes voor no-show-bescherming

Zelfde format als de eerdere Worker-docs. Vereist dat Stripe Connect al
gekoppeld is en dat `db/2026-07-noshow-migratie.sql` gedraaid is.

## 1. `/create-deposit-checkout` uitbreiden met `save_card`

De bestaande route (zie `workers/kronr-stripe-connect-routes.md`) moet een
optioneel `save_card: true` veld ondersteunen. Als dat meekomt, moet de
Checkout Session ZOWEL de aanbetaling incasseren ALS de kaart vastleggen
voor latere off-session charges -- dit voorkomt dat een klant twee keer
naar Stripe moet voor 1 boeking (aanbetaling + verplichte kaartgegevens).

```js
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card'], // let op: alleen 'card' ondersteunt
                                    // setup_future_usage; iDEAL bv. niet
  line_items: [{ price_data: {...}, quantity: 1 }],
  customer_email: email,
  success_url, cancel_url,
  metadata: { afspraak_id, salon_id, save_card: save_card ? '1' : '0' },
  payment_intent_data: save_card ? { setup_future_usage: 'off_session' } : undefined,
}, { stripeAccount: connectedAccountId });
```

## 2. Nieuwe route: `POST /create-setup-checkout`

Voor diensten die ALLEEN kaartgegevens vereisen (geen aanbetaling).

Request:
```json
{ "salon_id":"uuid", "afspraak_id":"uuid", "save_card":true, "email":"klant@mail.nl",
  "success_url":"...", "cancel_url":"..." }
```

```js
const session = await stripe.checkout.sessions.create({
  mode: 'setup', // GEEN afschrijving, alleen kaart vastleggen
  payment_method_types: ['card'],
  customer_email: email,
  success_url, cancel_url,
  metadata: { afspraak_id, salon_id },
}, { stripeAccount: connectedAccountId });
```

Retourneer: `{"url": session.url}`

## 3. Webhook uitbreiden: `checkout.session.completed` (setup mode)

Naast de bestaande afhandeling voor `mode: 'payment'` (aanbetaling), moet
de webhook nu ook `mode: 'setup'`-sessies afhandelen, EN de
`setup_future_usage`-variant van een payment-sessie:

```js
if (event.type === 'checkout.session.completed') {
  const session = event.data.object;
  const { afspraak_id } = session.metadata;

  if (session.mode === 'setup' || session.setup_future_usage) {
    // Haal de vastgelegde payment method + customer op
    const setupIntent = session.setup_intent
      ? await stripe.setupIntents.retrieve(session.setup_intent, {stripeAccount: connectedAccountId})
      : null;
    const paymentMethodId = setupIntent?.payment_method
      || session.payment_intent && (await stripe.paymentIntents.retrieve(session.payment_intent, {stripeAccount: connectedAccountId})).payment_method;
    const customerId = session.customer;

    await patchAfspraak(afspraak_id, {
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethodId,
      stripe_setup_intent_id: session.setup_intent || null,
      noshow_fee_status: 'vastgelegd',
    });
  }

  // (bestaande aanbetaling-afhandeling blijft ongewijzigd)
}
```

## 4. Nieuwe route: `POST /charge-noshow-fee`

Aangeroepen vanuit agenda.html als de salon op 'No-show-fee incasseren'
klikt.

Request: `{"salon_id":"uuid", "afspraak_id":"uuid"}`

```js
// 1. Haal de afspraak op (stripe_customer_id, stripe_payment_method_id,
//    noshow_fee_status) en het salon-brede noshow_fee_bedrag
// 2. Check: noshow_fee_status === 'vastgelegd' (anders al gedaan of geen kaart)
// 3. Off-session charge op de connected account:
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(noshow_fee_bedrag * 100),
  currency: 'eur',
  customer: stripe_customer_id,
  payment_method: stripe_payment_method_id,
  off_session: true,
  confirm: true,
}, { stripeAccount: connectedAccountId });

// 4. Bij succes: noshow_fee_status = 'geincasseerd'
// 5. Bij een Stripe-fout (kaart geweigerd/verlopen): noshow_fee_status = 'mislukt',
//    en geef een duidelijke foutmelding terug (de frontend toont deze al
//    met een suggestie om rechtstreeks contact op te nemen)
```

Retourneer bij succes: `{"success": true}`
Retourneer bij fout: `{"success": false, "error": "<duidelijke boodschap>"}`
(status 200, niet een HTTP-errorcode, zodat de frontend de foutmelding
netjes kan tonen in plaats van een generieke netwerkfout)

## Getest

De database-migratie is echt gedraaid tegen een lokaal geïnstalleerde
PostgreSQL (check constraints bevestigd correct). De volledige
frontend-flow (boeken.html: dienst-badge, gecombineerde aanbetaling+kaart
in 1 sessie, beide terugkeer-scenario's; agenda.html: incasseer-knop
verschijnt/verdwijnt correct, juiste Worker-aanroep) is getest met
gesimuleerde Worker-responses. De daadwerkelijke Stripe-integratie
(SetupIntent, off-session charge, webhook) kan ik niet vanaf hier
testen -- test dit met Stripe test-mode kaarten, inclusief een kaart die
specifiek off-session charges weigert (Stripe testkaart `4000000000003220`
is hiervoor bedoeld) om de foutafhandeling te verifiëren.
