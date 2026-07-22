-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: fooi-bedrag server-side valideren in de kassa
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- VEREIST: 2026-07-voorraadbeheer-migratie.sql moet al gedraaid zijn.
--
-- Wat dit toevoegt: 'fooi'-regels in de kassa werden tot nu toe volledig
-- op het clientbedrag vertrouwd (net als 'overig' in het algemeen). Fooi
-- heeft in de UI maar 2 vaste knoppen (€5/€10), dus die kunnen nu ook
-- server-side afgedwongen worden -- een gecompromitteerd personeels-
-- account kan niet meer een fooi-regel met een verzonnen bedrag insturen.
-- ══════════════════════════════════════════════════════════════════════

create or replace function verwerk_kassa_betaling(
  p_salon_id uuid,
  p_locatie_id uuid,
  p_methode text,
  p_afspraak_id uuid,
  p_items jsonb,
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
  v_fooi_prijs numeric;
begin
  if p_salon_id not in (
    select id from salons where owner_id = auth.uid()
    union
    select salon_id from medewerkers where auth_user_id = auth.uid()
  ) then
    raise exception 'Geen toegang tot deze salon';
  end if;

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

    elsif (v_item->>'type') = 'fooi' then
      -- Alleen de 2 bedragen die de kassa-UI daadwerkelijk aanbiedt.
      v_fooi_prijs := (v_item->>'prijs')::numeric;
      if v_fooi_prijs is null or v_fooi_prijs not in (5, 10) then
        raise exception 'Ongeldig fooi-bedrag: %', v_fooi_prijs;
      end if;
      v_regel_totaal := v_fooi_prijs * v_aantal;

    else
      -- 'overig'/cadeaubon_verkoop: geen canonieke prijs, client-bedrag
      -- wordt hier vertrouwd (zie toelichting in eerdere migratie).
      v_regel_totaal := coalesce((v_item->>'prijs')::numeric, 0) * v_aantal;
    end if;

    v_totaal := v_totaal + v_regel_totaal;
  end loop;

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

  insert into betalingen (
    salon_id, bedrag, methode, status, afspraak_id,
    cadeaubon_code, cadeaubon_bedrag_gebruikt, locatie_id
  ) values (
    p_salon_id, v_totaal, p_methode, 'betaald', p_afspraak_id,
    p_cadeaubon_code_gebruikt, p_cadeaubon_bedrag_gebruikt, p_locatie_id
  ) returning id into v_betaling_id;

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

    elsif (v_item->>'type') = 'fooi' then
      v_regel_totaal := (v_item->>'prijs')::numeric * v_aantal;

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

  if p_afspraak_id is not null then
    update afspraken set status = 'afgerond' where id = p_afspraak_id and salon_id = p_salon_id;
  end if;

  if v_cb_id is not null then
    v_nieuwe_saldo := greatest(0, v_cb_saldo - p_cadeaubon_bedrag_gebruikt);
    update cadeaubonnen set
      resterend_bedrag = v_nieuwe_saldo,
      status = case when v_nieuwe_saldo <= 0 then 'ingewisseld' else 'actief' end
    where id = v_cb_id;
  end if;

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

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. Let op: als je later de fooi-knoppen in kassa/index.html
-- verandert (andere bedragen dan €5/€10), moet de 'not in (5, 10)'-check
-- hierboven ook worden bijgewerkt.
-- ══════════════════════════════════════════════════════════════════════
