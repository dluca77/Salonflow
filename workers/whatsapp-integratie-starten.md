# WhatsApp-integratie — start dit nu, duurt zelf al dagen

Dit kan ik niet voor je regelen; Meta moet dit goedkeuren en dat is een
proces van dagen. Hoe eerder je dit start, hoe eerder ik de daadwerkelijke
integratie (verzendlogica, sjablonen, koppeling met bevestigingsmails)
kan bouwen zodra jouw account goedgekeurd is.

## Wat je moet doen (buiten Kronr, bij Meta/Twilio)

1. **Twilio-account** (als je die nog niet hebt): twilio.com → account
   aanmaken, betaalmethode toevoegen.
2. **WhatsApp Business API aanvragen via Twilio:**
   - Twilio Console → Messaging → Try WhatsApp / Senders → WhatsApp Senders
   - Je hebt een **Meta Business Manager-account** nodig (business.facebook.com)
     gekoppeld aan Kronr/je eigen bedrijf — als je die nog niet hebt, eerst
     aanmaken en verifiëren (dit verificatieproces is vaak de langste stap)
   - Vraag een WhatsApp-telefoonnummer aan via Twilio (nieuw nummer kopen,
     of een bestaand zakelijk nummer registreren)
3. **Message templates aanvragen** (nodig zodra je klanten proactief wilt
   berichten, bv. afspraakherinneringen) — dit moet ook door Meta
   goedgekeurd worden, apart van de account-verificatie. Voorbeeld-
   template die je nu al kunt indienen (Nederlands, categorie Utility):
   ```
   Naam: afspraak_herinnering
   Taal: Nederlands
   Body: Hoi {{1}}, je hebt een afspraak bij {{2}} op {{3}} om {{4}}.
   Tot dan!
   ```
   (variabelen: klantnaam, salonnaam, datum, tijd)

## Wat ik alvast klaarzet zodra je goedkeuring hebt

- Nieuwe Cloudflare Worker-route (`kronr-mail` of een nieuwe `kronr-whatsapp`)
  die Twilio's WhatsApp API aanroept
- Instellingen.html: WhatsApp aan/uit + telefoonnummer-koppeling
- Automatische verzending bij: bevestiging van een boeking, X uur van
  tevoren een herinnering, wachtlijst-claim-bericht (hergebruikt de
  bestaande claim-logica, alleen het verzendkanaal verandert)

Laat het me weten zodra je Twilio + Meta-verificatie hebt lopen (of al
goedgekeurd is) — dan bouw ik de rest.
