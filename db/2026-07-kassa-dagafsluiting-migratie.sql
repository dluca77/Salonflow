-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Kassa-dagafsluiting
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Wat dit toevoegt: aan het einde van de dag telt een medewerker de
-- kasla (alleen 'contant' heeft fysiek geld nodig -- pin/iDEAL/cadeaubon
-- zijn digitaal en hoeven niet geteld te worden). Het systeemtotaal per
-- betaalmethode wordt server-side berekend uit `betalingen` (niet door de
-- client aangeleverd), het geteld bedrag komt van de medewerker, en het
-- verschil wordt gelogd zodat de eigenaar afwijkingen kan zien.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists kassa_afsluitingen (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  locatie_id uuid,
  medewerker_id uuid references medewerkers(id) on delete set null,
  datum date not null default current_date,
  systeem_pin numeric not null default 0,
  systeem_contant numeric not null default 0,
  systeem_ideal numeric not null default 0,
  systeem_cadeaubon numeric not null default 0,
  geteld_contant numeric not null,
  verschil numeric not null,
  notitie text,
  afgesloten_op timestamptz not null default now(),
  afgesloten_door_naam text
);

create index if not exists kassa_afsluitingen_salon_datum_idx
  on kassa_afsluitingen(salon_id, datum desc);

alter table kassa_afsluitingen enable row level security;

drop policy if exists "kassa_afsluitingen_select_own_salon" on kassa_afsluitingen;
create policy "kassa_afsluitingen_select_own_salon" on kassa_afsluitingen
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

-- RPC: dag afsluiten. Berekent het systeemtotaal zelf (niet vertrouwd van
-- de client) en slaat het verschil t.o.v. het getelde contante bedrag op.
create or replace function sluit_kassa_dag_af(
  p_salon_id uuid,
  p_locatie_id uuid,
  p_geteld_contant numeric,
  p_notitie text,
  p_afgesloten_door_naam text
)
returns table(
  id uuid, systeem_pin numeric, systeem_contant numeric,
  systeem_ideal numeric, systeem_cadeaubon numeric, verschil numeric
)
language plpgsql
security definer
as $$
declare
  v_pin numeric; v_contant numeric; v_ideal numeric; v_cadeaubon numeric;
  v_verschil numeric;
  v_id uuid;
begin
  if p_salon_id not in (
    select id from salons where owner_id = auth.uid()
    union
    select salon_id from medewerkers where auth_user_id = auth.uid()
  ) then
    raise exception 'Geen toegang tot deze salon';
  end if;

  select
    coalesce(sum(bedrag) filter (where methode = 'pin'), 0),
    coalesce(sum(bedrag) filter (where methode = 'cash'), 0),
    coalesce(sum(bedrag) filter (where methode = 'ideal'), 0),
    coalesce(sum(bedrag) filter (where methode = 'cadeaubon'), 0)
  into v_pin, v_contant, v_ideal, v_cadeaubon
  from betalingen
  where salon_id = p_salon_id
    and status = 'betaald'
    and (p_locatie_id is null or locatie_id = p_locatie_id)
    and datum::date = current_date;

  v_verschil := p_geteld_contant - v_contant;

  insert into kassa_afsluitingen (
    salon_id, locatie_id, systeem_pin, systeem_contant, systeem_ideal,
    systeem_cadeaubon, geteld_contant, verschil, notitie, afgesloten_door_naam
  ) values (
    p_salon_id, p_locatie_id, v_pin, v_contant, v_ideal,
    v_cadeaubon, p_geteld_contant, v_verschil, p_notitie, p_afgesloten_door_naam
  ) returning kassa_afsluitingen.id into v_id;

  return query select v_id, v_pin, v_contant, v_ideal, v_cadeaubon, v_verschil;
end;
$$;

-- RPC: alleen de systeemtotalen van vandaag bekijken (voorbeeld tonen
-- vóórdat de medewerker het getelde bedrag invoert en definitief afsluit).
create or replace function bekijk_kassa_dag_totalen(p_salon_id uuid, p_locatie_id uuid)
returns table(systeem_pin numeric, systeem_contant numeric, systeem_ideal numeric, systeem_cadeaubon numeric)
language sql
stable
security definer
as $$
  select
    coalesce(sum(bedrag) filter (where methode = 'pin'), 0),
    coalesce(sum(bedrag) filter (where methode = 'cash'), 0),
    coalesce(sum(bedrag) filter (where methode = 'ideal'), 0),
    coalesce(sum(bedrag) filter (where methode = 'cadeaubon'), 0)
  from betalingen
  where salon_id = p_salon_id
    and status = 'betaald'
    and (p_locatie_id is null or locatie_id = p_locatie_id)
    and datum::date = current_date
    and p_salon_id in (
      select id from salons where owner_id = auth.uid()
      union
      select salon_id from medewerkers where auth_user_id = auth.uid()
    );
$$;

-- RPC: geschiedenis van eerdere afsluitingen opvragen (voor de eigenaar)
create or replace function get_kassa_afsluitingen(p_salon_id uuid, p_limiet integer default 30)
returns setof kassa_afsluitingen
language sql
stable
security definer
as $$
  select * from kassa_afsluitingen
  where salon_id = p_salon_id
    and p_salon_id in (select id from salons where owner_id = auth.uid())
  order by datum desc, afgesloten_op desc
  limit p_limiet;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Gebruikt betalingen.datum (bevestigd via rapportages/index.html)
-- als kolomnaam voor het betaalmoment.
-- ══════════════════════════════════════════════════════════════════════
