-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Automatisch annuleringsbeleid
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- BELANGRIJKE WAARSCHUWING over de twee CREATE OR REPLACE FUNCTION-
-- blokken hieronder: ik kan de huidige definitie van
-- get_afspraak_via_token en annuleer_afspraak_via_token niet inzien
-- (die staan alleen in jouw Supabase-project, niet in deze repo). De
-- versies hieronder zijn gebaseerd op wat annuleren.html ervan
-- VERWACHT te krijgen (klant_naam, dienst_naam, datum_tijd, status) --
-- dat zou moeten overeenkomen met wat er al staat, maar CHECK dit ZELF
-- even in de Supabase SQL editor (Database -> Functions) voordat je dit
-- draait, voor het geval de bestaande functie nog extra dingen doet die
-- hier niet in staan (bv. extra logging, andere kolommen).
--
-- Wat dit toevoegt:
--   1. Instelbare annuleer-cutoff per salon (in uren, 0 = geen limiet)
--   2. De cutoff wordt nu ook SERVER-SIDE afgedwongen in
--      annuleer_afspraak_via_token -- niet alleen een client-side check
--      in annuleren.html, want die is te omzeilen door de RPC direct
--      aan te roepen. De check in de frontend is alleen voor snelle UX
--      (meteen tonen dat annuleren niet meer kan, zonder een mislukte
--      aanroep te moeten afwachten).
-- ══════════════════════════════════════════════════════════════════════

alter table salons
  add column if not exists annuleer_cutoff_uren integer not null default 24;

create or replace function get_afspraak_via_token(p_token uuid)
returns table(
  klant_naam text,
  dienst_naam text,
  datum_tijd timestamptz,
  status text,
  annuleer_cutoff_uren integer,
  salon_telefoon text,
  salon_naam text
)
security definer
language sql
as $$
  select
    a.klant_naam,
    d.naam as dienst_naam,
    a.datum_tijd,
    a.status,
    s.annuleer_cutoff_uren,
    s.telefoon as salon_telefoon,
    s.naam as salon_naam
  from afspraken a
  left join diensten d on d.id = a.dienst_id
  join salons s on s.id = a.salon_id
  where a.annuleer_token = p_token;
$$;

create or replace function annuleer_afspraak_via_token(p_token uuid)
returns boolean
security definer
language plpgsql
as $$
declare
  v_afspraak_id uuid;
  v_datum_tijd timestamptz;
  v_cutoff_uren integer;
  v_status text;
begin
  select a.id, a.datum_tijd, a.status, s.annuleer_cutoff_uren
    into v_afspraak_id, v_datum_tijd, v_status, v_cutoff_uren
  from afspraken a
  join salons s on s.id = a.salon_id
  where a.annuleer_token = p_token;

  if v_afspraak_id is null then
    return false; -- token niet gevonden
  end if;

  if v_status = 'geannuleerd' then
    return false; -- al geannuleerd
  end if;

  if v_cutoff_uren > 0 and v_datum_tijd < (now() + (v_cutoff_uren || ' hours')::interval) then
    return false; -- te laat, cutoff verstreken
  end if;

  update afspraken set status = 'geannuleerd' where id = v_afspraak_id;
  return true;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Na het draaien: herlaad instellingen.html en test de annuleer-
-- link (annuleren.html?token=...) met een afspraak binnen en buiten de
-- cutoff-termijn.
-- ══════════════════════════════════════════════════════════════════════
