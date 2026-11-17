begin;
-- One salon per new owner even when two tabs initialize concurrently.
-- Metadata is profile input only; access and billing are never read from it.
create or replace function public.kronr_start_salon()
returns public.salons
language plpgsql security definer set search_path=public,pg_temp as $$
declare u auth.users; s public.salons; business_name text;
begin
 if auth.uid() is null then raise exception 'Log eerst in'; end if;
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'Bevestig eerst je e-mailadres'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id::text,71));
 select * into s from public.salons where owner_id=u.id order by created_at limit 1;
 if s.id is not null then return s; end if;
 if exists(select 1 from public.medewerkers where auth_user_id=u.id)
 or exists(select 1 from public.kronr_team where auth_user_id=u.id) then
  raise exception 'Dit account hoort bij een bestaand team';
 end if;
 business_name:=nullif(trim(u.raw_user_meta_data->>'bedrijf_naam'),'');
 if business_name is null then raise exception 'Bedrijfsnaam ontbreekt'; end if;
 insert into public.salons(owner_id,naam,type_bedrijf,email,contact_naam,telefoon,plan)
 values(u.id,left(business_name,150),left(coalesce(nullif(u.raw_user_meta_data->>'type_bedrijf',''),'Kapper'),50),
 u.email,left(u.raw_user_meta_data->>'contact_naam',150),left(u.raw_user_meta_data->>'telefoon',30),'free')
 returning * into s;
 return s;
end;
$$;
revoke all on function public.kronr_start_salon() from public,anon;
grant execute on function public.kronr_start_salon() to authenticated;
commit;
