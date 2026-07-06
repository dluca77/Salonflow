-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Marketing campagnes
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════

alter table klanten
  add column if not exists geboortedatum date,
  add column if not exists marketing_opt_out boolean not null default false;

create table if not exists marketing_campagnes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  onderwerp text not null,
  inhoud text not null,
  segment_type text not null check (segment_type in ('alle_klanten','inactief_60d','jarig_deze_maand')),
  aantal_ontvangers integer not null default 0,
  status text not null default 'concept' check (status in ('concept','verzonden','mislukt')),
  verzonden_op timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_campagnes_salon_idx on marketing_campagnes(salon_id);

alter table marketing_campagnes enable row level security;

drop policy if exists "marketing_campagnes_select_own_salon" on marketing_campagnes;
create policy "marketing_campagnes_select_own_salon" on marketing_campagnes
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
drop policy if exists "marketing_campagnes_insert_own_salon" on marketing_campagnes;
create policy "marketing_campagnes_insert_own_salon" on marketing_campagnes
  for insert with check (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
drop policy if exists "marketing_campagnes_update_own_salon" on marketing_campagnes;
create policy "marketing_campagnes_update_own_salon" on marketing_campagnes
  for update using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie workers/kronr-mail-campagnes-route.md voor het daadwerkelijk
-- versturen van een campagne naar het gekozen segment.
-- ══════════════════════════════════════════════════════════════════════
