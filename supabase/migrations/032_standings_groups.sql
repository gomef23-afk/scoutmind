-- 032 — Every standings table, group by group (Sequence 2 commit 4b-3a,
-- 17 Nov 2026)
--
-- Re-runnable: IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS first.
-- Run it whole in the SQL editor. (030 / 031 are reserved for news visuals.)
--
-- Why: `standings` keeps ONE row per club (primary key league_id, season,
-- team_id). Argentina publishes several tables per season — two groups per
-- phase (Apertura, Clausura) plus the annual table — and the same club sits
-- in several of them, so the standings job keeps only each club's best rank.
-- On 17 Nov the Clausura groups held 7 and 6 of their 15 clubs.
--
-- `standings_groups` keeps every table whole: one row per (group, club).
-- The standings job writes it beside `standings` (unchanged: the Home band,
-- the club page and the snapshots keep reading it). The Matches tab's league
-- table reads this one. Single-table leagues get one group, named as the API
-- names it ("Premier League", "Serie A", "Primera División").
--
-- Ingest is additive (rule 13): rows are upserted, never deleted. Group
-- labels are stable within a season, so a club never lingers in a group it
-- left. Public read, like `standings`; nothing for the browser to write.

create table if not exists public.standings_groups (
  league_id      bigint   not null references public.leagues(id) on delete cascade,
  season         integer  not null,
  group_label    text     not null,
  team_id        bigint   not null references public.teams(id) on delete cascade,
  group_order    smallint not null default 0,   -- the table's position in the API's answer
  rank           integer,
  points         integer,
  played         integer,
  win            integer,
  draw           integer,
  lose           integer,
  goals_for      integer,
  goals_against  integer,
  goal_diff      integer,
  form           text,
  updated_at     timestamptz not null default now(),
  primary key (league_id, season, group_label, team_id)
);
create index if not exists standings_groups_league_idx on public.standings_groups (league_id, season, group_order, rank);

alter table public.standings_groups enable row level security;
drop policy if exists "standings_groups: public read" on public.standings_groups;
create policy "standings_groups: public read" on public.standings_groups
  for select to anon, authenticated using (true);

revoke all on public.standings_groups from public, anon, authenticated;
grant select on public.standings_groups to anon, authenticated;
grant select, insert, update on public.standings_groups to service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run after the file and after the next standings run; each
-- column should say true)
-- ---------------------------------------------------------------------------
-- select
--   (select relrowsecurity from pg_class where oid = 'public.standings_groups'::regclass)     as rls_on,
--   has_table_privilege('anon', 'public.standings_groups', 'select')
--     and not has_table_privilege('anon', 'public.standings_groups', 'insert')
--     and not has_table_privilege('authenticated', 'public.standings_groups', 'update')
--     and not has_table_privilege('authenticated', 'public.standings_groups', 'delete')      as read_only_for_browser,
--   (select count(distinct group_label) >= 4 from public.standings_groups
--     where league_id = (select id from public.leagues where slug = 'argentina'))             as argentina_has_groups,
--   (select bool_and(n between 14 and 16) from (
--      select count(*) n from public.standings_groups
--       where league_id = (select id from public.leagues where slug = 'argentina')
--         and group_label like '% - Group %' group by group_label) g)                          as argentina_groups_whole,
--   (select bool_and(n = 1) from (
--      select count(distinct group_label) n from public.standings_groups
--       where league_id in (select id from public.leagues where slug <> 'argentina')
--       group by league_id) s)                                                                 as other_leagues_one_table;
