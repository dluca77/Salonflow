var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var ALLOWED_ORIGINS = ["https://kronr.nl", "https://www.kronr.nl"];
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}
__name(corsHeaders, "corsHeaders");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
    }
    if (url.pathname === "/bevestiging") {
      return handleBevestiging(request, env, headers);
    }
    if (url.pathname === "/wachtlijst-plek") {
      return handleWachtlijstPlek(request, env, headers);
    }
    if (url.pathname === "/medewerker-uitnodiging") {
      return handleMedewerkerUitnodiging(request, env, headers);
    }
    if (url.pathname === "/stempelkaart-code") {
      return handleStempelkaartCode(request, env, headers);
    }
    if (url.pathname === "/campagne") {
      return handleCampagne(request, env, headers);
    }
    if (url.pathname === "/interesse-bevestiging") {
      return handleInteresseBevestiging(request, env, headers);
    }
    return new Response(JSON.stringify({ error: "Onbekend endpoint" }), { status: 404, headers });
  },
  // ── Cron Trigger: elk uur, automatische review-verzoeken ──
  async scheduled(event, env, ctx) {
    ctx.waitUntil(verstuurReviewVerzoeken(env));
  }
};
async function stuurMail(env, { to, subject, html, attachments }) {
  const payload = {
    from: env.RESEND_FROM || "Kronr <onboarding@resend.dev>",
    to: [to],
    subject,
    html
  };
  if (attachments && attachments.length) payload.attachments = attachments;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Resend-fout: " + errText);
  }
  return res.json();
}
__name(stuurMail, "stuurMail");
async function supabaseQuery(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": env.SUPABASE_SERVICE_ROLE,
      "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...options.headers || {}
    }
  });
  if (!res.ok) throw new Error(`Supabase-fout: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
__name(supabaseQuery, "supabaseQuery");
function wacht(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
__name(wacht, "wacht");
function formatDatumNL(datum) {
  return datum.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
}
__name(formatDatumNL, "formatDatumNL");
function formatTijdNL(datum) {
  return datum.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
}
__name(formatTijdNL, "formatTijdNL");
function bouwIcs({ uid, start, duurMin, titel, beschrijving, locatie }) {
  const fmt = /* @__PURE__ */ __name((d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z", "fmt");
  const eind = new Date(start.getTime() + duurMin * 6e4);
  const escapeIcs = /* @__PURE__ */ __name((t) => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"), "escapeIcs");
  const regels = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kronr//Afspraak//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@kronr.nl`,
    `DTSTAMP:${fmt(/* @__PURE__ */ new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(eind)}`,
    `SUMMARY:${escapeIcs(titel)}`,
    `DESCRIPTION:${escapeIcs(beschrijving)}`
  ];
  if (locatie) regels.push(`LOCATION:${escapeIcs(locatie)}`);
  regels.push("BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Herinnering", "END:VALARM");
  regels.push("END:VEVENT", "END:VCALENDAR");
  return regels.join("\r\n");
}
__name(bouwIcs, "bouwIcs");
function bouwGoogleAgendaLink({ start, duurMin, titel, beschrijving, locatie }) {
  const fmt = /* @__PURE__ */ __name((d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z", "fmt");
  const eind = new Date(start.getTime() + duurMin * 6e4);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: titel,
    dates: fmt(start) + "/" + fmt(eind),
    details: beschrijving,
    location: locatie || ""
  });
  return "https://calendar.google.com/calendar/render?" + params.toString();
}
__name(bouwGoogleAgendaLink, "bouwGoogleAgendaLink");
function base64VanTekst(tekst) {
  return btoa(unescape(encodeURIComponent(tekst)));
}
__name(base64VanTekst, "base64VanTekst");
async function handleBevestiging(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON body" }), { status: 400, headers });
  }
  const { email, klant_naam, salon_naam, dienst_naam, datum_tijd, annuleer_token, afspraak_id, duur_min } = body;
  if (!email || !klant_naam || !datum_tijd) {
    return new Response(JSON.stringify({ error: "email, klant_naam en datum_tijd zijn verplicht" }), { status: 400, headers });
  }
  const datum = new Date(datum_tijd);
  const datumStr = formatDatumNL(datum);
  const tijdStr = formatTijdNL(datum);
  const annuleerUrl = `https://kronr.nl/annuleren/?token=${annuleer_token}`;
  const duurMinutenGebruikt = duur_min && duur_min > 0 ? duur_min : 45;
  const titelAgenda = `${dienst_naam || "Afspraak"} bij ${salon_naam || "de salon"}`;
  const beschrijvingAgenda = `Afspraak bij ${salon_naam || "de salon"} via Kronr.`;
  const googleAgendaUrl = bouwGoogleAgendaLink({
    start: datum,
    duurMin: duurMinutenGebruikt,
    titel: titelAgenda,
    beschrijving: beschrijvingAgenda,
    locatie: salon_naam
  });
  const html = `
<!DOCTYPE html>
<html lang="nl">
<body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;">

        <!-- Header -->
        <tr><td style="background:#1a1714;padding:28px 32px;text-align:center;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 32px 8px;">
          <p style="margin:0 0 4px;font-size:13px;color:#8a7d6e;letter-spacing:1px;text-transform:uppercase;">Afspraak bevestigd</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1a1714;">Tot binnenkort, ${klant_naam.split(" ")[0]}!</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3a342e;">Je afspraak bij <strong>${salon_naam || "de salon"}</strong> staat bevestigd. Hieronder de details:</p>
        </td></tr>

        <!-- Afspraak-kaart -->
        <tr><td style="padding:0 32px 8px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;border:1px solid #e2d9ce;border-radius:10px;">
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #e2d9ce;">
                <span style="font-size:12px;color:#8a7d6e;">Dienst</span><br>
                <span style="font-size:15px;font-weight:bold;color:#1a1714;">${dienst_naam || "Afspraak"}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;border-bottom:1px solid #e2d9ce;">
                <span style="font-size:12px;color:#8a7d6e;">Datum</span><br>
                <span style="font-size:15px;font-weight:bold;color:#1a1714;">${datumStr}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 20px;">
                <span style="font-size:12px;color:#8a7d6e;">Tijd</span><br>
                <span style="font-size:15px;font-weight:bold;color:#1a1714;">${tijdStr} uur</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Agenda-knop -->
        <tr><td style="padding:20px 32px 4px;text-align:center;">
          <a href="${googleAgendaUrl}" style="display:inline-block;padding:11px 22px;background:#ffffff;color:#1a1714;text-decoration:none;font-size:13px;font-weight:bold;border-radius:8px;border:1px solid #1a1714;">\u{1F4C5} Voeg toe aan Google Agenda</a>
          <p style="margin:10px 0 0;font-size:11.5px;color:#8a7d6e;">Gebruik je Outlook of Apple Agenda? Open de bijgevoegde agenda-bijlage bij deze mail.</p>
        </td></tr>

        <!-- Annuleer-link -->
        <tr><td style="padding:20px 32px 32px;text-align:center;">
          <p style="margin:0 0 14px;font-size:13px;color:#8a7d6e;">Kan je toch niet?</p>
          <a href="${annuleerUrl}" style="display:inline-block;padding:11px 24px;background:#1a1714;color:#faf8f4;text-decoration:none;font-size:13px;font-weight:bold;border-radius:8px;">Annuleer je afspraak</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;">
          <p style="margin:0;font-size:11px;color:#c2b5a4;">Verstuurd via Kronr namens ${salon_naam || "je salon"}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const icsInhoud = bouwIcs({
    uid: afspraak_id || `${Date.now()}`,
    start: datum,
    duurMin: duurMinutenGebruikt,
    titel: titelAgenda,
    beschrijving: beschrijvingAgenda,
    locatie: salon_naam
  });
  try {
    await stuurMail(env, {
      to: email,
      subject: `Bevestiging: je afspraak op ${datumStr}`,
      html,
      attachments: [{ filename: "afspraak.ics", content: base64VanTekst(icsInhoud) }]
    });
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}
__name(handleBevestiging, "handleBevestiging");
async function handleWachtlijstPlek(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON body" }), { status: 400, headers });
  }
  const { email, klant_naam, salon_naam, dienst_naam, datum_tijd, claim_token } = body;
  if (!email || !klant_naam || !datum_tijd || !claim_token) {
    return new Response(JSON.stringify({ error: "email, klant_naam, datum_tijd en claim_token zijn verplicht" }), { status: 400, headers });
  }
  const datum = new Date(datum_tijd);
  const datumStr = formatDatumNL(datum);
  const tijdStr = formatTijdNL(datum);
  const claimUrl = "https://kronr.nl/wachtlijst-claim/?token=" + claim_token;
  const html = `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;"><tr><td style="background:#1a1714;padding:28px 32px;text-align:center;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span></td></tr><tr><td style="padding:32px 32px 8px;"><p style="margin:0 0 4px;font-size:13px;color:#8a7d6e;letter-spacing:1px;text-transform:uppercase;">Er is een plek vrijgekomen!</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1a1714;">Goed nieuws, ` + klant_naam.split(" ")[0] + '!</h1><p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3a342e;">Er is een plek vrijgekomen bij <strong>' + (salon_naam || "de salon") + '</strong> waar jij op de wachtlijst voor stond:</p></td></tr><tr><td style="padding:0 32px 8px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;border:1px solid #e2d9ce;border-radius:10px;"><tr><td style="padding:18px 20px;border-bottom:1px solid #e2d9ce;"><span style="font-size:12px;color:#8a7d6e;">Dienst</span><br><span style="font-size:15px;font-weight:bold;color:#1a1714;">' + (dienst_naam || "Afspraak") + '</span></td></tr><tr><td style="padding:18px 20px;border-bottom:1px solid #e2d9ce;"><span style="font-size:12px;color:#8a7d6e;">Datum</span><br><span style="font-size:15px;font-weight:bold;color:#1a1714;">' + datumStr + '</span></td></tr><tr><td style="padding:18px 20px;"><span style="font-size:12px;color:#8a7d6e;">Tijd</span><br><span style="font-size:15px;font-weight:bold;color:#1a1714;">' + tijdStr + ' uur</span></td></tr></table></td></tr><tr><td style="padding:24px 32px 8px;text-align:center;"><p style="margin:0 0 14px;font-size:13px;color:#8a7d6e;">Deze plek is 24 uur voor jou gereserveerd. Wie het eerst komt...</p><a href="' + claimUrl + '" style="display:inline-block;padding:11px 24px;background:#8c6d3f;color:#faf8f4;text-decoration:none;font-size:13px;font-weight:bold;border-radius:8px;">Ja, ik wil deze plek!</a></td></tr><tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;"><p style="margin:0;font-size:11px;color:#c2b5a4;">Verstuurd via Kronr namens ' + (salon_naam || "je salon") + "</p></td></tr></table></td></tr></table></body></html>";
  try {
    await stuurMail(env, {
      to: email,
      subject: "Er is een plek vrijgekomen op " + datumStr + "!",
      html
    });
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}
__name(handleWachtlijstPlek, "handleWachtlijstPlek");
async function handleMedewerkerUitnodiging(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON body" }), { status: 400, headers });
  }
  const { email, naam, salon_naam, activatie_link } = body;
  if (!email || !naam || !activatie_link) {
    return new Response(JSON.stringify({ error: "email, naam en activatie_link zijn verplicht" }), { status: 400, headers });
  }
  const html = `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;"><tr><td style="background:#1a1714;padding:28px 32px;text-align:center;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span></td></tr><tr><td style="padding:32px 32px 8px;"><p style="margin:0 0 4px;font-size:13px;color:#8a7d6e;letter-spacing:1px;text-transform:uppercase;">Je bent uitgenodigd</p><h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1a1714;">Welkom, ` + naam.split(" ")[0] + '!</h1><p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3a342e;"><strong>' + (salon_naam || "Je werkgever") + '</strong> heeft je uitgenodigd om je eigen rooster te bekijken en verlof/ziekte aan te vragen via Kronr. Maak eerst een wachtwoord aan om je account te activeren.</p></td></tr><tr><td style="padding:8px 32px 32px;text-align:center;"><a href="' + activatie_link + '" style="display:inline-block;padding:11px 24px;background:#1a1714;color:#faf8f4;text-decoration:none;font-size:13px;font-weight:bold;border-radius:8px;">Account activeren</a></td></tr><tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;"><p style="margin:0;font-size:11px;color:#c2b5a4;">Verstuurd via Kronr namens ' + (salon_naam || "je werkgever") + "</p></td></tr></table></td></tr></table></body></html>";
  try {
    await stuurMail(env, {
      to: email,
      subject: "Je bent uitgenodigd bij " + (salon_naam || "Kronr"),
      html
    });
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}
__name(handleMedewerkerUitnodiging, "handleMedewerkerUitnodiging");
async function handleStempelkaartCode(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON body" }), { status: 400, headers });
  }
  const { salon_id, email, code } = body;
  if (!salon_id || !email || !code) {
    return new Response(JSON.stringify({ error: "salon_id, email en code zijn verplicht" }), { status: 400, headers });
  }
  let salonNaam = "je salon";
  try {
    const salons = await supabaseQuery(env, `salons?id=eq.${salon_id}&select=naam`);
    if (Array.isArray(salons) && salons[0] && salons[0].naam) {
      salonNaam = salons[0].naam;
    }
  } catch (err) {
    console.error("Kon salonnaam niet ophalen voor stempelkaart-code:", err.message);
  }
  const html = `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center"><table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;"><tr><td style="background:#1a1714;padding:28px 32px;text-align:center;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span></td></tr><tr><td style="padding:32px 32px 8px;"><p style="margin:0 0 4px;font-size:13px;color:#8a7d6e;letter-spacing:1px;text-transform:uppercase;">Jouw verificatiecode</p><h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1714;">Hoi,</h1><p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#3a342e;">Gebruik deze code om je stempelkaart bij <strong>` + escapeHtml(salonNaam) + `</strong> te bekijken:</p><p style="text-align:center;margin:0 0 20px;font-size:28px;font-weight:bold;letter-spacing:6px;color:#8c6d3f;">` + escapeHtml(code) + `</p><p style="margin:0;font-size:13px;color:#8a7d6e;">Deze code is 10 minuten geldig. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p></td></tr><tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;"><p style="margin:0;font-size:11px;color:#c2b5a4;">Verstuurd via Kronr namens ` + escapeHtml(salonNaam) + `</p></td></tr></table></td></tr></table></body></html>`;
  try {
    await stuurMail(env, {
      to: email,
      subject: `Jouw verificatiecode voor ${salonNaam}`,
      html
    });
  } catch (err) {
    console.error("Stempelkaart-code mail mislukt voor " + email + ":", err.message);
  }
  return new Response(JSON.stringify({ ok: true }), { headers });
}
__name(handleStempelkaartCode, "handleStempelkaartCode");
async function handleInteresseBevestiging(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON body" }), { status: 400, headers });
  }
  const { email } = body;
  if (!email) {
    return new Response(JSON.stringify({ error: "email is verplicht" }), { status: 400, headers });
  }
  const html = `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;">
      <tr><td style="background:#1a1714;padding:28px 32px;text-align:center;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span></td></tr>
      <tr><td style="padding:32px 32px 8px;">
        <p style="margin:0 0 4px;font-size:13px;color:#8a7d6e;letter-spacing:1px;text-transform:uppercase;">Bedankt voor je interesse</p>
        <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#1a1714;">We houden je op de hoogte!</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#3a342e;">Kronr is bijna klaar. Zodra we volledig live gaan en je een account kan aanmaken, laten we het je als eerste weten via dit e-mailadres.</p>
        <p style="margin:0;font-size:13px;color:#8a7d6e;">Tot snel!<br>— Het team van Kronr</p>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;">
        <p style="margin:0;font-size:11px;color:#c2b5a4;">Je ontvangt deze mail omdat je je hebt ingeschreven op kronr.nl.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  try {
    await stuurMail(env, {
      to: email,
      subject: "Bedankt voor je interesse in Kronr!",
      html
    });
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}
__name(handleInteresseBevestiging, "handleInteresseBevestiging");
function escapeHtml(tekst) {
  return String(tekst).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escapeHtml, "escapeHtml");
function campagneHtml({ naam, salon_naam, onderwerp, inhoud, afmeld_token }) {
  const afmeldUrl = afmeld_token ? `https://kronr.nl/afmelden/?token=${afmeld_token}` : null;
  const inhoudHtml = escapeHtml(inhoud).replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;">
      <tr><td style="background:#1a1714;padding:28px 32px;text-align:center;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span></td></tr>
      <tr><td style="padding:32px 32px 8px;">
        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1714;">Hoi ${escapeHtml((naam || "").split(" ")[0] || "daar")},</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#3a342e;">${inhoudHtml}</p>
        <p style="margin:0;font-size:13px;color:#8a7d6e;">— ${escapeHtml(salon_naam || "Het team")}</p>
      </td></tr>
      <tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;">
        <p style="margin:0 0 6px;font-size:11px;color:#c2b5a4;">Verstuurd via Kronr namens ${escapeHtml(salon_naam || "de salon")}</p>
        ${afmeldUrl ? `<p style="margin:0;font-size:11px;"><a href="${afmeldUrl}" style="color:#8c6d3f;">Uitschrijven voor marketing-e-mails</a></p>` : ""}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
__name(campagneHtml, "campagneHtml");
async function handleCampagne(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON body" }), { status: 400, headers });
  }
  const { salon_naam, onderwerp, inhoud, ontvangers } = body;
  if (!onderwerp || !inhoud || !Array.isArray(ontvangers) || !ontvangers.length) {
    return new Response(JSON.stringify({ error: "onderwerp, inhoud en ontvangers (niet-lege array) zijn verplicht" }), { status: 400, headers });
  }
  const BATCH_GROOTTE = 2;
  const PAUZE_MS = 1100;
  let gelukt = 0, mislukt = 0;
  for (let i = 0; i < ontvangers.length; i += BATCH_GROOTTE) {
    const batch = ontvangers.slice(i, i + BATCH_GROOTTE);
    const resultaten = await Promise.allSettled(batch.map((o) => {
      if (!o.email) return Promise.reject(new Error("geen e-mailadres"));
      return stuurMail(env, {
        to: o.email,
        subject: onderwerp,
        html: campagneHtml({ naam: o.naam, salon_naam, onderwerp, inhoud, afmeld_token: o.afmeld_token })
      });
    }));
    resultaten.forEach((r) => r.status === "fulfilled" ? gelukt++ : mislukt++);
    if (i + BATCH_GROOTTE < ontvangers.length) await wacht(PAUZE_MS);
  }
  if (gelukt === 0) {
    return new Response(JSON.stringify({ error: "Versturen volledig mislukt", gelukt, mislukt }), { status: 502, headers });
  }
  return new Response(JSON.stringify({ ok: true, gelukt, mislukt }), { headers });
}
__name(handleCampagne, "handleCampagne");
async function verstuurReviewVerzoeken(env) {
  let kandidaten;
  try {
    kandidaten = await supabaseQuery(
      env,
      "afspraken?select=id,klant_email,klant_naam,salon_id,salons!inner(naam,google_review_link,review_verzoek_actief)&status=eq.afgerond&review_verzoek_verzonden_op=is.null&klant_email=not.is.null&datum_tijd=gte." + new Date(Date.now() - 48 * 3600 * 1e3).toISOString() + "&datum_tijd=lte." + new Date(Date.now() - 24 * 3600 * 1e3).toISOString() + "&salons.review_verzoek_actief=eq.true"
    );
  } catch (err) {
    console.error("Kon review-kandidaten niet ophalen:", err.message);
    return;
  }
  if (!kandidaten || !kandidaten.length) return;
  for (const a of kandidaten) {
    if (!a.salons) continue;
    try {
      const recent = await supabaseQuery(
        env,
        "afspraken?select=id&salon_id=eq." + a.salon_id + "&klant_email=eq." + encodeURIComponent(a.klant_email) + "&review_verzoek_verzonden_op=gte." + new Date(Date.now() - 90 * 24 * 3600 * 1e3).toISOString()
      );
      if (!recent || !recent.length) {
        const html = `<!DOCTYPE html><html lang="nl"><body style="margin:0;padding:0;background:#faf8f4;font-family:Helvetica,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f4;padding:32px 16px;"><tr><td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2d9ce;">
              <tr><td style="background:#1a1714;padding:28px 32px;text-align:center;"><span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#faf8f4;letter-spacing:0.5px;">Kronr<span style="color:#8c6d3f;">.</span></span></td></tr>
              <tr><td style="padding:32px 32px 8px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#1a1714;">Hoe was je bezoek bij ${escapeHtml(a.salons.naam)}?</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#3a342e;">Hoi ${escapeHtml((a.klant_naam || "").split(" ")[0] || "daar")}, we hopen dat je bezoek goed bevallen is! Zou je een paar seconden willen nemen om een review achter te laten? Dat helpt ons enorm.</p>
                ${a.salons.google_review_link ? `<p style="text-align:center;margin:24px 0 0;"><a href="${a.salons.google_review_link}" style="display:inline-block;padding:11px 24px;background:#1a1714;color:#faf8f4;text-decoration:none;font-size:13px;font-weight:bold;border-radius:8px;">Schrijf een review</a></p>` : ""}
              </td></tr>
              <tr><td style="padding:20px 32px;background:#faf8f4;border-top:1px solid #e2d9ce;text-align:center;"><p style="margin:0;font-size:11px;color:#c2b5a4;">Verstuurd via Kronr namens ${escapeHtml(a.salons.naam)}</p></td></tr>
            </table>
          </td></tr></table>
        </body></html>`;
        if (a.salons.google_review_link) {
          await stuurMail(env, {
            to: a.klant_email,
            subject: `Hoe was je bezoek bij ${a.salons.naam}?`,
            html
          });
        }
      }
    } catch (err) {
      console.error("Review-verzoek mislukt voor afspraak " + a.id + ":", err.message);
    }
    try {
      await supabaseQuery(env, "afspraken?id=eq." + a.id, {
        method: "PATCH",
        body: JSON.stringify({ review_verzoek_verzonden_op: (/* @__PURE__ */ new Date()).toISOString() })
      });
    } catch (err) {
      console.error("Kon review_verzoek_verzonden_op niet bijwerken voor " + a.id + ":", err.message);
    }
  }
}
__name(verstuurReviewVerzoeken, "verstuurReviewVerzoeken");
export {
  index_default as default
};
