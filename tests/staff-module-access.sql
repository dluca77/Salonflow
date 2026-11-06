
do $$
declare owner_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();other_owner uuid:=gen_random_uuid();s uuid:=gen_random_uuid();foreign_s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(owner_id,'owner-'||owner_id||'@example.invalid'),(staff_id,'staff-'||staff_id||'@example.invalid'),(other_owner,'foreign-'||other_owner||'@example.invalid');
 insert into salons(id,owner_id,naam) values(s,owner_id,'Permission audit'),(foreign_s,other_owner,'Other salon');
 insert into medewerkers(id,salon_id,auth_user_id,naam,actief,rechten) values(m,s,staff_id,'Staff audit',true,'{"agenda":"bewerken","klanten":"bekijken","diensten":"bewerken","kassa":"geen","rapportages":"geen"}');
 insert into klanten(salon_id,naam,email) values(s,'Visible customer','visible@example.invalid'),(foreign_s,'Hidden customer','hidden@example.invalid');
 insert into afspraken(salon_id,medewerker_id,klant_naam,datum_tijd,duur_min,status) values(s,m,'Visible booking',now()+interval '1 day',30,'gepland'),(foreign_s,null,'Hidden booking',now()+interval '1 day',30,'gepland');
 perform set_config('audit.salon',s::text,true);perform set_config('audit.foreign',foreign_s::text,true);perform set_config('audit.staff',m::text,true);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare s uuid:=current_setting('audit.salon')::uuid;f uuid:=current_setting('audit.foreign')::uuid;n integer;
begin
 if kronr_medewerker_context(s)->>'naam'<>'Permission audit' then raise exception 'Staff context unavailable';end if;
 if kronr_medewerker_context(f) is not null then raise exception 'Foreign context exposed';end if;
 if (select count(*) from kronr_team_overzicht(s))<>1 then raise exception 'Roster unavailable';end if;
 if (select count(*) from klanten where salon_id=s)<>1 then raise exception 'Customer view denied';end if;
 if exists(select 1 from klanten where salon_id=f) then raise exception 'Foreign customers exposed';end if;
 update klanten set naam='FORBIDDEN' where salon_id=s;get diagnostics n=row_count;
 if n<>0 then raise exception 'Read-only customer modified';end if;
 update afspraken set status='bevestigd' where salon_id=s;get diagnostics n=row_count;
 if n<>1 then raise exception 'Agenda editing denied';end if;
 update afspraken set status='bevestigd' where salon_id=f;get diagnostics n=row_count;
 if n<>0 then raise exception 'Foreign agenda modified';end if;
 if kronr_mag_module(s,'kassa',array['gebruiken']) then raise exception 'Cash access leaked';end if;
end $$;
reset role;
update medewerkers set actief=false where id=current_setting('audit.staff')::uuid;
set local role authenticated;
do $$
begin
 if kronr_medewerker_context(current_setting('audit.salon')::uuid) is not null then raise exception 'Inactive staff context allowed';end if;
 if exists(select 1 from afspraken where salon_id=current_setting('audit.salon')::uuid) then raise exception 'Inactive roster allowed';end if;
 if exists(select 1 from klanten where salon_id=current_setting('audit.salon')::uuid) then raise exception 'Inactive customers allowed';end if;
end $$;
reset role;
