-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Medewerkers-commissie
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor
-- (Project: pscybcirexnltqvziixt → SQL Editor → New query → plakken → Run)
--
-- Wat dit toevoegt:
--   1. Commissie-instellingen per medewerker (type/percentage/vast bedrag/basis)
--   2. Salon-brede default voor de commissie-basis
--   3. Nieuwe tabel verkoop_items: regel-niveau opslag van kassa-verkopen
--      MET medewerker-koppeling (kassa slaat momenteel alleen het totaal-
--      bedrag op, geen regels en geen medewerker — dat is nodig om
--      commissie op kassa-verkopen te kunnen berekenen)
--
-- LET OP over RLS: de policies hieronder gaan uit van het patroon
-- "salons.owner_id = auth.uid()" dat elders in de app gebruikt wordt.
-- Check zelf even of dat overeenkomt met hoe je RLS op de bestaande
-- tabellen (bv. betalingen, afspraken) hebt staan -- ik kan de database
-- niet inzien vanuit hier, dus pas aan als jouw patroon afwijkt.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Commissie-instellingen per medewerker ------------------------------
alter table medewerkers
  add column if not exists commissie_type text
    check (commissie_type in ('percentage','vast')),
  add column if not exists commissie_percentage numeric(5,2)
    check (commissie_percentage is null or (commissie_percentage >= 0 and commissie_percentage <= 100)),
  add column if not exists commissie_vast_bedrag numeric(10,2)
    check (commissie_vast_bedrag is null or commissie_vast_bedrag >= 0),
  add column if not exists commissie_basis text
    check (commissie_basis in ('dienst','totaal'));
  -- commissie_basis = null betekent: gebruik de salon-brede default hieronder

-- 2) Salon-brede default voor commissie-basis ---------------------------
alter table salons
  add column if not exists commissie_basis_default text
    not null default 'totaal'
    check (commissie_basis_default in ('dienst','totaal'));

-- 3) Nieuwe tabel: regels binnen een kassa-verkoop -----------------------
create table if not exists verkoop_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  betaling_id uuid not null references betalingen(id) on delete cascade,
  medewerker_id uuid references medewerkers(id) on delete set null,
  naam text not null,
  type text not null check (type in ('dienst','product','fooi')),
  prijs numeric(10,2) not null,
  aantal integer not null default 1,
  totaal numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists verkoop_items_salon_idx on verkoop_items(salon_id);
create index if not exists verkoop_items_betaling_idx on verkoop_items(betaling_id);
create index if not exists verkoop_items_medewerker_idx on verkoop_items(medewerker_id);

alter table verkoop_items enable row level security;

-- Salon-eigenaar mag zijn eigen verkoop_items lezen/aanmaken
drop policy if exists "verkoop_items_select_own_salon" on verkoop_items;
create policy "verkoop_items_select_own_salon" on verkoop_items
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

drop policy if exists "verkoop_items_insert_own_salon" on verkoop_items;
create policy "verkoop_items_insert_own_salon" on verkoop_items
  for insert with check (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad kassa.html / medewerkers.html /
-- instellingen.html / rapportages.html eenmaal zodat de nieuwe kolommen
-- meegenomen worden.
-- ══════════════════════════════════════════════════════════════════════
