-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: goedgekeurd verlof daadwerkelijk blokkeren bij het
-- online boeken
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- PROBLEEM: medewerker_verlof (zie 2026-07-medewerker-login-migratie.sql)
-- laat medewerkers verlof aanvragen en de eigenaar goedkeuren, maar
-- boeken/index.html hield hier nooit rekening mee -- een medewerker met
-- goedgekeurd verlof kon alsnog via de online boekingswidget worden
-- volgeboekt.
--
-- OPLOSSING: een publieke, minimale RPC (zelfde patroon als
-- get_bezette_tijden) die alleen medewerker_id + datumrange teruggeeft
-- voor GOEDGEKEURD verlof, zodat de boekingswidget die medewerkers voor
-- de betreffende dagen als niet-beschikbaar kan behandelen. Geeft bewust
-- geen notitie/type (ziekte vs verlof) terug -- dat is geen klantzaak.
-- ══════════════════════════════════════════════════════════════════════

create or replace function get_verlof_op_datum(p_salon_id uuid, p_datum date)
returns table(medewerker_id uuid)
security definer
language sql
stable
as $$
  select medewerker_id
  from medewerker_verlof
  where salon_id = p_salon_id
    and status = 'goedgekeurd'
    and p_datum between van_datum and tot_datum;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie boeken/index.html: berekenBeschikbareSlots() en
-- vindBeschikbareMedewerker() roepen deze RPC nu aan en behandelen
-- medewerkers met goedgekeurd verlof als volledig bezet op die dag.
-- ══════════════════════════════════════════════════════════════════════
