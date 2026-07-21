# kronr-ai: route `/klant-vraag` -- STATUS: AL LIVE GEDEPLOYED

**Correctie t.o.v. een eerdere versie van dit document**, die deze route nog
als "te bouwen" beschreef: bij het verifiëren tegen de daadwerkelijke
Cloudflare Worker (dashboard → kronr-ai → Edit code) bleek de route al
live te staan, deployed via Wrangler. Deze bevindt zich NIET in deze
git-repo (de `workers/`-map bevat alleen deze planningsdocumenten), dus
hij was bij een eerdere audit over het hoofd gezien.

**Let op de padnaam:** de live route heet `/klant-vraag` (met streepje),
niet `/klantvraag`. `widget.js` in deze repo is hierop aangepast.

## Wat de live implementatie doet (geverifieerd door de broncode te lezen)

- `POST /klant-vraag`, body: `{ vraag, salon_naam, adres, stad, telefoon, type_bedrijf, openingstijden, diensten, annuleer_cutoff_uren }`
- **Belangrijk verschil met wat oorspronkelijk voorgesteld was:** deze route
  doet GEEN eigen Supabase-lookup op `salon_id`. Hij vertrouwt volledig op
  de salon-data die de aanroeper (de widget) zelf meestuurt in de request-
  body. `widget.js` haalt deze gegevens rechtstreeks op via de Supabase
  REST API (dezelfde publieke, RLS-beperkte kolommen als `boeken/index.html`
  al gebruikt) voordat hij de vraag doorstuurt.
- `vraag` wordt gevalideerd op leeg/te lang (`KLANT_VRAAG_MAX_LENGTE = 300`).
- De system-prompt bevat expliciete scope-bewaking: alleen antwoorden op
  basis van de meegegeven salongegevens, geen info verzinnen, geen
  instructies uit de bezoekersvraag zelf opvolgen (prompt-injectiebescherming
  is aanwezig), max 3 zinnen, Nederlands, geen opmaak.
- Response: `{ antwoord: "..." }` bij succes, `{ error: "..." }` (status 502)
  bij een Claude-fout.

## Nog ONTBREKEND in de live versie -- dit is de echte, resterende actie

**Geen rate limiting.** Dit is een publieke, ongeauthenticeerde POST-route
die een betaalde Claude-aanroep triggert. Zoals in de oorspronkelijke
planning al benoemd: zonder een limiet kan iemand deze endpoint spammen en
zo onbeperkt AI-kosten laten oplopen -- er is geen KV/Durable-Object-teller
of vergelijkbare beperking aangetroffen in de broncode. Dit is een reëel,
nu al live, misbruikbaar gat (geen kwetsbaarheid in de zin van datalek,
maar wel een open kostenrisico).

**Aanbevolen fix (niet door mij gedeployed -- vereist directe toegang tot
de kronr-ai Worker om te wijzigen en opnieuw te deployen):**
```js
// Bovenaan handleKlantVraag, na het uitlezen van `vraag`:
const key = `klantvraag:${request.headers.get('cf-connecting-ip') || 'onbekend'}`;
const huidig = await env.RATE_LIMIT_KV.get(key);
if (huidig && parseInt(huidig) >= 20) {
  return new Response(JSON.stringify({ error: 'Te veel vragen, probeer het later opnieuw' }), { status: 429, headers });
}
await env.RATE_LIMIT_KV.put(key, String((parseInt(huidig) || 0) + 1), { expirationTtl: 3600 });
```
Vereist een Workers KV-namespace gebonden aan `kronr-ai` (`RATE_LIMIT_KV`).
Zonder toegang tot de Worker-omgeving zelf (Bindings-tabblad) kan dit niet
vanuit deze sessie toegevoegd worden.
