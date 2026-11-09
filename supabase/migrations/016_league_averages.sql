-- 016_league_averages.sql — R7: league baselines from real data.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 003
-- (leagues, team_season_stats) and 015 (player_season_stats as derived from
-- player_fixture_stats, team_season_stats.player_sample).
--
-- Costs no API requests: both views are computed from rows we already hold.
--
-- WHY VIEWS
-- ---------------------------------------------------------------------------
-- The team view reads 146 rows and the player view a few thousand, so computing
-- them on read is free, nothing can go stale, and no job has to refresh them.
-- If either ever gets slow, it becomes a materialized view refreshed by the
-- jobs that already touch its inputs. It will not need that at this size.
--
-- Every mean carries its own count (rule 15): `<metric>_n` is how many teams
-- (or players) had a value, and on the team view `<metric>_games` is the sum of
-- the denominator behind it, so "based on N team-games" is always visible.

begin;

-- ---------------------------------------------------------------------------
-- 0. Repair team pass accuracy (an R5 bug found while building this)
-- ---------------------------------------------------------------------------
-- /api/cron/fixture-stats averaged passes_pct with `?? 0`, so a fixture whose
-- pass % the API did not publish counted as 0%. That is 834 of 2,660
-- fixture_stats rows (more than half in every European league), and it pulled
-- every club's `pa` down: the league means read 27-69% against a real 75-85%.
-- Rule 14 says null is not zero; rule 15 says the average needs its own
-- denominator. The job is fixed in the same commit; this recomputes every
-- existing row from fixture_stats, which the job never deletes.
--
-- SCHEMA PATCH, then an idempotent UPDATE: re-running it gives the same rows.
-- Apply this BEFORE pushing: the fixed job writes pa_sample.
alter table public.team_season_stats
  add column if not exists pa_sample integer;

comment on column public.team_season_stats.pa_sample is
  'Fixtures with a published pass %. Denominator for pa. pa_sample <= fixtures_sampled.';

update public.team_season_stats t
   set pa        = x.pa,
       pa_sample = x.n
  from (
    select fs.team_id, f.season,
           round(avg(fs.passes_pct), 2) as pa,   -- avg() skips nulls: the fix
           count(fs.passes_pct)         as n
      from public.fixture_stats fs
      join public.fixtures f on f.id = fs.fixture_id
     where f.status_short in ('FT', 'AET', 'PEN')
     group by fs.team_id, f.season
  ) x
 where t.team_id = x.team_id
   and t.season  = x.season;

-- ---------------------------------------------------------------------------
-- 1. Replace the empty 003 table with a view of the same name
-- ---------------------------------------------------------------------------
-- 003 created league_averages as a table that nothing ever filled or read
-- (0 rows, verified before this migration). The R9 weakness engine expects the
-- name, so the view takes it. The table is dropped ONLY if it is empty: if
-- anything was ever written to it, this stops rather than lose it.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'league_averages' and c.relkind = 'r') then
    if exists (select 1 from public.league_averages) then
      raise exception 'public.league_averages has rows; refusing to replace it with a view';
    end if;
    drop table public.league_averages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. league_averages — team level, one row per league and season
-- ---------------------------------------------------------------------------
-- The UNWEIGHTED mean across teams: "lg avg" beside a club means the typical
-- club, so every team counts once whatever its sample.
--
-- Denominators behind each metric (team_season_stats):
--   gs, gc, clean_sheet_rate, failed_to_score_rate   matches
--   sh_pg, sot_pg, fouls_pg, yel_pg, pos_pct         fixtures_sampled
--   pa                                               pa_sample (section 0)
--   xg_pg, xga_pg                                    xg_sample
--   tk_pg, int_pg, duels_won_pct                     player_sample
--
-- Not here: clearances (the API has none) and goals_prevented, which is a
-- season TOTAL with no stored denominator, so averaging it across teams would
-- compare different sample sizes.
create or replace view public.league_averages with (security_invoker = true) as
select
  l.id                                   as league_id,
  l.slug,
  s.season,
  (s.season = l.current_season)          as is_current,
  count(*)                               as teams,

  round(avg(s.gs), 3)                    as gs,
  count(s.gs)                            as gs_n,
  sum(s.matches) filter (where s.gs is not null)            as gs_games,
  round(avg(s.gc), 3)                    as gc,
  count(s.gc)                            as gc_n,
  sum(s.matches) filter (where s.gc is not null)            as gc_games,

  round(avg(s.sh_pg), 3)                 as sh_pg,
  count(s.sh_pg)                         as sh_pg_n,
  sum(s.fixtures_sampled) filter (where s.sh_pg is not null)    as sh_pg_games,
  round(avg(s.sot_pg), 3)                as sot_pg,
  count(s.sot_pg)                        as sot_pg_n,
  sum(s.fixtures_sampled) filter (where s.sot_pg is not null)   as sot_pg_games,
  round(avg(s.fouls_pg), 3)              as fouls_pg,
  count(s.fouls_pg)                      as fouls_pg_n,
  sum(s.fixtures_sampled) filter (where s.fouls_pg is not null) as fouls_pg_games,
  round(avg(s.yel_pg), 3)                as yel_pg,
  count(s.yel_pg)                        as yel_pg_n,
  sum(s.fixtures_sampled) filter (where s.yel_pg is not null)   as yel_pg_games,
  round(avg(s.pos_pct), 2)               as pos_pct,
  count(s.pos_pct)                       as pos_pct_n,
  sum(s.fixtures_sampled) filter (where s.pos_pct is not null)  as pos_pct_games,
  round(avg(s.pa), 2)                    as pa,
  count(s.pa)                            as pa_n,
  sum(s.pa_sample) filter (where s.pa is not null)              as pa_games,

  round(avg(s.xg_pg), 3)                 as xg_pg,
  count(s.xg_pg)                         as xg_pg_n,
  sum(s.xg_sample) filter (where s.xg_pg is not null)       as xg_pg_games,
  round(avg(s.xga_pg), 3)                as xga_pg,
  count(s.xga_pg)                        as xga_pg_n,
  sum(s.xg_sample) filter (where s.xga_pg is not null)      as xga_pg_games,

  round(avg(s.tk_pg), 3)                 as tk_pg,
  count(s.tk_pg)                         as tk_pg_n,
  sum(s.player_sample) filter (where s.tk_pg is not null)   as tk_pg_games,
  round(avg(s.int_pg), 3)                as int_pg,
  count(s.int_pg)                        as int_pg_n,
  sum(s.player_sample) filter (where s.int_pg is not null)  as int_pg_games,
  round(avg(s.duels_won_pct), 2)         as duels_won_pct,
  count(s.duels_won_pct)                 as duels_won_pct_n,
  sum(s.player_sample) filter (where s.duels_won_pct is not null) as duels_won_pct_games,

  round(avg(s.clean_sheets::numeric    / nullif(s.matches, 0)), 3) as clean_sheet_rate,
  count(s.clean_sheets) filter (where s.matches > 0)               as clean_sheet_rate_n,
  sum(s.matches) filter (where s.clean_sheets is not null)         as clean_sheet_rate_games,
  round(avg(s.failed_to_score::numeric / nullif(s.matches, 0)), 3) as failed_to_score_rate,
  count(s.failed_to_score) filter (where s.matches > 0)            as failed_to_score_rate_n,
  sum(s.matches) filter (where s.failed_to_score is not null)      as failed_to_score_rate_games
from public.team_season_stats s
join public.leagues l on l.id = s.league_id
group by l.id, l.slug, s.season, l.current_season;

comment on view public.league_averages is
  'R7. Per league and season: the unweighted mean of each team_season_stats metric across teams, with <m>_n (teams with a value) and <m>_games (sum of the denominator behind it). Replaces the empty 003 table of the same name.';

-- ---------------------------------------------------------------------------
-- 3. league_position_rates — player level, for the Scout Game
-- ---------------------------------------------------------------------------
-- One row per league, season and position (Goalkeeper / Defender /
-- Midfielder / Attacker, the position played most minutes). Mean and standard
-- deviation of per-90 goals, assists, shots on target, key passes and saves,
-- of each player's average rating (per appearance, not per 90), and of the
-- clean-sheet rate (clean sheets per appearance).
--
-- MINIMUM MINUTES: max(270, 30% of the player's team's minutes so far), so a
-- player qualifies on the same share of the season whatever the calendar. A
-- flat 450 would be half a Premier League season at round 10 and a sixth of a
-- Série A one at round 34.
--
-- A null position is excluded explicitly: it means the API sent none for any
-- of the player's appearances (late substitutes missing from the lineups, e.g.
-- 1491872), and such players are far below the threshold anyway.
--
-- Leagues are compared only with themselves. These are the baselines the
-- Scout Game's tiers are z-scored against (Day 3).
create or replace view public.league_position_rates with (security_invoker = true) as
with q as (
  select p.league_id, p.season, p.position, p.minutes,
         90.0 * p.goals      / p.minutes as goals_p90,
         90.0 * p.assists    / p.minutes as assists_p90,
         90.0 * p.shots_on   / p.minutes as shots_on_p90,
         90.0 * p.passes_key / p.minutes as key_passes_p90,
         90.0 * p.saves      / p.minutes as saves_p90,
         p.rating,
         p.clean_sheets::numeric / nullif(p.apps, 0) as cs_rate
    from public.player_season_stats p
    join public.team_season_stats t on t.team_id = p.team_id and t.season = p.season
   where p.position is not null
     and p.minutes > 0
     and p.minutes >= greatest(270, 0.3 * coalesce(t.matches, 0) * 90)
)
select
  q.league_id,
  l.slug,
  q.season,
  (q.season = l.current_season)          as is_current,
  q.position,
  count(*)                               as n_players,
  sum(q.minutes)                         as total_minutes,
  round(avg(q.goals_p90), 3)             as goals_p90,
  round(stddev_samp(q.goals_p90), 3)     as goals_p90_sd,
  round(avg(q.assists_p90), 3)           as assists_p90,
  round(stddev_samp(q.assists_p90), 3)   as assists_p90_sd,
  round(avg(q.shots_on_p90), 3)          as shots_on_p90,
  round(stddev_samp(q.shots_on_p90), 3)  as shots_on_p90_sd,
  round(avg(q.key_passes_p90), 3)        as key_passes_p90,
  round(stddev_samp(q.key_passes_p90), 3) as key_passes_p90_sd,
  round(avg(q.saves_p90), 3)             as saves_p90,
  round(stddev_samp(q.saves_p90), 3)     as saves_p90_sd,
  round(avg(q.rating), 3)                as rating,
  round(stddev_samp(q.rating), 3)        as rating_sd,
  count(q.rating)                        as rating_n,
  round(avg(q.cs_rate), 3)               as cs_rate,
  round(stddev_samp(q.cs_rate), 3)       as cs_rate_sd
from q
join public.leagues l on l.id = q.league_id
group by q.league_id, l.slug, q.season, l.current_season, q.position;

comment on view public.league_position_rates is
  'R7. Per league, season and position: mean and sample standard deviation of per-90 goals, assists, shots on target, key passes, saves, plus rating and clean-sheet rate, over players with minutes >= max(270, 30% of team minutes). n_players is the count behind every mean.';

-- ---------------------------------------------------------------------------
-- 4. GRANTS
-- ---------------------------------------------------------------------------
-- security_invoker = true above: the base tables' RLS applies to whoever reads
-- the view (both are public read). Neither view is updatable (aggregates), and
-- the revokes say so explicitly rather than relying on that.
grant select on public.league_averages       to anon, authenticated;
grant select on public.league_position_rates to anon, authenticated;
revoke insert, update, delete on public.league_averages       from anon, authenticated;
revoke insert, update, delete on public.league_position_rates from anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Pass accuracy repaired. Expect every league between roughly 75 and 86, and
-- pa_sample <= fixtures_sampled everywhere (0 violations):
--   select l.slug, round(avg(s.pa), 1) as mean_pa, min(s.pa) as min_pa, max(s.pa) as max_pa,
--          count(*) filter (where s.pa_sample > s.fixtures_sampled) as sample_violations
--     from public.team_season_stats s join public.leagues l on l.id = s.league_id
--    group by l.slug order by l.slug;
--
-- The old table is gone and the view is in its place. Expect 'v' for both:
--   select relname, relkind from pg_class
--    where relnamespace = 'public'::regnamespace
--      and relname in ('league_averages', 'league_position_rates');
--
-- Every team is covered, in exactly 7 current league rows. Expect 7 and 146:
--   select count(*) as leagues, sum(teams) as teams
--     from public.league_averages where is_current;
--
-- Each metric with its own n and games. Expect *_n = teams once the R6
-- backfill is done (tk/int/duels follow player_sample):
--   select slug, teams,
--          gs, gs_n, gs_games, pa, pa_n, pa_games,
--          xg_pg, xg_pg_n, xg_pg_games,
--          tk_pg, tk_pg_n, tk_pg_games, duels_won_pct, duels_won_pct_n
--     from public.league_averages where is_current order by slug;
--
-- The mean is the plain mean of the teams. Expect 0 in every row:
--   select a.slug, a.gs - round(avg(s.gs), 3) as gs_diff, a.pa - round(avg(s.pa), 2) as pa_diff
--     from public.league_averages a
--     join public.team_season_stats s on s.league_id = a.league_id and s.season = a.season
--    where a.is_current
--    group by a.slug, a.gs, a.pa;
--
-- Player rows per league and position, with their n. Expect 28 rows (7 x 4)
-- once enough minutes are played; small n is shown, never hidden:
--   select slug, position, n_players, total_minutes,
--          goals_p90, goals_p90_sd, assists_p90, key_passes_p90,
--          saves_p90, rating, rating_sd, cs_rate
--     from public.league_position_rates
--    where is_current
--    order by slug, case position when 'Goalkeeper' then 1 when 'Defender' then 2
--                                 when 'Midfielder' then 3 else 4 end;
--   select count(*) as rows, count(*) filter (where n_players < 5) as thin
--     from public.league_position_rates where is_current;
--
-- Sanity: attackers score more per 90 than defenders, goalkeepers save. Expect
-- every row to read true:
--   select slug,
--          max(goals_p90) filter (where position = 'Attacker')
--            > max(goals_p90) filter (where position = 'Defender') as att_beats_def,
--          max(saves_p90) filter (where position = 'Goalkeeper')
--            > coalesce(max(saves_p90) filter (where position <> 'Goalkeeper'), 0) as gk_saves
--     from public.league_position_rates where is_current group by slug order by slug;
--
-- Grants. Expect no rows:
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('league_averages', 'league_position_rates')
--      and grantee in ('anon', 'authenticated')
--      and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
