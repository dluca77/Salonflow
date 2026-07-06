-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Meerdere locaties
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- SCOPE-KEUZE (bewust, geen aparte afstemming over gedaan): locatie_id
-- komt op de tabellen die dagelijks per vestiging verschillen --
-- medewerkers, diensten, afspraken, betalingen, verkoop_items. Klanten,
-- cadeaubonnen en klantabonnementen blijven SALON-BREED (niet per
-- locatie gesplitst) -- een cadeaubon of abonnement gekocht bij vestiging
-- A moet ook bij vestiging B werken, en een klant is 1 persoon ongeacht
-- waar ze langskomen. Rapportages/instellingen kunnen per locatie EN
-- salon-breed bekeken worden (filter, geen harde scheiding).
--
-- Salons met maar 1 locatie merken hier niets van -- de locatie-switcher
-- verschijnt pas zodra er 2 of meer locaties zijn (zie kronr.js).
-- Bij het draaien van deze migratie krijgt elke salon automatisch 1
-- 'Hoofdvestiging' met alle bestaande data eraan gekoppeld, zodat er
-- niets verloren gaat of stuk gaat voor bestaande salons.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists locaties (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  naam text not null,
  adres text,
  stad text,
  telefoon text,
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists locaties_salon_idx on locaties(salon_id);

alter table locaties enable row level security;

drop policy if exists "locaties_select_own_salon" on locaties;
create policy "locaties_select_own_salon" on locaties
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
-- Ook publiek leesbaar (voor boeken.html, dat niet ingelogd is)
drop policy if exists "locaties_select_publiek" on locaties;
create policy "locaties_select_publiek" on locaties
  for select using (actief = true);

drop policy if exists "locaties_insert_own_salon" on locaties;
create policy "locaties_insert_own_salon" on locaties
  for insert with check (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
drop policy if exists "locaties_update_own_salon" on locaties;
create policy "locaties_update_own_salon" on locaties
  for update using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- Kolommen toevoegen aan de dagelijkse-operatie-tabellen -----------------
alter table medewerkers add column if not exists locatie_id uuid references locaties(id) on delete set null;
alter table diensten add column if not exists locatie_id uuid references locaties(id) on delete set null;
alter table afspraken add column if not exists locatie_id uuid references locaties(id) on delete set null;
alter table betalingen add column if not exists locatie_id uuid references locaties(id) on delete set null;
alter table verkoop_items add column if not exists locatie_id uuid references locaties(id) on delete set null;

create index if not exists medewerkers_locatie_idx on medewerkers(locatie_id);
create index if not exists diensten_locatie_idx on diensten(locatie_id);
create index if not exists afspraken_locatie_idx on afspraken(locatie_id);
create index if not exists betalingen_locatie_idx on betalingen(locatie_id);

-- Automatische migratie van bestaande salons: elke salon krijgt 1
-- 'Hoofdvestiging' met naam/adres/stad/telefoon van de salon zelf, en
-- ALLE bestaande medewerkers/diensten/afspraken/betalingen/verkoop_items
-- worden daaraan gekoppeld. Zo werkt alles voor bestaande salons precies
-- zoals voorheen (ze zien de locatie-switcher niet eens, want die
-- verschijnt pas bij 2+ locaties).
do $$
declare
  s record;
  nieuwe_locatie_id uuid;
begin
  for s in select id, naam, adres, stad, telefoon from salons loop
    -- Sla over als deze salon al een locatie heeft (idempotent, veilig
    -- om dit script per ongeluk 2x te draaien)
    if not exists (select 1 from locaties where salon_id = s.id) then
      insert into locaties (salon_id, naam, adres, stad, telefoon)
      values (s.id, 'Hoofdvestiging', s.adres, s.stad, s.telefoon)
      returning id into nieuwe_locatie_id;

      update medewerkers set locatie_id = nieuwe_locatie_id where salon_id = s.id and locatie_id is null;
      update diensten set locatie_id = nieuwe_locatie_id where salon_id = s.id and locatie_id is null;
      update afspraken set locatie_id = nieuwe_locatie_id where salon_id = s.id and locatie_id is null;
      update betalingen set locatie_id = nieuwe_locatie_id where salon_id = s.id and locatie_id is null;
      update verkoop_items set locatie_id = nieuwe_locatie_id where salon_id = s.id and locatie_id is null;
    end if;
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad alle pagina's eenmaal. Nieuwe
-- medewerkers/diensten/afspraken/betalingen die vanaf nu worden
-- aangemaakt krijgen automatisch de HUIDIGE_LOCATIE_ID mee vanuit de
-- frontend (kronr.js) -- niet vanuit de database zelf.
-- ══════════════════════════════════════════════════════════════════════
