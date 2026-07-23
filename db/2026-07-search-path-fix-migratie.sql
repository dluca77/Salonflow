-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Fix: search_path vastzetten op alle SECURITY DEFINER-functies
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit 1x in de Supabase SQL editor.
--
-- WAAROM: SECURITY DEFINER-functies zonder vastgezet search_path zijn
-- kwetsbaar voor search_path-hijacking -- iemand met CREATE-rechten op een
-- schema zou in theorie een eigen functie/object met dezelfde naam kunnen
-- laten "voorgaan" op wat de functie bedoelt aan te roepen. Door search_path
-- hier hard op 'public' te zetten, wordt dat onmogelijk. Gevonden via de
-- Supabase security-advisor (function_search_path_mutable, 30 treffers).
-- ══════════════════════════════════════════════════════════════════════

alter function public._kronr_traject_voortgang_bijwerken() set search_path = public;
alter function public.accepteer_medewerker_uitnodiging(p_token uuid) set search_path = public;
alter function public.annuleer_afspraak_via_token(p_token uuid) set search_path = public;
alter function public.annuleer_les_boeking(p_annuleer_token uuid) set search_path = public;
alter function public.bekijk_kassa_dag_totalen(p_salon_id uuid, p_locatie_id uuid) set search_path = public;
alter function public.bevestig_stempelkaart_code(p_salon_id uuid, p_email text, p_code text) set search_path = public;
alter function public.boek_les(p_les_id uuid, p_klant_naam text, p_klant_email text, p_klant_telefoon text) set search_path = public;
alter function public.claim_lessen_wachtlijst_plek(p_token uuid) set search_path = public;
alter function public.get_abonnement_tegoed(p_salon_id uuid, p_email text, p_dienst_id uuid) set search_path = public;
alter function public.get_afspraak_via_token(p_token uuid) set search_path = public;
alter function public.get_beschikbare_lessen(p_salon_id uuid, p_dienst_id uuid) set search_path = public;
alter function public.get_bezette_ruimtes(p_salon_id uuid, p_datum_start timestamptz, p_datum_eind timestamptz) set search_path = public;
alter function public.get_extra_diensten_voor_afspraken(p_afspraak_ids uuid[]) set search_path = public;
alter function public.get_kassa_afsluitingen(p_salon_id uuid, p_limiet integer) set search_path = public;
alter function public.get_lage_voorraad_producten(p_salon_id uuid) set search_path = public;
alter function public.get_lessen_wachtlijst_via_token(p_token uuid) set search_path = public;
alter function public.get_medewerker_uitnodiging_info(p_token uuid) set search_path = public;
alter function public.get_stempelkaart(p_salon_id uuid, p_email text) set search_path = public;
alter function public.get_verlof_op_datum(p_salon_id uuid, p_datum date) set search_path = public;
alter function public.maak_medewerker_uitnodiging(p_medewerker_id uuid) set search_path = public;
alter function public.meld_af_marketing(p_token uuid) set search_path = public;
alter function public.sluit_kassa_dag_af(p_salon_id uuid, p_locatie_id uuid, p_geteld_contant numeric, p_notitie text, p_afgesloten_door_naam text) set search_path = public;
alter function public.verbruik_abonnement_credit(p_abonnement_id uuid, p_email text) set search_path = public;
alter function public.verwerk_kassa_betaling(p_salon_id uuid, p_locatie_id uuid, p_methode text, p_afspraak_id uuid, p_items jsonb, p_cadeaubon_code_gebruikt text, p_cadeaubon_bedrag_gebruikt numeric, p_nieuwe_cadeaubonnen jsonb) set search_path = public;
alter function public.vind_lessen_wachtlijst_match(p_les_id uuid) set search_path = public;
alter function public.vind_of_maak_traject(p_salon_id uuid, p_email text, p_dienst_id uuid, p_klant_naam text, p_totaal_sessies integer) set search_path = public;
alter function public.voeg_extra_diensten_toe(p_afspraak_id uuid, p_dienst_ids uuid[]) set search_path = public;
alter function public.voeg_toe_lessen_wachtlijst(p_les_id uuid, p_klant_naam text, p_klant_email text, p_klant_telefoon text) set search_path = public;
alter function public.vraag_stempelkaart_code_aan(p_salon_id uuid, p_email text) set search_path = public;
alter function public.wissel_stempel_code_in(p_code text) set search_path = public;
