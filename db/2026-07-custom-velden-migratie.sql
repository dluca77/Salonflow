-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Flexibele custom-velden op klanten
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- WAAROM: het klantprofiel was volledig vastgetimmerd op de kapper-casus
-- (naam, telefoon, e-mail, geslacht, notitie). Een hondentrimsalon wil
-- ras/gewicht/gedrag vastleggen, een fysiopraktijk allergieën, een
-- schoonheidssalon huidtype -- allemaal anders per branche. In plaats van
-- voor elke branche een eigen tabel/kolom te bouwen, laat deze migratie
-- de salon-eigenaar zelf definiëren welke extra velden hij per klant wil
-- bijhouden; de waardes komen in één jsonb-kolom op klanten te staan.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists custom_veld_definities (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  naam text not null,
  type text not null default 'tekst' check (type in ('tekst', 'getal', 'checkbox')),
  volgorde integer not null default 0,
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists custom_veld_definities_salon_idx on custom_veld_definities(salon_id, actief, volgorde);

alter table custom_veld_definities enable row level security;

drop policy if exists "custom_veld_definities_select_eigen_salon" on custom_veld_definities;
create policy "custom_veld_definities_select_eigen_salon" on custom_veld_definities
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

drop policy if exists "custom_veld_definities_write_eigenaar" on custom_veld_definities;
create policy "custom_veld_definities_write_eigenaar" on custom_veld_definities
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

alter table klanten add column if not exists custom_velden jsonb not null default '{}'::jsonb;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. instellingen/index.html krijgt een sectie om custom-veld-
-- definities te beheren (naam + type). klanten/index.html rendert deze
-- velden dynamisch in het klant-detail- en bewerk-scherm en slaat de
-- waardes op in klanten.custom_velden (key = custom_veld_definitie.id).
-- ══════════════════════════════════════════════════════════════════════
