-- 015_players.sql — R6: player statistics per fixture.
--
-- Run in the Supabase SQL editor BEFORE pushing the jobs that write here.
-- Safe to run more than once, and order-independent like 005: it creates
-- structure only, and the jobs fill it. Depends on 003 (players,
-- player_season_stats, fixtures, teams, team_season_stats).
--
-- WHY PER FIXTURE
-- ---------------------------------------------------------------------------
-- The Scout Game scores each player per round, and a season total cannot score
-- a round. So the primary source is one row per player per fixture, and the
-- season rows in player_season_stats are DERIVED from those rows by
-- refresh_player_season_stats(), never fetched separately.
--
-- WHAT THE ROWS MEAN
-- ---------------------------------------------------------------------------
-- * A row exists only for a player who played (minutes > 0). Once a fixture has
--   players_fetched_at set, NO ROW MEANS DID NOT PLAY. The Scout Game relies on
--   this.
-- * position is G / D / M / F as played in THAT fixture, from the fixture.
-- * started comes from the lineup, not the API's substitute flag, which is wrong
--   for the Premier League.
-- * goals_conceded is derived for every position from the goal events while
--   the player was on the pitch, own goals included. goals_conceded_api is the
--   API's own figure, kept for cross-checking (null in some leagues).
-- * clean_sheet: 60+ minutes and nothing conceded while on the pitch. Both are
--   null for a fixture whose goal events do not add up to its score.
-- * Counting stats follow rule 14 per fixture: a field null for every player in
--   the fixture is "not provided" and stays null; otherwise null means zero.
--
-- Rule 13 applies: nothing in api/ deletes from these tables.

begin;

-- ---------------------------------------------------------------------------
-- 1. player_fixture_stats
-- ---------------------------------------------------------------------------
create table if not exists public.player_fixture_stats (
  fixture_id          bigint  not null references public.fixtures(id) on delete cascade,
  player_id           bigint  not null references public.players(id)  on delete cascade,
  team_id             bigint  not null references public.teams(id)    on delete cascade,
  season              integer not null,
  primary key (fixture_id, player_id)
);

-- ---------------------------------------------------------------------------
-- 2. fixture_events — goals, cards, substitutions, VAR
-- ---------------------------------------------------------------------------
-- Stored so conceded and clean sheet can be recomputed if a rule changes,
-- without re-fetching. seq is the event's position in the API's array; the
-- array is NOT strictly chronological, so order by (minute, extra, seq).
-- Players are referenced by API id: an event can name a player who never got a
-- player_fixture_stats row (an unused substitute, or an id the API left null).
create table if not exists public.fixture_events (
  fixture_id    bigint  not null references public.fixtures(id) on delete cascade,
  seq           integer not null,
  primary key (fixture_id, seq)
);

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
-- ---------------------------------------------------------------------------
-- Every column after the keys lives here, so a re-run always brings an
-- existing database up to date. `add column if not exists` is a no-op once a
-- column is there.

alter table public.player_fixture_stats
  add column if not exists position            text,      -- G | D | M | F
  add column if not exists started             boolean,
  add column if not exists captain             boolean,
  add column if not exists shirt_number        integer,
  add column if not exists minutes             integer,
  add column if not exists minute_on           integer,   -- 0 for starters
  add column if not exists minute_off          integer,   -- null = played to the whistle
  add column if not exists rating              numeric(4,2),
  add column if not exists goals               integer,
  add column if not exists assists             integer,
  add column if not exists saves               integer,
  add column if not exists goals_conceded      integer,
  add column if not exists goals_conceded_api  integer,
  add column if not exists clean_sheet         boolean,
  add column if not exists shots_total         integer,
  add column if not exists shots_on            integer,
  add column if not exists passes_total        integer,
  add column if not exists passes_key          integer,
  add column if not exists passes_accurate     integer,   -- a COUNT, not a %
  add column if not exists tackles             integer,
  add column if not exists blocks              integer,
  add column if not exists interceptions       integer,
  add column if not exists duels_total         integer,
  add column if not exists duels_won           integer,
  add column if not exists dribbles_attempts   integer,
  add column if not exists dribbles_success    integer,
  add column if not exists dribbles_past       integer,
  add column if not exists fouls_drawn         integer,
  add column if not exists fouls_committed     integer,
  add column if not exists offsides            integer,
  add column if not exists yellow              integer,
  add column if not exists red                 integer,
  add column if not exists pen_won             integer,
  add column if not exists pen_committed       integer,
  add column if not exists pen_scored          integer,
  add column if not exists pen_missed          integer,
  add column if not exists pen_saved           integer,
  add column if not exists updated_at          timestamptz not null default now();

create index if not exists pfs_player_season_idx on public.player_fixture_stats (player_id, season);
create index if not exists pfs_team_season_idx   on public.player_fixture_stats (team_id, season);

comment on table public.player_fixture_stats is
  'One row per player who PLAYED in a fixture (minutes > 0). Once fixtures.players_fetched_at is set, no row means did not play.';
comment on column public.player_fixture_stats.goals_conceded is
  'Derived from fixture_events: goals by the other team while this player was on the pitch, own goals included. Null when the fixture''s goal events do not add up to its score.';

alter table public.fixture_events
  add column if not exists minute         integer,
  add column if not exists extra          integer,
  add column if not exists team_id        bigint references public.teams(id),
  add column if not exists player_api_id  integer,
  add column if not exists player_name    text,
  add column if not exists assist_api_id  integer,   -- for a subst: the player coming ON
  add column if not exists assist_name    text,
  add column if not exists type           text,      -- Goal | Card | subst | Var
  add column if not exists detail         text,
  add column if not exists comments       text;

-- The queue for /api/cron/player-stats, kept on fixtures for the same reason
-- as 004's stats queue: an empty response writes no row to count attempts on.
alter table public.fixtures
  add column if not exists players_fetched_at    timestamptz,
  add column if not exists players_attempts      integer not null default 0,
  add column if not exists players_last_attempt  timestamptz,
  add column if not exists players_retry_after   timestamptz,
  -- Players who played but arrived with id 0, and so have no row. Re-fetch a
  -- fixture by setting players_fetched_at back to null.
  add column if not exists players_unidentified  integer;

create index if not exists fixtures_players_queue_idx
  on public.fixtures (kickoff_utc)
  where players_fetched_at is null
    and players_attempts < 3
    and status_short in ('FT', 'AET', 'PEN');

-- Season rows: denominators and the two counts R6 adds.
alter table public.player_season_stats
  add column if not exists rated_apps       integer,   -- denominator for rating
  add column if not exists clean_sheets     integer,
  add column if not exists passes_accurate  integer;

comment on column public.player_season_stats.passes_accuracy is
  'Percentage: 100 * passes_accurate / passes_total, summed over the season. Derived since 015.';
comment on column public.player_season_stats.rating is
  'Average over rated_apps, not over apps: a rating can be missing for an appearance.';

-- The denominator for tk_pg, int_pg and duels_won_pct (rule 15).
alter table public.team_season_stats
  add column if not exists player_sample integer;

comment on column public.team_season_stats.player_sample is
  'Fixtures with player rows that carried tackle data. Denominator for tk_pg, int_pg and duels_won_pct. player_sample <= matches; independent of fixtures_sampled and xg_sample, which come from a different endpoint.';

-- ---------------------------------------------------------------------------
-- 3. refresh_player_season_stats(fixture_ids)
-- ---------------------------------------------------------------------------
-- For every (player, team, season) that appears in these fixtures, the season
-- row is recomputed from ALL of that player's fixture rows and upserted. Never
-- incremented, so a re-run cannot double count, and the per-fixture rows always
-- sum exactly to the season row.
create or replace function public.refresh_player_season_stats(p_fixture_ids bigint[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with touched as (
    select distinct player_id, team_id, season
      from public.player_fixture_stats
     where fixture_id = any(p_fixture_ids)
  ),
  rows_ as (
    select s.*, f.league_id
      from public.player_fixture_stats s
      join touched t using (player_id, team_id, season)
      join public.fixtures f on f.id = s.fixture_id
  ),
  -- Season position: the one played for the most minutes.
  pos as (
    select distinct on (player_id, team_id, season)
           player_id, team_id, season, position
      from rows_
     group by player_id, team_id, season, position
     order by player_id, team_id, season, sum(minutes) desc, position
  ),
  agg as (
    select player_id, team_id, season,
           min(league_id)                                   as league_id,
           count(*)                                         as apps,
           count(*) filter (where started)                  as lineups,
           sum(minutes)                                     as minutes,
           round(avg(rating), 2)                            as rating,
           count(rating)                                    as rated_apps,
           sum(goals)            as goals,
           sum(assists)          as assists,
           sum(goals_conceded)   as conceded,
           sum(saves)            as saves,
           sum(shots_total)      as shots_total,
           sum(shots_on)         as shots_on,
           sum(passes_total)     as passes_total,
           sum(passes_key)       as passes_key,
           sum(passes_accurate)  as passes_accurate,
           case when sum(passes_total) > 0
                then round(100.0 * sum(passes_accurate) / sum(passes_total))::integer end
                                 as passes_accuracy,
           sum(tackles)          as tackles,
           sum(blocks)           as blocks,
           sum(interceptions)    as interceptions,
           sum(duels_total)      as duels_total,
           sum(duels_won)        as duels_won,
           sum(dribbles_attempts) as dribbles_attempts,
           sum(dribbles_success) as dribbles_success,
           sum(fouls_drawn)      as fouls_drawn,
           sum(fouls_committed)  as fouls_committed,
           sum(yellow)           as yellow,
           sum(red)              as red,
           sum(pen_scored)       as pen_scored,
           sum(pen_missed)       as pen_missed,
           count(*) filter (where clean_sheet) as clean_sheets
      from rows_
     group by player_id, team_id, season
  ),
  up as (
    insert into public.player_season_stats as p (
      player_id, team_id, league_id, season, position,
      apps, lineups, minutes, rating, rated_apps,
      goals, assists, conceded, saves, shots_total, shots_on,
      passes_total, passes_key, passes_accurate, passes_accuracy,
      tackles, blocks, interceptions, duels_total, duels_won,
      dribbles_attempts, dribbles_success, fouls_drawn, fouls_committed,
      yellow, red, pen_scored, pen_missed, clean_sheets, updated_at)
    select a.player_id, a.team_id, a.league_id, a.season,
           case pos.position when 'G' then 'Goalkeeper' when 'D' then 'Defender'
                             when 'M' then 'Midfielder' when 'F' then 'Attacker' end,
           a.apps, a.lineups, a.minutes, a.rating, a.rated_apps,
           a.goals, a.assists, a.conceded, a.saves, a.shots_total, a.shots_on,
           a.passes_total, a.passes_key, a.passes_accurate, a.passes_accuracy,
           a.tackles, a.blocks, a.interceptions, a.duels_total, a.duels_won,
           a.dribbles_attempts, a.dribbles_success, a.fouls_drawn, a.fouls_committed,
           a.yellow, a.red, a.pen_scored, a.pen_missed, a.clean_sheets, now()
      from agg a
      join pos using (player_id, team_id, season)
    on conflict (player_id, team_id, season) do update set
      league_id = excluded.league_id, position = excluded.position,
      apps = excluded.apps, lineups = excluded.lineups, minutes = excluded.minutes,
      rating = excluded.rating, rated_apps = excluded.rated_apps,
      goals = excluded.goals, assists = excluded.assists, conceded = excluded.conceded,
      saves = excluded.saves, shots_total = excluded.shots_total, shots_on = excluded.shots_on,
      passes_total = excluded.passes_total, passes_key = excluded.passes_key,
      passes_accurate = excluded.passes_accurate, passes_accuracy = excluded.passes_accuracy,
      tackles = excluded.tackles, blocks = excluded.blocks, interceptions = excluded.interceptions,
      duels_total = excluded.duels_total, duels_won = excluded.duels_won,
      dribbles_attempts = excluded.dribbles_attempts, dribbles_success = excluded.dribbles_success,
      fouls_drawn = excluded.fouls_drawn, fouls_committed = excluded.fouls_committed,
      yellow = excluded.yellow, red = excluded.red,
      pen_scored = excluded.pen_scored, pen_missed = excluded.pen_missed,
      clean_sheets = excluded.clean_sheets, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer from up;
$$;

-- ---------------------------------------------------------------------------
-- 4. refresh_team_player_stats(fixture_ids)
-- ---------------------------------------------------------------------------
-- tk_pg / int_pg: the team's per-fixture SUM over its players, averaged over
-- the fixtures that carried tackle data. duels_won_pct: a ratio of season sums,
-- not an average of per-match percentages. A fixture where the field was not
-- provided at all is null, and avg()/sum() leave it out rather than count a 0.
--
-- UPDATE only, and only these four columns: fixture-stats owns every other
-- column of team_season_stats and creates the row.
create or replace function public.refresh_team_player_stats(p_fixture_ids bigint[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with touched as (
    select distinct team_id, season
      from public.player_fixture_stats
     where fixture_id = any(p_fixture_ids)
  ),
  per_fixture as (
    select s.team_id, s.season, s.fixture_id,
           sum(s.tackles)       as tk,
           sum(s.interceptions) as itc,
           sum(s.duels_won)     as dw,
           sum(s.duels_total)   as dt
      from public.player_fixture_stats s
      join touched t using (team_id, season)
     group by s.team_id, s.season, s.fixture_id
  ),
  agg as (
    select team_id, season,
           count(tk)   as n,
           avg(tk)     as tk,
           avg(itc)    as itc,
           sum(dw)     as dw,
           sum(dt)     as dt
      from per_fixture
     group by team_id, season
  ),
  up as (
    update public.team_season_stats t
       set tk_pg         = round(a.tk, 3),
           int_pg        = round(a.itc, 3),
           duels_won_pct = case when a.dt > 0 then round(100.0 * a.dw / a.dt, 2) end,
           player_sample = a.n,
           updated_at    = now()
      from agg a
     where t.team_id = a.team_id and t.season = a.season
    returning 1
  )
  select count(*)::integer from up;
$$;

-- Only the service role runs these (the job, through PostgREST rpc).
revoke all on function public.refresh_player_season_stats(bigint[]) from public, anon, authenticated;
revoke all on function public.refresh_team_player_stats(bigint[])   from public, anon, authenticated;
grant execute on function public.refresh_player_season_stats(bigint[]) to service_role;
grant execute on function public.refresh_team_player_stats(bigint[])   to service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS + GRANTS
-- ---------------------------------------------------------------------------
-- Public read on everything here. Writes go through the service key, which
-- bypasses RLS. The revokes stop a browser write at the grant layer, before
-- any policy is consulted.
alter table public.player_fixture_stats enable row level security;
alter table public.fixture_events       enable row level security;

drop policy if exists "player_fixture_stats: public read" on public.player_fixture_stats;
create policy "player_fixture_stats: public read" on public.player_fixture_stats
  for select to anon, authenticated using (true);

drop policy if exists "fixture_events: public read" on public.fixture_events;
create policy "fixture_events: public read" on public.fixture_events
  for select to anon, authenticated using (true);

grant select on public.player_fixture_stats to anon, authenticated;
grant select on public.fixture_events       to anon, authenticated;

-- 003 gave players and player_season_stats their read policy; their write
-- grants are revoked here too, now that something writes them.
revoke insert, update, delete on public.player_fixture_stats from anon, authenticated;
revoke insert, update, delete on public.fixture_events       from anon, authenticated;
revoke insert, update, delete on public.players              from anon, authenticated;
revoke insert, update, delete on public.player_season_stats  from anon, authenticated;

-- ingest_runs keeps no read policy (003): telemetry, not content.

commit;

-- ---------------------------------------------------------------------------
-- VERIFY — after the first runs of /api/cron/player-stats
-- ---------------------------------------------------------------------------
-- Row counts:
--   select 'players' t, count(*) from public.players
--   union all select 'player_fixture_stats', count(*) from public.player_fixture_stats
--   union all select 'fixture_events', count(*) from public.fixture_events
--   union all select 'player_season_stats', count(*) from public.player_season_stats;
--
-- Coverage: % of finished fixtures with player rows, per league. Expect 100
-- once the backfill is done:
--   select l.slug,
--          count(*) as finished,
--          count(*) filter (where f.players_fetched_at is not null) as fetched,
--          round(100.0 * count(*) filter (where f.players_fetched_at is not null) / count(*), 1) as pct
--     from public.fixtures f join public.leagues l on l.id = f.league_id
--    where f.status_short in ('FT','AET','PEN') and f.season = l.current_season
--    group by l.slug order by l.slug;
--
-- Fixtures given up on (3 empty responses). Expect few or none:
--   select api_fixture_id, kickoff_utc, players_last_attempt
--     from public.fixtures
--    where players_fetched_at is null and players_attempts >= 3;
--
-- Players the API sent with id 0, so they have no row:
--   select api_fixture_id, players_unidentified from public.fixtures
--    where players_unidentified > 0 order by players_unidentified desc;
--
-- Goal events that did not add up to the score (conceded / clean sheet null).
-- Each is logged by the job too:
--   select f.api_fixture_id, count(*) as rows
--     from public.player_fixture_stats s join public.fixtures f on f.id = s.fixture_id
--    group by f.api_fixture_id
--   having bool_and(s.clean_sheet is null);
--
-- Players with more than one position across fixtures. Expect many:
--   select count(*) from (
--     select player_id from public.player_fixture_stats
--      group by player_id having count(distinct position) > 1) x;
--
-- Team derivations. Expect 146 rows, all three non-null, player_sample <= matches:
--   select count(*) as teams,
--          count(*) filter (where tk_pg is not null and int_pg is not null
--                             and duels_won_pct is not null) as filled,
--          count(*) filter (where player_sample > matches) as sample_over_matches
--     from public.team_season_stats;
--   select t.name, s.matches, s.player_sample, s.tk_pg, s.int_pg, s.duels_won_pct
--     from public.team_season_stats s join public.teams t on t.id = s.team_id
--    order by t.name limit 20;
--
-- Exact sums: the most-used player's fixture rows against their season row.
-- Expect every *_diff to be 0:
--   with p as (
--     select player_id, team_id, season from public.player_season_stats
--      order by apps desc, minutes desc limit 1
--   ), f as (
--     select count(*) apps, sum(minutes) minutes, sum(goals) goals,
--            sum(assists) assists, sum(tackles) tackles, sum(shots_on) shots_on,
--            sum(passes_key) passes_key, count(*) filter (where clean_sheet) cs
--       from public.player_fixture_stats join p using (player_id, team_id, season)
--   )
--   select s.apps - f.apps as apps_diff, s.minutes - f.minutes as minutes_diff,
--          s.goals - f.goals as goals_diff, s.assists - f.assists as assists_diff,
--          s.tackles - f.tackles as tackles_diff, s.shots_on - f.shots_on as shots_on_diff,
--          s.passes_key - f.passes_key as key_passes_diff, s.clean_sheets - f.cs as clean_sheets_diff
--     from public.player_season_stats s join p using (player_id, team_id, season), f;
--
-- Clean sheets are never given to a player under 60 minutes. Expect 0:
--   select count(*) from public.player_fixture_stats
--    where clean_sheet and (minutes < 60 or goals_conceded <> 0);
--
-- SCOUT GAME READINESS: the latest Série A round in which every fixture is
-- finished and fetched. Expect ~20-30 players per fixture with a row, and a top
-- five that reads like that round's scorers:
--   with r as (
--     select f.round
--       from public.fixtures f join public.leagues l on l.id = f.league_id
--      where l.slug = 'serie_a' and f.season = l.current_season
--      group by f.round
--     having bool_and(f.status_short in ('FT','AET','PEN'))
--        and bool_and(f.players_fetched_at is not null)
--      order by max(f.kickoff_utc) desc limit 1
--   ), rows_ as (
--     select s.*, f.round
--       from public.player_fixture_stats s
--       join public.fixtures f on f.id = s.fixture_id
--       join public.leagues l on l.id = f.league_id
--       join r on r.round = f.round
--      where l.slug = 'serie_a' and f.season = l.current_season
--   )
--   select (select round from r) as round,
--          (select count(*) from rows_) as players_with_a_row,
--          (select count(distinct fixture_id) from rows_) as fixtures;
--   -- top 5 by goals + assists in that round:
--   with r as (
--     select f.round
--       from public.fixtures f join public.leagues l on l.id = f.league_id
--      where l.slug = 'serie_a' and f.season = l.current_season
--      group by f.round
--     having bool_and(f.status_short in ('FT','AET','PEN'))
--        and bool_and(f.players_fetched_at is not null)
--      order by max(f.kickoff_utc) desc limit 1
--   )
--   select p.name, t.name as club, s.position, s.minutes, s.goals, s.assists,
--          s.goals + s.assists as g_plus_a, s.rating
--     from public.player_fixture_stats s
--     join public.fixtures f on f.id = s.fixture_id
--     join public.leagues l on l.id = f.league_id
--     join r on r.round = f.round
--     join public.players p on p.id = s.player_id
--     join public.teams t on t.id = s.team_id
--    where l.slug = 'serie_a' and f.season = l.current_season
--    order by g_plus_a desc, s.goals desc, s.rating desc nulls last
--    limit 5;
--
-- Grants. Expect no rows: browser roles hold no write on the four tables:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('players','player_season_stats','player_fixture_stats','fixture_events')
--      and grantee in ('anon','authenticated')
--      and privilege_type in ('INSERT','UPDATE','DELETE');
--
-- The refresh functions are not callable from the browser. Expect false, false:
--   select has_function_privilege('anon', 'public.refresh_player_season_stats(bigint[])', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.refresh_team_player_stats(bigint[])', 'EXECUTE');
