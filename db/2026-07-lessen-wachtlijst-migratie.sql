-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Wachtlijst voor groepslessen
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor. Vereist dat
-- 2026-07-groepslessen-migratie.sql al gedraaid is (lessen, les_boekingen).
--
-- WAAROM: een groepsles heeft een harde capaciteit. Zodra een les vol zit
-- kan een klant nu alleen "Vol" zien -- er is geen manier om zich kenbaar
-- te maken voor als er alsnog een plek vrijkomt (annulering). Dit volgt
-- hetzelfde patroon als de bestaande 1-op-1-wachtlijst (tabel `wachtlijst`
-- + vind_wachtlijst_match/claim_wachtlijst_plek), maar dan per specifieke
-- les (geen datum-range/flexibiliteit nodig -- de les staat al vast).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists lessen_wachtlijst (
  id uuid primary key default gen_random_uuid(),
  les_id uuid not null references lessen(id) on delete cascade,
  klant_naam text not null,
  klant_email text not null,
  klant_telefoon text,
  status text not null default 'actief' check (status in ('actief', 'voorgesteld', 'vervuld', 'verlopen', 'verwijderd')),
  claim_token uuid not null default gen_random_uuid(),
  voorgesteld_op timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lessen_wachtlijst_les_idx on lessen_wachtlijst(les_id, status);
create unique index if not exists lessen_wachtlijst_claim_token_idx on lessen_wachtlijst(claim_token);

-- ── RLS ──
-- Zelfde patroon als les_boekingen: geen publieke select (bevat
-- klantgegevens), alleen de salon zelf mag lezen/wijzigen. Toevoegen
-- (vanuit de boekingswidget) en claimen gaat via de security-definer
-- RPC's hieronder.
alter table lessen_wachtlijst enable row level security;

drop policy if exists "lessen_wachtlijst_select_eigen_salon" on lessen_wachtlijst;
create policy "lessen_wachtlijst_select_eigen_salon" on lessen_wachtlijst
  for select using (
    les_id in (
      select l.id from lessen l
      where l.salon_id in (select id from salons where owner_id = auth.uid())
         or l.salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
    )
  );

drop policy if exists "lessen_wachtlijst_update_eigen_salon" on lessen_wachtlijst;
create policy "lessen_wachtlijst_update_eigen_salon" on lessen_wachtlijst
  for update using (
    les_id in (
      select l.id from lessen l
      where l.salon_id in (select id from salons where owner_id = auth.uid())
         or l.salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
    )
  );

-- RPC: klant zet zichzelf op de wachtlijst voor een specifieke (volle)
-- les. Security definer zodat dit ook zonder inloggen kan (widget).
create or replace function voeg_toe_lessen_wachtlijst(
  p_les_id uuid, p_klant_naam text, p_klant_email text, p_klant_telefoon text
)
returns void
language plpgsql
security definer
as $$
begin
  insert into lessen_wachtlijst (les_id, klant_naam, klant_email, klant_telefoon)
  values (p_les_id, p_klant_naam, lower(p_klant_email), p_klant_telefoon);
end;
$$;

-- RPC: na het annuleren van een les_boeking (plek komt vrij) de langst
-- wachtende actieve wachtlijst-kandidaat voor déze les vinden en de plek
-- 24u voor hen reserveren (net als vind_wachtlijst_match voor afspraken).
-- Checkt de capaciteit opnieuw -- als de les toch al vol zit (bv. door
-- een andere geboekte plek) wordt er niemand voorgesteld.
create or replace function vind_lessen_wachtlijst_match(p_les_id uuid)
returns table(
  gevonden boolean, klant_naam text, klant_email text, klant_telefoon text, claim_token uuid
)
language plpgsql
security definer
as $$
#variable_conflict use_column
declare
  v_capaciteit integer;
  v_geboekt integer;
  v_kandidaat lessen_wachtlijst%rowtype;
begin
  select capaciteit into v_capaciteit from lessen where id = p_les_id and status = 'gepland';
  if v_capaciteit is null then
    return query select false, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  select count(*) into v_geboekt from les_boekingen where les_id = p_les_id and status <> 'geannuleerd';
  if v_geboekt >= v_capaciteit then
    return query select false, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  select * into v_kandidaat from lessen_wachtlijst
  where les_id = p_les_id and status = 'actief'
  order by created_at
  limit 1;

  if v_kandidaat.id is null then
    return query select false, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  update lessen_wachtlijst
  set status = 'voorgesteld', voorgesteld_op = now()
  where id = v_kandidaat.id;

  return query select true, v_kandidaat.klant_naam, v_kandidaat.klant_email, v_kandidaat.klant_telefoon, v_kandidaat.claim_token;
end;
$$;

-- RPC: gegevens ophalen bij het openen van de claim-link (zelfde
-- claim-pagina als de 1-op-1-wachtlijst, op basis van token).
create or replace function get_lessen_wachtlijst_via_token(p_token uuid)
returns table(
  klant_naam text, dienst_naam text, datum_tijd timestamptz, status text, voorgesteld_op timestamptz, salon_naam text
)
language sql
security definer
stable
as $$
  select w.klant_naam, d.naam, l.datum_tijd, w.status, w.voorgesteld_op, s.naam
  from lessen_wachtlijst w
  join lessen l on l.id = w.les_id
  join diensten d on d.id = l.dienst_id
  join salons s on s.id = l.salon_id
  where w.claim_token = p_token;
$$;

-- RPC: klant bevestigt de aangeboden plek. Controleert atomisch dat het
-- aanbod nog geldig is (status + 24u-venster) en dat de les nog een vrije
-- plek heeft, en zet dan pas de boeking om -- zelfde voorzichtigheid als
-- boek_les/claim_wachtlijst_plek.
create or replace function claim_lessen_wachtlijst_plek(p_token uuid)
returns jsonb
language plpgsql
security definer
as $$
#variable_conflict use_column
declare
  v_wachtlijst lessen_wachtlijst%rowtype;
  v_capaciteit integer;
  v_geboekt integer;
  v_dienst_id uuid;
  v_salon_id uuid;
  v_dienst_naam text;
  v_salon_naam text;
  v_datum_tijd timestamptz;
  v_boeking_id uuid;
  v_annuleer_token uuid;
begin
  select * into v_wachtlijst from lessen_wachtlijst where claim_token = p_token for update;

  if v_wachtlijst.id is null then
    return jsonb_build_object('success', false, 'error', 'Deze plek kon niet gevonden worden.');
  end if;
  if v_wachtlijst.status = 'vervuld' then
    return jsonb_build_object('success', false, 'error', 'Deze plek is al geclaimd.');
  end if;
  if v_wachtlijst.status <> 'voorgesteld' or v_wachtlijst.voorgesteld_op is null
     or now() - v_wachtlijst.voorgesteld_op > interval '24 hours' then
    return jsonb_build_object('success', false, 'error', 'Deze plek is verlopen.');
  end if;

  select l.capaciteit, l.dienst_id, l.datum_tijd, l.salon_id
    into v_capaciteit, v_dienst_id, v_datum_tijd, v_salon_id
  from lessen l where l.id = v_wachtlijst.les_id for update;

  select count(*) into v_geboekt from les_boekingen where les_id = v_wachtlijst.les_id and status <> 'geannuleerd';
  if v_geboekt >= v_capaciteit then
    update lessen_wachtlijst set status = 'verlopen' where id = v_wachtlijst.id;
    return jsonb_build_object('success', false, 'error', 'Helaas, deze plek is inmiddels door iemand anders bezet.');
  end if;

  insert into les_boekingen (les_id, klant_naam, klant_email, klant_telefoon)
  values (v_wachtlijst.les_id, v_wachtlijst.klant_naam, v_wachtlijst.klant_email, v_wachtlijst.klant_telefoon)
  returning id, annuleer_token into v_boeking_id, v_annuleer_token;

  update lessen_wachtlijst set status = 'vervuld' where id = v_wachtlijst.id;

  select naam into v_dienst_naam from diensten where id = v_dienst_id;
  select naam into v_salon_naam from salons where id = v_salon_id;

  return jsonb_build_object(
    'success', true,
    'klant_naam', v_wachtlijst.klant_naam,
    'klant_email', v_wachtlijst.klant_email,
    'salon_naam', v_salon_naam,
    'dienst_naam', v_dienst_naam,
    'datum_tijd', v_datum_tijd,
    'annuleer_token', v_annuleer_token
  );
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. lessen/index.html krijgt een "Annuleren"-knop per boeking (naast
-- No-show) die vind_lessen_wachtlijst_match aanroept en de bestaande
-- kronr-mail /wachtlijst-plek-route hergebruikt (die is al generiek genoeg:
-- klant_naam/dienst_naam/datum_tijd/salon_naam/claim_token).
-- boeken/index.html toont bij een volle les een "Zet me op de
-- wachtlijst"-knop i.p.v. alleen "Vol".
-- wachtlijst-claim/index.html probeert bij een onbekend token ook
-- get_lessen_wachtlijst_via_token/claim_lessen_wachtlijst_plek.
-- ══════════════════════════════════════════════════════════════════════
