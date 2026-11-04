begin;
alter table public.stempelkaart_verificaties add column if not exists pogingen integer not null default 0;
CREATE OR REPLACE FUNCTION public.get_stempelkaart(p_salon_id uuid, p_email text)
 RETURNS TABLE(stempels_verdiend integer, stempels_nodig integer, stempels_huidig integer, beloning text, vol boolean, open_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_verdiend integer;
  v_nodig integer;
  v_beloning text;
  v_ingewisseld_cycli integer;
  v_huidig integer;
  v_code text;
  v_pogingen integer;
begin
  if not public.kronr_mag_module(p_salon_id,'klanten',array['bekijken','bewerken']) then raise exception 'Geen toegang'; end if;
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
$function$
;
CREATE OR REPLACE FUNCTION public.vraag_stempelkaart_code_aan(p_salon_id uuid, p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pogingen integer;
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text||lower(p_email),37));
  if length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Ongeldig e-mailadres'; end if;
  delete from stempelkaart_lookup_pogingen where poging_op < now() - interval '1 day';

  select count(*) into v_pogingen
  from stempelkaart_lookup_pogingen
  where salon_id = p_salon_id and lower(email) = lower(p_email)
    and poging_op > now() - interval '1 hour';

  if v_pogingen >= 5 then
    raise exception 'Te veel pogingen, probeer het over een uur opnieuw';
  end if;

  insert into stempelkaart_lookup_pogingen (salon_id, email) values (p_salon_id, lower(p_email));

  update stempelkaart_verificaties set gebruikt=true where salon_id=p_salon_id and lower(email)=lower(p_email) and not gebruikt;
  v_code := lpad((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint % 1000000)::text,6,'0');

  insert into stempelkaart_verificaties (salon_id, email, code)
  values (p_salon_id, lower(p_email), v_code);

  return v_code;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bevestig_stempelkaart_code(p_salon_id uuid, p_email text, p_code text)
 RETURNS TABLE(stempels_verdiend integer, stempels_nodig integer, stempels_huidig integer, beloning text, vol boolean, open_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_verificatie_id uuid;
  v_nodig integer;
  v_beloning text;
  v_verdiend integer;
  v_ingewisseld_cycli integer;
  v_huidig integer;
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text||lower(p_email),37));
  -- A failed attempt must commit its counter; return no row instead of raising.
  select id into v_verificatie_id from stempelkaart_verificaties
   where salon_id=p_salon_id and lower(email)=lower(p_email) and not gebruikt and verlopen_op>now()
   order by aangemaakt_op desc limit 1 for update;
  if v_verificatie_id is null then return; end if;
  update stempelkaart_verificaties set pogingen=pogingen+1 where id=v_verificatie_id and pogingen<5;
  if not found then return; end if;
  select id into v_verificatie_id
  from stempelkaart_verificaties
  where salon_id = p_salon_id
    and lower(email) = lower(p_email)
    and id = v_verificatie_id
    and code = p_code
    and gebruikt = false
    and verlopen_op > now()
  order by aangemaakt_op desc
  limit 1;

  if v_verificatie_id is null then
    return;
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
$function$
;
revoke execute on function public.vraag_stempelkaart_code_aan(uuid,text) from public,anon,authenticated;
grant execute on function public.vraag_stempelkaart_code_aan(uuid,text) to service_role;
revoke execute on function public.get_stempelkaart(uuid,text) from public,anon;
grant execute on function public.get_stempelkaart(uuid,text) to authenticated;
commit;
