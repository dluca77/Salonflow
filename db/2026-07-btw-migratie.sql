-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Prijs inclusief/exclusief btw per dienst
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Wat dit toevoegt:
--   diensten.prijs_incl_btw (boolean, default true) -- of de ingestelde
--   prijs van een dienst het totaalbedrag ís (btw wordt eruit berekend)
--   of dat btw er bovenop komt bij het boeken/afrekenen.
--
--   Default true: bestaande diensten worden dus automatisch behandeld
--   als "inclusief btw" na deze migratie -- dat is bewust, want dat is
--   ook de nieuwe standaardinstelling in het diensten-formulier.
-- ══════════════════════════════════════════════════════════════════════

alter table diensten
  add column if not exists prijs_incl_btw boolean not null default true;
