-- WhatsApp-instellingen (voorbereiding -- daadwerkelijk versturen komt
-- pas zodra Meta/Twilio-goedkeuring binnen is). Kolommen alvast
-- toevoegen zodat de instellingen-UI ze kan lezen/opslaan.
alter table salons add column if not exists whatsapp_actief boolean default false;
alter table salons add column if not exists whatsapp_nummer text;
