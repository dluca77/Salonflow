-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Fix: sessienummer moest op GEBOEKTE sessies gebaseerd zijn,
-- niet op VOLTOOIDE sessies
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
-- VEREIST: 2026-07-behandeltrajecten-migratie.sql moet al gedraaid zijn.
--
-- GEVONDEN BIJ HET TESTEN: vind_of_maak_traject gebruikte
-- voltooide_sessies+1 om het sessienummer van de NIEUWE boeking te
-- bepalen. Omdat voltooide_sessies pas optelt zodra een afspraak
-- daadwerkelijk op 'afgerond' wordt gezet (dus na het bezoek), toonde
-- een tweede boeking voor hetzelfde traject ten onrechte ook "Sessie 1"
-- i.p.v. "Sessie 2" -- voltooide_sessies stond op dat moment nog op 0.
-- Deze fix voegt een apart 'geboekte_sessies'-teller toe die bij elke
-- boeking (niet pas bij afronding) optelt, en gebruikt DIE voor het
-- sessienummer.
-- ══════════════════════════════════════════════════════════════════════

alter table behandeltrajecten add column if not exists geboekte_sessies integer not null default 0;

-- Bestaande trajecten (uit de testfase) op een consistente waarde zetten:
-- minstens het aantal al gekoppelde afspraken.
update behandeltrajecten bt
set geboekte_sessies = greatest(bt.geboekte_sessies, sub.aantal)
from (
  select traject_id, count(*) as aantal
  from afspraken
  where traject_id is not null
  group by traject_id
) sub
where sub.traject_id = bt.id;

create or replace function vind_of_maak_traject(
  p_salon_id uuid, p_email text, p_dienst_id uuid,
  p_klant_naam text, p_totaal_sessies integer
)
returns table(id uuid, geboekte_sessies integer, totaal_sessies integer)
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_geboekt integer;
  v_totaal integer;
begin
  select bt.id, bt.geboekte_sessies, bt.totaal_sessies
    into v_id, v_geboekt, v_totaal
  from behandeltrajecten bt
  where bt.salon_id = p_salon_id
    and bt.dienst_id = p_dienst_id
    and lower(bt.klant_email) = lower(p_email)
    and bt.status = 'actief'
  order by bt.created_at desc
  limit 1;

  if v_id is not null then
    update behandeltrajecten
    set geboekte_sessies = geboekte_sessies + 1
    where id = v_id
    returning behandeltrajecten.geboekte_sessies into v_geboekt;

    return query select v_id, v_geboekt, v_totaal;
    return;
  end if;

  insert into behandeltrajecten (salon_id, dienst_id, klant_email, klant_naam, totaal_sessies, geboekte_sessies)
  values (p_salon_id, p_dienst_id, lower(p_email), p_klant_naam, p_totaal_sessies, 1)
  returning behandeltrajecten.id into v_id;

  return query select v_id, 1, p_totaal_sessies;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. boeken/index.html is aangepast om 'geboekte_sessies' (i.p.v.
-- 'voltooide_sessies') als sessienummer te gebruiken.
-- ══════════════════════════════════════════════════════════════════════
