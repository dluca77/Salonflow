# kronr-ai: nieuwe route `/prijsadvies`

Deze route bestaat nog niet in je Cloudflare Worker `kronr-ai`. Ik heb geen
zicht op je bestaande workercode (die staat alleen in het Cloudflare-
dashboard), dus hieronder staat wat er *inhoudelijk* moet gebeuren -- pas
het aan op jouw bestaande routing-structuur en de manier waarop je nu al
de Claude/Anthropic-API aanroept bij `/` (dashboard-inzichten) en
`/klant-briefing`.

## Wat de route moet doen

1. Request: `POST /prijsadvies` met JSON body:
   ```json
   {
     "salon_naam": "Kapsalon Test",
     "diensten": [{"naam": "Knippen", "prijs": 45, "aantal": 12}, ...],
     "tijdslots": [{"slot": "maandag ochtend", "aantal": 8}, ...],
     "totaal_boekingen": 34
   }
   ```
   `diensten` is gesorteerd op `aantal` (meest geboekt eerst).
   `tijdslots` is gesorteerd op `aantal` (drukste eerst) -- format is
   `"<dag> <dagdeel>"` met dagdeel ochtend/middag/avond.

2. Prompt Claude (zelfde model/aanroep-patroon als je andere routes) om
   op basis van deze boekingsdichtheid 2-4 CONCRETE prijsadvies-suggesties
   te geven. Belangrijk voor de prompt:
   - Wees expliciet dat dit *boekingsfrequentie* is, geen exacte
     bezettingsgraad (we weten niet hoeveel capaciteit er was, alleen
     hoeveel er geboekt is) -- laat Claude dat ook zo voorzichtig
     formuleren, geen overclaimen van precisie die er niet is.
   - Concreet = liefst met een richtbedrag of -percentage, en welke
     dienst/tijdslot het betreft.
   - Nederlands, kort (max ~2 zinnen per suggestie).

3. Response: JSON in dit exacte formaat (de frontend leest dit letterlijk zo):
   ```json
   {
     "suggesties": [
       {"dienst": "Knippen", "tekst": "Knippen is je populairste dienst op maandagochtend -- overweeg daar een toeslag van €5-10."},
       {"dienst": "Balayage", "tekst": "Balayage-vraag groeit; een prijsverhoging van €10-15 is waarschijnlijk goed te verdedigen."},
       {"dienst": null, "tekst": "Vrijdagavond is structureel rustig -- een tijdelijke off-peak korting kan de bezetting verhogen."}
     ]
   }
   ```
   - `dienst`: de exacte dienstnaam zoals meegegeven in de request, ALS de
     suggestie over 1 specifieke dienst gaat. Anders `null`.
     Dit veld wordt in de app gebruikt om de suggestie automatisch bij de
     juiste dienst te tonen (in Diensten) -- moet dus exact matchen
     (case-insensitive) met een van de namen uit `diensten[].naam`.
   - `tekst`: de suggestie zelf, in gewone tekst (geen markdown).

## Voorbeeld routehandler (pseudo-structuur -- pas aan naar jouw stijl)

```js
if (url.pathname === '/prijsadvies' && request.method === 'POST') {
  const { salon_naam, diensten, tijdslots, totaal_boekingen } = await request.json();

  const prompt = `Je bent een prijsadviseur voor een Nederlandse salon ("${salon_naam}").
Op basis van boekingsFREQUENTIE (niet exacte bezettingsgraad, want de
beschikbare capaciteit is onbekend) van de laatste 8 weken:

Diensten (meest geboekt eerst): ${JSON.stringify(diensten)}
Tijdslots (drukste eerst): ${JSON.stringify(tijdslots)}
Totaal aantal boekingen: ${totaal_boekingen}

Geef 2-4 concrete, korte prijsadvies-suggesties in het Nederlands. Wees
voorzichtig met precisie-claims (het is boekingsdichtheid, geen bewezen
bezettingsgraad). Antwoord ALLEEN met geldige JSON in dit formaat, zonder
markdown-codeblok eromheen:
{"suggesties":[{"dienst":"<exacte naam of null>","tekst":"<max 2 zinnen>"}]}`;

  // Gebruik hier dezelfde Anthropic-aanroep als in je andere routes
  const aiResponse = await callClaude(prompt); // <- jouw bestaande functie/patroon

  let suggesties;
  try {
    suggesties = JSON.parse(aiResponse).suggesties;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Kon AI-response niet parsen' }), { status: 500 });
  }

  return new Response(JSON.stringify({ suggesties }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
```

## Testen na het deployen

Open `rapportages.html`, open de devtools-console, en check of er geen
`AI-prijsadvies niet beschikbaar`-warning verschijnt. Zonder de route (of
bij een fout) valt de app automatisch terug op een simpel regelgebaseerd
advies -- de pagina breekt dus nooit, maar je AI-advies verschijnt pas
zodra deze route live staat.
