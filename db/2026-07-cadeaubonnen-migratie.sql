-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Cadeaubonnen
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Scope van deze migratie: verkopen en inwisselen via de KASSA. Een
-- publieke online-verkooppagina (waar een klant zelf een cadeaubon kan
-- kopen via Stripe) komt later -- deze tabel is daar al wel klaar voor
-- (verkocht_via-kolom), maar de RPC/publieke koppeling daarvoor is er nu
-- nog niet.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists cadeaubonnen (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  code text not null,
  bedrag_origineel numeric(10,2) not null check (bedrag_origineel > 0),
  resterend_bedrag numeric(10,2) not null check (resterend_bedrag >= 0),
  gekocht_door_naam text,
  gekocht_door_email text,
  status text not null default 'actief' check (status in ('actief','ingewisseld')),
  verkocht_via text not null default 'kassa' check (verkocht_via in ('kassa','online')),
  created_at timestamptz not null default now(),
  constraint cadeaubonnen_code_per_salon unique (salon_id, code)
);

create index if not exists cadeaubonnen_code_idx on cadeaubonnen(salon_id, code);

alter table cadeaubonnen enable row level security;

drop policy if exists "cadeaubonnen_select_own_salon" on cadeaubonnen;
create policy "cadeaubonnen_select_own_salon" on cadeaubonnen
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

drop policy if exists "cadeaubonnen_insert_own_salon" on cadeaubonnen;
create policy "cadeaubonnen_insert_own_salon" on cadeaubonnen
  for insert with check (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

drop policy if exists "cadeaubonnen_update_own_salon" on cadeaubonnen;
create policy "cadeaubonnen_update_own_salon" on cadeaubonnen
  for update using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- Vastleggen welke cadeaubon (en hoeveel ervan) gebruikt is bij een
-- betaling -- nodig voor rapportage/audit en om te zien welke betalingen
-- deels met een cadeaubon zijn afgerekend.
alter table betalingen
  add column if not exists cadeaubon_code text,
  add column if not exists cadeaubon_bedrag_gebruikt numeric(10,2);

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad kassa.html eenmaal.
-- ══════════════════════════════════════════════════════════════════════
