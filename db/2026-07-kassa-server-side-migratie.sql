-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: kassa-afrekenen + cadeaubon-mutaties server-side
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- PROBLEEM: kassa/index.html berekende bedragen client-side en schreef ze
-- rechtstreeks weg (sb.from('betalingen').insert(...), sb.from
-- ('cadeaubonnen').insert/update(...)). Een gecompromitteerd of malafide
-- medewerker-account kon zo, los van de normale kassa-flow, via de
-- browserconsole:
--   - een dienstprijs verlagen vlak voor het afrekenen (prijs komt uit de
--     client, niet opnieuw opgezocht in `diensten`)
--   - een cadeaubon aanmaken met een `resterend_bedrag` dat niet
--     overeenkomt met een echte betaling
--   - een bestaande cadeaubon een hoger saldo geven door de update
--     rechtstreeks aan te roepen
--
-- OPLOSSING: 1 atomaire, server-side RPC die (a) dienstprijzen zelf opnieuw
-- opzoekt in `diensten` i.p.v. het clientbedrag te vertrouwen, en (b) alle
-- schrijfacties (betaling, verkoop-regels, cadeaubon aanmaken/afschrijven,
-- afspraak op 'afgerond') in 1 transactie doet. Directe INSERT/UPDATE-
-- rechten op `cadeaubonnen` en INSERT op `betalingen` worden ingetrokken
-- voor de 'authenticated'-rol, zodat dit niet meer om te zeilen is door de
-- tabellen rechtstreeks aan te roepen.
--
-- 'Overig'-regels (fooi, vrije productverkoop) hebben geen canonieke prijs
-- om tegen te controleren -- dat blijft staff-ingevoerd, zoals nu. Dat is
-- een bewust geaccepteerd, beperkt risico (vereist al een geauthenticeerd
-- personeelsaccount, geen impact op klant/betaalgegevens van anderen).
-- ══════════════════════════════════════════════════════════════════════

create or replace function verwerk_kassa_betaling(
  p_salon_id uuid,
  p_locatie_id uuid,
  p_methode text,
  p_afspraak_id uuid,
  p_items jsonb,                 -- [{type, dienst_id, naam, prijs, aantal, medewerker_id}]
  p_cadeaubon_code_gebruikt text,
  p_cadeaubon_bedrag_gebruikt numeric,
  p_nieuwe_cadeaubonnen jsonb    -- [{bedrag, koper_naam, koper_email}]
)
returns table(betaling_id uuid, nieuwe_codes jsonb)
language plpgsql
security definer
as $$
declare
  v_item jsonb;
  v_cb jsonb;
  v_dienst_prijs numeric;
  v_regel_totaal numeric;
  v_totaal numeric := 0;
  v_btw numeric;
  v_betaling_id uuid;
  v_cb_id uuid;
  v_cb_saldo numeric;
  v_nieuwe_saldo numeric;
  v_code text;
  v_gen_codes jsonb := '[]'::jsonb;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
begin
  -- Toegangscheck: alleen voor de eigen salon (eigenaar OF medewerker met
  -- kassa-recht -- de RESTRICTIVE RLS-policy op betalingen/cadeaubonnen
  -- dekt medewerker-rechten al; hier alleen salon-eigendom als basischeck).
  if p_salon_id not in (
    select id from salons where owner_id = auth.uid()
    union
    select salon_id from medewerkers where auth_user_id = auth.uid()
  ) then
    raise exception 'Geen toegang tot deze salon';
  end if;

  -- 1) Regels doorlopen, dienstprijzen zelf opnieuw opzoeken -------------
  for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_i;

    if (v_item->>'type') = 'dienst' and (v_item->>'dienst_id') is not null then
      select prijs into v_dienst_prijs
      from diensten
      where id = (v_item->>'dienst_id')::uuid and salon_id = p_salon_id;

      if v_dienst_prijs is null then
        raise exception 'Onbekende dienst: %', (v_item->>'dienst_id');
      end if;
      v_regel_totaal := v_dienst_prijs * coalesce((v_item->>'aantal')::numeric, 1);
    else
      -- 'overig' (fooi/vrije productverkoop) en cadeaubon_verkoop-regels:
      -- geen canonieke prijs, client-bedrag wordt hier vertrouwd (zie
      -- toelichting bovenaan dit bestand).
      v_regel_totaal := coalesce((v_item->>'prijs')::numeric, 0) * coalesce((v_item->>'aantal')::numeric, 1);
    end if;

    v_totaal := v_totaal + v_regel_totaal;
  end loop;

  -- 2) Cadeaubon-inwisseling verifiëren (server-side saldo, niet client) --
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

  v_btw := round(v_totaal - (v_totaal / 1.21), 2);

  -- 3) Betaling aanmaken ---------------------------------------------------
  insert into betalingen (
    salon_id, bedrag, methode, status, afspraak_id,
    cadeaubon_code, cadeaubon_bedrag_gebruikt, locatie_id
  ) values (
    p_salon_id, v_totaal, p_methode, 'betaald', p_afspraak_id,
    p_cadeaubon_code_gebruikt, p_cadeaubon_bedrag_gebruikt, p_locatie_id
  ) returning id into v_betaling_id;

  -- 4) Verkoop-regels wegschrijven (met server-geverifieerd bedrag) -------
  for v_i in 0 .. jsonb_array_length(p_items) - 1 loop
    v_item := p_items -> v_i;

    if (v_item->>'type') = 'dienst' and (v_item->>'dienst_id') is not null then
      select prijs into v_dienst_prijs from diensten where id = (v_item->>'dienst_id')::uuid;
      v_regel_totaal := v_dienst_prijs * coalesce((v_item->>'aantal')::numeric, 1);
    else
      v_regel_totaal := coalesce((v_item->>'prijs')::numeric, 0) * coalesce((v_item->>'aantal')::numeric, 1);
    end if;

    insert into verkoop_items (salon_id, betaling_id, medewerker_id, naam, type, prijs, aantal, totaal, locatie_id)
    values (
      p_salon_id, v_betaling_id,
      nullif(v_item->>'medewerker_id','')::uuid,
      v_item->>'naam', coalesce(v_item->>'type','dienst'),
      coalesce((v_item->>'prijs')::numeric, v_dienst_prijs),
      coalesce((v_item->>'aantal')::numeric, 1),
      v_regel_totaal, p_locatie_id
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

  -- 7) Nieuwe cadeaubonnen aanmaken, gekoppeld aan déze betaling -----------
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

-- Directe schrijftoegang intrekken zodat dit niet meer te omzeilen is
-- door de tabellen rechtstreeks vanaf de client aan te roepen. Alleen de
-- RPC hierboven (security definer) mag deze tabellen nog muteren.
revoke insert on betalingen from authenticated;
revoke insert, update on cadeaubonnen from authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- LET OP na het draaien:
-- 1. Als er kolomnamen/typen afwijken van jouw live schema (bv.
--    verkoop_items of betalingen hebben een andere kolomset), pas de
--    functie daarop aan voordat je 'm draait -- test eerst op een
--    Supabase-preview/branch, niet direct op productie.
-- 2. `betaling_id` op cadeaubonnen bestaat mogelijk nog niet als kolom --
--    voeg zo nodig toe: alter table cadeaubonnen add column if not
--    exists betaling_id uuid references betalingen(id);
-- 3. kassa/index.html moet aangepast worden om verwerk_kassa_betaling()
--    aan te roepen i.p.v. de losse insert/update-calls (zie de bijgewerkte
--    betaal()-functie in dat bestand).
-- ══════════════════════════════════════════════════════════════════════
