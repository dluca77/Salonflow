-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Groepslessen/capaciteit (sportschool/yoga/PT)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- WAAROM: het volledige boekingsmodel ging tot nu toe uit van 1 klant per
-- tijdslot per medewerker/ruimte. Een sportschool/yoga-studio boekt
-- juist andersom: 1 instructeur + 1 tijdslot, maar tot wel N klanten
-- TEGELIJK (een groepsles met capaciteit). Dat past niet in het
-- bestaande model en vereist een nieuwe laag naast (niet in plaats van)
-- de bestaande 1-op-1-afspraken.
--
-- ONTWERP: een dienst kan als 'groepsles' gemarkeerd worden. De salon-
-- eigenaar plant losse 'lessen' (concrete, geplande momenten: bv. "Yoga
-- -- woensdag 18:00, capaciteit 12"). Klanten boeken via de
-- boekingswidget een PLEK in zo'n les (les_boekingen), niet een eigen
-- losse afspraak. Een atomaire RPC bewaakt de capaciteit zodat een les
-- nooit méér boekingen krijgt dan er plek is.
-- ══════════════════════════════════════════════════════════════════════

alter table diensten add column if not exists is_groepsles boolean not null default false;

create table if not exists lessen (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  dienst_id uuid not null references diensten(id) on delete cascade,
  locatie_id uuid,
  medewerker_id uuid references medewerkers(id) on delete set null,
  ruimte_id uuid references ruimtes(id) on delete set null,
  datum_tijd timestamptz not null,
  duur_min integer not null,
  capaciteit integer not null check (capaciteit > 0),
  status text not null default 'gepland' check (status in ('gepland', 'geannuleerd')),
  created_at timestamptz not null default now()
);

create index if not exists lessen_salon_datum_idx on lessen(salon_id, datum_tijd);
create index if not exists lessen_dienst_idx on lessen(dienst_id, status, datum_tijd);

create table if not exists les_boekingen (
  id uuid primary key default gen_random_uuid(),
  les_id uuid not null references lessen(id) on delete cascade,
  klant_naam text not null,
  klant_email text not null,
  klant_telefoon text,
  status text not null default 'gepland' check (status in ('gepland', 'aanwezig', 'no-show', 'geannuleerd')),
  annuleer_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists les_boekingen_les_idx on les_boekingen(les_id, status);
create unique index if not exists les_boekingen_annuleer_token_idx on les_boekingen(annuleer_token);

-- ── RLS: lessen ──
-- Publiek leesbaar (nodig voor de boekingswidget, net als diensten/
-- medewerkers/ruimtes), maar alleen de salon zelf mag ze aanmaken/wijzigen.
alter table lessen enable row level security;

drop policy if exists "lessen_select_publiek" on lessen;
create policy "lessen_select_publiek" on lessen
  for select using (status = 'gepland');

drop policy if exists "lessen_write_eigen_salon" on lessen;
create policy "lessen_write_eigen_salon" on lessen
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

-- ── RLS: les_boekingen ──
-- GEEN publieke select-policy -- bevat klantgegevens (naam/e-mail/tel),
-- net zo gevoelig als de afspraken-tabel. De boekingswidget raakt deze
-- tabel nooit rechtstreeks aan, alleen via de security-definer RPC's
-- hieronder (zelfde patroon als stempelkaart/trajecten/kassa elders).
alter table les_boekingen enable row level security;

drop policy if exists "les_boekingen_select_eigen_salon" on les_boekingen;
create policy "les_boekingen_select_eigen_salon" on les_boekingen
  for select using (
    les_id in (
      select l.id from lessen l
      where l.salon_id in (select id from salons where owner_id = auth.uid())
         or l.salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
    )
  );

drop policy if exists "les_boekingen_write_eigen_salon" on les_boekingen;
create policy "les_boekingen_write_eigen_salon" on les_boekingen
  for update using (
    les_id in (
      select l.id from lessen l
      where l.salon_id in (select id from salons where owner_id = auth.uid())
         or l.salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
    )
  );

-- RPC: publieke beschikbaarheid opvragen voor een dienst (welke lessen
-- zijn er gepland, en hoeveel plekken zijn er nog vrij). Security
-- definer zodat dit ook zonder inloggen kan (boekingswidget).
create or replace function get_beschikbare_lessen(p_salon_id uuid, p_dienst_id uuid)
returns table(
  id uuid, datum_tijd timestamptz, duur_min integer,
  capaciteit integer, aantal_geboekt bigint, medewerker_naam text, ruimte_naam text
)
language sql
security definer
stable
as $$
  select
    l.id, l.datum_tijd, l.duur_min, l.capaciteit,
    (select count(*) from les_boekingen lb where lb.les_id = l.id and lb.status <> 'geannuleerd') as aantal_geboekt,
    m.naam, r.naam
  from lessen l
  left join medewerkers m on m.id = l.medewerker_id
  left join ruimtes r on r.id = l.ruimte_id
  where l.salon_id = p_salon_id
    and l.dienst_id = p_dienst_id
    and l.status = 'gepland'
    and l.datum_tijd > now()
  order by l.datum_tijd;
$$;

-- RPC: plek boeken in een les. Controleert atomisch de capaciteit --
-- gooit een fout als de les al vol is, in plaats van de client de
-- capaciteit zelf te laten checken (die kon immers net verlopen zijn).
create or replace function boek_les(
  p_les_id uuid, p_klant_naam text, p_klant_email text, p_klant_telefoon text
)
returns table(id uuid, annuleer_token uuid)
language plpgsql
security definer
as $$
#variable_conflict use_column
declare
  v_capaciteit integer;
  v_geboekt integer;
  v_id uuid;
  v_token uuid;
begin
  select capaciteit into v_capaciteit
  from lessen
  where id = p_les_id and status = 'gepland' and datum_tijd > now()
  for update;

  if v_capaciteit is null then
    raise exception 'Deze les is niet (meer) beschikbaar';
  end if;

  select count(*) into v_geboekt
  from les_boekingen
  where les_id = p_les_id and status <> 'geannuleerd';

  if v_geboekt >= v_capaciteit then
    raise exception 'Deze les zit helaas vol';
  end if;

  insert into les_boekingen (les_id, klant_naam, klant_email, klant_telefoon)
  values (p_les_id, p_klant_naam, lower(p_klant_email), p_klant_telefoon)
  returning les_boekingen.id, les_boekingen.annuleer_token into v_id, v_token;

  return query select v_id, v_token;
end;
$$;

-- RPC: klant annuleert zelf zijn/haar plek (via link in bevestigingsmail
-- -- geen los annuleren-pagina nodig, dezelfde functie kan vanaf een
-- eenvoudige pagina met alleen de token aangeroepen worden).
create or replace function annuleer_les_boeking(p_annuleer_token uuid)
returns void
language plpgsql
security definer
as $$
begin
  update les_boekingen
  set status = 'geannuleerd'
  where annuleer_token = p_annuleer_token and status = 'gepland';
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Nieuwe pagina lessen/index.html voor het inplannen van lessen.
-- diensten/index.html krijgt een 'Dit is een groepsles'-schakelaar.
-- boeken/index.html toont bij zo'n dienst een lijst met geplande lessen
-- (met vrije plekken) i.p.v. de normale medewerker/tijd-stappen.
-- agenda/index.html en kassa/index.html tonen/verwerken groepslessen.
-- ══════════════════════════════════════════════════════════════════════
