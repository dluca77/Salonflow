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
-- LET OP: dit vereist ook een Supabase Storage-bucket "referenties"
-- (public, net als de bestaande "klant-fotos"-bucket). De bucket zelf
-- moet je aanmaken via Supabase → Storage → New bucket -- dat kan niet
-- via SQL. De policies hieronder WEL, en zijn hier al meegenomen.
-- ══════════════════════════════════════════════════════════════════════

alter table afspraken add column if not exists referentie_foto_url text;

-- Anoniem (de klant, tijdens het boeken, niet ingelogd) moet een foto
-- kunnen uploaden én de salon-eigenaar moet 'm terug kunnen lezen in de
-- agenda -- vandaar publieke select ÉN insert, in tegenstelling tot
-- klant-fotos/salon-logos waar alleen de ingelogde salon zelf uploadt.
drop policy if exists "Publieke leestoegang referentiefoto's" on storage.objects;
create policy "Publieke leestoegang referentiefoto's" on storage.objects
  for select using (bucket_id = 'referenties');

drop policy if exists "Publiek mag referentiefoto's uploaden" on storage.objects;
create policy "Publiek mag referentiefoto's uploaden" on storage.objects
  for insert with check (bucket_id = 'referenties');

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. boeken/index.html krijgt een optionele foto-upload in stap 4
-- (gegevens), agenda/index.html toont de foto (indien aanwezig) in het
-- afspraak-detailpaneel.
-- ══════════════════════════════════════════════════════════════════════
