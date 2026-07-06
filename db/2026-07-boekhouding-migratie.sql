-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Boekhoudkoppeling (Moneybird)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Ontwerpkeuze: OAuth-tokens (access/refresh) staan in een APARTE tabel
-- ZONDER RLS-policies (RLS staat wel aan, maar er zijn bewust geen
-- policies voor anon/authenticated) -- alleen de Cloudflare Worker
-- (via de service-role key) kan hierbij, nooit de browser/client direct.
-- Dit is bewust strenger dan de overige tabellen in Kronr, omdat een
-- gelekt Moneybird-token toegang geeft tot de volledige boekhouding van
-- de salon bij Moneybird zelf, niet alleen tot Kronr-data.
-- ══════════════════════════════════════════════════════════════════════

alter table salons
  add column if not exists boekhouding_provider text
    check (boekhouding_provider in ('geen','moneybird')) default 'geen',
  add column if not exists moneybird_administration_id text,
  add column if not exists boekhouding_laatste_sync_fout text,
  add column if not exists boekhouding_laatste_sync_fout_op timestamptz;

create table if not exists boekhouding_tokens (
  salon_id uuid primary key references salons(id) on delete cascade,
  provider text not null check (provider in ('moneybird')),
  access_token text not null,
  refresh_token text not null,
  verloopt_op timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table boekhouding_tokens enable row level security;
-- Met opzet GEEN policies hier -- RLS zonder policies = standaard geen
-- toegang voor anon/authenticated, alleen de service-role (Worker) kan
-- via de service-role key nog altijd bij deze tabel (die negeert RLS).

alter table betalingen
  add column if not exists boekhouding_sync_status text
    check (boekhouding_sync_status in ('niet_gesynchroniseerd','gesynchroniseerd','mislukt'))
    default 'niet_gesynchroniseerd',
  add column if not exists moneybird_factuur_id text;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie workers/kronr-moneybird-routes.md voor de OAuth-koppeling
-- en de synchronisatielogica.
-- ══════════════════════════════════════════════════════════════════════
