-- 026_funnel.sql — first-party funnel: the events the funnel needs, recorded
-- by the database where it can, and funnel_weekly() to read them.
--
-- Run in the Supabase SQL editor AFTER 025 (funnel_weekly reads the league
-- tables). Safe to run more than once. Depends on 008/011/012 (events), 017
-- (game_entries), 025 (game_leagues, game_league_members).
--
-- THE EVENTS
-- ---------------------------------------------------------------------------
--   signup, email_confirmed   not events: read from auth.users (created_at,
--                             email_confirmed_at), which also sees people who
--                             never confirm or never open the app again
--   club_chosen               trigger on profiles: main_club_id first set, by
--                             ANY route (onboarding never logged club_set)
--   onboarding_skipped        trigger on profiles: onboarded_at set, no club
--   picks_saved               trigger on game_entries: the entry for a round
--                             is created (changing picks later is an update)
--   league_created            trigger on game_leagues
--   league_joined             trigger on game_league_members (not the owner's
--                             own row at creation; a rejoin is not counted again)
--   app_installed             the browser (index.html): first signed-in open in
--                             home-screen mode
--   session                   the browser, once a day (unchanged since 008)
--
-- "Once each" is the database's job: a unique index on (user, type, ref) for
-- these types, with ref ignored for the once-per-person ones, and every
-- trigger insert says ON CONFLICT DO NOTHING. A trigger can never fail the
-- write it watches: each one swallows its own errors.

begin;

-- ---------------------------------------------------------------------------
-- 1. EVENT TYPES AND THE ONCE-ONLY INDEX
-- ---------------------------------------------------------------------------
alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check
  check (type in ('session','comment','reaction','follow','unfollow','report',
                  'club_set','group_message','like',
                  'club_chosen','onboarding_skipped','picks_saved',
                  'league_created','league_joined','app_installed'));

create unique index if not exists events_once_idx on public.events (
  user_id, type,
  (case when type in ('club_chosen','onboarding_skipped','app_installed') then '' else coalesce(ref_id, '') end)
) where type in ('club_chosen','onboarding_skipped','picks_saved','league_created','league_joined','app_installed');

-- ---------------------------------------------------------------------------
-- 2. TRIGGERS
-- ---------------------------------------------------------------------------
/** One funnel event, at most once, never raising. */
create or replace function public.funnel_event(p_user uuid, p_type text, p_ref_type text, p_ref_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  insert into public.events (user_id, type, ref_type, ref_id)
  values (p_user, p_type, p_ref_type, p_ref_id)
  on conflict do nothing;
exception when others then
  raise warning 'funnel_event %: %', p_type, sqlerrm;   -- telemetry never blocks a write
end;
$$;
revoke all on function public.funnel_event(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.funnel_on_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.main_club_id is not null and (tg_op = 'INSERT' or old.main_club_id is null) then
    perform public.funnel_event(new.id, 'club_chosen', 'team', new.main_club_id::text);
  end if;
  if tg_op = 'UPDATE' and old.onboarded_at is null and new.onboarded_at is not null and new.main_club_id is null then
    perform public.funnel_event(new.id, 'onboarding_skipped', null, null);
  end if;
  return null;
end;
$$;
drop trigger if exists funnel_profile on public.profiles;
create trigger funnel_profile
  after insert or update of main_club_id, onboarded_at on public.profiles
  for each row execute function public.funnel_on_profile();

create or replace function public.funnel_on_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.funnel_event(new.user_id, 'picks_saved', 'round', new.round_id::text);
  return null;
end;
$$;
drop trigger if exists funnel_entry on public.game_entries;
create trigger funnel_entry
  after insert on public.game_entries
  for each row execute function public.funnel_on_entry();

create or replace function public.funnel_on_league()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.funnel_event(new.owner_id, 'league_created', 'game_league', new.id::text);
  return null;
end;
$$;
drop trigger if exists funnel_league on public.game_leagues;
create trigger funnel_league
  after insert on public.game_leagues
  for each row execute function public.funnel_on_league();

create or replace function public.funnel_on_league_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The owner's own row is written by create_game_league(): that is a
  -- league_created, not a join.
  if not exists (select 1 from public.game_leagues gl where gl.id = new.league_id and gl.owner_id = new.user_id) then
    perform public.funnel_event(new.user_id, 'league_joined', 'game_league', new.league_id::text);
  end if;
  return null;
end;
$$;
drop trigger if exists funnel_league_member on public.game_league_members;
create trigger funnel_league_member
  after insert on public.game_league_members
  for each row execute function public.funnel_on_league_member();

revoke all on function public.funnel_on_profile(), public.funnel_on_entry(),
                       public.funnel_on_league(), public.funnel_on_league_member()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. funnel_weekly() — signup-week cohorts, for the SQL editor
-- ---------------------------------------------------------------------------
-- One row per ISO week (Monday, UTC) of the last p_weeks, newest first, even
-- a week with no signups. Every column after `signups` counts people who
-- signed up THAT week and have EVER reached the step:
--   confirmed     auth.users.email_confirmed_at set
--   chose_club    profiles.main_club_id set (now)
--   saved_picks   any Scout Game entry
--   two_rounds    entries in round n and n+1 of the same competition and season
--   in_league     an active private-league membership
--   installed     an app_installed event
-- Deleted accounts are gone from auth.users, so they leave the funnel.
create or replace function public.funnel_weekly(p_weeks integer default 12)
returns table (week date, signups bigint, confirmed bigint, chose_club bigint, saved_picks bigint,
               two_rounds bigint, in_league bigint, installed bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with weeks as (
    select (date_trunc('week', now()) - make_interval(weeks => g))::date as week
      from generate_series(0, greatest(p_weeks, 1) - 1) g
  ),
  ent as (
    select ge.user_id, g.league_id, g.season, g.round_no
      from public.game_entries ge
      join public.game_rounds g on g.id = ge.round_id
  ),
  two as (
    select distinct a.user_id
      from ent a
      join ent b on b.user_id = a.user_id and b.league_id = a.league_id
                and b.season = a.season and b.round_no = a.round_no + 1
  ),
  u as (
    select date_trunc('week', au.created_at)::date as week,
           au.email_confirmed_at is not null as confirmed,
           p.main_club_id is not null as chose_club,
           exists (select 1 from public.game_entries x where x.user_id = au.id) as saved_picks,
           exists (select 1 from two where two.user_id = au.id) as two_rounds,
           exists (select 1 from public.game_league_members m
                    where m.user_id = au.id and m.left_at is null and m.removed_at is null) as in_league,
           exists (select 1 from public.events ev where ev.user_id = au.id and ev.type = 'app_installed') as installed
      from auth.users au
      left join public.profiles p on p.id = au.id
     where au.created_at >= (select min(week) from weeks)
  )
  select w.week,
         count(u.week),
         count(u.week) filter (where u.confirmed),
         count(u.week) filter (where u.chose_club),
         count(u.week) filter (where u.saved_picks),
         count(u.week) filter (where u.two_rounds),
         count(u.week) filter (where u.in_league),
         count(u.week) filter (where u.installed)
    from weeks w
    left join u on u.week = w.week
   group by w.week
   order by w.week desc;
$$;

comment on function public.funnel_weekly(integer) is
  'Signup-week cohorts: signups, confirmed, chose a club, saved picks, picks in two consecutive rounds, in a private league, installed the app. Run in the SQL editor; not callable from the browser.';

revoke all on function public.funnel_weekly(integer) from public, anon, authenticated;
grant execute on function public.funnel_weekly(integer) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY / USE
-- ---------------------------------------------------------------------------
-- The funnel, last 12 weeks:
--   select * from public.funnel_weekly();
--
-- The browser cannot call it. Expect false, false:
--   select has_function_privilege('authenticated', 'public.funnel_weekly(integer)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.funnel_weekly(integer)', 'EXECUTE');
--
-- The triggers. Expect four rows:
--   select tgname, tgrelid::regclass from pg_trigger where tgname like 'funnel_%';
--
-- Events as they arrive (the funnel types):
--   select type, count(*), max(created_at) from public.events
--    where type in ('club_chosen','onboarding_skipped','picks_saved','league_created','league_joined','app_installed')
--    group by type order by type;
