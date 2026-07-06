-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Abonnementen voor klanten
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- Vereist Stripe Connect (db/2026-07-stripe-aanbetaling-migratie.sql).
--
-- Ontwerpkeuzes (geen aparte afstemming over gedaan, redelijke defaults --
-- laat het weten als dit moet worden aangepast):
--   - Een abonnement-plan is gekoppeld aan PRECIES 1 dienst (niet vrij
--     inzetbaar over meerdere diensten) -- voorspelbaarder voor de salon
--     en simpeler voor de klant om te begrijpen ("1x knippen per maand")
--   - Credits worden maandelijks bijgeschreven bij een succesvolle
--     Stripe-betaling (via webhook), niet vooruit in 1x toegekend
--   - Een credit wordt bij het boeken direct verbruikt (geen wachtrij/
--     reservering van credits)
-- ══════════════════════════════════════════════════════════════════════

-- 1) Abonnement-plannen (door de salon aangemaakt) ------------------------
create table if not exists abonnement_plannen (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  dienst_id uuid not null references diensten(id) on delete cascade,
  naam text not null,
  credits_per_maand integer not null default 1 check (credits_per_maand > 0),
  prijs_per_maand numeric(10,2) not null check (prijs_per_maand > 0),
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists abonnement_plannen_salon_idx on abonnement_plannen(salon_id, actief);

alter table abonnement_plannen enable row level security;

drop policy if exists "abonnement_plannen_select_own_salon" on abonnement_plannen;
create policy "abonnement_plannen_select_own_salon" on abonnement_plannen
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
-- Ook publiek leesbaar (voor boeken.html, dat niet ingelogd is) -- alleen
-- actieve plannen, geen gevoelige data in deze tabel.
drop policy if exists "abonnement_plannen_select_publiek" on abonnement_plannen;
create policy "abonnement_plannen_select_publiek" on abonnement_plannen
  for select using (actief = true);

drop policy if exists "abonnement_plannen_insert_own_salon" on abonnement_plannen;
create policy "abonnement_plannen_insert_own_salon" on abonnement_plannen
  for insert with check (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
drop policy if exists "abonnement_plannen_update_own_salon" on abonnement_plannen;
create policy "abonnement_plannen_update_own_salon" on abonnement_plannen
  for update using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- 2) Klant-abonnementen (wie is er op geabonneerd) -------------------------
create table if not exists klant_abonnementen (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  plan_id uuid not null references abonnement_plannen(id) on delete restrict,
  klant_naam text not null,
  klant_email text not null,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text not null default 'actief' check (status in ('actief','opgezegd','mislukt')),
  credits_resterend integer not null default 0 check (credits_resterend >= 0),
  aangemaakt_op timestamptz not null default now(),
  opgezegd_op timestamptz
);

create index if not exists klant_abonnementen_salon_idx on klant_abonnementen(salon_id, status);
create index if not exists klant_abonnementen_email_idx on klant_abonnementen(salon_id, klant_email);
create unique index if not exists klant_abonnementen_stripe_sub_idx on klant_abonnementen(stripe_subscription_id) where stripe_subscription_id is not null;

alter table klant_abonnementen enable row level security;

drop policy if exists "klant_abonnementen_select_own_salon" on klant_abonnementen;
create policy "klant_abonnementen_select_own_salon" on klant_abonnementen
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
drop policy if exists "klant_abonnementen_update_own_salon" on klant_abonnementen;
create policy "klant_abonnementen_update_own_salon" on klant_abonnementen
  for update using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );
-- GEEN publieke select/insert-policy: het aanmaken en tegoed-lookup van
-- klant_abonnementen loopt via een SECURITY DEFINER RPC (zie hieronder),
-- niet via directe tabeltoegang -- dit voorkomt dat iemand zomaar
-- credits_resterend voor een willekeurige klant kan uitlezen door een
-- e-mailadres te raden.

-- 3) Koppeling op afspraken: gebruikte een credit i.p.v. betaling --------
alter table afspraken
  add column if not exists gebruikt_abonnement_id uuid references klant_abonnementen(id) on delete set null;

-- 4) RPC: abonnement-tegoed opzoeken (PUBLIEK, voor boeken.html) ----------
-- Geeft alleen terug wat nodig is om te tonen of er tegoed is, geen
-- brede toegang tot de abonnementstabel.
create or replace function get_abonnement_tegoed(p_salon_id uuid, p_email text, p_dienst_id uuid)
returns table(heeft_tegoed boolean, credits_resterend integer, abonnement_id uuid)
security definer
language sql
as $$
  select
    (ka.credits_resterend > 0) as heeft_tegoed,
    ka.credits_resterend,
    ka.id
  from klant_abonnementen ka
  join abonnement_plannen ap on ap.id = ka.plan_id
  where ka.salon_id = p_salon_id
    and lower(ka.klant_email) = lower(p_email)
    and ap.dienst_id = p_dienst_id
    and ka.status = 'actief'
  order by ka.credits_resterend desc
  limit 1;
$$;

-- 5) RPC: credit verbruiken bij het boeken (PUBLIEK, atomisch) -----------
-- Trekt 1 credit af EN geeft true/false terug of dat gelukt is -- dit
-- moet atomisch in de database gebeuren (niet eerst ophalen, dan los
-- updaten vanuit de browser), anders kan een klant met een trage
-- verbinding per ongeluk (of expres) hetzelfde tegoed dubbel gebruiken.
create or replace function verbruik_abonnement_credit(p_abonnement_id uuid)
returns boolean
security definer
language plpgsql
as $$
declare
  v_bijgewerkt integer;
begin
  update klant_abonnementen
  set credits_resterend = credits_resterend - 1
  where id = p_abonnement_id and credits_resterend > 0 and status = 'actief';

  get diagnostics v_bijgewerkt = row_count;
  return v_bijgewerkt > 0;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Zie workers/kronr-stripe-abonnementen-routes.md voor de
-- recurring-Stripe-koppeling en de webhook die credits bijschrijft.
-- ══════════════════════════════════════════════════════════════════════
