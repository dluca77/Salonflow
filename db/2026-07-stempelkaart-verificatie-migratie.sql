-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Stempelkaart-verificatie met e-mailcode
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- VEREIST: 2026-07-stempelkaart-migratie.sql moet al gedraaid zijn.
--
-- WAAROM: get_stempelkaart had al rate limiting (max 5x/uur), maar wie
-- een klant-e-mailadres kende/raadde kon nog steeds diens stempelkaart +
-- onverzilverde beloningscode inzien met alleen dat e-mailadres. Deze
-- migratie voegt een echte verificatiestap toe: eerst een 6-cijferige
-- code naar het e-mailadres, pas daarna de stempelkaart tonen.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists stempelkaart_verificaties (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  email text not null,
  code text not null,
  aangemaakt_op timestamptz not null default now(),
  verlopen_op timestamptz not null default (now() + interval '10 minutes'),
  gebruikt boolean not null default false
);

create index if not exists stempelkaart_verificaties_lookup_idx
  on stempelkaart_verificaties(salon_id, email, code);

-- Geen policies nodig -- deze tabel wordt alleen via security-definer
-- RPC's aangeraakt, nooit rechtstreeks door een client.
alter table stempelkaart_verificaties enable row level security;

-- RPC: verificatiecode aanmaken. Hergebruikt dezelfde rate-limit-tabel als
-- get_stempelkaart (max 5 pogingen per salon+e-mail per uur) zodat het
-- aanvragen van codes ook niet ongelimiteerd kan.
create or replace function vraag_stempelkaart_code_aan(p_salon_id uuid, p_email text)
returns text
language plpgsql
security definer
as $$
declare
  v_pogingen integer;
  v_code text;
begin
  delete from stempelkaart_lookup_pogingen where poging_op < now() - interval '1 day';

  select count(*) into v_pogingen
  from stempelkaart_lookup_pogingen
  where salon_id = p_salon_id and lower(email) = lower(p_email)
    and poging_op > now() - interval '1 hour';

  if v_pogingen >= 5 then
    raise exception 'Te veel pogingen, probeer het over een uur opnieuw';
  end if;

  insert into stempelkaart_lookup_pogingen (salon_id, email) values (p_salon_id, lower(p_email));

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  insert into stempelkaart_verificaties (salon_id, email, code)
  values (p_salon_id, lower(p_email), v_code);

  return v_code;
end;
$$;

-- RPC: code bevestigen en, indien geldig, de stempelkaart tonen (zelfde
-- returnvorm als get_stempelkaart, zodat de frontend 'm 1-op-1 kan
-- hergebruiken).
create or replace function bevestig_stempelkaart_code(p_salon_id uuid, p_email text, p_code text)
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
  v_verificatie_id uuid;
  v_nodig integer;
  v_beloning text;
  v_verdiend integer;
  v_ingewisseld_cycli integer;
  v_huidig integer;
  v_code text;
begin
  select id into v_verificatie_id
  from stempelkaart_verificaties
  where salon_id = p_salon_id
    and lower(email) = lower(p_email)
    and code = p_code
    and gebruikt = false
    and verlopen_op > now()
  order by aangemaakt_op desc
  limit 1;

  if v_verificatie_id is null then
    raise exception 'Ongeldige of verlopen code';
  end if;

  update stempelkaart_verificaties set gebruikt = true where id = v_verificatie_id;

  select s.stempel_aantal_nodig, s.stempel_beloning
    into v_nodig, v_beloning
  from salons s
  where s.id = p_salon_id and s.stempelkaart_actief = true;

  if v_nodig is null then
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

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. stempelkaart/index.html vraagt nu eerst een code aan (via
-- vraag_stempelkaart_code_aan + een nieuwe kronr-mail-route, zie
-- workers/kronr-mail-stempelkaart-verificatie.md) en toont de kaart pas
-- na bevestig_stempelkaart_code(). De oude, directe get_stempelkaart-RPC
-- blijft bestaan (met zijn eigen rate limit) maar wordt niet meer
-- rechtstreeks door de klant-facing pagina aangeroepen.
-- ══════════════════════════════════════════════════════════════════════
