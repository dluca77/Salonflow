# kronr-mail: nieuwe route `/campagne`

Zelfde format als de andere Worker-docs.

## `POST /campagne`

Request:
```json
{
  "salon_naam": "Kapsalon Test",
  "onderwerp": "We missen je!",
  "inhoud": "Kom gauw weer langs, 15% korting deze maand.",
  "ontvangers": [{"naam": "Fatima", "email": "fatima@mail.nl", "afmeld_token": "uuid"}, ...]
}
```

Wat het moet doen: verstuur de mail naar elke ontvanger, met de naam
gepersonaliseerd. Belangrijk:

- **Batchen**: bij grotere klantenlijsten (100+) niet alles in 1x naar
  Resend sturen -- check Resend's rate limits en batch/spreid indien nodig.
- **Onderwerp/inhoud zijn vrije tekst van de salon-eigenaar** -- render
  dit als platte tekst in de mail-body (geen HTML-injectie toestaan als
  je het ooit naar HTML omzet).
- **Afmeld-link is AL GEBOUWD** (correctie t.o.v. een eerdere versie van
  dit document, die hem nog als ontbrekend beschreef): `klanten.afmeld_token`,
  de RPC `meld_af_marketing(p_token)` en de publieke pagina `afmelden/index.html`
  bestaan al (zie `db/2026-07-afmelden-migratie.sql`). `klanten/index.html`
  geeft `afmeld_token` ook al mee per ontvanger in de request hierboven --
  deze Worker-route hoeft het dus alleen nog te GEBRUIKEN: bouw per
  ontvanger de link `https://kronr.nl/afmelden/?token={ontvanger.afmeld_token}`
  en zet die onderaan de mail. Er is geen aparte pagina meer nodig, alleen
  deze regel in de route.

```
Onderwerp: {onderwerp}
Body: Hoi {naam},

{inhoud}

—
{salon_naam}

Wil je geen marketing-e-mails meer ontvangen? Meld je af: https://kronr.nl/afmelden/?token={afmeld_token}
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
