-- Camper Compare shared scores. Reuses the Georgia/recipes Supabase project.
-- Run once in the Supabase SQL Editor. Idempotent.

create table if not exists camper_scores (
  family_code text not null,
  scorer text not null,          -- 'Ollie', 'Jenny' or '_weights'
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (family_code, scorer)
);

alter table camper_scores enable row level security;

drop policy if exists camper_read   on camper_scores;
drop policy if exists camper_insert on camper_scores;
drop policy if exists camper_update on camper_scores;
create policy camper_read   on camper_scores for select to anon using (length(family_code) >= 4);
create policy camper_insert on camper_scores for insert to anon with check (length(family_code) >= 4);
create policy camper_update on camper_scores for update to anon using (length(family_code) >= 4) with check (length(family_code) >= 4);

do $rt$
begin
  alter publication supabase_realtime add table camper_scores;
exception when duplicate_object then null;
end
$rt$;
