-- 021_pickable_fixture.sql — the pick list says who each player's club plays
-- in the round.
--
-- Run in the Supabase SQL editor BEFORE pushing. Safe to run more than once.
-- Depends on 019 (game_pickable_players). No API cost.
--
-- game_pickable_players(round) gains six columns, so the function is dropped
-- and created again (Postgres cannot change a function's result columns in
-- place); the grants are re-issued below.
--
--   fixture_id     the club's counting fixture in the round (earliest kickoff
--                  when it has two), or null: no match this round
--   opponent_id    teams.id of the other club
--   opponent       its name
--   is_home        true when the club is at home
--   kickoff_utc    that fixture's kickoff
--   round_matches  how many counting fixtures the club has in the round
--
-- The list also widens to clubs whose only fixture in the round no longer
-- counts (postponed out of the window): their players come back with
-- fixture_id null, so the board can say "No match this round" instead of the
-- player silently vanishing. submit_picks() already refuses them.

begin;

drop function if exists public.game_pickable_players(bigint);

create function public.game_pickable_players(p_round_id bigint)
returns table (
  player_id bigint, name text, photo_url text, team_id bigint, "position" text,
  tier smallint, apps integer, minutes integer,
  goals_p90 numeric, assists_p90 numeric, shots_on_p90 numeric, key_passes_p90 numeric,
  saves_p90 numeric, rating numeric, cs_rate numeric,
  last_match text, last_match_at timestamptz,
  fixture_id bigint, opponent_id bigint, opponent text, is_home boolean,
  kickoff_utc timestamptz, round_matches integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rd as (
    select g.id, g.league_id, g.season from public.game_rounds g where g.id = p_round_id
  ),
  -- Every club with a fixture linked to the round, counting or not.
  round_teams as (
    select f.home_team_id as team_id from public.game_round_fixtures gf
      join public.fixtures f on f.id = gf.fixture_id
     where gf.round_id = p_round_id
    union
    select f.away_team_id from public.game_round_fixtures gf
      join public.fixtures f on f.id = gf.fixture_id
     where gf.round_id = p_round_id
  ),
  -- Each club's counting fixtures in the round, one row per side.
  sides as (
    select f.home_team_id as team_id, f.id as fixture_id, f.away_team_id as opponent_id,
           true as is_home, f.kickoff_utc
      from public.game_round_fixtures gf join public.fixtures f on f.id = gf.fixture_id
     where gf.round_id = p_round_id and gf.counts
    union all
    select f.away_team_id, f.id, f.home_team_id, false, f.kickoff_utc
      from public.game_round_fixtures gf join public.fixtures f on f.id = gf.fixture_id
     where gf.round_id = p_round_id and gf.counts
  ),
  club_fx as (
    select distinct on (s.team_id) s.team_id, s.fixture_id, s.opponent_id, s.is_home, s.kickoff_utc,
           count(*) over (partition by s.team_id) as round_matches
      from sides s
     order by s.team_id, s.kickoff_utc, s.fixture_id
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
         lf.kickoff_utc,
         cf.fixture_id, cf.opponent_id, ot.name, cf.is_home, cf.kickoff_utc,
         coalesce(cf.round_matches, 0)::integer
    from t
    join public.players p on p.id = t.player_id
    left join agg a on a.player_id = t.player_id
    left join last_fx lf on lf.team_id = t.team_id
    left join public.player_fixture_stats s on s.fixture_id = lf.fixture_id and s.player_id = t.player_id
    left join club_fx cf on cf.team_id = t.team_id
    left join public.teams ot on ot.id = cf.opponent_id
   order by t.team_id, t."position", t.minutes desc;
$$;

comment on function public.game_pickable_players(bigint) is
  'Scout tab pick list for one round: eligibility as in submit_picks(), tier and position from player_tiers_at(now()), season per-90s, last-match status, and the club''s fixture in the round (null = no match this round).';

revoke all on function public.game_pickable_players(bigint) from public;
grant execute on function public.game_pickable_players(bigint) to anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The earliest open Série A round. Expect every row with a fixture (0 without),
-- each club against exactly one opponent, home and away split evenly:
--   select count(*) filter (where fixture_id is null) as no_match,
--          count(distinct team_id) as clubs,
--          count(distinct (team_id, opponent_id)) as pairs,
--          count(*) filter (where is_home) as home_rows, count(*) filter (where not is_home) as away_rows
--     from public.game_pickable_players((
--       select id from public.game_rounds g join public.leagues l on l.id = g.league_id
--        where l.slug = 'serie_a' and g.status = 'open' order by g.deadline_utc limit 1));
--
-- Still callable by guests. Expect true:
--   select has_function_privilege('anon', 'public.game_pickable_players(bigint)', 'EXECUTE');
