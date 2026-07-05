-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Stripe aanbetaling bij boeken (Stripe Connect)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Wat dit toevoegt:
--   1. Koppeling van de salon aan een eigen Stripe-account (Stripe Connect)
--   2. Per-dienst instelling of en hoeveel aanbetaling vereist is
--   3. Aanbetalingsstatus/-bedrag per afspraak
-- ══════════════════════════════════════════════════════════════════════

-- 1) Stripe Connect-koppeling op salon-niveau -----------------------------
alter table salons
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_status text
    check (stripe_connect_status in ('niet_gekoppeld','in_behandeling','actief'))
    default 'niet_gekoppeld';

-- 2) Aanbetaling-instelling per dienst -------------------------------------
alter table diensten
  add column if not exists aanbetaling_type text
    check (aanbetaling_type in ('percentage','vast')),
  add column if not exists aanbetaling_bedrag numeric(10,2)
    check (aanbetaling_bedrag is null or aanbetaling_bedrag >= 0);
  -- aanbetaling_type = null betekent: geen aanbetaling vereist voor deze dienst

-- 3) Aanbetaling-tracking per afspraak --------------------------------------
alter table afspraken
  add column if not exists aanbetaling_status text
    check (aanbetaling_status in ('niet_vereist','in_afwachting','betaald','mislukt'))
    default 'niet_vereist',
  add column if not exists aanbetaling_bedrag numeric(10,2),
  add column if not exists stripe_payment_intent_id text;

create index if not exists afspraken_payment_intent_idx on afspraken(stripe_payment_intent_id);

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad instellingen.html / diensten.html /
-- boeken.html eenmaal. Voor de daadwerkelijke Stripe Connect-koppeling en
-- het afrekenen van de aanbetaling is ook een Worker-uitbreiding nodig --
-- zie workers/kronr-stripe-connect-routes.md
-- ══════════════════════════════════════════════════════════════════════
