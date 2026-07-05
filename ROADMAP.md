# Kronr — Bouwplan (features om 1 voor 1 te bouwen)

Twee bronnen samengevoegd:
- **A1–A6**: features die al op index.html/instellingen.html beloofd worden
  (Pro/Business-pakket) maar nog niet bestaan
- **B1–B5**: nieuwe ideeën om je te onderscheiden van Salonized/Fresha/Treatwell

Volgorde is bepaald op: grootte, of iets een bestaande loze belofte dekt, en
technische afhankelijkheden (bv. no-show-bescherming heeft Stripe Connect
nodig, die staat er nu al).

---

## 1. Automatisch annuleringsbeleid (A6) — KLEIN
**Dekt:** de "Automatisch annuleringsbeleid"-belofte op index.html, die nu
niet klopt (annuleren.html heeft geen tijdcheck).

- Instellingen: cutoff instelbaar (bv. "annuleren kan tot X uur van tevoren"),
  default 24u
- annuleren.html: check of de afspraak binnen die cutoff valt; zo ja, geen
  annuleer-knop meer, wel een duidelijke melding + telefoonnummer van de salon
- Optioneel (later): no-show-fee bij te laat annuleren, koppelt aan #5

---

## 2. Stempelkaart / loyaliteitsprogramma (B3) — KLEIN-MIDDEL
**Waarom nu:** simpele databasewijziging, directe klantwaarde, geen externe
afhankelijkheden.

- Salon stelt in: "na X afgeronde afspraken -> gratis dienst" (instellingen)
- Nieuwe kolom/tabel: stempels-teller per klant, +1 bij elke afgeronde
  afspraak/kassa-verkoop
- Zichtbaar in klanten.html (per klant) en voor de klant zelf via een lookup
  op e-mail/telefoon (nieuwe kleine pagina of onderdeel van annuleren.html-
  achtige flow)
- Automatische melding richting salon (of klant) zodra iemand een gratis
  beurt heeft verdiend

---

## 3. Automatische review-verzameling (B4) — KLEIN-MIDDEL
**Waarom nu:** hergebruikt de bestaande kronr-mail Worker, geen nieuwe
infrastructuur nodig.

- Instellingen: salon vult eigen Google-reviewlink in
- Na een afspraak op 'afgerond' (via de Afrekenen-knop of handmatig): 1 dag
  later automatisch een mailtje met verzoek om een review + de link
  (Cloudflare Worker Cron Trigger nodig, of een lichte polling-aanpak vanuit
  de kronr-mail Worker — even kijken wat het makkelijkst inpast in je
  bestaande Worker-structuur)
- Simpele opt-out (niet elke klant lastigvallen bij elke afspraak)

---

## 4. Cadeaubonnen (A2) — MIDDEL
**Dekt:** de "Cadeaubonnen"-belofte (Pro-pakket). Kassa heeft al een
ongebruikte "Cadeaubon"-betaalknop staan.

- Nieuwe tabel `cadeaubonnen`: code, bedrag, resterend_bedrag, salon_id,
  gekocht_door (naam/email), actief, verloopdatum
- Aankoop: los kunnen verkopen via de kassa (nieuw "Cadeaubon verkopen"-knop,
  apart van de service-flow) en/of via een publieke pagina zoals boeken.html
- Inwisselen: de bestaande "Cadeaubon"-betaalknop in kassa.html laten werken
  (code invoeren, saldo aftrekken, resterend bedrag bijhouden)
- Uitgifte van een cadeaubon-PDF/mailtje met code (hergebruikt kronr-mail)

---

## 5. No-show-bescherming (B1) — MIDDEL
**Waarom deze positie:** hergebruikt de Stripe Connect-infrastructuur die er
al staat (roadmap-punt 10) — geen nieuwe koppeling nodig, wel nieuwe Stripe-
functionaliteit (SetupIntent i.p.v. een directe Checkout).

- Bij het boeken: kaartgegevens vastleggen via een Stripe SetupIntent (geen
  meteen-afschrijven, alleen vastleggen) — instelbaar per salon of dit
  verplicht is, ongeacht of er een losse aanbetaling-instelling per dienst is
- Bij no-show (status 'no-show' gezet): salon krijgt een knop "No-show-fee
  incasseren" die een off-session charge doet op de vastgelegde kaart
- Instellingen: salon stelt het fee-bedrag in (vast of percentage, zelfde
  patroon als de aanbetaling-instelling bij diensten)
- Duidelijke communicatie naar de klant bij het boeken (transparantie is
  belangrijk hier, geen verrassingen)

---

## 6. Personeelsplanning / verlof (B5) — MIDDEL
**Waarom nu:** ontbreekt volledig, veelgevraagd bij salons met meerdere
medewerkers.

- Medewerkers.html of een nieuwe pagina: medewerker (of eigenaar namens hen)
  geeft verlof/ziekte-periode door
- Agenda: die medewerker's tijdslots worden automatisch geblokkeerd in
  boeken.html (geen nieuwe boekingen mogelijk) voor die periode
- Bestaande afspraken in die periode: waarschuwing aan de salon om te
  verplaatsen (niet automatisch verwijderen)

---

## 7. Boekhoudkoppeling (A4) — MIDDEL-GROOT
**Dekt:** de "Boekhoudkoppeling"-belofte (Pro-pakket).
**Open vraag:** welke partij eerst? Voorstel: **Moneybird** (populair in NL,
duidelijke API, relatief simpele OAuth) — zeg het als je een voorkeur hebt
(e-Boekhouden, Exact Online zijn de andere gangbare NL-opties).

- OAuth-koppeling in instellingen (zelfde patroon als Stripe Connect)
- Automatisch: elke kassa-betaling wordt een factuur/mutatie in de
  boekhouding (nieuwe Cloudflare Worker-route, zelfde aanpak als kronr-stripe)
- Foutafhandeling: als de koppeling verloopt, salon moet dat merken (niet
  stilletjes falen)

---

## 8. Abonnementen voor klanten (B2) — GROOT
**Waarom groot:** vergt terugkerende Stripe-betalingen OP de connected
account van de salon (andere Stripe-flow dan de huidige eenmalige
aanbetaling-Checkout), plus een heel nieuw concept (credits/tegoed dat
maandelijks aangevuld wordt).

- Salon stelt abonnementsvorm in (bv. "1x knippen per maand, €35/maand")
- Klant abonneert via boeken.html of een nieuwe pagina; Stripe recurring
  billing op de connected account
- Bij elke maandelijkse betaling: 1 (of X) tegoed-beurten bijschrijven voor
  die klant, in te wisselen bij het boeken (geen prijs meer bij checkout als
  er tegoed is)
- Opzeggen/pauzeren-flow voor de klant

---

## 9. Meerdere locaties (A5) — GROOT
**Waarom groot:** raakt bijna elke tabel. `salon_id` wordt conceptueel
`salon_id + locatie_id`. Dit is een architectuur-wijziging, niet een feature
die je "erbij plakt".

- Nieuwe tabel `locaties` (naam, adres per locatie), gekoppeld aan een salon
- `afspraken`, `medewerkers`, `diensten`, `betalingen` krijgen een
  `locatie_id` (medewerkers/diensten evt. deelbaar tussen locaties, even
  bepalen)
- Locatie-switcher in de hele admin-interface (dashboard, agenda, kassa, etc.)
- boeken.html: klant kiest eerst een locatie (als de salon er meerdere heeft)
- **Advies:** dit pas oppakken als er daadwerkelijk een salon met meerdere
  locaties op Kronr zit, of vlak daarvoor — anders bouw je iets dat niemand
  gebruikt terwijl kleinere features wachten

---

## 10. Marketing campagnes (A6a) — GROOT
**Dekt:** de "Marketing campagnes"-belofte (Business-pakket).

- Salon selecteert een klantsegment (bv. "niet geweest in 60 dagen",
  "verjaardag deze maand") uit klanten.html
- Campagne-builder: e-mail (later evt. WhatsApp, zodra dat er is) naar dat
  segment, hergebruikt kronr-mail
- Opt-out verplicht bijhouden per klant (juridisch belangrijk, niet
  overslaan)
- Simpele resultaten-weergave (verzonden/geopend indien meetbaar via Resend)

---

## 11. AI-assistent die klantvragen beantwoordt (A6b) — GROOT
**Dekt:** de "AI assistent... beantwoordt klantvragen"-belofte (hero-sectie
index.html).

- Chatwidget op s.html/boeken.html (of widget.js), voor bezoekers die vragen
  hebben voordat ze boeken ("Zijn jullie zondag open?", "Wat kost highlights?")
- Nieuwe Cloudflare Worker-route (zelfde patroon als /prijsadvies en
  /klant-briefing), gevoed met de salon's eigen diensten/openingstijden/
  adresgegevens zodat de AI alleen over déze salon praat
- Duidelijke grens: alleen informatieve vragen, geen boekingen zelf
  afhandelen via de chat (dat blijft de bestaande boekingsflow) — anders
  wordt de scope van deze feature te groot

---

## 12. WhatsApp herinneringen (A1) — GEBLOKKEERD
**Status:** wacht op jouw Meta/Twilio-aanvraag (zie
`workers/whatsapp-integratie-starten.md`). Code zelf is relatief klein
zodra die aanvraag goedgekeurd is. Bouwen zodra je het seintje geeft.

---

## Samenvatting — volgorde
1. Automatisch annuleringsbeleid
2. Stempelkaart / loyaliteitsprogramma
3. Automatische review-verzameling
4. Cadeaubonnen
5. No-show-bescherming
6. Personeelsplanning / verlof
7. Boekhoudkoppeling *(open vraag: welke partij)*
8. Abonnementen voor klanten
9. Meerdere locaties *(advies: pas oppakken bij echte vraag)*
10. Marketing campagnes
11. AI-assistent voor klantvragen
12. WhatsApp herinneringen *(geblokkeerd, buiten volgorde te bouwen zodra Meta akkoord is)*
