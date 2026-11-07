
do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();ap uuid:=gen_random_uuid();ka uuid:=gen_random_uuid();t uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();account text:='acct_audit'||replace(s::text,'-','');dt timestamptz:=((current_date+8)::timestamp+time '12:00') at time zone 'Europe/Amsterdam';actions jsonb;
begin
 insert into auth.users(id,email) values(u,'events-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam,openingstijden,stripe_connect_account_id,stripe_customer_id,stripe_subscription_id,plan) values(s,u,'Event audit','{}',account,'cus_audit'||s,'sub_current','pro');
 insert into medewerkers(id,salon_id,naam,actief) values(m,s,'Test',true);
 insert into diensten(id,salon_id,naam,actief,prijs,duur_min) values(d,s,'Test',true,25,30);
 insert into abonnement_plannen(id,salon_id,dienst_id,naam,credits_per_maand,prijs_per_maand,actief) values(ap,s,d,'Test',3,25,true);
 insert into klant_abonnementen(id,salon_id,plan_id,klant_naam,klant_email,status,credits_resterend,stripe_subscription_id) values(ka,s,ap,'Test','test@example.invalid','actief',0,'sub_'||ka);
 actions:=jsonb_build_array(jsonb_build_object('kind','credits','account',account,'subscription','sub_'||ka,'invoice','in_audit'||replace(ka::text,'-','')));
 perform kronr_apply_stripe_event('evt_A'||replace(s::text,'-',''),actions);
 perform kronr_apply_stripe_event('evt_B'||replace(s::text,'-',''),actions);
 if (select credits_resterend from klant_abonnementen where id=ka)<>3 then raise exception 'Duplicate invoice granted credit';end if;
 perform kronr_apply_stripe_event('evt_C'||replace(s::text,'-',''),jsonb_build_array(jsonb_build_object('kind','salon_plan','customer','cus_audit'||s,'subscription','sub_old','plan','free')));
 if (select plan from salons where id=s)<>'pro' then raise exception 'Old subscription changed current plan';end if;
 insert into wachtlijst(salon_id,dienst_id,medewerker_id,klant_naam,klant_email,voorgesteld_op,voorgestelde_datum_tijd,claim_token) values(s,d,m,'Test','test@example.invalid',now(),dt,t),(s,d,m,'Second','second@example.invalid',now(),dt,t2);
 if not (claim_wachtlijst_plek(t)->>'success')::boolean then raise exception 'Valid waitlist failed';end if;
 if (claim_wachtlijst_plek(t)->>'success')::boolean then raise exception 'Claim token replay accepted';end if;
 if (claim_wachtlijst_plek(t2)->>'success')::boolean then raise exception 'Taken slot accepted';end if;
 if (select count(*) from afspraken where salon_id=s)<>1 then raise exception 'Duplicate waitlist appointment';end if;
end $$;
