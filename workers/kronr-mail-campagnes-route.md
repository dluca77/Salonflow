# kronr-mail: nieuwe route `/campagne`

Zelfde format als de andere Worker-docs.

## `POST /campagne`

Request:
```json
{
  "salon_naam": "Kapsalon Test",
  "onderwerp": "We missen je!",
  "inhoud": "Kom gauw weer langs, 15% korting deze maand.",
  "ontvangers": [{"naam": "Fatima", "email": "fatima@mail.nl"}, ...]
}
```

Wat het moet doen: verstuur de mail naar elke ontvanger, met de naam
gepersonaliseerd. Belangrijk:

- **Batchen**: bij grotere klantenlijsten (100+) niet alles in 1x naar
  Resend sturen -- check Resend's rate limits en batch/spreid indien nodig.
- **Onderwerp/inhoud zijn vrije tekst van de salon-eigenaar** -- render
  dit als platte tekst in de mail-body (geen HTML-injectie toestaan als
  je het ooit naar HTML omzet).
- **Afmeld-link**: voeg een simpele "Uitschrijven"-link toe onderaan elke
  mail. Dit vereist een klein extra stukje wat nu nog niet gebouwd is:
  een publieke pagina/RPC om `klanten.marketing_opt_out` op true te
  zetten op basis van een token in de link (zelfde patroon als
  annuleren.html/stempelkaart.html). Voor nu: verwijs desnoods naar
  "Neem contact op met de salon om je uit te schrijven" totdat die
  pagina gebouwd is -- juridisch is een opt-out-mogelijkheid wel
  verplicht bij marketing-mail (AVG/telecommunicatiewet), dus dit moet
  op korte termijn alsnog toegevoegd worden.

```
Onderwerp: {onderwerp}
Body: Hoi {naam},

{inhoud}

—
{salon_naam}

Wil je geen marketing-e-mails meer ontvangen? [Uitschrijven] (nog te bouwen)
```

Retourneer 200 OK als het versturen (grotendeels) gelukt is, of een
foutcode als het volledig mislukt is -- de frontend zet de campagne dan
op status 'mislukt' i.p.v. 'verzonden'.

## Getest

De segment-berekening (alle klanten met e-mail/niet-uitgeschreven, niet
geweest in 60+ dagen inclusief klanten die nog nooit geweest zijn,
jarig deze maand) en de volledige verstuur-flow (juiste ontvangerslijst
doorgegeven, opt-out en klanten zonder e-mail correct uitgesloten,
status bijgewerkt na succes/falen) zijn getest met een gesimuleerde
Worker-response. Het daadwerkelijke e-mail-versturen zelf, en de nog
niet gebouwde afmeld-pagina, kan ik niet vanaf hier testen/bouwen binnen
deze sessie.
