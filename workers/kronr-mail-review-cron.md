# kronr-mail: nieuwe Cron Trigger voor automatische review-verzoeken

Net als bij de andere Worker-docs: ik heb geen zicht op je bestaande
`kronr-mail`-workercode. Hieronder staat wat er inhoudelijk moet gebeuren.
Dit keer geen HTTP-route maar een **Cron Trigger** -- een geplande taak die
Cloudflare zelf periodiek aanroept, zonder dat de frontend iets doet.

**Voorwaarde:** voer eerst `db/2026-07-review-verzameling-migratie.sql` uit.

## 1. Cron Trigger instellen

In `wrangler.toml` van kronr-mail (of via het Cloudflare-dashboard →
Workers → kronr-mail → Settings → Triggers → Cron Triggers):

```toml
[triggers]
crons = ["0 * * * *"]  # elk uur
```

En in de Worker-code een `scheduled`-handler toevoegen naast je bestaande
`fetch`-handler:

```js
export default {
  async fetch(request, env, ctx) { /* je bestaande routes (/bevestiging, /klant-briefing, etc.) */ },
  async scheduled(event, env, ctx) {
    await verstuurReviewVerzoeken(env);
  }
};
```

## 2. De logica (getest -- zie onder)

**Stap 1 — kandidaten vinden.** Afspraken die 24-48 uur geleden afgerond
zijn, review_verzoek_verzonden_op nog leeg, en de salon heeft het
programma aan staan:

```sql
select a.id, a.klant_email, a.klant_naam, a.salon_id,
       s.naam as salon_naam, s.google_review_link
from afspraken a
join salons s on s.id = a.salon_id
where s.review_verzoek_actief = true
  and a.status = 'afgerond'
  and a.review_verzoek_verzonden_op is null
  and a.klant_email is not null
  and a.datum_tijd between (now() - interval '48 hours') and (now() - interval '24 hours');
```

Het venster van 24-48u (i.p.v. "ouder dan 24u") is bewust: de cron draait
elk uur, dus zonder een boven-grens zou je bij elke run ALLE oude,
al-lang-voorbije afspraken opnieuw opvragen totdat ze verwerkt zijn. Met
dit venster verwerk je elke afspraak precies 1x, binnen een paar uur na
het bereiken van de 24u-grens.

**Stap 2 — per kandidaat: niet te vaak lastigvallen.** Check of deze
klant (op e-mailadres, binnen deze salon) al in de laatste 90 dagen een
verzoek kreeg:

```sql
select exists(
  select 1 from afspraken
  where salon_id = $1
    and klant_email = $2
    and review_verzoek_verzonden_op > now() - interval '90 days'
) as al_recent_gehad;
```

- Zo ja: **sla het versturen over**, maar zet
  `review_verzoek_verzonden_op = now()` op déze afspraak alsnog (anders
  blijft de cron 'm elk uur opnieuw als kandidaat zien).
- Zo nee: verstuur de mail (zie stap 3), en zet dan
  `review_verzoek_verzonden_op = now()`.

**Stap 3 — mail versturen.** Hergebruik je bestaande mail-verzendlogica
(zelfde patroon als de bevestigingsmail), met onderwerp/inhoud zoals:

```
Onderwerp: Hoe was je bezoek bij {salon_naam}?
Body: Hoi {klant_naam}, we hopen dat je bezoek aan {salon_naam} goed
bevallen is! Zou je een paar seconden willen nemen om een review te
schrijven? Dat helpt ons enorm.
[Schrijf een review] -> {google_review_link}
```

**Stap 4 — na verwerking (of overslaan):**
```sql
update afspraken set review_verzoek_verzonden_op = now() where id = $1;
```

## Getest

De query-logica in stap 1 en 2 is al echt tegen een lokaal geinstalleerde
PostgreSQL-instantie gedraaid met 4 scenario's (te vroeg/net op tijd/niet
afgerond/al recent gehad) -- zie het testverslag in de sessie. De
Cloudflare Cron Trigger zelf en het daadwerkelijke mail-versturen kan ik
niet vanaf hier testen; check na het deployen of de cron draait via
Cloudflare Dashboard → kronr-mail → Triggers (je ziet daar de laatste
executie-tijd en of die geslaagd is).
