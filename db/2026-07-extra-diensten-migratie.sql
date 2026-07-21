-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: extra diensten toevoegen aan 1 boeking
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- ONTWERPKEUZE (bewust, i.v.m. risico): de hoofddienst van een afspraak
-- (afspraken.dienst_id) blijft ongewijzigd de enige dienst die meetelt
-- voor aanbetaling, abonnement-credits en de 'kaartgegevens vereist bij
-- no-show'-regel. Extra diensten zijn simpele toevoegingen (bv. "wenk-
-- brauwen bijwerken" naast "knippen") die WEL de duur/prijs van de
-- afspraak verhogen, maar GEEN eigen aanbetalings-/abonnementslogica
-- hebben -- die worden altijd volledig ter plekke afgerekend. Dit
-- voorkomt dat de bestaande, al geteste betaalflows moeten worden
-- omgebouwd naar 'som van N diensten met elk eigen regels', wat een veel
-- groter en risicovoller project zou zijn.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists afspraak_extra_diensten (
  id uuid primary key default gen_random_uuid(),
  afspraak_id uuid not null references afspraken(id) on delete cascade,
  dienst_id uuid not null references diensten(id),
  naam text not null,
  prijs numeric not null,
  duur_min integer not null,
  created_at timestamptz not null default now()
);

create index if not exists afspraak_extra_diensten_afspraak_idx
  on afspraak_extra_diensten(afspraak_id);

alter table afspraak_extra_diensten enable row level security;

-- Leesbaar voor de salon (eigenaar + medewerkers), net als afspraken zelf.
drop policy if exists "extra_diensten_select_eigen_salon" on afspraak_extra_diensten;
create policy "extra_diensten_select_eigen_salon" on afspraak_extra_diensten
  for select using (
    afspraak_id in (
      select a.id from afspraken a
      where a.salon_id in (
        select id from salons where owner_id = auth.uid()
        union
        select salon_id from medewerkers where auth_user_id = auth.uid()
      )
    )
  );

-- RPC: extra dienst(en) toevoegen aan een net aangemaakte afspraak. Publiek
-- aanroepbaar (net als het aanmaken van de afspraak zelf via boeken.html),
-- maar controleert dat de dienst_id echt bij dezelfde salon hoort.
create or replace function voeg_extra_diensten_toe(p_afspraak_id uuid, p_dienst_ids uuid[])
returns setof afspraak_extra_diensten
language plpgsql
security definer
as $$
declare
  v_salon_id uuid;
begin
  select salon_id into v_salon_id from afspraken where id = p_afspraak_id;
  if v_salon_id is null then
    raise exception 'Afspraak niet gevonden';
  end if;

  return query
  insert into afspraak_extra_diensten (afspraak_id, dienst_id, naam, prijs, duur_min)
  select p_afspraak_id, d.id, d.naam, d.prijs, d.duur_min
  from diensten d
  where d.id = any(p_dienst_ids) and d.salon_id = v_salon_id
  returning afspraak_extra_diensten.*;
end;
$$;

-- RPC: extra diensten van 1 of meerdere afspraken ophalen (voor agenda/kassa)
create or replace function get_extra_diensten_voor_afspraken(p_afspraak_ids uuid[])
returns setof afspraak_extra_diensten
language sql
stable
security definer
as $$
  select * from afspraak_extra_diensten where afspraak_id = any(p_afspraak_ids);
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie boeken/index.html (stap 'dienst kiezen' heeft nu een
-- 'extra toevoegen'-sectie), agenda/index.html en kassa/index.html
-- (afrekenen-vanuit-agenda toont/rekent nu ook extra diensten mee).
-- ══════════════════════════════════════════════════════════════════════
