begin;
-- Context contains display/configuration fields, never owner or payment identifiers.
create or replace function public.kronr_medewerker_context(p_salon uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',s.id,'naam',s.naam,'type_bedrijf',s.type_bedrijf,'plan',s.plan,'created_at',s.created_at,'logo_url',s.logo_url,'openingstijden',s.openingstijden)
 from salons s where s.id=p_salon and exists(select 1 from medewerkers m where m.salon_id=s.id and m.auth_user_id=auth.uid() and m.actief);
$$;
revoke all on function public.kronr_medewerker_context(uuid) from public,anon;
grant execute on function public.kronr_medewerker_context(uuid) to authenticated;
create or replace function public.kronr_team_overzicht(p_salon uuid)
returns table(id uuid,salon_id uuid,naam text,rol text,kleur text,actief boolean,locatie_id uuid)
language sql stable security definer set search_path=public as $$
 select m.id,m.salon_id,m.naam,m.rol,m.kleur,m.actief,m.locatie_id from medewerkers m
 where m.salon_id=p_salon and m.actief and (
 exists(select 1 from salons s where s.id=p_salon and s.owner_id=auth.uid()) or
 exists(select 1 from medewerkers me where me.salon_id=p_salon and me.auth_user_id=auth.uid() and me.actief));
$$;
revoke all on function public.kronr_team_overzicht(uuid) from public,anon;
grant execute on function public.kronr_team_overzicht(uuid) to authenticated;
-- Preserve public catalog access and owner access; inactive employees lose module access.
create or replace function public._kronr_medewerker_recht_ok(p_salon_id uuid,p_module text,p_vereist text[])
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from salons where id=p_salon_id and owner_id=auth.uid())
 or not exists(select 1 from medewerkers where auth_user_id=auth.uid())
 or exists(select 1 from medewerkers where auth_user_id=auth.uid() and salon_id=p_salon_id and actief and rechten->>p_module=any(p_vereist));
$$;
drop policy if exists kronr_staff_klanten_select on public.klanten;
create policy kronr_staff_klanten_select on public.klanten for select to authenticated using (public.kronr_mag_module(salon_id,'klanten',array['bekijken','bewerken']));
drop policy if exists kronr_staff_klanten_insert on public.klanten;
create policy kronr_staff_klanten_insert on public.klanten for insert to authenticated with check (public.kronr_mag_module(salon_id,'klanten',array['bewerken']));
drop policy if exists kronr_staff_klanten_update on public.klanten;
create policy kronr_staff_klanten_update on public.klanten for update to authenticated using (public.kronr_mag_module(salon_id,'klanten',array['bewerken'])) with check (public.kronr_mag_module(salon_id,'klanten',array['bewerken']));
drop policy if exists kronr_staff_klanten_delete on public.klanten;
create policy kronr_staff_klanten_delete on public.klanten for delete to authenticated using (public.kronr_mag_module(salon_id,'klanten',array['bewerken']));
drop policy if exists kronr_staff_diensten_select on public.diensten;
create policy kronr_staff_diensten_select on public.diensten for select to authenticated using (public.kronr_mag_module(salon_id,'diensten',array['bekijken','bewerken']));
drop policy if exists kronr_staff_diensten_insert on public.diensten;
create policy kronr_staff_diensten_insert on public.diensten for insert to authenticated with check (public.kronr_mag_module(salon_id,'diensten',array['bewerken']));
drop policy if exists kronr_staff_diensten_update on public.diensten;
create policy kronr_staff_diensten_update on public.diensten for update to authenticated using (public.kronr_mag_module(salon_id,'diensten',array['bewerken'])) with check (public.kronr_mag_module(salon_id,'diensten',array['bewerken']));
drop policy if exists kronr_staff_diensten_delete on public.diensten;
create policy kronr_staff_diensten_delete on public.diensten for delete to authenticated using (public.kronr_mag_module(salon_id,'diensten',array['bewerken']));
drop policy if exists kronr_staff_dienst_varianten_select on public.dienst_varianten;
create policy kronr_staff_dienst_varianten_select on public.dienst_varianten for select to authenticated using (public.kronr_mag_module(salon_id,'diensten',array['bekijken','bewerken']));
drop policy if exists kronr_staff_dienst_varianten_insert on public.dienst_varianten;
create policy kronr_staff_dienst_varianten_insert on public.dienst_varianten for insert to authenticated with check (public.kronr_mag_module(salon_id,'diensten',array['bewerken']));
drop policy if exists kronr_staff_dienst_varianten_update on public.dienst_varianten;
create policy kronr_staff_dienst_varianten_update on public.dienst_varianten for update to authenticated using (public.kronr_mag_module(salon_id,'diensten',array['bewerken'])) with check (public.kronr_mag_module(salon_id,'diensten',array['bewerken']));
drop policy if exists kronr_staff_dienst_varianten_delete on public.dienst_varianten;
create policy kronr_staff_dienst_varianten_delete on public.dienst_varianten for delete to authenticated using (public.kronr_mag_module(salon_id,'diensten',array['bewerken']));

drop policy if exists kronr_staff_agenda_select on public.afspraken;
create policy kronr_staff_agenda_select on public.afspraken for select to authenticated using (
 kronr_mag_module(salon_id,'agenda',array['bekijken','bewerken']) or kronr_mag_module(salon_id,'kassa',array['gebruiken','bewerken']) or kronr_mag_module(salon_id,'rapportages',array['bekijken','bewerken']));
drop policy if exists kronr_staff_agenda_update on public.afspraken;
create policy kronr_staff_agenda_update on public.afspraken for update to authenticated using(kronr_mag_module(salon_id,'agenda',array['bewerken'])) with check(kronr_mag_module(salon_id,'agenda',array['bewerken']));
drop policy if exists kronr_staff_agenda_delete on public.afspraken;
create policy kronr_staff_agenda_delete on public.afspraken for delete to authenticated using(kronr_mag_module(salon_id,'agenda',array['bewerken']));
drop policy if exists afspraken_select_eigen_rooster on public.afspraken;
create policy afspraken_select_eigen_rooster on public.afspraken for select to authenticated using(exists(select 1 from medewerkers m where m.id=medewerker_id and m.auth_user_id=auth.uid() and m.actief));
drop policy if exists kronr_staff_payments_select on public.betalingen;
create policy kronr_staff_payments_select on public.betalingen for select to authenticated using(kronr_mag_module(salon_id,'kassa',array['gebruiken','bewerken']) or kronr_mag_module(salon_id,'rapportages',array['bekijken','bewerken']));
drop policy if exists restrict_betalingen_select_rechten on public.betalingen;
create policy restrict_betalingen_select_rechten on public.betalingen as restrictive for select using(_kronr_medewerker_recht_ok(salon_id,'kassa',array['gebruiken','bewerken']) or kronr_mag_module(salon_id,'rapportages',array['bekijken','bewerken']));
commit;
