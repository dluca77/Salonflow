-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Staffelprijzen/varianten per dienst
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- WAAROM: sommige branches hebben geen vaste prijs/duur per dienst --
-- een hondentrimsalon rekent "Trimmen" heel anders af voor een chihuahua
-- dan voor een Bernese Sennenhond. Tot nu toe moest je daarvoor per maat
-- een aparte dienst aanmaken. Deze migratie voegt optionele varianten toe
-- aan een dienst (bv. "Klein hondje" / "Middelgroot" / "Groot hondje"),
-- elk met eigen prijs en duur. Een dienst ZONDER varianten werkt exact
-- zoals voorheen (eigen prijs/duur) -- volledig achterwaarts compatibel.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists dienst_varianten (
  id uuid primary key default gen_random_uuid(),
  dienst_id uuid not null references diensten(id) on delete cascade,
  salon_id uuid not null references salons(id) on delete cascade,
  naam text not null,
  prijs numeric not null,
  duur_min integer not null,
  volgorde integer not null default 0,
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists dienst_varianten_dienst_idx on dienst_varianten(dienst_id, actief, volgorde);

alter table dienst_varianten enable row level security;

drop policy if exists "dienst_varianten_select_eigen_salon" on dienst_varianten;
create policy "dienst_varianten_select_eigen_salon" on dienst_varianten
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

-- Publiek leesbaar (nodig voor de boekingswidget, net als diensten zelf):
drop policy if exists "dienst_varianten_select_publiek" on dienst_varianten;
create policy "dienst_varianten_select_publiek" on dienst_varianten
  for select using (actief = true);

drop policy if exists "dienst_varianten_write_eigenaar" on dienst_varianten;
create policy "dienst_varianten_write_eigenaar" on dienst_varianten
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

alter table afspraken add column if not exists dienst_variant_id uuid references dienst_varianten(id) on delete set null;
alter table afspraak_extra_diensten add column if not exists dienst_variant_id uuid references dienst_varianten(id) on delete set null;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. diensten/index.html krijgt een 'Varianten'-beheerscherm per
-- dienst (mirror van het bestaande aanbetaling-modal-patroon).
-- boeken/index.html toont, als een dienst varianten heeft, een keuzestap
-- vóórdat prijs/duur in de state komen te staan.
-- ══════════════════════════════════════════════════════════════════════
