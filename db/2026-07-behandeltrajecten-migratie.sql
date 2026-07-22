-- ══════════════════════════════════════════════════════════════════════
-- Kronr — Migratie: Multi-sessie behandeltrajecten (tattoo/fysio)
-- ══════════════════════════════════════════════════════════════════════
-- Draai dit volledige bestand 1x in de Supabase SQL editor.
--
-- WAAROM: een tattoo (meerdere sessies voor 1 ontwerp) of een fysio-
-- traject (bv. 10 behandelingen op verwijzing) bestaat uit een reeks
-- losse afspraken die bij elkaar horen, met een voortgang ("sessie 2 van
-- 3"). Tot nu toe was elke afspraak volledig los, zonder enig verband.
--
-- ONTWERP: een dienst kan een 'traject_sessies'-aantal krijgen (bv. 3).
-- Bij het boeken van zo'n dienst zoekt/maakt het systeem automatisch een
-- bijpassend 'behandeltraject' voor dat e-mailadres + die dienst (via 1
-- atomaire RPC, zelfde patroon als eerdere kassa/stempelkaart-RPC's).
-- Zodra een afspraak binnen een traject op 'afgerond' wordt gezet, telt
-- een trigger de voortgang van het traject automatisch op.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists behandeltrajecten (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons(id) on delete cascade,
  dienst_id uuid not null references diensten(id) on delete cascade,
  klant_email text not null,
  klant_naam text,
  totaal_sessies integer not null,
  voltooide_sessies integer not null default 0,
  status text not null default 'actief' check (status in ('actief', 'voltooid', 'gestopt')),
  created_at timestamptz not null default now()
);

create index if not exists behandeltrajecten_zoek_idx
  on behandeltrajecten(salon_id, dienst_id, klant_email, status);

alter table behandeltrajecten enable row level security;

-- Geen publieke policy nodig -- de boekingswidget raakt deze tabel nooit
-- rechtstreeks aan, alleen via de security-definer RPC hieronder (net als
-- stempelkaart/abonnement-tegoed-lookups elders in dit project).
drop policy if exists "behandeltrajecten_select_eigen_salon" on behandeltrajecten;
create policy "behandeltrajecten_select_eigen_salon" on behandeltrajecten
  for select using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

drop policy if exists "behandeltrajecten_write_eigen_salon" on behandeltrajecten;
create policy "behandeltrajecten_write_eigen_salon" on behandeltrajecten
  for all using (
    salon_id in (select id from salons where owner_id = auth.uid())
    or salon_id in (select salon_id from medewerkers where auth_user_id = auth.uid())
  );

alter table diensten add column if not exists traject_sessies integer;
alter table afspraken add column if not exists traject_id uuid references behandeltrajecten(id) on delete set null;
alter table afspraken add column if not exists traject_sessienummer integer;

-- RPC: vindt een bestaand actief traject voor dit e-mailadres+dienst, of
-- maakt er direct één aan als er nog geen is. Security definer zodat de
-- anonieme boekingswidget dit kan aanroepen zonder rechtstreekse toegang
-- tot de (privacygevoelige) behandeltrajecten-tabel.
create or replace function vind_of_maak_traject(
  p_salon_id uuid, p_email text, p_dienst_id uuid,
  p_klant_naam text, p_totaal_sessies integer
)
returns table(id uuid, voltooide_sessies integer, totaal_sessies integer)
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_voltooid integer;
  v_totaal integer;
begin
  select bt.id, bt.voltooide_sessies, bt.totaal_sessies
    into v_id, v_voltooid, v_totaal
  from behandeltrajecten bt
  where bt.salon_id = p_salon_id
    and bt.dienst_id = p_dienst_id
    and lower(bt.klant_email) = lower(p_email)
    and bt.status = 'actief'
  order by bt.created_at desc
  limit 1;

  if v_id is not null then
    return query select v_id, v_voltooid, v_totaal;
    return;
  end if;

  insert into behandeltrajecten (salon_id, dienst_id, klant_email, klant_naam, totaal_sessies)
  values (p_salon_id, p_dienst_id, lower(p_email), p_klant_naam, p_totaal_sessies)
  returning behandeltrajecten.id into v_id;

  return query select v_id, 0, p_totaal_sessies;
end;
$$;

-- Trigger: zodra een afspraak die bij een traject hoort op 'afgerond'
-- wordt gezet, telt de voortgang van dat traject automatisch op (en
-- markeert het traject als 'voltooid' zodra de laatste sessie klaar is).
create or replace function _kronr_traject_voortgang_bijwerken()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'afgerond' and (old.status is distinct from 'afgerond') and new.traject_id is not null then
    update behandeltrajecten
    set voltooide_sessies = voltooide_sessies + 1,
        status = case when voltooide_sessies + 1 >= totaal_sessies then 'voltooid' else status end
    where id = new.traject_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_traject_voortgang on afspraken;
create trigger trg_traject_voortgang
  after update of status on afspraken
  for each row execute function _kronr_traject_voortgang_bijwerken();

-- ══════════════════════════════════════════════════════════════════════
-- Klaar. diensten/index.html krijgt een 'Dit is een meerdere-sessies-
-- traject'-schakelaar. boeken/index.html roept vind_of_maak_traject aan
-- bij het bevestigen van zo'n dienst (met de al ingevulde naam/e-mail) en
-- toont 'Sessie X van N' in de bevestiging. agenda/index.html toont
-- dezelfde voortgang in het afspraak-detailpaneel.
-- ══════════════════════════════════════════════════════════════════════
