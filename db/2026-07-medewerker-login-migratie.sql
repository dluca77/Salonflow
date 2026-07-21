-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Medewerker-login + verlof/ziekte-aanvragen
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- BELANGRIJKE WAARSCHUWING: dit voegt een TWEEDE soort ingelogde
-- gebruiker toe (medewerkers, naast de bestaande salon-eigenaren). De
-- nieuwe RLS-policies hieronder zijn ADDITIONEEL bedoeld -- ik heb de
-- bestaande policies op medewerkers/afspraken niet kunnen inzien (die
-- staan alleen in jouw Supabase-project). Check zelf of er geen
-- conflicterende policy bestaat die deze nieuwe, beperktere toegang
-- per ongeluk zou kunnen overschrijven of juist blokkeren.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Koppeling medewerker <-> eigen inlogaccount ---------------------------
alter table medewerkers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists uitnodiging_status text
    check (uitnodiging_status in ('niet_uitgenodigd','uitgenodigd','geactiveerd'))
    default 'niet_uitgenodigd',
  add column if not exists uitnodiging_token uuid,
  add column if not exists uitnodiging_verzonden_op timestamptz;

create unique index if not exists medewerkers_auth_user_idx on medewerkers(auth_user_id) where auth_user_id is not null;
create unique index if not exists medewerkers_uitnodiging_token_idx on medewerkers(uitnodiging_token) where uitnodiging_token is not null;

-- 2) Verlof/ziekte-aanvragen ------------------------------------------------
create table if not exists medewerker_verlof (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  medewerker_id uuid not null references medewerkers(id) on delete cascade,
  van_datum date not null,
  tot_datum date not null,
  type text not null default 'verlof' check (type in ('verlof','ziekte')),
  status text not null default 'aangevraagd' check (status in ('aangevraagd','goedgekeurd','afgewezen')),
  notitie text,
  aangevraagd_op timestamptz not null default now(),
  behandeld_op timestamptz,
  constraint medewerker_verlof_datums_check check (tot_datum >= van_datum)
);

create index if not exists medewerker_verlof_salon_idx on medewerker_verlof(salon_id, status);
create index if not exists medewerker_verlof_medewerker_idx on medewerker_verlof(medewerker_id);

alter table medewerker_verlof enable row level security;

-- Eigenaar: volledige toegang tot verlof van medewerkers in de eigen salon
drop policy if exists "verlof_eigenaar_alles" on medewerker_verlof;
create policy "verlof_eigenaar_alles" on medewerker_verlof
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- Medewerker: mag EIGEN verlofaanvragen inzien en aanmaken, niet die van
-- collega's, en NIET de status wijzigen (goedkeuren/afwijzen is aan de
-- eigenaar -- zie de aparte update-policy hieronder die dat afdwingt).
drop policy if exists "verlof_medewerker_select_eigen" on medewerker_verlof;
create policy "verlof_medewerker_select_eigen" on medewerker_verlof
  for select using (
    medewerker_id in (select id from medewerkers where auth_user_id = auth.uid())
  );

drop policy if exists "verlof_medewerker_insert_eigen" on medewerker_verlof;
create policy "verlof_medewerker_insert_eigen" on medewerker_verlof
  for insert with check (
    medewerker_id in (select id from medewerkers where auth_user_id = auth.uid())
    and status = 'aangevraagd'  -- kan alleen aanvragen, niet zichzelf goedkeuren
  );

-- 3) Additionele RLS op medewerkers: eigen rij mogen lezen -----------------
-- (De bestaande eigenaar-policy blijft ongewijzigd staan -- dit is een
-- POLICY ERBIJ, geen vervanging. Met RLS worden meerdere SELECT-policies
-- met OR gecombineerd, dus dit breidt toegang uit, het beperkt 'm niet.)
drop policy if exists "medewerkers_select_eigen_account" on medewerkers;
create policy "medewerkers_select_eigen_account" on medewerkers
  for select using (auth_user_id = auth.uid());

-- 4) Additionele RLS op afspraken: medewerker mag EIGEN rooster zien -------
drop policy if exists "afspraken_select_eigen_rooster" on afspraken;
create policy "afspraken_select_eigen_rooster" on afspraken
  for select using (
    medewerker_id in (select id from medewerkers where auth_user_id = auth.uid())
  );

-- 5) RPC: uitnodiging versturen (eigenaar) ---------------------------------
create or replace function maak_medewerker_uitnodiging(p_medewerker_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_token uuid;
  v_salon_id uuid;
begin
  select salon_id into v_salon_id from medewerkers where id = p_medewerker_id;
  if v_salon_id is null or v_salon_id not in (select id from salons where owner_id = auth.uid()) then
    raise exception 'Geen toegang tot deze medewerker';
  end if;

  v_token := gen_random_uuid();
  update medewerkers set
    uitnodiging_token = v_token,
    uitnodiging_status = 'uitgenodigd',
    uitnodiging_verzonden_op = now()
  where id = p_medewerker_id;

  return v_token;
end;
$$;

-- 6) RPC: uitnodiging accepteren (medewerker, NA het aanmaken van hun
--    eigen Supabase Auth account -- koppelt hun nieuwe account aan de
--    juiste medewerkers-rij via het token) --------------------------------
create or replace function accepteer_medewerker_uitnodiging(p_token uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_email text;
  v_jwt_email text;
begin
  select id, email into v_id, v_email
  from medewerkers
  where uitnodiging_token = p_token and uitnodiging_status = 'uitgenodigd';

  if v_id is null then
    return false; -- token onbekend of al gebruikt
  end if;

  -- Beveiliging: het token is een gedeeld geheim (kan lekken via
  -- doorgestuurde mail, gedeelde inbox, etc). Voorkom dat een account met
  -- een ANDER e-mailadres dan de uitgenodigde medewerker zich hiermee kan
  -- koppelen -- zelfde kwetsbaarheidsklasse als de eigenaar-auto-bootstrap
  -- die eerder in postvak-login is gefixt.
  v_jwt_email := auth.jwt() ->> 'email';
  if v_jwt_email is null or lower(v_jwt_email) <> lower(v_email) then
    raise exception 'Het e-mailadres van je account komt niet overeen met de uitnodiging';
  end if;

  update medewerkers set
    auth_user_id = auth.uid(),
    uitnodiging_status = 'geactiveerd',
    uitnodiging_token = null
  where id = v_id;

  return true;
end;
$$;

-- 7) RPC: uitnodiging opzoeken (PUBLIEK, niet ingelogd -- voor de
--    activatiepagina, die iemand bezoekt VOORDAT ze een account hebben).
--    Geeft bewust alleen naam+e-mail terug, geen andere salon-data.
create or replace function get_medewerker_uitnodiging_info(p_token uuid)
returns table(naam text, email text)
security definer
language sql
as $$
  select naam, email from medewerkers
  where uitnodiging_token = p_token and uitnodiging_status = 'uitgenodigd';
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie workers/kronr-mail-medewerker-uitnodiging.md voor het
-- versturen van de uitnodigingsmail.
-- ══════════════════════════════════════════════════════════════════════
