begin;
do $$ declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,'launch-protection-'||u||'@example.invalid',now(),'{"bedrijf_naam":"Protected salon"}');
 insert into salons(id,owner_id,naam,plan) values(s,u,'Protected salon','free');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('audit.salon',s::text,true);
end $$;
set local role authenticated;
do $$ declare s uuid:=current_setting('audit.salon')::uuid; blocked boolean;begin
 update salons set naam='Allowed profile change' where id=s;
 if (select naam from salons where id=s)<>'Allowed profile change' then raise exception 'Profile update denied';end if;
 blocked:=false;begin update salons set plan='business' where id=s;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Plan escalation';end if;
 blocked:=false;begin update salons set created_at=now()+interval '1 year' where id=s;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Trial reset';end if;
 blocked:=false;begin update salons set stripe_customer_id='cus_forged' where id=s;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Billing customer injection';end if;
 blocked:=false;begin insert into salons(owner_id,naam) values(auth.uid(),'Second trial');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Direct duplicate provisioning';end if;
 if (kronr_start_salon()).id<>s then raise exception 'Existing owner startup broken';end if;
end $$;
reset role;
rollback;
select 'PASS profile edits allowed; plan, billing, trial reset and direct salon inserts denied' as result;
