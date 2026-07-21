-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Stempelkaart / loyaliteitsprogramma
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Ontwerpkeuze: stempels worden LIVE geteld uit afgeronde afspraken (geen
-- apart optelveld dat uit sync kan raken) omdat afspraken geen directe
-- koppeling heeft met een klanten-record -- alleen los klant_email. De
-- koppeling naar een klant loopt dus via e-mailadres.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Per dienst instelbaar of hij meetelt voor de stempelkaart -----------
alter table diensten
  add column if not exists telt_voor_stempel boolean not null default false;

-- 2) Salon-instellingen voor het stempelprogramma -------------------------
alter table salons
  add column if not exists stempelkaart_actief boolean not null default false,
  add column if not exists stempel_aantal_nodig integer not null default 5
    check (stempel_aantal_nodig > 0),
  add column if not exists stempel_beloning text;

-- 3) Codes voor een verdiende beloning ------------------------------------
-- Elke keer dat een klant het benodigde aantal stempels rondmaakt, komt er
-- 1 rij bij met status 'open'. De salon (of de klant zelf via de
-- stempelkaart-pagina) ziet de code; de salon zet 'm op 'ingewisseld' zodra
-- de beloning daadwerkelijk gegeven is.
create table if not exists klant_stempel_codes (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  klant_email text not null,
  code text not null,
  status text not null default 'open' check (status in ('open','ingewisseld')),
  created_at timestamptz not null default now(),
  ingewisseld_op timestamptz
);

create index if not exists klant_stempel_codes_lookup_idx
  on klant_stempel_codes(salon_id, klant_email, status);

alter table klant_stempel_codes enable row level security;

drop policy if exists "stempel_codes_select_own_salon" on klant_stempel_codes;
create policy "stempel_codes_select_own_salon" on klant_stempel_codes
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

drop policy if exists "stempel_codes_update_own_salon" on klant_stempel_codes;
create policy "stempel_codes_update_own_salon" on klant_stempel_codes
  for update using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- 4a) Rate-limiting voor de publieke lookup hieronder ----------------------
-- Zonder dit kan iemand die klant-e-mailadressen kent/raadt onbeperkt
-- stempelkaarten + beloningscodes van andere klanten opvragen (IDOR-achtig
-- misbruik van een geraden e-mailadres als enige 'credential'). Dit beperkt
-- het aantal opvragingen per salon+e-mail per uur.
create table if not exists stempelkaart_lookup_pogingen (
  id bigint generated always as identity primary key,
  salon_id uuid not null,
  email text not null,
  poging_op timestamptz not null default now()
);

create index if not exists stempelkaart_lookup_pogingen_idx
  on stempelkaart_lookup_pogingen(salon_id, email, poging_op);

-- 4b) RPC: stempelstatus opvragen (en zo nodig een nieuwe code aanmaken) ---
-- SECURITY DEFINER omdat dit ook publiek aanroepbaar moet zijn vanaf de
-- klant-facing stempelkaart.html (net als get_afspraak_via_token) --
-- geeft alleen het strikt noodzakelijke terug, geen brede tabeltoegang.
create or replace function get_stempelkaart(p_salon_id uuid, p_email text)
returns table(
  stempels_verdiend integer,
  stempels_nodig integer,
  stempels_huidig integer,
  beloning text,
  vol boolean,
  open_code text
)
security definer
language plpgsql
as $$
declare
  v_verdiend integer;
  v_nodig integer;
  v_beloning text;
  v_ingewisseld_cycli integer;
  v_huidig integer;
  v_code text;
  v_pogingen integer;
begin
  -- Rate limit: max 5 opvragingen per salon+e-mail per uur. Voorkomt
  -- geautomatiseerd aftasten van beloningscodes met geraden e-mailadressen.
  delete from stempelkaart_lookup_pogingen where poging_op < now() - interval '1 day';

  select count(*) into v_pogingen
  from stempelkaart_lookup_pogingen
  where salon_id = p_salon_id and lower(email) = lower(p_email)
    and poging_op > now() - interval '1 hour';

  if v_pogingen >= 5 then
    raise exception 'Te veel pogingen, probeer het over een uur opnieuw';
  end if;

  insert into stempelkaart_lookup_pogingen (salon_id, email) values (p_salon_id, lower(p_email));

  select s.stempel_aantal_nodig, s.stempel_beloning
    into v_nodig, v_beloning
  from salons s
  where s.id = p_salon_id and s.stempelkaart_actief = true;

  if v_nodig is null then
    -- salon heeft stempelkaart niet aan staan, of bestaat niet
    return query select 0,0,0,null::text,false,null::text;
    return;
  end if;

  select count(*) into v_verdiend
  from afspraken a
  join diensten d on d.id = a.dienst_id
  where a.salon_id = p_salon_id
    and lower(a.klant_email) = lower(p_email)
    and a.status = 'afgerond'
    and d.telt_voor_stempel = true;

  select count(*) into v_ingewisseld_cycli
  from klant_stempel_codes
  where salon_id = p_salon_id and lower(klant_email) = lower(p_email) and status = 'ingewisseld';

  v_huidig := v_verdiend - (v_ingewisseld_cycli * v_nodig);

  if v_huidig >= v_nodig then
    -- al een open code voor deze cyclus?
    select code into v_code
    from klant_stempel_codes
    where salon_id = p_salon_id and lower(klant_email) = lower(p_email) and status = 'open'
    limit 1;

    if v_code is null then
      v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      insert into klant_stempel_codes (salon_id, klant_email, code)
      values (p_salon_id, lower(p_email), v_code);
    end if;
  end if;

  return query select v_verdiend, v_nodig, v_huidig, v_beloning, (v_huidig >= v_nodig), v_code;
end;
$$;

-- 5) RPC: code inwisselen (door de salon, ingelogd) -----------------------
create or replace function wissel_stempel_code_in(p_code text)
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from klant_stempel_codes
  where code = upper(p_code) and status = 'open'
    and salon_id in (select id from salons where owner_id = auth.uid());

  if v_id is null then
    return false;
  end if;

  update klant_stempel_codes set status = 'ingewisseld', ingewisseld_op = now() where id = v_id;
  return true;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad instellingen.html / diensten.html /
-- klanten.html eenmaal.
-- ══════════════════════════════════════════════════════════════════════
