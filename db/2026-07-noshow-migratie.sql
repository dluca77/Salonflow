-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: No-show-bescherming
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- Vereist dat Stripe Connect al gekoppeld is (db/2026-07-stripe-
-- aanbetaling-migratie.sql) -- deze feature hergebruikt die koppeling.
--
-- Ontwerp: bij het boeken van een dienst die dit vereist, legt de klant
-- kaartgegevens vast via een Stripe SetupIntent (GEEN afschrijving op
-- dat moment). Als de afspraak later op 'no-show' wordt gezet, kan de
-- salon vanuit de agenda een vast bedrag incasseren op die vastgelegde
-- kaart (off-session charge).
-- ══════════════════════════════════════════════════════════════════════

-- 1) Per dienst instelbaar of kaartgegevens verplicht zijn ----------------
alter table diensten
  add column if not exists vereist_kaartgegevens boolean not null default false;

-- 2) Salon-instelling: het vaste no-show-bedrag ---------------------------
alter table salons
  add column if not exists noshow_fee_bedrag numeric(10,2)
    check (noshow_fee_bedrag is null or noshow_fee_bedrag >= 0);

-- 3) Vastgelegde kaartgegevens + status per afspraak ----------------------
alter table afspraken
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists noshow_fee_status text
    check (noshow_fee_status in ('niet_vereist','in_afwachting','vastgelegd','geincasseerd','mislukt'))
    default 'niet_vereist';

create index if not exists afspraken_noshow_idx on afspraken(salon_id, noshow_fee_status);

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad instellingen.html / diensten.html /
-- boeken.html / agenda.html eenmaal. Voor de daadwerkelijke SetupIntent-
-- flow en het incasseren is ook een Worker-uitbreiding nodig -- zie
-- workers/kronr-stripe-noshow-routes.md
-- ══════════════════════════════════════════════════════════════════════
