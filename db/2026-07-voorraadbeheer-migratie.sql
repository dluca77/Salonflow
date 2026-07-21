-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Voorraadbeheer voor productverkoop
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- VEREIST: 2026-07-kassa-server-side-migratie.sql moet al gedraaid zijn
-- (deze migratie vervangt verwerk_kassa_betaling door een versie die ook
-- voorraad afboekt).
--
-- Wat dit toevoegt: een echte productenlijst (naam, prijs, voorraadaantal)
-- i.p.v. de generieke 'Product €15/€25'-knoppen in de kassa. Voorraad
-- wordt ATOMISCH afgeboekt in dezelfde transactie als de betaling (dus
-- nooit een verkoop zonder voorraadmutatie, of andersom).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists producten (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  naam text not null,
  prijs numeric not null check (prijs >= 0),
  voorraad_aantal integer not null default 0 check (voorraad_aantal >= 0),
  lage_voorraad_drempel integer not null default 3,
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists producten_salon_idx on producten(salon_id, actief);

alter table producten enable row level security;

drop policy if exists "producten_select_eigen_salon" on producten;
create policy "producten_select_eigen_salon" on producten
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

drop policy if exists "producten_write_eigenaar" on producten;
create policy "producten_write_eigenaar" on producten
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
  );

-- ── verwerk_kassa_betaling uitbreiden met voorraadafboeking ───────────────
-- Items van het type 'product' krijgen nu een verplicht product_id; de
-- prijs wordt (net als bij diensten) server-side opnieuw opgezocht i.p.v.
-- het clientbedrag te vertrouwen, en de voorraad wordt in dezelfde
-- transactie verlaagd. Onvoldoende voorraad -> hele betaling faalt (geen
-- verkoop van iets dat niet op voorraad is).
create or replace function verwerk_kassa_betaling(
  p_salon_id uuid,
  p_locatie_id uuid,
  p_methode text,
  p_afspraak_id uuid,
  p_items jsonb,                 -- [{type, dienst_id, product_id, naam, prijs, aantal, medewerker_id}]
  p_cadeaubon_code_gebruikt text,
  p_cadeaubon_bedrag_gebruikt numeric,
  p_nieuwe_cadeaubonnen jsonb
)
returns table(betaling_id uuid, nieuwe_codes jsonb)
language plpgsql
security definer
as $$
declare
  v_item jsonb;
  v_cb jsonb;
  v_dienst_prijs numeric;
  v_product_prijs numeric;
  v_product_voorraad integer;
  v_regel_totaal numeric;
  v_totaal numeric := 0;
  v_betaling_id uuid;
  v_cb_id uuid;
  v_cb_saldo numeric;
  v_nieuwe_saldo numeric;
  v_code text;
  v_gen_codes jsonb := '[]'::jsonb;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_aantal numeric;
begin
  if p_salon_id not in (
    select id from salons where owner_id = auth.uid()
    union
    select salon_id from medewerkers where auth_user_id = auth.uid()
  ) then
    raise exception 'Geen toegang tot deze salon';
  end if;

  -- 1) Regels doorlopen, prijzen zelf opnieuw opzoeken + voorraad checken --
  for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_i;
    v_aantal := coalesce((v_item->>'aantal')::numeric, 1);

    if (v_item->>'type') = 'dienst' and (v_item->>'dienst_id') is not null then
      select prijs into v_dienst_prijs from diensten where id = (v_item->>'dienst_id')::uuid and salon_id = p_salon_id;
      if v_dienst_prijs is null then
        raise exception 'Onbekende dienst: %', (v_item->>'dienst_id');
      end if;
      v_regel_totaal := v_dienst_prijs * v_aantal;

    elsif (v_item->>'type') = 'product' and (v_item->>'product_id') is not null then
      select prijs, voorraad_aantal into v_product_prijs, v_product_voorraad
      from producten where id = (v_item->>'product_id')::uuid and salon_id = p_salon_id;
      if v_product_prijs is null then
        raise exception 'Onbekend product: %', (v_item->>'product_id');
      end if;
      if v_product_voorraad < v_aantal then
        raise exception 'Onvoldoende voorraad voor dit product (nog % op voorraad)', v_product_voorraad;
      end if;
      v_regel_totaal := v_product_prijs * v_aantal;

    else
      -- 'overig' (fooi/vrije toevoeging) en cadeaubon_verkoop: geen
      -- canonieke prijs, client-bedrag wordt hier vertrouwd.
      v_regel_totaal := coalesce((v_item->>'prijs')::numeric, 0) * v_aantal;
    end if;

    v_totaal := v_totaal + v_regel_totaal;
  end loop;

  -- 2) Cadeaubon-inwisseling verifiëren --------------------------------
  if p_cadeaubon_code_gebruikt is not null then
    select id, resterend_bedrag into v_cb_id, v_cb_saldo
    from cadeaubonnen
    where salon_id = p_salon_id and code = upper(p_cadeaubon_code_gebruikt) and status = 'actief';
    if v_cb_id is null then
      raise exception 'Cadeaubon niet gevonden of niet actief';
    end if;
    if p_cadeaubon_bedrag_gebruikt > v_cb_saldo then
      raise exception 'Cadeaubon-saldo ontoereikend';
    end if;
    v_totaal := v_totaal - p_cadeaubon_bedrag_gebruikt;
  end if;

  -- 3) Betaling aanmaken ---------------------------------------------------
  insert into betalingen (
    salon_id, bedrag, methode, status, afspraak_id,
    cadeaubon_code, cadeaubon_bedrag_gebruikt, locatie_id
  ) values (
    p_salon_id, v_totaal, p_methode, 'betaald', p_afspraak_id,
    p_cadeaubon_code_gebruikt, p_cadeaubon_bedrag_gebruikt, p_locatie_id
  ) returning id into v_betaling_id;

  -- 4) Verkoop-regels wegschrijven + voorraad afboeken ---------------------
  for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_i;
    v_aantal := coalesce((v_item->>'aantal')::numeric, 1);

    if (v_item->>'type') = 'dienst' and (v_item->>'dienst_id') is not null then
      select prijs into v_dienst_prijs from diensten where id = (v_item->>'dienst_id')::uuid;
      v_regel_totaal := v_dienst_prijs * v_aantal;

    elsif (v_item->>'type') = 'product' and (v_item->>'product_id') is not null then
      select prijs into v_product_prijs from producten where id = (v_item->>'product_id')::uuid;
      v_regel_totaal := v_product_prijs * v_aantal;

      update producten set voorraad_aantal = voorraad_aantal - v_aantal::integer
      where id = (v_item->>'product_id')::uuid;

    else
      v_regel_totaal := coalesce((v_item->>'prijs')::numeric, 0) * v_aantal;
    end if;

    insert into verkoop_items (salon_id, betaling_id, medewerker_id, naam, type, prijs, aantal, totaal, locatie_id)
    values (
      p_salon_id, v_betaling_id,
      nullif(v_item->>'medewerker_id','')::uuid,
      v_item->>'naam', coalesce(v_item->>'type','dienst'),
      coalesce(v_dienst_prijs, v_product_prijs, (v_item->>'prijs')::numeric),
      v_aantal, v_regel_totaal, p_locatie_id
    );
  end loop;

  -- 5) Afspraak op 'afgerond' zetten ---------------------------------------
  if p_afspraak_id is not null then
    update afspraken set status = 'afgerond' where id = p_afspraak_id and salon_id = p_salon_id;
  end if;

  -- 6) Gebruikte cadeaubon afschrijven --------------------------------------
  if v_cb_id is not null then
    v_nieuwe_saldo := greatest(0, v_cb_saldo - p_cadeaubon_bedrag_gebruikt);
    update cadeaubonnen set
      resterend_bedrag = v_nieuwe_saldo,
      status = case when v_nieuwe_saldo <= 0 then 'ingewisseld' else 'actief' end
    where id = v_cb_id;
  end if;

  -- 7) Nieuwe cadeaubonnen aanmaken -----------------------------------------
  if p_nieuwe_cadeaubonnen is not null then
    for v_i in 0 .. jsonb_array_length(p_nieuwe_cadeaubonnen) - 1 loop
      v_cb := p_nieuwe_cadeaubonnen -> v_i;
      v_code := '';
      for v_i in 1..8 loop
        v_code := v_code || substr(v_chars, (floor(random()*length(v_chars))+1)::int, 1);
      end loop;
      insert into cadeaubonnen (
        salon_id, code, bedrag_origineel, resterend_bedrag,
        gekocht_door_naam, gekocht_door_email, verkocht_via, betaling_id
      ) values (
        p_salon_id, v_code, (v_cb->>'bedrag')::numeric, (v_cb->>'bedrag')::numeric,
        v_cb->>'koper_naam', v_cb->>'koper_email', 'kassa', v_betaling_id
      );
      v_gen_codes := v_gen_codes || jsonb_build_object('code', v_code, 'bedrag', (v_cb->>'bedrag')::numeric);
    end loop;
  end if;

  return query select v_betaling_id, v_gen_codes;
end;
$$;

-- RPC: producten met lage voorraad opvragen (voor een dashboard-waarschuwing)
create or replace function get_lage_voorraad_producten(p_salon_id uuid)
returns setof producten
language sql
stable
security definer
as $$
  select * from producten
  where salon_id = p_salon_id
    and actief = true
    and voorraad_aantal <= lage_voorraad_drempel
    and p_salon_id in (select id from salons where owner_id = auth.uid())
  order by voorraad_aantal asc;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Nieuwe pagina producten/index.html voor beheer (toevoegen/
-- bewerken/voorraad aanpassen). kassa/index.html laadt nu producten
-- i.p.v. de vaste 'Product €15/€25'-knoppen.
-- ══════════════════════════════════════════════════════════════════════
