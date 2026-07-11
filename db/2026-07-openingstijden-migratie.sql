-- Openingstijden per dag van de week. Bestond nog nergens als echt
-- data-model -- de boekingswidget gebruikte tot nu toe hardgecodeerde
-- placeholder-tijden (09:00-17:30) die niks met de werkelijkheid te
-- maken hadden.
alter table salons add column if not exists openingstijden jsonb default '{
  "maandag":   {"open": "09:00", "dicht": "18:00", "gesloten": false},
  "dinsdag":   {"open": "09:00", "dicht": "18:00", "gesloten": false},
  "woensdag":  {"open": "09:00", "dicht": "18:00", "gesloten": false},
  "donderdag": {"open": "09:00", "dicht": "18:00", "gesloten": false},
  "vrijdag":   {"open": "09:00", "dicht": "18:00", "gesloten": false},
  "zaterdag":  {"open": "09:00", "dicht": "17:00", "gesloten": false},
  "zondag":    {"open": null,    "dicht": null,     "gesloten": true}
}'::jsonb;
