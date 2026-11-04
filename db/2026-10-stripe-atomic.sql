begin;
create or replace function public.kronr_apply_stripe_event(p_event_id text,p_actions jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare a jsonb; sid uuid; aid uuid; credits integer;
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' then raise exception 'Invalid event'; end if;
 -- The event receipt and every mutation commit together. Failed processing remains retryable.
 insert into stripe_verwerkte_events(event_id) values(p_event_id) on conflict do nothing;
 if not found then return false; end if;
 for a in select value from jsonb_array_elements(p_actions) loop
  if a->>'kind'='salon_plan' then
   if a->>'plan' not in ('free','starter','pro','business') then raise exception 'Invalid plan'; end if;
   update salons set plan=a->>'plan',stripe_customer_id=a->>'customer',
    stripe_subscription_id=coalesce(a->>'subscription',stripe_subscription_id)
    where (a->>'salon_id' is not null and id=(a->>'salon_id')::uuid)
     or (a->>'salon_id' is null and stripe_customer_id=a->>'customer');
   if not found then raise exception 'Unknown salon'; end if;
  else
   select id into sid from salons where stripe_connect_account_id=a->>'account';
   if sid is null then raise exception 'Unknown connected account'; end if;
   case a->>'kind'
    when 'abo_start' then
     if not exists(select 1 from abonnement_plannen where id=(a->>'plan_id')::uuid and salon_id=sid) then raise exception 'Invalid subscription plan'; end if;
     perform pg_advisory_xact_lock(hashtextextended(a->>'subscription',41));
     if not exists(select 1 from klant_abonnementen where stripe_subscription_id=a->>'subscription') then
      insert into klant_abonnementen(salon_id,plan_id,klant_naam,klant_email,stripe_subscription_id,stripe_customer_id,status,credits_resterend)
      values(sid,(a->>'plan_id')::uuid,a->>'name',a->>'email',a->>'subscription',a->>'customer','actief',0);
     end if;
    when 'appointment' then
     update afspraken set
      stripe_customer_id=coalesce(a->>'customer',stripe_customer_id),
      stripe_payment_method_id=coalesce(a->>'payment_method',stripe_payment_method_id),
      stripe_setup_intent_id=coalesce(a->>'setup_intent',stripe_setup_intent_id),
      noshow_fee_status=case when a->>'payment_method' is not null then 'vastgelegd' else noshow_fee_status end,
      aanbetaling_status=case when (a->>'paid')::boolean then 'betaald' else aanbetaling_status end,
      stripe_payment_intent_id=coalesce(a->>'payment_intent',stripe_payment_intent_id)
      where id=(a->>'appointment_id')::uuid and salon_id=sid;
     if not found then raise exception 'Unknown appointment'; end if;
    when 'credits' then
     select ka.id,ap.credits_per_maand into aid,credits from klant_abonnementen ka join abonnement_plannen ap on ap.id=ka.plan_id
      where ka.salon_id=sid and ka.stripe_subscription_id=a->>'subscription' for update of ka;
     if aid is null then raise exception 'Subscription not created yet; retry'; end if;
     update klant_abonnementen set credits_resterend=coalesce(credits_resterend,0)+coalesce(credits,0) where id=aid;
    when 'abo_cancel' then
     update klant_abonnementen set status='opgezegd',opgezegd_op=now() where salon_id=sid and stripe_subscription_id=a->>'subscription';
    else raise exception 'Unknown action';
   end case;
  end if;
 end loop;
 return true;
end;
$$;
revoke execute on function public.kronr_apply_stripe_event(text,jsonb) from public,anon,authenticated;
grant execute on function public.kronr_apply_stripe_event(text,jsonb) to service_role;
commit;
