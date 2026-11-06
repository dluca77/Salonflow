-- Append to migration body, before ROLLBACK instead of COMMIT.
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();e uuid:=gen_random_uuid(); r jsonb; receipt record; failed boolean; ap uuid:=gen_random_uuid();ka uuid:=gen_random_uuid();lesson uuid:=gen_random_uuid(); proof uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(u,'booking-audit-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,plan) values(s,u,'Booking audit','free');
 insert into kronr_email_bewijzen(token,salon_id,email) values(proof,s,'booking@example.invalid');
 update salons set openingstijden='{}'::jsonb where id=s;
 insert into medewerkers(id,salon_id,naam,actief) values(m,s,'Audit medewerker',true);
 insert into diensten(id,salon_id,naam,actief,prijs,duur_min) values(d,s,'Audit behandeling',true,50,30),(e,s,'Extra',true,10,15);
 r:=jsonb_build_object('salon_id',s,'medewerker_id',m,'dienst_id',d,'datum_tijd',((current_date+8)::timestamp+time '12:00') at time zone 'Europe/Amsterdam','klant_naam','Test klant','klant_email','booking@example.invalid','status','afgerond','duur_min',1,'abonnement_token',proof);
 select * into receipt from kronr_boek_afspraken(jsonb_build_array(r),array[e]);
 if receipt.id is null or receipt.annuleer_token is null then raise exception 'Missing booking receipt'; end if;
 if not exists(select 1 from afspraken where id=receipt.id and duur_min=45 and status='gepland') then raise exception 'Client forged booking fields'; end if;
 if not exists(select 1 from afspraak_extra_diensten where afspraak_id=receipt.id and dienst_id=e) then raise exception 'Missing extra service'; end if;
 if kronr_boeking_status(receipt.id,gen_random_uuid()) is not null then raise exception 'Invalid receipt exposed booking'; end if;
 if kronr_boeking_status(receipt.id,receipt.annuleer_token) is null then raise exception 'Receipt unavailable'; end if;
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r),array[e]); exception when others then failed:=true;end;
 if not failed then raise exception 'Double booking accepted'; end if;
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r||jsonb_build_object('medewerker_id',gen_random_uuid())),'{}'); exception when others then failed:=true;end;
 if not failed then raise exception 'Foreign employee accepted'; end if;
 insert into abonnement_plannen(id,salon_id,dienst_id,naam,credits_per_maand,prijs_per_maand,actief) values(ap,s,d,'Audit membership',2,25,true);
 insert into klant_abonnementen(id,salon_id,plan_id,klant_naam,klant_email,status,credits_resterend) values(ka,s,ap,'Test klant','booking@example.invalid','actief',2);
 insert into lessen(id,salon_id,dienst_id,datum_tijd,duur_min,capaciteit,status) values(lesson,s,d,now()+interval '3 days',30,1,'gepland');
 perform * from kronr_boek_les(lesson,'Test klant','booking@example.invalid',null,ka,proof);
 if (select credits_resterend from klant_abonnementen where id=ka)<>1 then raise exception 'Lesson credit not consumed'; end if;
 failed:=false;
 begin perform * from kronr_boek_les(lesson,'Test klant','booking@example.invalid',null,ka,proof);exception when others then failed:=true;end;
 if not failed or (select credits_resterend from klant_abonnementen where id=ka)<>1 then raise exception 'Full lesson lost credit'; end if;
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r||jsonb_build_object('gebruikt_abonnement_id',ka)),array[e]);exception when others then failed:=true;end;
 if not failed or (select credits_resterend from klant_abonnementen where id=ka)<>1 then raise exception 'Unavailable appointment lost credit'; end if;
end $$;
