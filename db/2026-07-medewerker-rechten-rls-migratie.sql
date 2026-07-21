-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: medewerker-rechten server-side afdwingen (RLS)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- PROBLEEM: medewerkers.rechten (per module 'geen'/'bekijken'/'bewerken')
-- werd tot nu toe ALLEEN door de frontend (kronr.js: heeftRecht/
-- isAlleenBekijken) gecontroleerd. Een medewerker met een geldige sessie
-- kon via de browser-console de Supabase-client rechtstreeks aanroepen
-- (bv. sb.from('betalingen').insert(...)) en zo de UI-beperking omzeilen,
-- omdat de onderliggende RLS-policies alleen op salon-lidmaatschap
-- controleren, niet op de rechten-kolom.
--
-- OPLOSSING: RESTRICTIVE policies toevoegen (i.p.v. nog een permissive
-- policy). In Postgres RLS worden permissive policies met OR gecombineerd
-- (verruimen toegang), maar restrictive policies worden met AND gecombineerd
-- (ze kunnen alleen toegang INPERKEN, nooit verruimen). Dat is precies wat
-- hier nodig is: de bestaande (niet in deze repo zichtbare) salon-brede
-- policies blijven ongewijzigd, maar worden voor medewerker-sessies verder
-- beperkt op basis van hun rechten. Sessies van de salon-eigenaar zelf
-- (auth.uid() = salons.owner_id, geen rij in medewerkers) worden door de
-- "geen gekoppelde medewerker"-voorwaarde niet geraakt.
--
-- LET OP: dit vereist dat medewerkers ook via reguliere Supabase Auth-
-- sessies inloggen (zie 2026-07-medewerker-login-migratie.sql) zodat
-- auth.uid() overeenkomt met medewerkers.auth_user_id.
-- ══════════════════════════════════════════════════════════════════════

-- Helper: heeft de huidige ingelogde gebruiker voldoende rechten op module
-- p_module (voor de gegeven salon), OF is deze sessie geen medewerker
-- (dus waarschijnlijk de eigenaar, of een service-context)?
create or replace function _kronr_medewerker_recht_ok(p_salon_id uuid, p_module text, p_vereist text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from medewerkers m where m.auth_user_id = auth.uid()
    )
    or exists (
      select 1 from medewerkers m
      where m.auth_user_id = auth.uid()
        and m.salon_id = p_salon_id
        and (m.rechten ->> p_module) = any (p_vereist)
    );
$$;

-- ── klanten ────────────────────────────────────────────────────────────
alter table klanten enable row level security;

drop policy if exists "restrict_klanten_select_rechten" on klanten;
create policy "restrict_klanten_select_rechten" on klanten
  as restrictive for select using (
    _kronr_medewerker_recht_ok(salon_id, 'klanten', array['bekijken','bewerken'])
  );

drop policy if exists "restrict_klanten_write_rechten" on klanten;
create policy "restrict_klanten_write_rechten" on klanten
  as restrictive for insert with check (
    _kronr_medewerker_recht_ok(salon_id, 'klanten', array['bewerken'])
  );

drop policy if exists "restrict_klanten_update_rechten" on klanten;
create policy "restrict_klanten_update_rechten" on klanten
  as restrictive for update using (
    _kronr_medewerker_recht_ok(salon_id, 'klanten', array['bewerken'])
  );

drop policy if exists "restrict_klanten_delete_rechten" on klanten;
create policy "restrict_klanten_delete_rechten" on klanten
  as restrictive for delete using (
    _kronr_medewerker_recht_ok(salon_id, 'klanten', array['bewerken'])
  );

-- ── betalingen (kassa) ───────────────────────────────────────────────────
alter table betalingen enable row level security;

drop policy if exists "restrict_betalingen_select_rechten" on betalingen;
create policy "restrict_betalingen_select_rechten" on betalingen
  as restrictive for select using (
    _kronr_medewerker_recht_ok(salon_id, 'kassa', array['gebruiken','bewerken'])
  );

drop policy if exists "restrict_betalingen_insert_rechten" on betalingen;
create policy "restrict_betalingen_insert_rechten" on betalingen
  as restrictive for insert with check (
    _kronr_medewerker_recht_ok(salon_id, 'kassa', array['gebruiken','bewerken'])
  );

-- ── cadeaubonnen (kassa) ────────────────────────────────────────────────
alter table cadeaubonnen enable row level security;

drop policy if exists "restrict_cadeaubonnen_select_rechten" on cadeaubonnen;
create policy "restrict_cadeaubonnen_select_rechten" on cadeaubonnen
  as restrictive for select using (
    _kronr_medewerker_recht_ok(salon_id, 'kassa', array['gebruiken','bewerken'])
  );

drop policy if exists "restrict_cadeaubonnen_write_rechten" on cadeaubonnen;
create policy "restrict_cadeaubonnen_write_rechten" on cadeaubonnen
  as restrictive for insert with check (
    _kronr_medewerker_recht_ok(salon_id, 'kassa', array['gebruiken','bewerken'])
  );

drop policy if exists "restrict_cadeaubonnen_update_rechten" on cadeaubonnen;
create policy "restrict_cadeaubonnen_update_rechten" on cadeaubonnen
  as restrictive for update using (
    _kronr_medewerker_recht_ok(salon_id, 'kassa', array['gebruiken','bewerken'])
  );

-- ── diensten ─────────────────────────────────────────────────────────────
alter table diensten enable row level security;

drop policy if exists "restrict_diensten_select_rechten" on diensten;
create policy "restrict_diensten_select_rechten" on diensten
  as restrictive for select using (
    _kronr_medewerker_recht_ok(salon_id, 'diensten', array['bekijken','bewerken'])
  );

drop policy if exists "restrict_diensten_write_rechten" on diensten;
create policy "restrict_diensten_write_rechten" on diensten
  as restrictive for insert with check (
    _kronr_medewerker_recht_ok(salon_id, 'diensten', array['bewerken'])
  );

drop policy if exists "restrict_diensten_update_rechten" on diensten;
create policy "restrict_diensten_update_rechten" on diensten
  as restrictive for update using (
    _kronr_medewerker_recht_ok(salon_id, 'diensten', array['bewerken'])
  );

-- ══════════════════════════════════════════════════════════════════════
-- BELANGRIJK, controleer dit zelf na het draaien:
-- 1. Rapportages worden in dit project client-side opgebouwd uit
--    afspraken/betalingen (geen aparte 'rapportages'-tabel gevonden in
--    deze repo). De betalingen-restrictive-policy hierboven dekt daarmee
--    ook de omzetcijfers. Als er wel een aparte tabel bestaat waar
--    rapportages.html rechtstreeks uit leest, voeg daar dezelfde
--    restrictive policy aan toe met p_module = 'rapportages'.
-- 2. Dit script kan alleen de policies toevoegen -- of de kolomnamen
--    (salon_id) exact overeenkomen met jouw live schema kun je het beste
--    verifiëren door dit eerst op een Supabase-preview/branch te draaien,
--    niet direct op productie.
-- 3. "gebruiken" is de aanname voor de kassa-waarde (zie het commentaar in
--    2026-07-medewerker-rechten-migratie.sql: "kassa heeft alleen
--    'geen'/'gebruiken'"), maar de default kolomwaarde in die migratie
--    gebruikt nergens het woord "gebruiken" expliciet buiten dat commentaar.
--    Controleer welke exacte string de kassa-toggle in medewerkers/
--    index.html daadwerkelijk opslaat en pas p_vereist hierboven aan als
--    die afwijkt.
-- ══════════════════════════════════════════════════════════════════════
