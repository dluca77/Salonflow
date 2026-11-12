begin;
-- Same existing agenda-edit permission; appointment and extras commit together.
create or replace function public.kronr_bewaar_agenda_afspraak(p_data jsonb,p_id uuid default null,p_extra uuid[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare s uuid:=(p_data->>'salon_id')::uuid; a uuid; d uuid:=(p_data->>'dienst_id')::uuid; m uuid:=(p_data->>'medewerker_id')::uuid; loc uuid:=(p_data->>'locatie_id')::uuid;
begin
 if auth.uid() is null or not kronr_mag_module(s,'agenda',array['bewerken']) then raise exception 'Geen toegang';end if;
 if d is not null and not exists(select 1 from diensten where id=d and salon_id=s) then raise exception 'Ongeldige dienst';end if;
 if m is not null and not exists(select 1 from medewerkers where id=m and salon_id=s) then raise exception 'Ongeldige medewerker';end if;
 if loc is not null and not exists(select 1 from locaties where id=loc and salon_id=s) then raise exception 'Ongeldige locatie';end if;
 if exists(select 1 from unnest(p_extra) e where not exists(select 1 from diensten where id=e and salon_id=s)) then raise exception 'Ongeldige extra dienst';end if;
 if p_id is not null then
  select id into a from afspraken where id=p_id and salon_id=s for update;
  if a is null then raise exception 'Afspraak niet gevonden';end if;
  update afspraken set klant_naam=p_data->>'klant_naam',dienst_id=d,medewerker_id=m,datum_tijd=(p_data->>'datum_tijd')::timestamptz,duur_min=(p_data->>'duur_min')::integer,status=p_data->>'status',herhaling=p_data->>'herhaling',herhaling_einde=(p_data->>'herhaling_einde')::date,notities=p_data->>'notities' where id=a;
 else
  insert into afspraken(salon_id,klant_naam,dienst_id,medewerker_id,datum_tijd,duur_min,status,herhaling,herhaling_einde,notities,type,locatie_id)
  values(s,p_data->>'klant_naam',d,m,(p_data->>'datum_tijd')::timestamptz,(p_data->>'duur_min')::integer,p_data->>'status',p_data->>'herhaling',(p_data->>'herhaling_einde')::date,p_data->>'notities','afspraak',loc) returning id into a;
 end if;
 delete from afspraak_extra_diensten where afspraak_id=a and not(dienst_id=any(coalesce(p_extra,'{}')));
 insert into afspraak_extra_diensten(afspraak_id,dienst_id,naam,prijs,duur_min)
 select a,ds.id,ds.naam,ds.prijs,ds.duur_min from diensten ds where ds.id=any(p_extra) and not exists(select 1 from afspraak_extra_diensten e where e.afspraak_id=a and e.dienst_id=ds.id);
 return a;
end $$;
revoke all on function public.kronr_bewaar_agenda_afspraak(jsonb,uuid,uuid[]) from public,anon;
grant execute on function public.kronr_bewaar_agenda_afspraak(jsonb,uuid,uuid[]) to authenticated;
commit;
