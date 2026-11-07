begin;
create or replace function public.claim_wachtlijst_plek(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w wachtlijst%rowtype;receipt record;room_id uuid;location_id uuid;minutes integer;needs_room boolean;
begin
 select * into w from wachtlijst where claim_token=p_token for update;
 if not found or w.status is distinct from 'actief' or w.voorgestelde_datum_tijd is null or w.voorgesteld_op is null or w.voorgesteld_op<now()-interval '24 hours' then
 return jsonb_build_object('success',false,'error','Deze plek is niet meer beschikbaar.');end if;
 perform pg_advisory_xact_lock(hashtextextended(w.salon_id::text,93));
 select duur_min,vereist_ruimte into minutes,needs_room from diensten where id=w.dienst_id;
 select locatie_id into location_id from medewerkers where id=w.medewerker_id;
 if needs_room then
  select r.id into room_id from ruimtes r where r.salon_id=w.salon_id and r.actief and (location_id is null or r.locatie_id is null or r.locatie_id=location_id)
  and not exists(select 1 from afspraken a where a.ruimte_id=r.id and a.status not in ('geannuleerd','verplaatst') and a.datum_tijd<w.voorgestelde_datum_tijd+make_interval(mins=>minutes) and a.datum_tijd+make_interval(mins=>a.duur_min)>w.voorgestelde_datum_tijd) order by r.id limit 1;
 end if;
 begin
 select * into receipt from kronr_boek_afspraken(jsonb_build_array(jsonb_build_object(
 'ruimte_id',room_id,'locatie_id',location_id,'salon_id',w.salon_id,'dienst_id',w.dienst_id,'medewerker_id',w.medewerker_id,'datum_tijd',w.voorgestelde_datum_tijd,
 'klant_naam',w.klant_naam,'klant_email',w.klant_email,'klant_telefoon',w.klant_telefoon)), '{}');
 exception when others then return jsonb_build_object('success',false,'error','Deze plek kan niet meer online worden geboekt. Neem contact op met de salon.');end;
 update wachtlijst set status='vervuld' where id=w.id;
 return jsonb_build_object('success',true,'klant_naam',w.klant_naam,'klant_email',w.klant_email,
 'salon_naam',(select naam from salons where id=w.salon_id),'dienst_naam',(select naam from diensten where id=w.dienst_id),
 'datum_tijd',w.voorgestelde_datum_tijd,'annuleer_token',receipt.annuleer_token);
end $$;
commit;
