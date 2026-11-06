
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();r jsonb;failed boolean;
begin
 insert into auth.users(id,email) values(u,'block-test-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,openingstijden) values(s,u,'Block audit','{}');
 insert into medewerkers(id,salon_id,naam,actief) values(m,s,'Test',true);
 insert into diensten(id,salon_id,naam,actief,prijs,duur_min) values(d,s,'Test',true,25,30);
 insert into geblokkeerde_klanten(salon_id,email,telefoon) values(s,'BLOCKED@example.invalid','06 1234 5678');
 r:=jsonb_build_object('salon_id',s,'medewerker_id',m,'dienst_id',d,'datum_tijd',((current_date+8)::timestamp+time '12:00') at time zone 'Europe/Amsterdam','klant_naam','Test','klant_email','blocked@example.invalid');
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r),'{}');exception when others then if sqlerrm not like '%Online boeken%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Blocked email booked';end if;
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r||jsonb_build_object('klant_email','other@example.invalid','klant_telefoon','0612345678')),'{}');exception when others then if sqlerrm not like '%Online boeken%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Blocked phone booked';end if;
 perform * from kronr_boek_afspraken(jsonb_build_array(r||jsonb_build_object('klant_email','allowed@example.invalid')),'{}');
 if (select count(*) from afspraken where salon_id=s)<>1 then raise exception 'Blocked request persisted';end if;
end $$;
