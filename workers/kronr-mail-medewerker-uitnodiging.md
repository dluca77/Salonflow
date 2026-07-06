# kronr-mail: nieuwe route `/medewerker-uitnodiging`

Zelfde format als de andere Worker-docs.

## `POST /medewerker-uitnodiging`

Request:
```json
{
  "email": "sanne@test.nl",
  "naam": "Sanne Bakker",
  "salon_naam": "Kapsalon Test",
  "activatie_link": "https://kronr.nl/medewerker-activeren.html?token=..."
}
```

Verstuur een e-mail (zelfde patroon als je bevestigingsmail):

```
Onderwerp: Je bent uitgenodigd bij {salon_naam} op Kronr
Body: Hoi {naam}, {salon_naam} heeft je uitgenodigd om je eigen rooster
en verlofaanvragen te beheren via Kronr. Klik op onderstaande link om je
account te activeren:
[Account activeren] -> {activatie_link}
```

Retourneer 200 OK. Als het versturen faalt, hoeft dat niet de hele
uitnodig-actie in de app te breken (die is al gebeurd in de database) --
de eigenaar kan de knop 'Opnieuw uitnodigen' gebruiken.

## Getest

De volledige flow eromheen (RPC voor het aanmaken van de uitnodiging,
het bewaren van het token, de activatiepagina die het token opzoekt, de
koppeling na account-aanmaak) is grondig getest -- zowel de database-
laag (echt tegen lokale PostgreSQL, inclusief RLS-lekpogingen) als de
frontend (browser-e2e). Alleen het daadwerkelijke e-mail-versturen zelf
kan ik niet vanaf hier testen.
