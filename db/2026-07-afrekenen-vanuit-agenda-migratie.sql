-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Afrekenen vanuit de agenda (koppeling afspraken ↔ kassa)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- Vereist dat db/2026-07-commissie-migratie.sql al gedraaid is.
--
-- Wat dit toevoegt:
--   Een link tussen een kassa-betaling en de afspraak waar die betaling
--   (optioneel) bij hoort. Nodig om te voorkomen dat omzet/commissie
--   dubbel geteld wordt wanneer een afspraak via de agenda wordt
--   afgerekend (in plaats van de status los op 'afgerond' te zetten).
-- ══════════════════════════════════════════════════════════════════════

alter table betalingen
  add column if not exists afspraak_id uuid references afspraken(id) on delete set null;

create index if not exists betalingen_afspraak_idx on betalingen(afspraak_id);

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad agenda.html en kassa.html eenmaal.
-- ══════════════════════════════════════════════════════════════════════
