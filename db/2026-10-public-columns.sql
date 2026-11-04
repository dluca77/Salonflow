begin;
-- Booking pages need public display fields, never employee invitation tokens,
-- personal contact details, commission settings or owner/payment identifiers.
revoke select on public.medewerkers from anon;
grant select(id,salon_id,naam,rol,kleur,actief,locatie_id) on public.medewerkers to anon;
revoke select on public.salons from anon;
grant select(id,naam,type_bedrijf,telefoon,adres,stad,stripe_connect_status,stempelkaart_actief,
 openingstijden,slug,logo_url,plan,annuleer_cutoff_uren) on public.salons to anon;
commit;
