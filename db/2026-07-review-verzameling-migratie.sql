-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Automatische review-verzameling
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Ontwerp: het daadwerkelijke versturen gebeurt via een Cloudflare Cron
-- Trigger op kronr-mail (zie workers/kronr-mail-review-cron.md) -- deze
-- migratie legt alleen de benodigde kolommen vast waarop die cron kan
-- filteren.
-- ══════════════════════════════════════════════════════════════════════

alter table salons
  add column if not exists review_verzoek_actief boolean not null default false,
  add column if not exists google_review_link text;

alter table afspraken
  add column if not exists review_verzoek_verzonden_op timestamptz;

-- Voor de cron-query: snel alle 'rijpe' afspraken vinden zonder de hele
-- tabel te scannen.
create index if not exists afspraken_review_kandidaten_idx
  on afspraken(salon_id, status, datum_tijd)
  where review_verzoek_verzonden_op is null;

-- Voor de 'niet te vaak lastigvallen'-check: snel de laatste verzoek-datum
-- per klant_email opzoeken.
create index if not exists afspraken_review_klant_idx
  on afspraken(salon_id, klant_email, review_verzoek_verzonden_op);

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad instellingen.html eenmaal, en zie
-- workers/kronr-mail-review-cron.md voor de Cloudflare Cron Trigger.
-- ══════════════════════════════════════════════════════════════════════
