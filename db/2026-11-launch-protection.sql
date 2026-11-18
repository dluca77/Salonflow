begin;
-- Provisioning goes through kronr_start_salon, which verifies identity and locks the owner.
revoke insert on public.salons from public,anon,authenticated;
create or replace function public.kronr_bescherm_salon_systeemvelden()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare field text; team_member boolean;
begin
 if auth.role() is distinct from 'authenticated' then return new; end if;
 select exists(select 1 from public.kronr_team where auth_user_id=auth.uid()) into team_member;
 foreach field in array array['id','owner_id','created_at','stripe_customer_id','stripe_subscription_id','stripe_connect_account_id','stripe_connect_status'] loop
  if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
   raise exception 'Dit systeemveld kan niet via je profiel worden gewijzigd' using errcode='42501';
  end if;
 end loop;
 if not team_member and (new.plan is distinct from old.plan or new.gepauzeerd is distinct from old.gepauzeerd) then
  raise exception 'Abonnement en accountstatus worden door Kronr beheerd' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.kronr_bescherm_salon_systeemvelden() from public,anon,authenticated;
drop trigger if exists kronr_bescherm_salon_systeemvelden on public.salons;
create trigger kronr_bescherm_salon_systeemvelden before update on public.salons
 for each row execute function public.kronr_bescherm_salon_systeemvelden();
-- These administrative RPCs are never part of the public booking flow.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace
 and proname in ('accepteer_medewerker_uitnodiging','bekijk_kassa_dag_totalen','get_kassa_afsluitingen','get_lage_voorraad_producten','get_salon_laatste_activiteit','maak_medewerker_uitnodiging','sluit_kassa_dag_af','vind_lessen_wachtlijst_match','vind_wachtlijst_match') loop
  execute format('revoke execute on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated,service_role',f.signature);
 end loop;
end $$;
commit;
