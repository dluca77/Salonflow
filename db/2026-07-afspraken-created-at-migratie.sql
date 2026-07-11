-- Veiligheidsmigratie: zorgt dat afspraken.created_at bestaat, nodig
-- voor het dashboard om "recent geplaatste online boekingen" correct
-- te kunnen onderscheiden van gewoon "aankomende afspraken". Onschadelijk
-- als de kolom al bestaat (Supabase voegt 'm doorgaans standaard toe).
alter table afspraken add column if not exists created_at timestamptz default now();
