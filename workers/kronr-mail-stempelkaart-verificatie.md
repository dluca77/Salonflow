# kronr-mail: nieuwe route `/stempelkaart-code`

Zelfde format als de andere kronr-mail-routes (bevestigingsmail, review-
verzoek). **Vereist** dat `db/2026-07-stempelkaart-verificatie-migratie.sql`
al gedraaid is.

## `POST /stempelkaart-code`

Request:
```json
{ "salon_id": "uuid", "email": "klant@mail.nl", "code": "123456" }
```

Wat het moet doen: stuur de code naar het opgegeven e-mailadres. Haal de
salonnaam op (`select naam from salons where id = salon_id`) voor een
gepersonaliseerd onderwerp.

```
Onderwerp: Jouw verificatiecode voor {salon_naam}
Body: Hoi,

Gebruik deze code om je stempelkaart bij {salon_naam} te bekijken:

{code}

Deze code is 10 minuten geldig. Heb je dit niet aangevraagd? Dan kun je
deze mail negeren.

—
{salon_naam} via Kronr
```

Retourneer 200 OK ongeacht of het e-mailadres wel/niet bij een bekende
klant hoort -- dit is bewust (geen "dit e-mailadres bestaat niet"-lek).
De frontend toont sowieso de code-invoerstap na het aanvragen; als het
mailtje niet aankomt merkt de klant dat vanzelf (geen code ontvangen) en
kan opnieuw aanvragen.

## Belangrijk: geen rate limiting hier nodig

De aanroepende RPC (`vraag_stempelkaart_code_aan`) hergebruikt de
bestaande `stempelkaart_lookup_pogingen`-rate-limit (max 5x per salon+
e-mail per uur), dus deze route hoeft dat niet nog eens te doen -- de
route wordt hoe dan ook niet vaker aangeroepen dan die limiet toestaat.

## Getest

Niet vanaf hier te testen (vereist een echte Resend-verzending). Test na
het toevoegen door op `stempelkaart/index.html` een code aan te vragen en
te checken of de mail binnenkomt met de juiste code.
