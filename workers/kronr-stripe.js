var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var ALLOWED_ORIGINS = ["https://kronr.nl", "https://www.kronr.nl"];
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function geldigUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}
__name(geldigUuid, "geldigUuid");
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, authorization",
    "Content-Type": "application/json"
  };
}
__name(corsHeaders, "corsHeaders");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    if (url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }
    if (url.pathname === "/webhook-connect") {
      return handleWebhookConnect(request, env);
    }
    if (url.pathname === "/create-checkout") {
      return handleCreateCheckout(request, env, headers);
    }
    if (url.pathname === "/portal") {
      return handlePortal(request, env, headers);
    }
    if (url.pathname === "/create-connect-link") {
      return handleCreateConnectLink(request, env, headers);
    }
    if (url.pathname === "/connect-status") {
      return handleConnectStatus(request, env, headers);
    }
    if (url.pathname === "/create-deposit-checkout") {
      return handleCreateDepositCheckout(request, env, headers);
    }
    if (url.pathname === "/create-setup-checkout") {
      return handleCreateSetupCheckout(request, env, headers);
    }
    if (url.pathname === "/charge-noshow-fee") {
      return handleChargeNoshowFee(request, env, headers);
    }
    if (url.pathname === "/create-subscription-checkout") {
      return handleCreateSubscriptionCheckout(request, env, headers);
    }
    return new Response(JSON.stringify({ error: "Onbekend endpoint" }), { status: 404, headers });
  }
};
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
async function verifieerEigenaarschap(request, env, salon_id) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, error: "Niet ingelogd" };
  const gebruiker = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": env.SUPABASE_SERVICE_ROLE, "Authorization": `Bearer ${token}` }
  }).then((r) => r.ok ? r.json() : null).catch(() => null);
  if (!gebruiker) return { ok: false, status: 401, error: "Ongeldige sessie" };
  const salonRows = await supabaseQuery(env, `salons?id=eq.${salon_id}&select=owner_id`);
  const salon = salonRows?.[0];
  if (!salon || salon.owner_id !== gebruiker.id) {
    return { ok: false, status: 403, error: "Je bent geen eigenaar van deze salon" };
  }
  return { ok: true, gebruiker };
}
__name(verifieerEigenaarschap, "verifieerEigenaarschap");
async function stripeRequest(env, path, params, { connectedAccount } = {}) {
  const headers = {
    "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (connectedAccount) headers["Stripe-Account"] = connectedAccount;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers,
    body: params.toString()
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || "Stripe-fout");
    err.stripeDetail = data;
    throw err;
  }
  return data;
}
__name(stripeRequest, "stripeRequest");
async function stripeGet(env, path, { connectedAccount } = {}) {
  const headers = { "Authorization": `Bearer ${env.STRIPE_SECRET_KEY}` };
  if (connectedAccount) headers["Stripe-Account"] = connectedAccount;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Stripe-fout");
  return data;
}
__name(stripeGet, "stripeGet");
async function getConnectedAccountId(env, salon_id) {
  const rows = await supabaseQuery(env, `salons?id=eq.${salon_id}&select=stripe_connect_account_id`);
  return rows?.[0]?.stripe_connect_account_id || null;
}
__name(getConnectedAccountId, "getConnectedAccountId");
async function handleCreateCheckout(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id, plan, period, email } = body;
  if (!salon_id || !plan) {
    return new Response(JSON.stringify({ error: "salon_id en plan zijn verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig salon_id-formaat" }), { status: 400, headers });
  }
  if (period && period !== "monthly" && period !== "yearly") {
    return new Response(JSON.stringify({ error: "period moet 'monthly' of 'yearly' zijn" }), { status: 400, headers });
  }
  const eigenaarCheck = await verifieerEigenaarschap(request, env, salon_id);
  if (!eigenaarCheck.ok) {
    return new Response(JSON.stringify({ error: eigenaarCheck.error }), { status: eigenaarCheck.status, headers });
  }
  const isJaarlijks = period === "yearly";
  const priceMap = {
    starter: isJaarlijks ? env.PRICE_STARTER_Y : env.PRICE_STARTER_M,
    pro: isJaarlijks ? env.PRICE_PRO_Y : env.PRICE_PRO_M,
    business: isJaarlijks ? env.PRICE_BUSINESS_Y : env.PRICE_BUSINESS_M
  };
  const priceId = priceMap[plan];
  if (!priceId) {
    return new Response(JSON.stringify({ error: "Ongeldig plan" }), { status: 400, headers });
  }
  try {
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", "https://kronr.nl/instellingen/?checkout=success");
    params.append("cancel_url", "https://kronr.nl/instellingen/?checkout=cancel");
    params.append("client_reference_id", salon_id);
    params.append("metadata[salon_id]", salon_id);
    params.append("metadata[plan]", plan);
    if (email) params.append("customer_email", email);
    const session = await stripeRequest(env, "checkout/sessions", params);
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, detail: err.stripeDetail }), { status: 502, headers });
  }
}
__name(handleCreateCheckout, "handleCreateCheckout");
async function handlePortal(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { customer_id, salon_id } = body;
  if (!customer_id || !salon_id) {
    return new Response(JSON.stringify({ error: "customer_id en salon_id zijn verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig salon_id-formaat" }), { status: 400, headers });
  }
  const eigenaarCheck = await verifieerEigenaarschap(request, env, salon_id);
  if (!eigenaarCheck.ok) {
    return new Response(JSON.stringify({ error: eigenaarCheck.error }), { status: eigenaarCheck.status, headers });
  }
  const salonRows = await supabaseQuery(env, `salons?id=eq.${salon_id}&select=stripe_customer_id`);
  if (salonRows?.[0]?.stripe_customer_id !== customer_id) {
    return new Response(JSON.stringify({ error: "customer_id hoort niet bij deze salon" }), { status: 403, headers });
  }
  try {
    const params = new URLSearchParams();
    params.append("customer", customer_id);
    params.append("return_url", "https://kronr.nl/instellingen/");
    const session = await stripeRequest(env, "billing_portal/sessions", params);
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, detail: err.stripeDetail }), { status: 502, headers });
  }
}
__name(handlePortal, "handlePortal");
async function handleCreateConnectLink(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id, return_url } = body;
  if (!salon_id || !return_url) {
    return new Response(JSON.stringify({ error: "salon_id en return_url zijn verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig salon_id-formaat" }), { status: 400, headers });
  }
  const eigenaarCheck = await verifieerEigenaarschap(request, env, salon_id);
  if (!eigenaarCheck.ok) {
    return new Response(JSON.stringify({ error: eigenaarCheck.error }), { status: eigenaarCheck.status, headers });
  }
  try {
    let accountId = await getConnectedAccountId(env, salon_id);
    if (!accountId) {
      const acctParams = new URLSearchParams();
      acctParams.append("type", "express");
      acctParams.append("country", "NL");
      acctParams.append("capabilities[card_payments][requested]", "true");
      acctParams.append("capabilities[transfers][requested]", "true");
      const account = await stripeRequest(env, "accounts", acctParams);
      accountId = account.id;
      await supabaseQuery(env, `salons?id=eq.${salon_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stripe_connect_account_id: accountId,
          stripe_connect_status: "in_behandeling"
        })
      });
    }
    const linkParams = new URLSearchParams();
    linkParams.append("account", accountId);
    linkParams.append("type", "account_onboarding");
    linkParams.append("return_url", return_url);
    linkParams.append("refresh_url", return_url);
    const link = await stripeRequest(env, "account_links", linkParams);
    return new Response(JSON.stringify({ url: link.url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, detail: err.stripeDetail }), { status: 502, headers });
  }
}
__name(handleCreateConnectLink, "handleCreateConnectLink");
async function handleConnectStatus(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id } = body;
  if (!salon_id) {
    return new Response(JSON.stringify({ error: "salon_id is verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig salon_id-formaat" }), { status: 400, headers });
  }
  const eigenaarCheck = await verifieerEigenaarschap(request, env, salon_id);
  if (!eigenaarCheck.ok) {
    return new Response(JSON.stringify({ error: eigenaarCheck.error }), { status: eigenaarCheck.status, headers });
  }
  try {
    const accountId = await getConnectedAccountId(env, salon_id);
    if (!accountId) {
      return new Response(JSON.stringify({ status: "niet_gekoppeld" }), { headers });
    }
    const account = await stripeGet(env, `accounts/${accountId}`);
    const nieuweStatus = account.charges_enabled ? "actief" : "in_behandeling";
    await supabaseQuery(env, `salons?id=eq.${salon_id}`, {
      method: "PATCH",
      body: JSON.stringify({ stripe_connect_status: nieuweStatus })
    });
    return new Response(JSON.stringify({ status: nieuweStatus }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 502, headers });
  }
}
__name(handleConnectStatus, "handleConnectStatus");
async function handleCreateDepositCheckout(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id, afspraak_id, bedrag, email, success_url, cancel_url, save_card } = body;
  if (!salon_id || !afspraak_id || !bedrag || !success_url || !cancel_url) {
    return new Response(JSON.stringify({ error: "salon_id, afspraak_id, bedrag, success_url en cancel_url zijn verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id) || !geldigUuid(afspraak_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig ID-formaat" }), { status: 400, headers });
  }
  const afspraakRows = await supabaseQuery(env, `afspraken?id=eq.${afspraak_id}&select=salon_id`);
  if (afspraakRows?.[0]?.salon_id !== salon_id) {
    return new Response(JSON.stringify({ error: "Deze afspraak hoort niet bij deze salon" }), { status: 403, headers });
  }
  try {
    const accountId = await getConnectedAccountId(env, salon_id);
    if (!accountId) {
      return new Response(JSON.stringify({ error: "Deze salon heeft nog geen Stripe gekoppeld" }), { status: 400, headers });
    }
    const params = new URLSearchParams();
    params.append("mode", "payment");
    if (save_card) {
      params.append("payment_method_types[0]", "card");
      params.append("payment_intent_data[setup_future_usage]", "off_session");
    } else {
      params.append("payment_method_types[0]", "card");
      params.append("payment_method_types[1]", "ideal");
    }
    params.append("line_items[0][price_data][currency]", "eur");
    params.append("line_items[0][price_data][product_data][name]", "Aanbetaling afspraak");
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(bedrag * 100)));
    params.append("line_items[0][quantity]", "1");
    if (email) params.append("customer_email", email);
    params.append("success_url", success_url);
    params.append("cancel_url", cancel_url);
    params.append("metadata[afspraak_id]", afspraak_id);
    params.append("metadata[salon_id]", salon_id);
    params.append("metadata[save_card]", save_card ? "1" : "0");
    const session = await stripeRequest(env, "checkout/sessions", params, { connectedAccount: accountId });
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, detail: err.stripeDetail }), { status: 502, headers });
  }
}
__name(handleCreateDepositCheckout, "handleCreateDepositCheckout");
async function handleCreateSetupCheckout(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id, afspraak_id, email, success_url, cancel_url } = body;
  if (!salon_id || !afspraak_id || !success_url || !cancel_url) {
    return new Response(JSON.stringify({ error: "salon_id, afspraak_id, success_url en cancel_url zijn verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id) || !geldigUuid(afspraak_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig ID-formaat" }), { status: 400, headers });
  }
  const afspraakRows = await supabaseQuery(env, `afspraken?id=eq.${afspraak_id}&select=salon_id`);
  if (afspraakRows?.[0]?.salon_id !== salon_id) {
    return new Response(JSON.stringify({ error: "Deze afspraak hoort niet bij deze salon" }), { status: 403, headers });
  }
  try {
    const accountId = await getConnectedAccountId(env, salon_id);
    if (!accountId) {
      return new Response(JSON.stringify({ error: "Deze salon heeft nog geen Stripe gekoppeld" }), { status: 400, headers });
    }
    const params = new URLSearchParams();
    params.append("mode", "setup");
    params.append("payment_method_types[0]", "card");
    if (email) params.append("customer_email", email);
    params.append("success_url", success_url);
    params.append("cancel_url", cancel_url);
    params.append("metadata[afspraak_id]", afspraak_id);
    params.append("metadata[salon_id]", salon_id);
    const session = await stripeRequest(env, "checkout/sessions", params, { connectedAccount: accountId });
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, detail: err.stripeDetail }), { status: 502, headers });
  }
}
__name(handleCreateSetupCheckout, "handleCreateSetupCheckout");
async function handleChargeNoshowFee(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id, afspraak_id } = body;
  if (!salon_id || !afspraak_id) {
    return new Response(JSON.stringify({ success: false, error: "salon_id en afspraak_id zijn verplicht" }), { headers });
  }
  if (!geldigUuid(salon_id) || !geldigUuid(afspraak_id)) {
    return new Response(JSON.stringify({ success: false, error: "Ongeldig ID-formaat" }), { status: 400, headers });
  }
  const eigenaarCheck = await verifieerEigenaarschap(request, env, salon_id);
  if (!eigenaarCheck.ok) {
    return new Response(JSON.stringify({ success: false, error: eigenaarCheck.error }), { status: eigenaarCheck.status, headers });
  }
  try {
    const accountId = await getConnectedAccountId(env, salon_id);
    if (!accountId) {
      return new Response(JSON.stringify({ success: false, error: "Geen Stripe-koppeling gevonden voor deze salon" }), { headers });
    }
    const geclaimd = await supabaseQuery(
      env,
      `afspraken?id=eq.${afspraak_id}&salon_id=eq.${salon_id}&noshow_fee_status=eq.vastgelegd`,
      {
        method: "PATCH",
        body: JSON.stringify({ noshow_fee_status: "incasso_bezig" })
      }
    );
    const afspraak = geclaimd?.[0];
    if (!afspraak) {
      return new Response(JSON.stringify({ success: false, error: "Geen vastgelegde kaartgegevens gevonden voor deze afspraak (mogelijk al ge\xEFncasseerd, in behandeling, of nooit vastgelegd)" }), { headers });
    }
    const salonRows = await supabaseQuery(env, `salons?id=eq.${salon_id}&select=noshow_fee_bedrag`);
    const bedrag = salonRows?.[0]?.noshow_fee_bedrag;
    if (!bedrag) {
      await supabaseQuery(env, `afspraken?id=eq.${afspraak_id}`, {
        method: "PATCH",
        body: JSON.stringify({ noshow_fee_status: "vastgelegd" })
      });
      return new Response(JSON.stringify({ success: false, error: "Geen no-show-bedrag ingesteld voor deze salon" }), { headers });
    }
    const params = new URLSearchParams();
    params.append("amount", String(Math.round(bedrag * 100)));
    params.append("currency", "eur");
    params.append("customer", afspraak.stripe_customer_id);
    params.append("payment_method", afspraak.stripe_payment_method_id);
    params.append("off_session", "true");
    params.append("confirm", "true");
    try {
      await stripeRequest(env, "payment_intents", params, { connectedAccount: accountId });
      await supabaseQuery(env, `afspraken?id=eq.${afspraak_id}`, {
        method: "PATCH",
        body: JSON.stringify({ noshow_fee_status: "geincasseerd" })
      });
      return new Response(JSON.stringify({ success: true }), { headers });
    } catch (stripeErr) {
      await supabaseQuery(env, `afspraken?id=eq.${afspraak_id}`, {
        method: "PATCH",
        body: JSON.stringify({ noshow_fee_status: "mislukt" })
      });
      return new Response(JSON.stringify({ success: false, error: stripeErr.message }), { headers });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { headers });
  }
}
__name(handleChargeNoshowFee, "handleChargeNoshowFee");
async function handleCreateSubscriptionCheckout(request, env, headers) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Alleen POST toegestaan" }), { status: 405, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Ongeldige JSON" }), { status: 400, headers });
  }
  const { salon_id, plan_id, klant_naam, email, success_url, cancel_url } = body;
  if (!salon_id || !plan_id || !klant_naam || !success_url || !cancel_url) {
    return new Response(JSON.stringify({ error: "salon_id, plan_id, klant_naam, success_url en cancel_url zijn verplicht" }), { status: 400, headers });
  }
  if (!geldigUuid(salon_id) || !geldigUuid(plan_id)) {
    return new Response(JSON.stringify({ error: "Ongeldig ID-formaat" }), { status: 400, headers });
  }
  try {
    const accountId = await getConnectedAccountId(env, salon_id);
    if (!accountId) {
      return new Response(JSON.stringify({ error: "Deze salon heeft nog geen Stripe gekoppeld" }), { status: 400, headers });
    }
    const planRows = await supabaseQuery(env, `abonnement_plannen?id=eq.${plan_id}&select=naam,prijs_per_maand,salon_id`);
    const plan = planRows?.[0];
    if (!plan || plan.salon_id !== salon_id) {
      return new Response(JSON.stringify({ error: "Abonnement-plan niet gevonden voor deze salon" }), { status: 404, headers });
    }
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("line_items[0][price_data][currency]", "eur");
    params.append("line_items[0][price_data][product_data][name]", plan.naam);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(plan.prijs_per_maand * 100)));
    params.append("line_items[0][price_data][recurring][interval]", "month");
    params.append("line_items[0][quantity]", "1");
    if (email) params.append("customer_email", email);
    params.append("success_url", success_url);
    params.append("cancel_url", cancel_url);
    params.append("metadata[salon_id]", salon_id);
    params.append("metadata[plan_id]", plan_id);
    params.append("metadata[klant_naam]", klant_naam);
    const session = await stripeRequest(env, "checkout/sessions", params, { connectedAccount: accountId });
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, detail: err.stripeDetail }), { status: 502, headers });
  }
}
__name(handleCreateSubscriptionCheckout, "handleCreateSubscriptionCheckout");
async function alIsVerwerkt(env, eventId) {
  try {
    await supabaseQuery(env, "stripe_verwerkte_events", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ event_id: eventId })
    });
    return false;
  } catch (err) {
    if (err.message && err.message.includes("23505")) {
      return true;
    }
    throw err;
  }
}
__name(alIsVerwerkt, "alIsVerwerkt");
function planFromPriceId(priceId, env) {
  if (priceId === env.PRICE_STARTER_M || priceId === env.PRICE_STARTER_Y) return "starter";
  if (priceId === env.PRICE_PRO_M || priceId === env.PRICE_PRO_Y) return "pro";
  if (priceId === env.PRICE_BUSINESS_M || priceId === env.PRICE_BUSINESS_Y) return "business";
  return "pro";
}
__name(planFromPriceId, "planFromPriceId");
async function handleWebhook(request, env) {
  const sig = request.headers.get("stripe-signature");
  const body = await request.text();
  let event;
  try {
    event = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook-signature ongeldig: ${err.message}`, { status: 400 });
  }
  try {
    if (await alIsVerwerkt(env, event.id)) {
      return new Response("ok (al eerder verwerkt)", { status: 200 });
    }
  } catch (err) {
    return new Response(`Idempotentie-check mislukt: ${err.message}`, { status: 500 });
  }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.metadata?.salon_id) {
          await supabaseQuery(env, `salons?id=eq.${session.metadata.salon_id}`, {
            method: "PATCH",
            body: JSON.stringify({
              plan: session.metadata.plan || "starter",
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription
            })
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const actief = sub.status === "active" || sub.status === "trialing";
        const nieuwPlan = actief ? planFromPriceId(sub.items?.data?.[0]?.price?.id, env) : "free";
        await supabaseQuery(env, `salons?stripe_customer_id=eq.${sub.customer}`, {
          method: "PATCH",
          body: JSON.stringify({ plan: nieuwPlan })
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await supabaseQuery(env, `salons?stripe_customer_id=eq.${sub.customer}`, {
          method: "PATCH",
          body: JSON.stringify({ plan: "free" })
        });
        break;
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    return new Response(`Verwerken mislukt: ${err.message}`, { status: 500 });
  }
}
__name(handleWebhook, "handleWebhook");
async function handleWebhookConnect(request, env) {
  const sig = request.headers.get("stripe-signature");
  const body = await request.text();
  let event;
  try {
    event = await verifyStripeSignature(body, sig, env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook-signature ongeldig: ${err.message}`, { status: 400 });
  }
  try {
    if (await alIsVerwerkt(env, event.id)) {
      return new Response("ok (al eerder verwerkt)", { status: 200 });
    }
  } catch (err) {
    return new Response(`Idempotentie-check mislukt: ${err.message}`, { status: 500 });
  }
  const connectedAccountId = event.account;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata || {};
        if (session.mode === "subscription" && meta.plan_id) {
          await supabaseQuery(env, "klant_abonnementen", {
            method: "POST",
            body: JSON.stringify({
              salon_id: meta.salon_id,
              plan_id: meta.plan_id,
              klant_naam: meta.klant_naam,
              klant_email: session.customer_details?.email || null,
              stripe_subscription_id: session.subscription,
              stripe_customer_id: session.customer,
              status: "actief",
              credits_resterend: 0
            })
          });
          break;
        }
        if (meta.afspraak_id && (session.mode === "setup" || meta.save_card === "1")) {
          let paymentMethodId = null;
          const customerId = session.customer;
          if (session.mode === "setup" && session.setup_intent) {
            const setupIntent = await stripeGet(env, `setup_intents/${session.setup_intent}`, { connectedAccount: connectedAccountId });
            paymentMethodId = setupIntent.payment_method;
          } else if (session.payment_intent) {
            const paymentIntent = await stripeGet(env, `payment_intents/${session.payment_intent}`, { connectedAccount: connectedAccountId });
            paymentMethodId = paymentIntent.payment_method;
          }
          const patch = {
            stripe_customer_id: customerId,
            stripe_payment_method_id: paymentMethodId,
            noshow_fee_status: "vastgelegd"
          };
          if (session.setup_intent) patch.stripe_setup_intent_id = session.setup_intent;
          await supabaseQuery(env, `afspraken?id=eq.${meta.afspraak_id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          });
          if (session.mode === "payment") {
            await supabaseQuery(env, `afspraken?id=eq.${meta.afspraak_id}`, {
              method: "PATCH",
              body: JSON.stringify({
                aanbetaling_status: "betaald",
                stripe_payment_intent_id: session.payment_intent
              })
            });
          }
          break;
        }
        if (meta.afspraak_id) {
          await supabaseQuery(env, `afspraken?id=eq.${meta.afspraak_id}`, {
            method: "PATCH",
            body: JSON.stringify({
              aanbetaling_status: "betaald",
              stripe_payment_intent_id: session.payment_intent
            })
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;
        const aboRows = await supabaseQuery(env, `klant_abonnementen?stripe_subscription_id=eq.${subscriptionId}&select=id,plan_id,credits_resterend`);
        const abo = aboRows?.[0];
        if (!abo) break;
        const planRows = await supabaseQuery(env, `abonnement_plannen?id=eq.${abo.plan_id}&select=credits_per_maand`);
        const creditsPerMaand = planRows?.[0]?.credits_per_maand || 0;
        await supabaseQuery(env, `klant_abonnementen?id=eq.${abo.id}`, {
          method: "PATCH",
          body: JSON.stringify({ credits_resterend: (abo.credits_resterend || 0) + creditsPerMaand })
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await supabaseQuery(env, `klant_abonnementen?stripe_subscription_id=eq.${sub.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "opgezegd", opgezegd_op: (/* @__PURE__ */ new Date()).toISOString() })
        });
        break;
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    return new Response(`Verwerken mislukt: ${err.message}`, { status: 500 });
  }
}
__name(handleWebhookConnect, "handleWebhookConnect");
function timingSafeGelijk(a, b) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) {
    verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return verschil === 0;
}
__name(timingSafeGelijk, "timingSafeGelijk");
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) throw new Error("Geen stripe-signature header");
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Ongeldige signature-header");
  const nu = Math.floor(Date.now() / 1e3);
  const leeftijd = nu - parseInt(timestamp, 10);
  if (leeftijd > 300 || leeftijd < -60) {
    throw new Error("Webhook-timestamp te oud of ongeldig (mogelijke replay)");
  }
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = [...new Uint8Array(sigBytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!timingSafeGelijk(expected, signature)) throw new Error("Signature komt niet overeen");
  return JSON.parse(payload);
}
__name(verifyStripeSignature, "verifyStripeSignature");
export {
  index_default as default
};
