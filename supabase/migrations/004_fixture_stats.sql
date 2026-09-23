-- 004_fixture_stats.sql
-- Phase R5 — fixture statistics ingest + team season aggregates.
--
-- `fixture_stats` and `team_season_stats` already exist (003) with every column
-- R5 writes. This migration only adds the machinery R5 needs AROUND them:
--
--   1. A durable work queue on `fixtures`. /fixtures/statistics legitimately
--      returns [] when stats are not published yet, and an empty response
--      writes NO fixture_stats row — so there is nothing to count attempts on.
--      The counters therefore live on `fixtures`, which also turns the queue
--      into an indexed scan instead of an anti-join that degrades as the table
--      grows.
--   2. `xg_sample` — the third denominator. xG is absent for some fixtures and
--      must be averaged over the fixtures that HAVE it, never over zeros.
--   3. `stats_coverage` — cached per league so the job can skip a competition
--      without statistics coverage instead of discovering it fixture by
--      fixture at one wasted request each.
--
-- Safe to re-run. Everything is `add column if not exists`.
-- RLS: no new tables, so no new policies. `fixtures`, `leagues` and
-- `team_season_stats` already carry their public-read policy from 003 and the
-- new columns inherit it.

begin;

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
-- ---------------------------------------------------------------------------

-- Work queue + empty-response backoff.
--   stats_fetched_at    non-null = done, never queued again
--   stats_attempts      capped at 3, then abandoned
--   stats_last_attempt  observability
--   stats_retry_after   precomputed on write so the queue is ONE predicate
--                       instead of an OR across attempt counts: 2h after the
--                       first empty response, 24h after the second.
alter table public.fixtures
  add column if not exists stats_fetched_at    timestamptz,
  add column if not exists stats_attempts      integer not null default 0,
  add column if not exists stats_last_attempt  timestamptz,
  add column if not exists stats_retry_after   timestamptz;

comment on column public.fixtures.stats_retry_after is
  'Earliest time this fixture may be re-requested after an empty /fixtures/statistics response. Null = eligible now.';

-- Partial index matching the queue predicate exactly.
create index if not exists fixtures_stats_queue_idx
  on public.fixtures (kickoff_utc)
  where stats_fetched_at is null
    and stats_attempts < 3
    and status_short in ('FT', 'AET', 'PEN');

-- The third denominator. See the comment block below for all three.
alter table public.team_season_stats
  add column if not exists xg_sample integer;

comment on column public.team_season_stats.xg_sample is
  'Fixtures with a non-null expected_goals. Denominator for xg_pg/xga_pg only.';

-- Cached coverage.fixtures.statistics_fixtures from /leagues.
-- Null = not checked yet; the job checks it once and caches.
alter table public.leagues
  add column if not exists stats_coverage boolean;

comment on column public.leagues.stats_coverage is
  'coverage.fixtures.statistics_fixtures for the current season. False = skip this league in the fixture-stats job.';

commit;

-- ---------------------------------------------------------------------------
-- THE THREE DENOMINATORS IN team_season_stats
--
-- Getting these wrong is the single easiest way to produce plausible-looking
-- nonsense, so they are spelled out:
--
--   matches           games played, counted from `fixtures`
--                     -> denominator for gs, gc
--   fixtures_sampled  games we actually hold stats for
--                     -> denominator for pa, pos_pct, sh_pg, sot_pg,
--                        fouls_pg, yel_pg
--   xg_sample         games with a non-null expected_goals
--                     -> denominator for xg_pg, xga_pg
--
-- matches >= fixtures_sampled >= xg_sample. When they diverge the averages are
-- still correct; the sample columns are what make that visible.
--
-- tk_pg, int_pg and duels_won_pct stay NULL after R5 — they come from player
-- data in R6, not from /fixtures/statistics.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- VERIFY
--   select column_name from information_schema.columns
--    where table_name = 'fixtures' and column_name like 'stats_%';
--   -- expect: stats_fetched_at, stats_attempts, stats_last_attempt, stats_retry_after
--
--   select indexname from pg_indexes where tablename = 'fixtures';
--   -- expect fixtures_stats_queue_idx among them
-- ---------------------------------------------------------------------------
