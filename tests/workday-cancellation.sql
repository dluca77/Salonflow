begin;
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();a uuid:=gen_random_uuid();t uuid:=gen_random_uuid();rejected boolean:=false;
begin
 insert into auth.users(id,email) values(u,'workday-rollback-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,annuleer_cutoff_uren) values(s,u,'Workday rollback',0);
 insert into afspraken(id,salon_id,klant_naam,datum_tijd,duur_min,status,annuleer_token) values(a,s,'Test',now()+interval '3 days',30,'afgerond',t);
 if annuleer_afspraak_via_token(t) then raise exception 'Completed appointment cancelled';end if;
 update afspraken set status='bevestigd',datum_tijd=now()-interval '1 day' where id=a;
 if annuleer_afspraak_via_token(t) then raise exception 'Past appointment cancelled';end if;
 update afspraken set datum_tijd=now()+interval '3 days' where id=a;
 if not annuleer_afspraak_via_token(t) then raise exception 'Valid future cancellation denied';end if;
 if annuleer_afspraak_via_token(t) then raise exception 'Cancellation replay succeeded';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin
  perform verwerk_kassa_betaling(s,null,'cash',a,'[{"type":"overig","prijs":10,"aantal":1}]',null,null,'[]');
 exception when others then rejected:=true;end;
 if not rejected then raise exception 'Cancelled appointment charged';end if;
 if exists(select 1 from betalingen where salon_id=s) then raise exception 'Rejected checkout wrote payment';end if;
end $$;
rollback;
