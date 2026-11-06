
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();ap uuid:=gen_random_uuid();ka uuid:=gen_random_uuid();l uuid:=gen_random_uuid();code text;proof uuid;failed boolean;r jsonb;i integer;
begin
 insert into auth.users(id,email) values(u,'membership-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,openingstijden) values(s,u,'Membership test','{}');
 insert into medewerkers(id,salon_id,naam,actief) values(m,s,'Test',true);
 insert into diensten(id,salon_id,naam,actief,prijs,duur_min) values(d,s,'Test',true,25,30);
 insert into abonnement_plannen(id,salon_id,dienst_id,naam,credits_per_maand,prijs_per_maand,actief) values(ap,s,d,'Test',3,25,true);
 insert into klant_abonnementen(id,salon_id,plan_id,klant_naam,klant_email,status,credits_resterend) values(ka,s,ap,'Test','member@example.invalid','actief',3);
 insert into lessen(id,salon_id,dienst_id,datum_tijd,duur_min,capaciteit,status) values(l,s,d,now()+interval '10 days',30,1,'gepland');
 code:=vraag_stempelkaart_code_aan(s,'member@example.invalid');
 for i in 1..5 loop
  if kronr_verifieer_email(s,'member@example.invalid','invalid') is not null then raise exception 'Wrong code accepted';end if;
 end loop;
 if kronr_verifieer_email(s,'member@example.invalid',code) is not null then raise exception 'Attempt limit bypassed';end if;
 code:=vraag_stempelkaart_code_aan(s,'member@example.invalid');proof:=kronr_verifieer_email(s,'member@example.invalid',code);
 if proof is null then raise exception 'Valid code rejected';end if;
 if kronr_verifieer_email(s,'member@example.invalid',code) is not null then raise exception 'Code replay accepted';end if;
 if kronr_email_bevestigd(s,'someone@example.invalid',proof) then raise exception 'Proof email binding failed';end if;
 if kronr_email_bevestigd(gen_random_uuid(),'member@example.invalid',proof) then raise exception 'Proof salon binding failed';end if;
 if not exists(select 1 from kronr_abonnement_tegoed(s,'member@example.invalid',d,proof) where heeft_tegoed and credits_resterend=3) then raise exception 'Verified lookup failed';end if;
 r:=jsonb_build_object('salon_id',s,'dienst_id',d,'medewerker_id',m,'datum_tijd',((current_date+8)::timestamp+time '12:00') at time zone 'Europe/Amsterdam','klant_naam','Test','klant_email','member@example.invalid','gebruikt_abonnement_id',ka);
 failed:=false;
 begin perform * from kronr_boek_afspraken(jsonb_build_array(r),'{}');exception when others then if sqlerrm not like '%Bevestig%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Unverified membership booked';end if;
 perform * from kronr_boek_afspraken(jsonb_build_array(r||jsonb_build_object('abonnement_token',proof)),'{}');
 failed:=false;
 begin perform * from kronr_boek_les(l,'Test','member@example.invalid',null,ka);exception when others then if sqlerrm not like '%Bevestig%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Legacy endpoint bypass';end if;
 perform * from kronr_boek_les(l,'Test','member@example.invalid',null,ka,proof);
 if (select credits_resterend from klant_abonnementen where id=ka)<>1 then raise exception 'Incorrect credit balance';end if;
 update kronr_email_bewijzen set verloopt_op=now()-interval '1 second' where token=proof;
 if kronr_email_bevestigd(s,'member@example.invalid',proof) then raise exception 'Expired proof accepted';end if;
 if has_function_privilege('anon','get_abonnement_tegoed(uuid,text,uuid)','execute') then raise exception 'Legacy anonymous lookup exposed';end if;
end $$;
