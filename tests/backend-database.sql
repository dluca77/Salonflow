-- Append after the migration's BEGIN/body, replacing COMMIT. All fixtures roll back.
do $$
declare u uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 payment uuid; amount numeric; n integer; rejected boolean;
begin
 insert into auth.users(id,email) values(u,'kronr-audit-'||u||'@example.invalid');
 insert into public.salons(id,owner_id,naam,plan) values(s,u,'Rollback test','free');
 insert into public.producten(id,salon_id,naam,prijs,voorraad_aantal) values(p,s,'Testproduct',12.50,3);
 perform set_config('request.jwt.claim.sub',u::text,true);
 select betaling_id into payment from public.verwerk_kassa_betaling(s,null,'pin',null,
  jsonb_build_array(jsonb_build_object('type','product','product_id',p,'prijs',0.01,'naam','Testproduct','aantal',2)),
  null,null,'[{"bedrag":25}]');
 select bedrag into amount from public.betalingen where id=payment;
 if amount<>50 then raise exception 'FAIL: server price/gift total %',amount; end if;
 select voorraad_aantal into n from public.producten where id=p;
 if n<>1 then raise exception 'FAIL: stock %',n; end if;
 if (select count(*) from public.verkoop_items where betaling_id=payment)<>2 then raise exception 'FAIL: missing gift line'; end if;
 rejected:=false;
 begin
  perform public.verwerk_kassa_betaling(s,null,'pin',null,
   jsonb_build_array(jsonb_build_object('type','product','product_id',p,'aantal',2)),null,null,'[]');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: overselling accepted'; end if;
 rejected:=false;
 begin
  perform public.verwerk_kassa_betaling(s,null,'pin',null,'[{"type":"overig","prijs":5,"aantal":-1}]',null,null,'[]');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: negative quantity accepted'; end if;
 rejected:=false;
 begin
  perform public.verwerk_kassa_betaling(s,null,'pin',null,'[{"type":"overig","prijs":5,"aantal":1}]',null,-1,'[]');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: negative gift redemption accepted'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 rejected:=false;
 begin
  perform public.verwerk_kassa_betaling(s,null,'pin',null,'[{"type":"overig","prijs":5,"aantal":1}]',null,null,'[]');
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'FAIL: other salon accepted'; end if;
 if has_function_privilege('anon','public.verwerk_kassa_betaling(uuid,uuid,text,uuid,jsonb,text,numeric,jsonb)','EXECUTE') then
  raise exception 'FAIL: anonymous checkout permission';
 end if;
end;
$$;
rollback;
select 'PASS: server prices, gift sales, stock, invalid quantities, invalid gift amounts, salon isolation, anonymous permissions; fixtures rolled back' as result;
