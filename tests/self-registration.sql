begin;
do $$
declare u uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid(); s public.salons; again public.salons; rejected boolean:=false;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 values(u,'registration-rollback@example.invalid',now(),'{"bedrijf_naam":"Registratietest","contact_naam":"Test Eigenaar","type_bedrijf":"Wellness","telefoon":"+31612345678","plan":"business"}');
 perform set_config('request.jwt.claim.sub',u::text,true);
 s:=public.kronr_start_salon(); again:=public.kronr_start_salon();
 if s.id<>again.id or (select count(*) from salons where owner_id=u)<>1 then raise exception 'Duplicate salon'; end if;
 if s.plan<>'free' or s.contact_naam<>'Test Eigenaar' or s.telefoon<>'+31612345678' or s.naam<>'Registratietest' then raise exception 'Incorrect profile or plan'; end if;
 if s.stripe_customer_id is not null or s.stripe_subscription_id is not null then raise exception 'Unexpected billing'; end if;
 insert into auth.users(id,email,raw_user_meta_data) values(other_user,'unconfirmed-rollback@example.invalid','{"bedrijf_naam":"Unconfirmed"}');
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 begin perform public.kronr_start_salon(); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Unconfirmed owner accepted'; end if;
 if has_function_privilege('anon','public.kronr_start_salon()','EXECUTE') then raise exception 'Anonymous signup provisioning'; end if;
 if not has_function_privilege('authenticated','public.kronr_start_salon()','EXECUTE') then raise exception 'Owner cannot provision'; end if;
end $$;
rollback;
