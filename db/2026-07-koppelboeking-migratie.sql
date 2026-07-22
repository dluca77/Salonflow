-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Koppel/duo-boekingen (spa)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- VEREIST: 2026-07-ruimtes-migratie.sql moet al gedraaid zijn.
--
-- WAAROM: een spa/wellness-salon biedt vaak koppelbehandelingen aan (bv.
-- een koppelmassage) waarbij 2 ruimtes (en meestal ook 2 medewerkers)
-- TEGELIJK voor dezelfde tijd gereserveerd moeten worden, onder wat voor
-- de klant conceptueel 1 boeking is. Het bestaande boekingsmodel legt
-- altijd precies 1 ruimte + 1 medewerker per afspraak-rij vast.
--
-- ONTWERP (bewust conservatief): in plaats van het bestaande model om te
-- bouwen naar "meerdere resources per afspraak", maakt een koppelboeking
-- gewoon 2 gekoppelde afspraak-rijen aan (1 per ruimte/medewerker), die
-- elkaar herkennen via een gedeelde duo_groep_id. Bestaande salons zonder
-- koppelbehandelingen merken hier niets van -- volledig optioneel, net
-- als vereist_ruimte destijds.
--
-- BEWUSTE SCOPE-BEPERKING: koppelbehandelingen slaan voorlopig aanbetaling/
-- kaartgegevens-vereisten/Stripe-koppeling over (2 personen, 1 betaling is
-- een apart vraagstuk) -- de UI biedt de koppel-optie daarom alleen aan
-- bij diensten zonder aanbetaling en zonder vereiste kaartgegevens.
-- ══════════════════════════════════════════════════════════════════════

alter table diensten add column if not exists koppel_optie boolean not null default false;
alter table afspraken add column if not exists duo_groep_id uuid;

create index if not exists afspraken_duo_groep_idx on afspraken(duo_groep_id) where duo_groep_id is not null;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. diensten/index.html krijgt een 'Kan als koppelbehandeling
-- geboekt worden'-schakelaar (alleen zinvol i.c.m. 'vereist een ruimte').
-- boeken/index.html toont bij zo'n dienst een keuze 'Alleen ik' / 'Met
-- een tweede persoon', en maakt bij koppel 2 gekoppelde afspraak-rijen
-- aan (2 verschillende ruimtes + 2 verschillende medewerkers, zelfde
-- tijd/duur/dienst, gedeelde duo_groep_id).
-- ══════════════════════════════════════════════════════════════════════
