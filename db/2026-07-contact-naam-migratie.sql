-- Persoonlijke naam van de accounthouder (los van de bedrijfsnaam) --
-- ontbrak nog, nodig voor het uitgebreide registratieformulier
-- ("Jouw naam" apart van "Bedrijfsnaam", zoals Salonized dat ook doet).
alter table salons add column if not exists contact_naam text;
