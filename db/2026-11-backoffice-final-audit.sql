begin;
-- Public appointments use the salon's Dutch local time, independent of browser timezone.
create or replace function public.kronr_controleer_boeking(p_salon uuid,p_medewerker uuid,p_start timestamptz,p_duur integer)
returns void language plpgsql security definer set search_path=public as $$
declare local_start timestamp:=p_start at time zone 'Europe/Amsterdam';
 local_end timestamp:=(p_start+make_interval(mins=>p_duur)) at time zone 'Europe/Amsterdam';
 day_info jsonb; open_at time; close_at time;
begin
 select openingstijden->(array['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'])[extract(dow from local_start)::integer+1]
 into day_info from salons where id=p_salon;
 if coalesce((day_info->>'gesloten')::boolean,false) then raise exception 'De salon is op deze dag gesloten'; end if;
 open_at:=coalesce(nullif(day_info->>'open','')::time,'09:00'::time);
 close_at:=coalesce(nullif(day_info->>'dicht','')::time,'18:00'::time);
 if local_end::date<>local_start::date or local_start::time<open_at or local_end::time>close_at then
  raise exception 'Deze afspraak valt buiten de openingstijden';
 end if;
 if exists(select 1 from medewerker_verlof where salon_id=p_salon and medewerker_id=p_medewerker and status='goedgekeurd' and local_start::date between van_datum and tot_datum) then
  raise exception 'Deze medewerker is op deze dag niet beschikbaar';
 end if;
 if exists(select 1 from afspraken a where a.salon_id=p_salon and a.type='bloktijd'
   and a.medewerker_id is null and a.status not in ('geannuleerd','verplaatst')
   and (a.locatie_id is null or a.locatie_id=(select locatie_id from medewerkers where id=p_medewerker))
   and a.datum_tijd<p_start+make_interval(mins=>p_duur)
   and a.datum_tijd+make_interval(mins=>a.duur_min)>p_start) then
   raise exception 'Deze tijd is niet meer beschikbaar';
 end if;
end $$;
revoke all on function public.kronr_controleer_boeking(uuid,uuid,timestamptz,integer) from public,anon,authenticated;

create or replace function public.get_bezette_tijden(p_salon_id uuid,p_locatie_id uuid,p_datum_start timestamptz,p_datum_eind timestamptz)
returns table(datum_tijd timestamptz,duur_min integer,medewerker_id uuid)
language sql security definer set search_path=public as $$
 select a.datum_tijd,a.duur_min,a.medewerker_id from afspraken a
 where a.salon_id=p_salon_id and a.datum_tijd<p_datum_eind
 and a.datum_tijd+make_interval(mins=>a.duur_min)>p_datum_start
 and a.status not in ('geannuleerd','verplaatst')
 and (p_locatie_id is null or a.locatie_id is null or a.locatie_id=p_locatie_id);
$$;
create or replace function claim_lessen_wachtlijst_plek(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
#variable_conflict use_column
declare
  v_wachtlijst lessen_wachtlijst%rowtype;
  v_capaciteit integer;
  v_geboekt integer;
  v_dienst_id uuid;
  v_salon_id uuid;
  v_dienst_naam text;
  v_salon_naam text;
  v_datum_tijd timestamptz;
  v_boeking_id uuid;
  v_annuleer_token uuid;
begin
  select * into v_wachtlijst from lessen_wachtlijst where claim_token = p_token for update;

  if v_wachtlijst.id is null then
    return jsonb_build_object('success', false, 'error', 'Deze plek kon niet gevonden worden.');
  end if;
  if v_wachtlijst.status = 'vervuld' then
    return jsonb_build_object('success', false, 'error', 'Deze plek is al geclaimd.');
  end if;
  if v_wachtlijst.status <> 'voorgesteld' or v_wachtlijst.voorgesteld_op is null
     or now() - v_wachtlijst.voorgesteld_op > interval '24 hours' then
    return jsonb_build_object('success', false, 'error', 'Deze plek is verlopen.');
  end if;

  select l.capaciteit, l.dienst_id, l.datum_tijd, l.salon_id
    into v_capaciteit, v_dienst_id, v_datum_tijd, v_salon_id
  from lessen l where l.id = v_wachtlijst.les_id and l.status='gepland' and l.datum_tijd>now() for update;
  if not found then
    return jsonb_build_object('success',false,'error','Deze les is niet meer beschikbaar.');
  end if;
  begin
    perform public.kronr_controleer_klant(v_salon_id,v_wachtlijst.klant_email,v_wachtlijst.klant_telefoon);
  exception when others then
    return jsonb_build_object('success',false,'error','Online boeken is niet mogelijk. Neem contact op met de salon.');
  end;

  select count(*) into v_geboekt from les_boekingen where les_id = v_wachtlijst.les_id and status <> 'geannuleerd';
  if v_geboekt >= v_capaciteit then
    update lessen_wachtlijst set status = 'verlopen' where id = v_wachtlijst.id;
    return jsonb_build_object('success', false, 'error', 'Helaas, deze plek is inmiddels door iemand anders bezet.');
  end if;

  insert into les_boekingen (les_id, klant_naam, klant_email, klant_telefoon)
  values (v_wachtlijst.les_id, v_wachtlijst.klant_naam, v_wachtlijst.klant_email, v_wachtlijst.klant_telefoon)
  returning id, annuleer_token into v_boeking_id, v_annuleer_token;

  update lessen_wachtlijst set status = 'vervuld' where id = v_wachtlijst.id;

  select naam into v_dienst_naam from diensten where id = v_dienst_id;
  select naam into v_salon_naam from salons where id = v_salon_id;

  return jsonb_build_object(
    'success', true,
    'klant_naam', v_wachtlijst.klant_naam,
    'klant_email', v_wachtlijst.klant_email,
    'salon_naam', v_salon_naam,
    'dienst_naam', v_dienst_naam,
    'datum_tijd', v_datum_tijd,
    'annuleer_token', v_annuleer_token
  );
end;
$$;
commit;
