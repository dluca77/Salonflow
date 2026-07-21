-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Ruimtes/resources naast medewerkers
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- WAAROM: het boekingsmodel was volledig gebouwd rond medewerkers als
-- enige schaarse resource. Voor spa/wellness-achtige salons is vaak de
-- RUIMTE (behandelkamer, massagebed, sauna) de echte beperkende factor,
-- soms los van wie er werkt. Dit voegt ruimtes toe als EXTRA, optionele
-- laag -- bestaande salons die alleen op medewerkers boeken merken hier
-- niets van (ruimtes zijn standaard niet vereist).
--
-- ONTWERP (bewust conservatief, i.v.m. risico op de bestaande, al-
-- geverifieerde medewerker-beschikbaarheidscheck): dit raakt de
-- bestaande get_bezette_tijden-RPC NIET aan (die staat alleen live in
-- Supabase, niet in deze repo, dus kan ik niet veilig blind aanpassen).
-- In plaats daarvan komt er een aparte, nieuwe RPC voor ruimte-
-- beschikbaarheid. Bij een dienst die 'vereist_ruimte' heeft, checkt
-- boeken.html straks ZOWEL medewerker- als ruimte-beschikbaarheid.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists ruimtes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  locatie_id uuid,
  naam text not null,
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ruimtes_salon_idx on ruimtes(salon_id, actief);

alter table ruimtes enable row level security;

drop policy if exists "ruimtes_select_eigen_salon" on ruimtes;
create policy "ruimtes_select_eigen_salon" on ruimtes
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

-- Publiek leesbaar (nodig voor de boekingswidget, net als medewerkers):
drop policy if exists "ruimtes_select_publiek" on ruimtes;
create policy "ruimtes_select_publiek" on ruimtes
  for select using (actief = true);

drop policy if exists "ruimtes_write_eigenaar" on ruimtes;
create policy "ruimtes_write_eigenaar" on ruimtes
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

alter table diensten add column if not exists vereist_ruimte boolean not null default false;
alter table afspraken add column if not exists ruimte_id uuid references ruimtes(id) on delete set null;

-- RPC: bezette ruimte-tijdvakken opvragen (publiek, net als de
-- medewerker-tegenhanger) -- geeft alleen tijd/duur/ruimte terug.
create or replace function get_bezette_ruimtes(p_salon_id uuid, p_datum_start timestamptz, p_datum_eind timestamptz)
returns table(ruimte_id uuid, datum_tijd timestamptz, duur_min integer)
security definer
language sql
stable
as $$
  select a.ruimte_id, a.datum_tijd, a.duur_min
  from afspraken a
  where a.salon_id = p_salon_id
    and a.ruimte_id is not null
    and a.status not in ('geannuleerd','no-show')
    and a.datum_tijd between p_datum_start and p_datum_eind;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Nieuwe pagina ruimtes/index.html voor beheer. diensten/index.html
-- heeft nu een 'vereist een ruimte'-schakelaar per dienst. boeken/index.html
-- checkt ruimte-beschikbaarheid ALS ALLEBEI (medewerker + ruimte) moeten
-- kloppen, voor diensten die vereist_ruimte hebben.
-- ══════════════════════════════════════════════════════════════════════
