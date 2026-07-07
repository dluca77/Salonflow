-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Afmelden voor marketing-mail (AVG-verplichting)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- Wat dit toevoegt:
--   1. klanten.afmeld_token -- stabiel, uniek token per klant, gebruikt
--      in de afmeld-link onderaan elke marketing-mail
--   2. RPC meld_af_marketing(p_token) -- publiek aanroepbaar (geen login
--      nodig, net als annuleer_afspraak_via_token), zet
--      marketing_opt_out = true voor de klant met dat token
-- ══════════════════════════════════════════════════════════════════════

alter table klanten
  add column if not exists afmeld_token uuid not null default gen_random_uuid();

create unique index if not exists klanten_afmeld_token_idx on klanten(afmeld_token);

create or replace function meld_af_marketing(p_token uuid)
returns table(klant_naam text, salon_naam text)
security definer
language plpgsql
as $$
declare
  v_klant_id uuid;
  v_klant_naam text;
  v_salon_naam text;
begin
  select k.id, k.naam, s.naam
    into v_klant_id, v_klant_naam, v_salon_naam
  from klanten k
  join salons s on s.id = k.salon_id
  where k.afmeld_token = p_token;

  if v_klant_id is null then
    return;
  end if;

  update klanten set marketing_opt_out = true where id = v_klant_id;

  return query select v_klant_naam, v_salon_naam;
end;
$$;
