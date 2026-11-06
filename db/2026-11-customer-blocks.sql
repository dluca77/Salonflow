begin;
create table if not exists public.geblokkeerde_klanten(
 id uuid primary key default gen_random_uuid(),salon_id uuid not null references public.salons(id) on delete cascade,
 email text,telefoon text,reden text,created_at timestamptz not null default now(),
 check(nullif(trim(email),'') is not null or nullif(trim(telefoon),'') is not null)
);
alter table public.geblokkeerde_klanten enable row level security;
revoke all on public.geblokkeerde_klanten from anon;
grant select,insert,update,delete on public.geblokkeerde_klanten to authenticated;
create policy kronr_blokkades_lezen on public.geblokkeerde_klanten for select to authenticated using(kronr_mag_module(salon_id,'klanten',array['bekijken','bewerken']));
create policy kronr_blokkades_beheren on public.geblokkeerde_klanten for all to authenticated using(kronr_mag_module(salon_id,'klanten',array['bewerken'])) with check(kronr_mag_module(salon_id,'klanten',array['bewerken']));
create index if not exists geblokkeerde_klanten_salon_idx on public.geblokkeerde_klanten(salon_id);
create or replace function public.kronr_controleer_klant(p_salon uuid,p_email text,p_telefoon text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from geblokkeerde_klanten b where b.salon_id=p_salon and (
 (nullif(trim(p_email),'') is not null and lower(trim(b.email))=lower(trim(p_email))) or
 (length(regexp_replace(coalesce(p_telefoon,''),'[^0-9]','','g'))>=7 and regexp_replace(b.telefoon,'[^0-9]','','g')=regexp_replace(p_telefoon,'[^0-9]','','g')))) then
 raise exception 'Online boeken is niet mogelijk. Neem contact op met de salon.';
 end if;
end $$;
revoke all on function public.kronr_controleer_klant(uuid,text,text) from public,anon,authenticated;
create or replace function public.kronr_boek_afspraken(p_rows jsonb,p_extra uuid[] default '{}')
returns table(id uuid,annuleer_token uuid,traject_id uuid,traject_sessienummer integer)
language plpgsql security definer set search_path=public as $$
declare r jsonb; d diensten%rowtype; v dienst_varianten%rowtype; sid uuid;
 aid uuid; token uuid; start_at timestamptz; minutes integer; price numeric;
 mid uuid; rid uuid; lid uuid; extra_minutes integer; result_ids uuid[]:='{}'; abo uuid; tid uuid; sessie integer; tr record;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2 then raise exception 'Ongeldige boeking'; end if;
 if cardinality(p_extra)>20 then raise exception 'Te veel extra diensten'; end if;
 sid:=(p_rows->0->>'salon_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,93));
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'salon_id')::uuid is distinct from sid then raise exception 'Ongeldige salon'; end if;
  select * into d from diensten where diensten.id=(r->>'dienst_id')::uuid and salon_id=sid and actief;
  if not found then raise exception 'Dienst niet beschikbaar'; end if;
  if jsonb_array_length(p_rows)=2 and not coalesce(d.koppel_optie,false) then raise exception 'Geen koppelbehandeling'; end if;
  minutes:=d.duur_min; price:=d.prijs;
  if nullif(r->>'dienst_variant_id','') is not null then
   select * into v from dienst_varianten where dienst_varianten.id=(r->>'dienst_variant_id')::uuid and dienst_id=d.id and salon_id=sid and actief;
   if not found then raise exception 'Variant niet beschikbaar'; end if;
   minutes:=v.duur_min;price:=v.prijs;
  end if;
  if (select count(*) from diensten where diensten.id=any(p_extra) and salon_id=sid and actief)<>cardinality(p_extra) then raise exception 'Ongeldige extra dienst'; end if;
  select coalesce(sum(duur_min),0) into extra_minutes from diensten where diensten.id=any(p_extra);
  minutes:=minutes+extra_minutes;
  if minutes is null or minutes not between 1 and 1440 then raise exception 'Ongeldige duur'; end if;
  start_at:=(r->>'datum_tijd')::timestamptz;
  if start_at is null or start_at<now() or start_at>now()+interval '2 years' then raise exception 'Ongeldige datum'; end if;
  if length(trim(coalesce(r->>'klant_naam',''))) not between 1 and 200 or coalesce(r->>'klant_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(r->>'klant_email')>254 then raise exception 'Ongeldige klantgegevens'; end if;
  perform public.kronr_controleer_klant(sid,r->>'klant_email',r->>'klant_telefoon');
  mid:=(r->>'medewerker_id')::uuid;rid:=nullif(r->>'ruimte_id','')::uuid;lid:=nullif(r->>'locatie_id','')::uuid;
  if not exists(select 1 from medewerkers where medewerkers.id=mid and salon_id=sid and actief and (lid is null or locatie_id is null or locatie_id=lid)) then raise exception 'Medewerker niet beschikbaar'; end if;
  if lid is not null and not exists(select 1 from locaties where locaties.id=lid and salon_id=sid and actief) then raise exception 'Ongeldige locatie'; end if;
  if coalesce(d.vereist_ruimte,false) and rid is null then raise exception 'Kies een beschikbare ruimte'; end if;
  if rid is not null and not exists(select 1 from ruimtes where ruimtes.id=rid and salon_id=sid and actief and (lid is null or locatie_id is null or locatie_id=lid)) then raise exception 'Ongeldige ruimte'; end if;
  perform public.kronr_controleer_boeking(sid,mid,start_at,minutes);
  if exists(select 1 from afspraken a where a.salon_id=sid and a.status not in ('geannuleerd','verplaatst') and (a.medewerker_id=mid or (rid is not null and a.ruimte_id=rid)) and a.datum_tijd<start_at+make_interval(mins=>minutes) and a.datum_tijd+make_interval(mins=>a.duur_min)>start_at) then raise exception 'Deze tijd is niet meer beschikbaar'; end if;
  abo:=nullif(r->>'gebruikt_abonnement_id','')::uuid;
  if abo is not null then
   if jsonb_array_length(p_rows)>1 or not exists(select 1 from klant_abonnementen ka join abonnement_plannen ap on ap.id=ka.plan_id where ka.id=abo and ka.salon_id=sid and lower(ka.klant_email)=lower(trim(r->>'klant_email')) and (ap.dienst_id is null or ap.dienst_id=d.id)) then raise exception 'Ongeldig abonnement'; end if;
   if not public.verbruik_abonnement_credit(abo,r->>'klant_email') then raise exception 'Geen abonnementstegoed'; end if;
  end if;
  if coalesce(d.traject_sessies,0)>0 and tid is null then
   select * into tr from public.vind_of_maak_traject(sid,r->>'klant_email',d.id,r->>'klant_naam',d.traject_sessies);
   tid:=tr.id;sessie:=tr.geboekte_sessies;
  end if;
  insert into afspraken(salon_id,dienst_id,dienst_variant_id,medewerker_id,ruimte_id,locatie_id,datum_tijd,duur_min,status,klant_naam,klant_email,klant_telefoon,notities,duo_groep_id,referentie_foto_url,aanbetaling_status,aanbetaling_bedrag,noshow_fee_status,gebruikt_abonnement_id,traject_id,traject_sessienummer)
  values(sid,d.id,nullif(r->>'dienst_variant_id','')::uuid,mid,rid,lid,start_at,minutes,'gepland',trim(r->>'klant_naam'),lower(trim(r->>'klant_email')),left(r->>'klant_telefoon',50),left(r->>'notities',4000),nullif(r->>'duo_groep_id','')::uuid,left(r->>'referentie_foto_url',2000),
   case when d.aanbetaling_type is not null then 'in_afwachting' else null end,
   case when d.aanbetaling_type='percentage' then round(price*d.aanbetaling_bedrag/100,2) when d.aanbetaling_type is not null then d.aanbetaling_bedrag else null end,
   case when d.vereist_kaartgegevens then 'in_afwachting' else null end,abo,tid,sessie)
  returning afspraken.id,afspraken.annuleer_token into aid,token;
  insert into afspraak_extra_diensten(afspraak_id,dienst_id,naam,prijs,duur_min)
   select aid,e.id,e.naam,e.prijs,e.duur_min from diensten e where e.id=any(p_extra);
  result_ids:=array_append(result_ids,aid);
 end loop;
 return query select a.id,a.annuleer_token,a.traject_id,a.traject_sessienummer from afspraken a where a.id=any(result_ids) order by array_position(result_ids,a.id);
end $$;
revoke all on function public.kronr_boek_afspraken(jsonb,uuid[]) from public;
grant execute on function public.kronr_boek_afspraken(jsonb,uuid[]) to anon,authenticated;
create or replace function public.kronr_boek_les(p_les_id uuid,p_klant_naam text,p_klant_email text,p_klant_telefoon text,p_abonnement_id uuid default null)
returns table(id uuid,annuleer_token uuid) language plpgsql security definer set search_path=public as $$
begin
 perform public.kronr_controleer_klant((select salon_id from lessen where lessen.id=p_les_id),p_klant_email,p_klant_telefoon);
 if p_abonnement_id is not null then
  if not exists(select 1 from lessen l join klant_abonnementen ka on ka.salon_id=l.salon_id join abonnement_plannen ap on ap.id=ka.plan_id where l.id=p_les_id and ka.id=p_abonnement_id and lower(ka.klant_email)=lower(p_klant_email) and (ap.dienst_id is null or ap.dienst_id=l.dienst_id)) then raise exception 'Ongeldig abonnement'; end if;
  if not public.verbruik_abonnement_credit(p_abonnement_id,p_klant_email) then raise exception 'Geen abonnementstegoed'; end if;
 end if;
 return query select * from public.boek_les(p_les_id,p_klant_naam,p_klant_email,p_klant_telefoon);
end $$;
revoke all on function public.kronr_boek_les(uuid,text,text,text,uuid) from public;
grant execute on function public.kronr_boek_les(uuid,text,text,text,uuid) to anon,authenticated;
commit;
