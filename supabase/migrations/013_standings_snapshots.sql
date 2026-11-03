-- 013_standings_snapshots.sql — two changes, despite the file name:
--   1. standings_snapshots: one dated row per club per day.
--   2. The profiles role lock: plan and credential can no longer be written
--      from the app. See the last section.
--
-- Run in the Supabase SQL editor BEFORE deploying the standings job that writes
-- here. Safe to run more than once. Depends on 003 (standings, leagues, teams).
--
-- WHY THIS CANNOT WAIT
-- ---------------------------------------------------------------------------
-- API-Football serves the table as it stands now, not as it stood last Tuesday,
-- and `standings` is overwritten daily. A snapshot not taken is gone for good,
-- so this is the one roadmap item that cannot be back-filled. "Biggest mover
-- this week" and SM Weekly's week-over-week read from here.
--
-- Dates are UTC, here and in the job (`isoDate()`), so both name the same day.
--
-- Rule 13 applies: nothing in api/ deletes from this table.
--
-- THIS FILE ALSO LOCKS profiles.plan AND profiles.credential
-- ---------------------------------------------------------------------------
-- Unrelated to snapshots, and shipped here by decision. is_admin() trusts
-- profiles.plan, and `authenticated` could update that column on its own row,
-- so any signed-in user could make themselves an admin. See the last section.

begin;

-- ---------------------------------------------------------------------------
-- TABLE
-- ---------------------------------------------------------------------------
-- The primary key is the unique (league_id, season, team_id, snapshot_date) that
-- makes a same-day re-run an update rather than a second row.
--
-- `on delete restrict`, unlike the cascade on `standings`: this history cannot
-- be rebuilt, so removing a club should fail loudly instead of erasing it.
create table if not exists public.standings_snapshots (
  league_id     bigint  not null references public.leagues(id) on delete restrict,
  season        integer not null,
  team_id       bigint  not null references public.teams(id) on delete restrict,
  snapshot_date date    not null,
  rank          integer,
  points        integer,
  played        integer,
  won           integer,
  drawn         integer,
  lost          integer,
  gf            integer,
  ga            integer,
  form          text,
  -- Which table `rank` came from. Argentina publishes several and we keep each
  -- club's best rank, so a rank change means nothing if this changed too.
  group_label   text,
  primary key (league_id, season, team_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
-- ---------------------------------------------------------------------------
-- No-ops today. Later additive columns go here so a re-run always brings an
-- existing database up to date.
alter table public.standings_snapshots
  add column if not exists rank   integer,
  add column if not exists points integer,
  add column if not exists played integer,
  add column if not exists won    integer,
  add column if not exists drawn  integer,
  add column if not exists lost   integer,
  add column if not exists gf     integer,
  add column if not exists ga     integer,
  add column if not exists form   text,
  add column if not exists group_label text;

-- "This league on this date", which is what a week-over-week comparison reads.
create index if not exists standings_snapshots_date_idx
  on public.standings_snapshots (league_id, season, snapshot_date);

comment on table public.standings_snapshots is
  'One row per club per UTC day, copied from standings by /api/cron/standings. Cannot be back-filled.';

-- ---------------------------------------------------------------------------
-- RLS + GRANTS
-- ---------------------------------------------------------------------------
-- Public read. Only the cron job writes, through the service key, which bypasses
-- RLS. The revokes stop a browser write at the grant layer, before any policy.
alter table public.standings_snapshots enable row level security;

drop policy if exists "standings_snapshots: public read" on public.standings_snapshots;
create policy "standings_snapshots: public read" on public.standings_snapshots
  for select to anon, authenticated using (true);

grant select on public.standings_snapshots to anon, authenticated;
revoke insert, update, delete on public.standings_snapshots from anon, authenticated;

-- ---------------------------------------------------------------------------
-- DAY ONE
-- ---------------------------------------------------------------------------
-- Today's snapshot from the current table, so the first day is not lost waiting
-- for the next cron run. Current season of active leagues only.
insert into public.standings_snapshots
  (league_id, season, team_id, snapshot_date,
   rank, points, played, won, drawn, lost, gf, ga, form, group_label)
select s.league_id, s.season, s.team_id, (now() at time zone 'utc')::date,
       s.rank, s.points, s.played, s.win, s.draw, s.lose,
       s.goals_for, s.goals_against, s.form, s.group_label
  from public.standings s
  join public.leagues l
    on l.id = s.league_id
   and l.current_season = s.season
   and l.active
on conflict (league_id, season, team_id, snapshot_date) do update set
  rank   = excluded.rank,
  points = excluded.points,
  played = excluded.played,
  won    = excluded.won,
  drawn  = excluded.drawn,
  lost   = excluded.lost,
  gf     = excluded.gf,
  ga     = excluded.ga,
  form   = excluded.form,
  group_label = excluded.group_label;

-- ---------------------------------------------------------------------------
-- LOCK profiles.plan AND profiles.credential
-- ---------------------------------------------------------------------------
-- Revoking a column alone does nothing while the role holds table-level UPDATE,
-- because the table grant still covers that column. So the table grant goes, and
-- UPDATE comes back on every other column, read from the catalog so that
-- production columns no migration created keep working.
--
-- The cost: a column added to profiles later is not writable by the app until
-- it is granted. See CLAUDE.md rule 23.
do $$
declare
  cols text;
begin
  revoke update on public.profiles from authenticated;
  revoke update (plan, credential) on public.profiles from authenticated;

  select string_agg(quote_ident(column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'profiles'
     and column_name not in ('plan', 'credential');

  execute format('grant update (%s) on public.profiles to authenticated', cols);

  -- REVOKE only warns when a different role made the grant, so check the result.
  -- Failing here rolls back this whole file instead of reporting success with
  -- the hole still open.
  if has_column_privilege('authenticated', 'public.profiles', 'plan', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'credential', 'UPDATE') then
    raise exception 'authenticated can still update profiles.plan or credential';
  end if;
end $$;

-- Belt and braces, and the only guard on INSERT: `profiles` has self-delete and
-- self-insert policies, so without this a user could delete their row and insert
-- it again as an admin.
--
-- It names the two API roles rather than allowing only service_role. The SQL
-- editor runs as postgres and signup's handle_new_user() runs as its owner, and
-- both must keep working. SECURITY INVOKER is what makes current_user the caller.
create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.plan, 'fan') <> 'fan' or new.credential is not null then
      raise exception 'plan and credential cannot be set from the app'
        using errcode = '42501';
    end if;
  elsif new.plan is distinct from old.plan
     or new.credential is distinct from old.credential then
    raise exception 'plan and credential cannot be changed from the app'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_role_guard() from public, anon, authenticated;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_role_guard();

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Today's rows. Expect 146, and the same number after running this file again:
--   select count(*) from public.standings_snapshots
--    where snapshot_date = (now() at time zone 'utc')::date;
--
-- Per league. Expect 20, 20, 20, 18, 20, 18, 30 for leagues 1 to 7:
--   select league_id, count(*) from public.standings_snapshots
--    where snapshot_date = (now() at time zone 'utc')::date
--    group by 1 order by 1;
--
-- No club twice in one day. Expect no rows:
--   select league_id, season, team_id, snapshot_date, count(*)
--     from public.standings_snapshots
--    group by 1,2,3,4 having count(*) > 1;
--
-- The copy matches the live table. Expect 0 until the next standings run:
--   select count(*)
--     from public.standings_snapshots n
--     join public.standings s using (league_id, season, team_id)
--    where n.snapshot_date = (now() at time zone 'utc')::date
--      and (n.rank, n.points, n.played, n.won, n.drawn, n.lost, n.gf, n.ga, n.group_label)
--          is distinct from
--          (s.rank, s.points, s.played, s.win, s.draw, s.lose, s.goals_for, s.goals_against, s.group_label);
--
-- Labels carried over. Expect one row per league, Argentina with up to four
-- labels and no league with a null count above 0:
--   select league_id, count(distinct group_label) as labels,
--          count(*) filter (where group_label is null) as null_labels
--     from public.standings_snapshots
--    where snapshot_date = (now() at time zone 'utc')::date
--    group by 1 order by 1;
--
-- Policy. Expect one row, SELECT, to anon and authenticated:
--   select policyname, cmd, roles from pg_policies
--    where schemaname='public' and tablename='standings_snapshots';
--
-- Browser roles hold no write grant. Expect no rows:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='standings_snapshots'
--      and grantee in ('anon','authenticated')
--      and privilege_type in ('INSERT','UPDATE','DELETE');
--
-- PROFILES LOCK
--
-- Column grants after. Expect a row for every profiles column EXCEPT plan and
-- credential:
--   select grantee, column_name, privilege_type
--     from information_schema.role_column_grants
--    where table_schema='public' and table_name='profiles'
--      and grantee='authenticated' and privilege_type='UPDATE'
--    order by column_name;
--
-- Expect no rows: the table-level grant is gone:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='profiles'
--      and grantee='authenticated' and privilege_type='UPDATE';
--
-- Expect one row, profiles_role_guard:
--   select tgname from pg_trigger
--    where tgrelid='public.profiles'::regclass and not tgisinternal
--      and tgname='profiles_role_guard';
--
-- Who holds a role today. Anyone you do not recognise promoted themselves:
--   select u.email, p.plan, p.credential
--     from public.profiles p join auth.users u on u.id = p.id
--    where p.plan <> 'fan' or p.credential is not null
--    order by p.plan, u.email;
--
-- Behaviour, run as the real role. Each block rolls back, so nothing changes.
-- Run them one at a time with the test account's uuid in place of <uuid>.
--
-- 1. The grant refuses. Expect "permission denied":
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true);
--   update public.profiles set plan='admin' where id='<uuid>';
--   rollback;
--
-- 2. The trigger refuses, with the grant put back for this transaction only.
--    Expect "plan and credential cannot be changed from the app":
--   begin;
--   grant update (plan) on public.profiles to authenticated;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true);
--   update public.profiles set plan='admin' where id='<uuid>';
--   rollback;
--
-- 3. Insert as admin. Expect "plan and credential cannot be set from the app":
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true);
--   insert into public.profiles (id, plan) values ('<uuid>', 'admin');
--   rollback;
--
-- 4. Ordinary saves still work. Expect the row back:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true);
--   update public.profiles set content_langs=content_langs where id='<uuid>' returning id;
--   rollback;
