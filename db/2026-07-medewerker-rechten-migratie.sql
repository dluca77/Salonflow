-- Rechten per medewerker: welke onderdelen mag deze medewerker zien
-- en/of bewerken. Waarden per module: 'geen', 'bekijken', 'bewerken'
-- (kassa heeft alleen 'geen'/'gebruiken', geen 'bekijken'-tussenvorm).
alter table medewerkers add column if not exists rechten jsonb default '{
  "agenda": "bewerken",
  "klanten": "bekijken",
  "kassa": "geen",
  "diensten": "bekijken",
  "rapportages": "geen"
}'::jsonb;
