do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();l uuid:=gen_random_uuid();w uuid:=gen_random_uuid();t uuid:=gen_random_uuid();dt timestamptz:=((current_date+8)::timestamp+time '12:00') at time zone 'Europe/Amsterdam';failed boolean:=false;r jsonb;
begin
 insert into auth.users(id,email) values(u,'final-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,openingstijden) values(s,u,'Final rollback audit','{}');
 insert into medewerkers(id,salon_id,naam,actief) values(m,s,'Test',true);
 insert into diensten(id,salon_id,naam,duur_min,prijs,actief) values(d,s,'Test',30,20,true);
 insert into afspraken(salon_id,klant_naam,datum_tijd,duur_min,type,status) values(s,'Team block',dt,60,'bloktijd','bevestigd');
 begin perform kronr_controleer_boeking(s,m,dt,30);exception when others then failed:=true;end;
 if not failed then raise exception 'Team block ignored';end if;
 if (select count(*) from get_bezette_tijden(s,null,dt+interval '30 minutes',dt+interval '2 hours'))<>1 then raise exception 'Overlapping prior-start block missing';end if;
 insert into lessen(id,salon_id,dienst_id,datum_tijd,duur_min,capaciteit,status) values(l,s,d,dt,30,1,'geannuleerd');
 insert into lessen_wachtlijst(id,les_id,klant_naam,klant_email,status,voorgesteld_op,claim_token) values(w,l,'Test','final@example.invalid','voorgesteld',now(),t);
 r:=claim_lessen_wachtlijst_plek(t);if (r->>'success')::boolean then raise exception 'Cancelled lesson claimed';end if;
 update lessen set status='gepland',datum_tijd=now()-interval '1 day' where id=l;
 r:=claim_lessen_wachtlijst_plek(t);if (r->>'success')::boolean then raise exception 'Past lesson claimed';end if;
 update lessen set datum_tijd=dt where id=l;
 insert into geblokkeerde_klanten(salon_id,email) values(s,'final@example.invalid');
 r:=claim_lessen_wachtlijst_plek(t);if (r->>'success')::boolean then raise exception 'Blocked customer claimed lesson';end if;
 if exists(select 1 from les_boekingen where les_id=l) then raise exception 'Rejected claim mutated bookings';end if;
end $$;
