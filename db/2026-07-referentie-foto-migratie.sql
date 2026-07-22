-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Referentiefoto bij het boeken
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- WAAROM: een tattoo-studio wil vaak vooraf een referentiebeeld/ontwerp
-- van de klant zien, en een nagelstudio-klant wil soms een inspiratiefoto
-- meesturen. Deze migratie voegt alleen de kolom toe om de URL van een
-- optionele, door de klant geüploade foto bij de afspraak op te slaan.
--
-- LET OP: dit vereist ook een Supabase Storage-bucket "boeking-referenties"
-- (public, net als de bestaande "klant-fotos"-bucket). Maak die zelf aan
-- via Supabase → Storage → New bucket (naam exact "boeking-referenties",
-- public aanvinken) -- dat kan niet via SQL.
-- ══════════════════════════════════════════════════════════════════════

alter table afspraken add column if not exists referentie_foto_url text;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. boeken/index.html krijgt een optionele foto-upload in stap 4
-- (gegevens), agenda/index.html toont de foto (indien aanwezig) in het
-- afspraak-detailpaneel.
-- ══════════════════════════════════════════════════════════════════════
