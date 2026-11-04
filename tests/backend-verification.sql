do $$
declare u uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); token text; n integer; event text:='evt_audit'||replace(gen_random_uuid()::text,'-',''); rejected boolean;
begin
 insert into auth.users(id,email) values(u,'kronr-audit-'||u||'@example.invalid');
 insert into public.salons(id,owner_id,naam,plan,stempelkaart_actief,stempel_aantal_nodig) values(s,u,'Rollback verification','free',true,10);
 if has_function_privilege('anon','public.vraag_stempelkaart_code_aan(uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.vraag_stempelkaart_code_aan(uuid,text)','EXECUTE') then raise exception 'FAIL: code generation exposed'; end if;
 if has_function_privilege('anon','public.get_stempelkaart(uuid,text)','EXECUTE') then raise exception 'FAIL: unverified loyalty lookup'; end if;
 token:=public.vraag_stempelkaart_code_aan(s,'audit@example.invalid');
 for n in 1..5 loop
  perform * from public.bevestig_stempelkaart_code(s,'audit@example.invalid','invalid');
 end loop;
 if exists(select 1 from public.bevestig_stempelkaart_code(s,'audit@example.invalid',token)) then raise exception 'FAIL: attempt limit bypass'; end if;
 token:=public.vraag_stempelkaart_code_aan(s,'audit@example.invalid');
 if not exists(select 1 from public.bevestig_stempelkaart_code(s,'audit@example.invalid',token)) then raise exception 'FAIL: valid code rejected'; end if;
 if exists(select 1 from public.bevestig_stempelkaart_code(s,'audit@example.invalid',token)) then raise exception 'FAIL: code replay'; end if;
 if not public.kronr_apply_stripe_event(event,'[]') then raise exception 'FAIL: first webhook rejected'; end if;
 if public.kronr_apply_stripe_event(event,'[]') then raise exception 'FAIL: duplicate webhook accepted'; end if;
 event:=event||'failure'; rejected:=false;
 begin
  perform public.kronr_apply_stripe_event(event,'[{"kind":"invalid","account":"acct_missing"}]');
 exception when others then rejected:=true; end;
 if not rejected or exists(select 1 from public.stripe_verwerkte_events where event_id=event) then raise exception 'FAIL: failed event prevents retry'; end if;
 if not public.kronr_claim_request(event,1,60) then raise exception 'FAIL: first request rejected'; end if;
 if public.kronr_claim_request(event,1,60) then raise exception 'FAIL: rate limit ignored'; end if;
end;
$$;
