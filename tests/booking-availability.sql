
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();r jsonb;dt timestamptz:=((current_date+8)::timestamp+time '12:00') at time zone 'Europe/Amsterdam';failed boolean;
begin
 insert into auth.users(id,email) values(u,'availability-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,openingstijden) values(s,u,'Availability audit','{}');
 insert into medewerkers(id,salon_id,naam,actief) values(m,s,'Test medewerker',true);
 insert into diensten(id,salon_id,naam,actief,prijs,duur_min) values(d,s,'Test dienst',true,25,30);
 r:=jsonb_build_object('salon_id',s,'medewerker_id',m,'dienst_id',d,'datum_tijd',dt,'klant_naam','Test','klant_email','test@example.invalid');
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r||jsonb_build_object('datum_tijd',dt-interval '4 hours')),'{}'); exception when others then
 if sqlerrm not like '%openingstijden%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Outside hours accepted';end if;
 insert into medewerker_verlof(salon_id,medewerker_id,van_datum,tot_datum,type,status) values(s,m,(dt at time zone 'Europe/Amsterdam')::date,(dt at time zone 'Europe/Amsterdam')::date,'verlof','goedgekeurd');
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r),'{}');exception when others then
 if sqlerrm not like '%niet beschikbaar%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Approved leave accepted';end if;
 update medewerker_verlof set status='afgewezen' where salon_id=s;
 perform * from kronr_boek_afspraken(jsonb_build_array(r),'{}');
 if (select count(*) from afspraken where salon_id=s)<>1 then raise exception 'Rejected requests changed bookings';end if;
end $$;
