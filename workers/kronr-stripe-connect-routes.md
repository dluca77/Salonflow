# kronr-stripe: nieuwe routes voor Stripe Connect + aanbetaling

Net als bij de prijsadvies-route: ik heb geen zicht op je bestaande
`kronr-stripe`-workercode (staat alleen in het Cloudflare-dashboard). Hieronder
staat wat er inhoudelijk moet gebeuren -- pas het in op jouw bestaande
structuur en Stripe-API-key-gebruik (dezelfde secret key als bij
`/create-checkout` en `/portal`).

**Voorwaarde:** Stripe Connect moet aanstaan voor je Stripe-platformaccount
(Stripe Dashboard → Settings → Connect → zet standaard/Express accounts aan).
Dat is een instelling bij Stripe zelf, geen code.

---

## 1. `POST /create-connect-link`

Request:
```json
{ "salon_id": "uuid", "return_url": "https://kronr.nl/instellingen.html?stripe_connect_return=1#abonnement" }
```

Wat het moet doen:
1. Als de salon nog geen Stripe-koppeling heeft: maak een nieuw Express-
   account (`stripe.accounts.create({type: 'express', country: 'NL', ...})`)
   en sla het account-id NOG NIET op in Supabase (dat gebeurt pas na de
   succesvolle OAuth-koppeling, zie route 2) -- of sla 'm alvast op met
   status `in_behandeling` als je 'm meteen wilt kunnen traceren.
2. Maak een Account Link (`stripe.accountLinks.create({account, type:
   'account_onboarding', return_url, refresh_url: return_url})`)
3. Retourneer: `{"url": "<de account-link-url>"}`

De frontend redirect de gebruiker naar die URL. Stripe stuurt na het
onboarden de gebruiker terug naar `return_url` -- let op: Stripe's Express
onboarding werkt met Account Links, niet met de klassieke OAuth
`code`-flow. **Dit betekent dat route 2 hieronder in de praktijk niet nodig
is als je Account Links gebruikt** -- in plaats daarvan check je na
terugkomst gewoon of het account `charges_enabled` is
(`stripe.accounts.retrieve(account_id)`) en sla je die status op.

Ik heb de frontend (instellingen.html) wel gebouwd op een `?code=`-param in
de return-URL, wat past bij de KLASSIEKE Stripe Connect OAuth-flow (Standard
accounts). **Kies een van deze twee varianten en zeg het even welke je
gebruikt, dan pas ik instellingen.html aan als het de Account Links-variant
wordt** (scheelt een aanpassing aan `verwerkStripeConnectReturn()`).

## 2. `POST /exchange-connect-code` (alleen nodig bij de klassieke OAuth-variant)

Request: `{"salon_id": "uuid", "code": "ac_..."}`

```js
const resp = await stripe.oauth.token({ grant_type: 'authorization_code', code });
// resp.stripe_user_id is het connected account-id
```

Sla `resp.stripe_user_id` op in `salons.stripe_connect_account_id` en zet
`salons.stripe_connect_status = 'actief'`. Retourneer: `{"account_id": resp.stripe_user_id}`.

## 3. `POST /create-deposit-checkout`

Request:
```json
{
  "salon_id": "uuid", "afspraak_id": "uuid", "bedrag": 30, "email": "klant@mail.nl",
  "success_url": "https://.../boeken.html?aanbetaling=succes&afspraak=...",
  "cancel_url": "https://.../boeken.html?aanbetaling=geannuleerd&afspraak=..."
}
```

Wat het moet doen:
1. Haal `stripe_connect_account_id` op voor deze `salon_id` (uit Supabase,
   met de service-role key zoals je andere routes vermoedelijk al doen).
2. Maak een Checkout Session **op het connected account** (destination
   charge -- geld komt binnen bij de salon, Kronr kan optioneel een
   `application_fee_amount` afromen als je daar ooit voor kiest, nu niet
   verplicht):
   ```js
   const session = await stripe.checkout.sessions.create({
     mode: 'payment',
     payment_method_types: ['card', 'ideal'],
     line_items: [{
       price_data: {
         currency: 'eur',
         product_data: { name: 'Aanbetaling afspraak' },
         unit_amount: Math.round(bedrag * 100),
       },
       quantity: 1,
     }],
     customer_email: email,
     success_url,
     cancel_url,
     metadata: { afspraak_id, salon_id },
   }, { stripeAccount: connectedAccountId });
   ```
3. Retourneer: `{"url": session.url}`

## 4. Webhook: `checkout.session.completed` (BELANGRIJK, niet optioneel)

De frontend toont na de redirect al een bevestiging, maar dat is alleen de
UX -- de **waarheid** over of er echt betaald is moet via de webhook komen,
niet via de redirect (een klant kan de terug-pagina sluiten, of de redirect
kan om wat voor reden dan ook niet aankomen).

Je hebt vermoedelijk al een webhook-endpoint voor de gewone abonnementen
(`checkout.session.completed` voor de Stripe-subscriptions). Voeg hier een
route aan toe die **connected-account-events** afhandelt (Stripe Connect
webhooks komen apart binnen, met een `account`-veld in de event-payload):

```js
if (event.type === 'checkout.session.completed') {
  const session = event.data.object;
  const { afspraak_id } = session.metadata;
  if (afspraak_id) {
    await fetch(SUPABASE_URL + '/rest/v1/afspraken?id=eq.' + afspraak_id, {
      method: 'PATCH',
      headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ aanbetaling_status: 'betaald', stripe_payment_intent_id: session.payment_intent }),
    });
  }
}
```

Vergeet niet: dit webhook-endpoint moet je apart registreren bij Stripe
**op het platform-niveau met "Listen to Connect events" aangevinkt** (niet
de gewone webhook die je al hebt voor losse accounts) -- anders komen deze
events niet binnen.

---

## Testen na het deployen

1. Koppel een (test-mode) Stripe-account via Instellingen → Abonnement.
2. Zet bij een dienst een aanbetaling aan (Diensten → klik op "Aanbetaling: Geen").
3. Boek die dienst via `boeken.html`, gebruik een Stripe test-kaartnummer
   (4242 4242 4242 4242) bij de checkout.
4. Check in Supabase of `afspraken.aanbetaling_status` op `betaald` staat
   (via de webhook, niet alleen de redirect-pagina).
