-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Fix: verbruik_abonnement_credit mist p_email-parameter
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit 1x in de Supabase SQL editor (na 2026-07-abonnementen-migratie.sql).
--
-- WAAROM: boeken/index.html roept verbruik_abonnement_credit aan met zowel
-- p_abonnement_id als p_email, maar de functie in de abonnementen-migratie
-- accepteert alleen p_abonnement_id. Met PostgREST faalt een RPC-aanroep
-- met een onbekende named parameter -- élke boeking die een abonnement-
-- tegoed gebruikt, zou hierdoor stuklopen. Als bonus checken we hier ook
-- meteen of het e-mailadres bij het abonnement hoort, zodat je niet met
-- een geraden/afgekeken abonnement_id iemand anders' tegoed kunt verbruiken.
-- ══════════════════════════════════════════════════════════════════════

drop function if exists verbruik_abonnement_credit(uuid);

create or replace function verbruik_abonnement_credit(p_abonnement_id uuid, p_email text)
returns boolean
security definer
language plpgsql
as $$
declare
  v_bijgewerkt integer;
begin
  update klant_abonnementen
  set credits_resterend = credits_resterend - 1
  where id = p_abonnement_id
    and lower(klant_email) = lower(p_email)
    and credits_resterend > 0
    and status = 'actief';

  get diagnostics v_bijgewerkt = row_count;
  return v_bijgewerkt > 0;
end;
$$;
