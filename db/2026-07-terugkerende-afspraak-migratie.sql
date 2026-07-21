-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Terugkerende-afspraak-herinnering
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Wat dit toevoegt: instelbaar per dienst na hoeveel weken een klant een
-- herinneringsmail krijgt om opnieuw te boeken (bv. "elke 5 weken
-- knippen"). Het daadwerkelijke versturen gebeurt via dezelfde
-- Cloudflare Cron Trigger als de al-actieve review-verzameling (kronr-mail,
-- draait al elk uur) -- zie workers/kronr-mail-terugkeer-cron.md voor de
-- toe te voegen logica in die bestaande scheduled()-handler.
-- ══════════════════════════════════════════════════════════════════════

alter table diensten
  add column if not exists terugkeer_weken integer;
  -- null = geen herinnering voor deze dienst. Positief getal = aantal
  -- weken na de afgeronde afspraak waarna de herinnering verstuurd wordt.

alter table salons
  add column if not exists terugkeer_herinnering_actief boolean not null default false;

alter table afspraken
  add column if not exists terugkeer_herinnering_verzonden_op timestamptz;

-- Index voor de cron-query (kandidaten vinden zonder volledige table scan)
create index if not exists afspraken_terugkeer_kandidaat_idx
  on afspraken(status, terugkeer_herinnering_verzonden_op)
  where status = 'afgerond' and terugkeer_herinnering_verzonden_op is null;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie diensten/index.html ('Terugkeer-herinnering na X weken'-veld)
-- en instellingen/index.html (hoofdschakelaar) voor de UI, en
-- workers/kronr-mail-terugkeer-cron.md voor de worker-uitbreiding.
-- ══════════════════════════════════════════════════════════════════════
