# kronr-mail: uitbreiding van de bestaande Cron Trigger met terugkeer-herinneringen

**Voorwaarde:** `db/2026-07-terugkerende-afspraak-migratie.sql` moet gedraaid zijn.

De `scheduled()`-handler van `kronr-mail` draait al elk uur (zie
`kronr-mail-review-cron.md`, al live bevestigd tijdens deze sessie). Deze
uitbreiding voegt een TWEEDE taak toe aan diezelfde handler -- geen nieuwe
Cron Trigger nodig, gewoon een extra functie-aanroep naast
`verstuurReviewVerzoeken(env)`.

```js
export default {
  async fetch(request, env, ctx) { /* bestaande routes */ },
  async scheduled(event, env, ctx) {
    await verstuurReviewVerzoeken(env);      // bestaand
    await verstuurTerugkeerHerinneringen(env); // nieuw
  }
};
```

## De logica

**Stap 1 — kandidaten vinden.** Afgeronde afspraken waarvan de dienst een
`terugkeer_weken`-instelling heeft, de salon dit heeft aanstaan, de
herinnering nog niet verstuurd is, EN het ingestelde aantal weken
inmiddels is verstreken. Zelfde 24-uurs-venster-logica als bij
review-verzoeken (voorkomt dat elke afspraak keer op keer als kandidaat
wordt gezien totdat 'ie verwerkt is):

```sql
select a.id, a.klant_email, a.klant_naam, a.salon_id,
       s.naam as salon_naam, d.naam as dienst_naam, d.terugkeer_weken
from afspraken a
join salons s on s.id = a.salon_id
join diensten d on d.id = a.dienst_id
where s.terugkeer_herinnering_actief = true
  and a.status = 'afgerond'
  and a.terugkeer_herinnering_verzonden_op is null
  and d.terugkeer_weken is not null
  and a.klant_email is not null
  and a.datum_tijd between
    (now() - (d.terugkeer_weken || ' weeks')::interval - interval '1 hour')
    and (now() - (d.terugkeer_weken || ' weeks')::interval);
```

**Stap 2 — mail versturen** (zelfde patroon als bevestigingsmail/review-verzoek):

```
Onderwerp: Tijd voor je volgende {dienst_naam} bij {salon_naam}?
Body: Hoi {klant_naam}, het is alweer {terugkeer_weken} weken geleden sinds
je laatste {dienst_naam} bij {salon_naam}. Zin om weer een afspraak te
maken?
[Boek nu] -> https://kronr.nl/boeken/?salon={salon_id}
```

**Stap 3 — na verwerking:**
```sql
update afspraken set terugkeer_herinnering_verzonden_op = now() where id = $1;
```

## Getest

De query-logica (kandidaten binnen het juiste tijdvenster, uitgesloten
als al verzonden of dienst geen terugkeer_weken heeft) is qua opzet
consistent met de al-werkende review-verzoek-query uit dezelfde Worker.
Het daadwerkelijke mail-versturen kan ik niet vanaf hier testen -- check
na het toevoegen of de Cron Trigger-log (Cloudflare Dashboard →
kronr-mail → Triggers) beide functies zonder fouten doorloopt.
