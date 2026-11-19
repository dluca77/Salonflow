begin;
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();d uuid:=gen_random_uuid();v uuid:=gen_random_uuid();bad uuid:=gen_random_uuid();pid uuid;rejected boolean:=false;
begin
 insert into auth.users(id,email) values(u,'variant-audit-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam) values(s,u,'Variant rollback');
 insert into diensten(id,salon_id,naam,prijs,duur_min) values(d,s,'Base',35,30),(bad,s,'Other',20,30);
 insert into dienst_varianten(id,dienst_id,salon_id,naam,prijs,duur_min) values(v,d,s,'Long',45,45);
 perform set_config('request.jwt.claim.sub',u::text,true);
 select betaling_id into pid from verwerk_kassa_betaling(s,null,'cash',null,jsonb_build_array(jsonb_build_object('type','dienst','dienst_id',d,'dienst_variant_id',v,'aantal',1,'prijs',0.01)),null,null,'[]');
 if (select bedrag from betalingen where id=pid)<>45 then raise exception 'Variant server price not used';end if;
 begin
 perform verwerk_kassa_betaling(s,null,'cash',null,jsonb_build_array(jsonb_build_object('type','dienst','dienst_id',bad,'dienst_variant_id',v,'aantal',1,'prijs',45)),null,null,'[]');
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Mismatched variant accepted';end if;
 if (select count(*) from betalingen where salon_id=s)<>1 then raise exception 'Invalid variant wrote a payment';end if;
end $$;
rollback;
