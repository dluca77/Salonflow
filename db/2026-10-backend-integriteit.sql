-- Validated against the production schema snapshot of 2026-10-29.
begin;

alter table public.verkoop_items drop constraint if exists verkoop_items_type_check;
alter table public.verkoop_items add constraint verkoop_items_type_check
 check(type in ('dienst','product','fooi','overig','cadeaubon_verkoop'));

create or replace function public.kronr_mag_module(p_salon_id uuid,p_module text,p_niveaus text[])
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
 exists(select 1 from salons where id=p_salon_id and owner_id=auth.uid()) or
 exists(select 1 from medewerkers where salon_id=p_salon_id and auth_user_id=auth.uid()
 and actief=true and rechten->>p_module=any(p_niveaus))
 );
$$;

create or replace function public.verwerk_kassa_betaling(
 p_salon_id uuid,p_locatie_id uuid,p_methode text,p_afspraak_id uuid,p_items jsonb,
 p_cadeaubon_code_gebruikt text,p_cadeaubon_bedrag_gebruikt numeric,p_nieuwe_cadeaubonnen jsonb)
returns table(betaling_id uuid,nieuwe_codes jsonb)
language plpgsql security definer set search_path=public as $$
declare
 item jsonb; cb jsonb; unit_price numeric; qty integer; stock integer;
 total numeric:=0; gift_used numeric:=coalesce(p_cadeaubon_bedrag_gebruikt,0);
 payment uuid; gift_id uuid; gift_balance numeric; gift_code text;
 lines jsonb:='[]'; codes jsonb:='[]'; staff uuid;
begin
 if not kronr_mag_module(p_salon_id,'kassa',array['gebruiken','bewerken']) then
  raise exception 'Geen toegang tot deze salon';
 end if;
 -- Serialize checkout within one salon, including gift balance and repeated appointment checkout.
 perform pg_advisory_xact_lock(hashtextextended(p_salon_id::text,23));
 if p_methode is null or p_methode not in ('pin','cash','ideal','cadeaubon') then
  raise exception 'Ongeldige betaalmethode';
 end if;
 if p_locatie_id is not null and not exists(select 1 from locaties where id=p_locatie_id and salon_id=p_salon_id) then
  raise exception 'Ongeldige locatie';
 end if;
 if p_afspraak_id is not null then
  perform 1 from afspraken where id=p_afspraak_id and salon_id=p_salon_id for update;
  if not found then raise exception 'Ongeldige afspraak'; end if;
  if exists(select 1 from betalingen where afspraak_id=p_afspraak_id and status='betaald') then
   raise exception 'Deze afspraak is al afgerekend';
  end if;
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then
  raise exception 'Ongeldige verkoopregels';
 end if;
 if p_nieuwe_cadeaubonnen is not null and (jsonb_typeof(p_nieuwe_cadeaubonnen)<>'array' or jsonb_array_length(p_nieuwe_cadeaubonnen)>50) then
  raise exception 'Ongeldige cadeaubonnen';
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if coalesce(item->>'aantal','') !~ '^[1-9][0-9]{0,3}$' then raise exception 'Ongeldig aantal'; end if;
  qty:=(item->>'aantal')::integer;
  staff:=nullif(item->>'medewerker_id','')::uuid;
  if staff is not null and not exists(select 1 from medewerkers where id=staff and salon_id=p_salon_id and actief) then
   raise exception 'Ongeldige medewerker';
  end if;
  unit_price:=null;
  case item->>'type'
   when 'dienst' then
    select prijs into unit_price from diensten where id=(item->>'dienst_id')::uuid and salon_id=p_salon_id for share;
   when 'product' then
    select prijs,voorraad_aantal into unit_price,stock from producten where id=(item->>'product_id')::uuid and salon_id=p_salon_id and actief for update;
    if unit_price is not null then
     if stock<qty then raise exception 'Onvoldoende voorraad'; end if;
     update producten set voorraad_aantal=voorraad_aantal-qty where id=(item->>'product_id')::uuid;
    end if;
   when 'fooi' then
    unit_price:=(item->>'prijs')::numeric;
    if unit_price not in (5,10) or qty<>1 then raise exception 'Ongeldige fooi'; end if;
   when 'overig' then unit_price:=(item->>'prijs')::numeric;
   else raise exception 'Onbekend type verkoopregel';
  end case;
  if unit_price is null or unit_price<0 or unit_price>100000 or unit_price::text in ('NaN','Infinity','-Infinity') then
   raise exception 'Ongeldige prijs of onbekend artikel';
  end if;
  unit_price:=round(unit_price,2);
  total:=total+unit_price*qty;
  lines:=lines||jsonb_build_object('naam',left(coalesce(item->>'naam','Artikel'),250),'type',item->>'type','prijs',unit_price,'aantal',qty,'medewerker_id',staff);
 end loop;
 -- The frontend submits gift sales separately; include them in the amount charged.
 for cb in select value from jsonb_array_elements(coalesce(p_nieuwe_cadeaubonnen,'[]')) loop
  unit_price:=(cb->>'bedrag')::numeric;
  if unit_price is null or unit_price<=0 or unit_price>100000 or unit_price::text in ('NaN','Infinity','-Infinity') or round(unit_price,2)<>unit_price then
   raise exception 'Ongeldig cadeaubonbedrag';
  end if;
  total:=total+unit_price;
  lines:=lines||jsonb_build_object('naam','Cadeaubon','type','cadeaubon_verkoop','prijs',unit_price,'aantal',1);
 end loop;
 if jsonb_array_length(lines)=0 then raise exception 'De bon is leeg'; end if;
 if gift_used<0 or gift_used>total or gift_used::text in ('NaN','Infinity','-Infinity') or round(gift_used,2)<>gift_used then
  raise exception 'Ongeldig cadeaubonbedrag';
 end if;
 if p_cadeaubon_code_gebruikt is not null then
  select id,resterend_bedrag into gift_id,gift_balance from cadeaubonnen
   where salon_id=p_salon_id and code=upper(p_cadeaubon_code_gebruikt) and status='actief' for update;
  if gift_id is null or gift_used<=0 or gift_used>gift_balance then raise exception 'Cadeaubon niet geldig of saldo ontoereikend'; end if;
 elsif gift_used<>0 then raise exception 'Cadeauboncode ontbreekt';
 end if;
 if p_methode='cadeaubon' and gift_used<>total then raise exception 'Cadeaubon dekt de bon niet volledig'; end if;
 insert into betalingen(salon_id,bedrag,methode,status,afspraak_id,cadeaubon_code,cadeaubon_bedrag_gebruikt,locatie_id)
 values(p_salon_id,total-gift_used,p_methode,'betaald',p_afspraak_id,p_cadeaubon_code_gebruikt,gift_used,p_locatie_id) returning id into payment;
 for item in select value from jsonb_array_elements(lines) loop
  insert into verkoop_items(salon_id,betaling_id,medewerker_id,naam,type,prijs,aantal,totaal,locatie_id)
  values(p_salon_id,payment,(item->>'medewerker_id')::uuid,item->>'naam',item->>'type',(item->>'prijs')::numeric,
   (item->>'aantal')::integer,(item->>'prijs')::numeric*(item->>'aantal')::integer,p_locatie_id);
 end loop;
 if gift_id is not null then
  update cadeaubonnen set resterend_bedrag=gift_balance-gift_used,status=case when gift_balance=gift_used then 'ingewisseld' else 'actief' end where id=gift_id;
 end if;
 for cb in select value from jsonb_array_elements(coalesce(p_nieuwe_cadeaubonnen,'[]')) loop
  gift_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into cadeaubonnen(salon_id,code,bedrag_origineel,resterend_bedrag,gekocht_door_naam,gekocht_door_email,verkocht_via,betaling_id)
  values(p_salon_id,gift_code,(cb->>'bedrag')::numeric,(cb->>'bedrag')::numeric,cb->>'koper_naam',cb->>'koper_email','kassa',payment);
  codes:=codes||jsonb_build_object('code',gift_code,'bedrag',(cb->>'bedrag')::numeric);
 end loop;
 if p_afspraak_id is not null then update afspraken set status='afgerond' where id=p_afspraak_id and salon_id=p_salon_id; end if;
 return query select payment,codes;
end;
$$;

revoke execute on function public.verwerk_kassa_betaling(uuid,uuid,text,uuid,jsonb,text,numeric,jsonb) from public,anon;
grant execute on function public.verwerk_kassa_betaling(uuid,uuid,text,uuid,jsonb,text,numeric,jsonb) to authenticated;

commit;
