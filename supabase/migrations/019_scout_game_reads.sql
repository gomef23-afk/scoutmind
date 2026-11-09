-- 019_scout_game_reads.sql — what the Scout tab and the match panel read, and
-- the end-of-round post in each club room.
--
-- Run in the Supabase SQL editor BEFORE pushing. Safe to run more than once.
-- Depends on 015 (player_fixture_stats, fixture_events), 017 (the game) and
-- 018 (two-decimal multipliers). No API cost: everything here reads rows we
-- already hold.
--
-- 1. game_config gains the ladder, written by the job from
--    api/_lib/scout-game.js on every run. The browser shows the multipliers
--    from here, so what a player sees is exactly what the lock step will use,
--    and index.html never holds a copy of the numbers.
-- 2. game_pickable_players(round): one call returns everything the pick list
--    shows, with the same eligibility submit_picks() enforces.
-- 3. match_detail(fixture): one call returns everything the match panel shows
--    (with match_form() for an upcoming match's position and last five).
-- 4. post_round_messages(): when a round is final, one ScoutMind message per
--    club room with that torcida's top 3, never for fewer than
--    max(3, torcida_min_members) fans. Posted once (game_round_posts).
--
-- Rule 13 applies: nothing here deletes.

begin;

-- ---------------------------------------------------------------------------
-- 1. SCHEMA PATCHES
-- ---------------------------------------------------------------------------
alter table public.game_config
  add column if not exists ladder                      jsonb,
  add column if not exists unranked_multiplier         numeric(4,2),
  add column if not exists captain_mode                text,
  add column if not exists max_multiplier              numeric(4,2),
  add column if not exists contrarian_max_pct          numeric(5,2),
  add column if not exists contrarian_min_participants integer,
  add column if not exists contrarian_bonus            numeric(4,2),
  add column if not exists rules_synced_at             timestamptz;

comment on column public.game_config.ladder is
  'Tier -> multiplier, written by /api/cron/player-stats from api/_lib/scout-game.js. Read by the Scout tab; never edit by hand.';

-- The Profile and "my row" reads filter results by user.
create index if not exists game_round_results_user_idx on public.game_round_results (user_id);

create table if not exists public.game_round_posts (
  round_id   bigint not null references public.game_rounds(id),
  club_id    bigint not null references public.teams(id),
  primary key (round_id, club_id)
);
alter table public.game_round_posts
  add column if not exists message_id uuid,
  add column if not exists posted_at  timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. game_pickable_players(round) — the pick list in one call
-- ---------------------------------------------------------------------------
-- Eligibility is submit_picks()'s: at least one appearance in this competition
-- this season, and the club he played for most recently plays in this round.
-- Tier and position come from player_tiers_at(..., now()), the formula the
-- lock step will apply at the deadline. Per-90s are season totals over
-- minutes. last_match: did he start, come on, or not play in his club's most
-- recent ingested league fixture (null when that fixture has no player rows
-- yet, so nothing is claimed).
create or replace function public.game_pickable_players(p_round_id bigint)
returns table (
  player_id bigint, name text, photo_url text, team_id bigint, "position" text,
  tier smallint, apps integer, minutes integer,
  goals_p90 numeric, assists_p90 numeric, shots_on_p90 numeric, key_passes_p90 numeric,
  saves_p90 numeric, rating numeric, cs_rate numeric,
  last_match text, last_match_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rd as (
    select g.id, g.league_id, g.season from public.game_rounds g where g.id = p_round_id
  ),
  round_teams as (
    select f.home_team_id as team_id from public.game_round_fixtures gf
      join public.fixtures f on f.id = gf.fixture_id
     where gf.round_id = p_round_id and gf.counts
    union
    select f.away_team_id from public.game_round_fixtures gf
      join public.fixtures f on f.id = gf.fixture_id
     where gf.round_id = p_round_id and gf.counts
  ),
  t as (
    select tt.* from rd, public.player_tiers_at(rd.league_id, rd.season, now()) tt
     where tt.team_id in (select team_id from round_teams)
  ),
  agg as (
    select s.player_id,
           sum(coalesce(s.goals, 0))      as goals,
           sum(coalesce(s.assists, 0))    as assists,
           sum(coalesce(s.shots_on, 0))   as shots_on,
           sum(coalesce(s.passes_key, 0)) as passes_key,
           sum(coalesce(s.saves, 0))      as saves,
           avg(s.rating)                  as rating,
           count(*) filter (where s.clean_sheet) as cs,
           count(*)                       as apps
      from public.player_fixture_stats s
      join public.fixtures f on f.id = s.fixture_id
      join rd on f.league_id = rd.league_id and f.season = rd.season
     where s.player_id in (select t.player_id from t)
     group by s.player_id
  ),
  last_fx as (
    select distinct on (x.team_id) x.team_id, f.id as fixture_id, f.kickoff_utc
      from round_teams x
      join public.fixtures f
        on (f.home_team_id = x.team_id or f.away_team_id = x.team_id)
      join rd on f.league_id = rd.league_id and f.season = rd.season
     where f.status_short in ('FT', 'AET', 'PEN') and f.players_fetched_at is not null
     order by x.team_id, f.kickoff_utc desc
  )
  select t.player_id, p.name, p.photo_url, t.team_id, t."position", t.tier, t.apps, t.minutes,
         round(90.0 * a.goals      / nullif(t.minutes, 0), 2),
         round(90.0 * a.assists    / nullif(t.minutes, 0), 2),
         round(90.0 * a.shots_on   / nullif(t.minutes, 0), 2),
         round(90.0 * a.passes_key / nullif(t.minutes, 0), 2),
         round(90.0 * a.saves      / nullif(t.minutes, 0), 2),
         round(a.rating, 2),
         round(a.cs::numeric / nullif(a.apps, 0), 3),
         case
           when lf.fixture_id is null then null
           when s.player_id is null then 'did_not_play'
           when s.started then 'started'
           else 'came_on'
         end,
         lf.kickoff_utc
    from t
    join public.players p on p.id = t.player_id
    left join agg a on a.player_id = t.player_id
    left join last_fx lf on lf.team_id = t.team_id
    left join public.player_fixture_stats s on s.fixture_id = lf.fixture_id and s.player_id = t.player_id
   order by t.team_id, t."position", t.minutes desc;
$$;

comment on function public.game_pickable_players(bigint) is
  'Scout tab pick list for one round: eligibility as in submit_picks(), tier and position from player_tiers_at(now()), season per-90s, last-match status.';

-- ---------------------------------------------------------------------------
-- 3a. match_form(team, league, season, before) — used by match_detail below,
--     so it is created first (Postgres checks a SQL function's body on create)
-- ---------------------------------------------------------------------------
-- One club's league position and last five league results before a kickoff.
create or replace function public.match_form(p_team_id bigint, p_league_id bigint, p_season integer, p_before timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'rank',   (select st.rank   from public.standings st
                where st.team_id = p_team_id and st.league_id = p_league_id and st.season = p_season
                order by st.rank nulls last limit 1),
    'points', (select st.points from public.standings st
                where st.team_id = p_team_id and st.league_id = p_league_id and st.season = p_season
                order by st.rank nulls last limit 1),
    'last5', coalesce((
      select jsonb_agg(x.r order by x.kickoff_utc desc)
        from (
          select f.kickoff_utc,
                 jsonb_build_object(
                   'result', case
                     when (f.home_team_id = p_team_id and f.home_goals > f.away_goals)
                       or (f.away_team_id = p_team_id and f.away_goals > f.home_goals) then 'W'
                     when f.home_goals = f.away_goals then 'D'
                     else 'L' end,
                   'score', f.home_goals || '-' || f.away_goals,
                   'home', f.home_team_id = p_team_id,
                   'opponent', (select t.name from public.teams t
                                 where t.id = case when f.home_team_id = p_team_id
                                                   then f.away_team_id else f.home_team_id end)) as r
            from public.fixtures f
           where (f.home_team_id = p_team_id or f.away_team_id = p_team_id)
             and f.league_id = p_league_id and f.season = p_season
             and f.status_short in ('FT', 'AET', 'PEN')
             and f.kickoff_utc < p_before
           order by f.kickoff_utc desc
           limit 5
        ) x
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. match_detail(fixture) — the match panel in one call
-- ---------------------------------------------------------------------------
-- Finished or live: score, goals (own goals and penalties marked by detail),
-- the players who appeared with their numbers, and the signed-in reader's
-- Scout Game points in this fixture (empty for a guest). Upcoming: each club's
-- league position and last five league results. No previews, no predictions.
create or replace function public.match_detail(p_fixture_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'fixture', jsonb_build_object(
      'id', f.id, 'kickoff_utc', f.kickoff_utc, 'status', f.status_short, 'elapsed', f.elapsed,
      'home_goals', f.home_goals, 'away_goals', f.away_goals, 'venue', f.venue_name,
      'round', f.round, 'league', l.name, 'league_flag', l.flag, 'league_id', l.id, 'season', f.season,
      'players_fetched', f.players_fetched_at is not null,
      'players_unidentified', f.players_unidentified,
      'home', jsonb_build_object('id', ht.id, 'name', ht.name, 'logo_url', ht.logo_url, 'api_team_id', ht.api_team_id),
      'away', jsonb_build_object('id', awt.id, 'name', awt.name, 'logo_url', awt.logo_url, 'api_team_id', awt.api_team_id)
    ),
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'minute', e.minute, 'extra', e.extra, 'team_id', e.team_id,
               'player', e.player_name, 'assist', e.assist_name, 'detail', e.detail)
             order by e.minute, e.extra nulls first, e.seq)
        from public.fixture_events e
       where e.fixture_id = f.id and e.type = 'Goal' and e.detail <> 'Missed Penalty'
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'player_id', s.player_id, 'team_id', s.team_id, 'name', p.name,
               'shirt', s.shirt_number, 'position', s."position", 'started', s.started,
               'minutes', s.minutes, 'minute_on', s.minute_on, 'minute_off', s.minute_off,
               'rating', s.rating, 'goals', s.goals, 'assists', s.assists,
               'yellow', s.yellow, 'red', s.red)
             order by s.team_id, s.started desc,
                      case s."position" when 'G' then 1 when 'D' then 2 when 'M' then 3 else 4 end,
                      s.shirt_number nulls last)
        from public.player_fixture_stats s
        join public.players p on p.id = s.player_id
       where s.fixture_id = f.id
    ), '[]'::jsonb),
    'my_points', coalesce((
      select jsonb_agg(jsonb_build_object(
               'player_id', sc.player_id, 'name', p.name, 'base', sc.base_points,
               'multiplier', sc.multiplier, 'captain', sc.is_captain, 'total', sc.total)
             order by sc.total desc)
        from public.game_pick_scores sc
        join public.game_entries e on e.id = sc.entry_id
        join public.players p on p.id = sc.player_id
       where sc.fixture_id = f.id and e.user_id = auth.uid()
    ), '[]'::jsonb),
    'form', jsonb_build_object(
      'home', public.match_form(f.home_team_id, f.league_id, f.season, f.kickoff_utc),
      'away', public.match_form(f.away_team_id, f.league_id, f.season, f.kickoff_utc)
    )
  )
  from public.fixtures f
  join public.leagues l on l.id = f.league_id
  left join public.teams ht on ht.id = f.home_team_id
  left join public.teams awt on awt.id = f.away_team_id
  where f.id = p_fixture_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. post_round_messages() — the torcida's top 3 in each club room
-- ---------------------------------------------------------------------------
-- For every final round, for every club with at least max(3,
-- torcida_min_members) fans playing, one is_system message in that club's
-- official room. game_round_posts makes it once per round per club, so this
-- is safe to call on every run. Names come from public_profiles, never email.
create or replace function public.post_round_messages()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_min   integer;
  v_posts integer := 0;
  r       record;
  v_room  uuid;
  v_msg   uuid;
begin
  select greatest(3, coalesce(torcida_min_members, 3)) into v_min from public.game_config where id;

  for r in
    with fans as (
      select res.round_id, pp.main_club_id as club_id, pp.name, res.total,
             row_number() over (partition by res.round_id, pp.main_club_id
                                order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rk,
             count(*) over (partition by res.round_id, pp.main_club_id) as n
        from public.game_round_results res
        join public.game_rounds g on g.id = res.round_id and g.status = 'final'
        join public.public_profiles pp on pp.id = res.user_id
       where pp.main_club_id is not null
    )
    select f.round_id, f.club_id,
           string_agg(f.rk || '. ' || coalesce(nullif(btrim(f.name), ''), 'A fan') || ' '
                      || to_char(f.total, 'FM9990.0'), ' · ' order by f.rk) as top3
      from fans f
     where f.n >= v_min and f.rk <= 3
       and not exists (select 1 from public.game_round_posts p
                        where p.round_id = f.round_id and p.club_id = f.club_id)
     group by f.round_id, f.club_id
  loop
    select g.id into v_room from public.groups g
     where g.club_id = r.club_id and g.is_official and g.active
     limit 1;
    if v_room is null then
      continue;
    end if;

    insert into public.group_messages (group_id, user_id, content, pinned, is_system)
    select v_room, null,
           l.name || ' · '
             || case when g.round_label like 'Regular Season%' then 'Round ' || g.round_no
                     else split_part(g.round_label, ' - ', 1) || ' · Round ' || g.round_no end
             || ' is final. Top of the ' || t.name || ' torcida in the Scout Game: ' || r.top3 || ' pts.',
           false, true
      from public.game_rounds g
      join public.leagues l on l.id = g.league_id
      join public.teams t on t.id = r.club_id
     where g.id = r.round_id
    returning id into v_msg;

    insert into public.game_round_posts (round_id, club_id, message_id)
    values (r.round_id, r.club_id, v_msg)
    on conflict do nothing;
    v_posts := v_posts + 1;
  end loop;

  return v_posts;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS + GRANTS
-- ---------------------------------------------------------------------------
-- game_round_posts is the job's bookkeeping: no browser reads or writes it.
alter table public.game_round_posts enable row level security;
revoke all on public.game_round_posts from anon, authenticated;

-- The two readers take public data (and, for match_detail, the caller's own
-- points through RLS), so guests may call them.
revoke all on function public.game_pickable_players(bigint) from public;
revoke all on function public.match_detail(bigint) from public;
revoke all on function public.match_form(bigint, bigint, integer, timestamptz) from public;
grant execute on function public.game_pickable_players(bigint) to anon, authenticated, service_role;
grant execute on function public.match_detail(bigint) to anon, authenticated, service_role;
grant execute on function public.match_form(bigint, bigint, integer, timestamptz) to anon, authenticated, service_role;

revoke all on function public.post_round_messages() from public, anon, authenticated;
grant execute on function public.post_round_messages() to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- After the first player-stats run, the ladder is in game_config. Expect
-- {"1": 1.35, "2": 1.2, "3": 1.1, "4": 1.05, "5": 1}, 1.35, additive, 6:
--   select ladder, unranked_multiplier, captain_mode, max_multiplier, rules_synced_at
--     from public.game_config;
--
-- The pick list for the earliest open Série A round. Expect a few hundred
-- rows, every team in the round, tiers 1-5 plus some null:
--   select count(*), count(distinct team_id), count(*) filter (where tier is null) as unranked
--     from public.game_pickable_players((
--       select id from public.game_rounds g join public.leagues l on l.id = g.league_id
--        where l.slug = 'serie_a' and g.status = 'open' order by g.deadline_utc limit 1));
--
-- The match panel for a recent finished Série A match. Expect goals, ~30 players:
--   select jsonb_array_length(d -> 'goals') as goals, jsonb_array_length(d -> 'players') as players,
--          d -> 'fixture' ->> 'status' as status
--     from (select public.match_detail((
--             select id from public.fixtures where league_id = 1 and status_short = 'FT'
--              order by kickoff_utc desc limit 1)) as d) x;
--
-- Room posts: one per round per club, and only system messages. Expect 0, 0:
--   select count(*) - count(distinct (round_id, club_id)) from public.game_round_posts;
--   select count(*) from public.group_messages m join public.game_round_posts p on p.message_id = m.id
--    where not m.is_system or m.user_id is not null;
--
-- Browsers cannot post as ScoutMind or read the bookkeeping. Expect false, false:
--   select has_function_privilege('authenticated', 'public.post_round_messages()', 'EXECUTE'),
--          has_table_privilege('anon', 'public.game_round_posts', 'SELECT');
