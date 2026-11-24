-- 041 — The Championship and the Primeira Liga join the Scout Game, and rounds
-- open at most 21 days ahead (3.2c, 24 Nov 2026)
--
-- Run in the Supabase SQL editor BEFORE Tue 24 Nov 19:45 UTC (the deadline of
-- Championship round 17, the first round to open). Re-runnable: one UPDATE that
-- only ever switches the two ON, and create or replace. Nothing is deleted.
-- Depends on 017 (the game) and 035 (leagues.playable, sync_game_rounds with
-- the playable condition).
--
-- WHY THESE TWO
-- ---------------------------------------------------------------------------
-- Argentina's regular season ended on 5 Nov and Série A's ends on 3 Dec, which
-- would leave five playable leagues. Backtest of 23 Nov on the rounds we hold
-- (full points table, the scoring of bceed9d): tiers in order (top 5 tiers
-- 65.0 / random 38.2 / bottom 37.1 a round in the Championship, 63.4 / 40.0 /
-- 28.8 in the Primeira Liga; Premier League 48.0 / 46.6 / 39.7), a typical fan
-- round ~40, all five tiers in every position, ~1% of rows without a rating.
-- The Eredivisie can follow with the same one-line UPDATE (winter break
-- 18 Dec - 8 Jan, which is why it is not first).
--
-- WHY THE HORIZON
-- ---------------------------------------------------------------------------
-- These two hold their whole season of fixtures (21 Nov), so without a limit
-- sync_game_rounds() would open every remaining round at once (31 and 23
-- chips in the Scout tab, running to May, on provisional kick-off times). A
-- round is now created only once its deadline is within 21 days, which is
-- what the original seven already get from the fixtures job's 21-day window.
-- Nothing else changes: deadlines, windows ("until the next round's deadline,
-- or 6 days"), statuses and fixture flags are 035's, and the next round's
-- deadline is still looked up among ALL rounds, so a round's window does not
-- depend on whether its successor has been created yet.
--
-- WHAT THE FIRST RUN DOES (player-stats, within 15 minutes)
-- ---------------------------------------------------------------------------
-- Rounds already played are created locked or final (017's rule for a round
-- first seen after its deadline): nobody can pick in them, nothing opens
-- retroactively. Open: Championship 17 (Tue 24 Nov 19:45) and 18 (Fri 27
-- Nov), Primeira Liga 12 (Fri 27 Nov), and whatever else falls in 21 days.
-- Squads (players.js) pick the two up on their next weekly cycle; the pick
-- list does not need them (it comes from the match rows we already hold).

begin;

-- ---------------------------------------------------------------------------
-- 1. THE TWO LEAGUES (data; only ever switches ON)
-- ---------------------------------------------------------------------------
update public.leagues
   set playable   = true,
       updated_at = now()
 where slug in ('championship', 'primeira_liga')
   and active
   and type = 'league'
   and not playable;

-- ---------------------------------------------------------------------------
-- 2. sync_game_rounds(): 035's function, a round created at most 21 days ahead
-- ---------------------------------------------------------------------------
create or replace function public.sync_game_rounds()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rounds integer;
begin
  with r as (
    select f.league_id, f.season, f.round as round_label,
           min(f.kickoff_utc) filter (where f.status_short not in ('PST','CANC','ABD','AWD','WO')) as deadline,
           count(*)           filter (where f.status_short not in ('PST','CANC','ABD','AWD','WO')) as fixture_n
      from public.fixtures f
      join public.leagues l on l.id = f.league_id and l.active and l.playable and l.current_season = f.season
     where f.round ~ ' - [0-9]+$'
     group by f.league_id, f.season, f.round
  ),
  w as (
    select r.*,
           least(
             (select min(r2.deadline) from r r2
               where r2.league_id = r.league_id and r2.season = r.season and r2.deadline > r.deadline),
             r.deadline + interval '6 days') as closes
      from r
     where r.deadline is not null
       and r.deadline <= now() + interval '21 days'
  )
  -- A round first seen after its deadline was never playable (the game did not
  -- exist yet): it starts locked, or final once its window has closed, so the
  -- lock step never has to process a backlog of empty historical rounds.
  insert into public.game_rounds as g
    (league_id, season, round_label, round_no, deadline_utc, closes_utc, fixture_count, status)
  select w.league_id, w.season, w.round_label,
         substring(w.round_label from '([0-9]+)$')::integer,
         w.deadline, coalesce(w.closes, w.deadline + interval '6 days'), w.fixture_n,
         case when coalesce(w.closes, w.deadline + interval '6 days') + interval '1 day' < now() then 'final'
              when w.deadline <= now() then 'locked'
              else 'open' end
    from w
  on conflict (league_id, season, round_label) do update set
    round_no      = excluded.round_no,
    deadline_utc  = excluded.deadline_utc,
    closes_utc    = excluded.closes_utc,
    fixture_count = excluded.fixture_count,
    updated_at    = now()
  where g.status = 'open';
  get diagnostics v_rounds = row_count;

  -- Every round gets its fixture rows (historical ones too: the backtest scores
  -- them); only rounds that are not final keep updating their flags.
  insert into public.game_round_fixtures (round_id, fixture_id, counts)
  select g.id, f.id,
         (f.status_short not in ('PST','CANC','ABD','AWD','WO')
          and f.kickoff_utc >= g.deadline_utc and f.kickoff_utc < g.closes_utc)
    from public.game_rounds g
    join public.fixtures f
      on f.league_id = g.league_id and f.season = g.season and f.round = g.round_label
  on conflict (round_id, fixture_id) do nothing;

  update public.game_round_fixtures gf
     set counts = x.counts
    from (
      select g.id as round_id, f.id as fixture_id,
             (f.status_short not in ('PST','CANC','ABD','AWD','WO')
              and f.kickoff_utc >= g.deadline_utc and f.kickoff_utc < g.closes_utc) as counts
        from public.game_rounds g
        join public.fixtures f
          on f.league_id = g.league_id and f.season = g.season and f.round = g.round_label
       where g.status <> 'final'
    ) x
   where gf.round_id = x.round_id and gf.fixture_id = x.fixture_id
     and gf.counts is distinct from x.counts;

  return v_rounds;
end;
$$;

revoke all on function public.sync_game_rounds() from public, anon, authenticated;
grant execute on function public.sync_game_rounds() to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- Nine playable, the two among them:
--   select count(*) filter (where active and playable) as playable,
--          string_agg(slug, ', ' order by slug) filter (where playable and slug in ('championship', 'primeira_liga')) as new
--     from public.leagues;                                                     -- 9, championship, primeira_liga
--
-- After the next player-stats run (<= 15 minutes): the two leagues' rounds.
-- Open rounds only ahead and within 21 days; every past round locked or final,
-- with no entries; no open round anywhere more than 21 days out:
--   select l.slug, g.status, count(*) as rounds, min(g.round_no) as first, max(g.round_no) as last,
--          min(g.deadline_utc) as first_deadline, max(g.deadline_utc) as last_deadline,
--          (select count(*) from public.game_entries e join public.game_rounds g2 on g2.id = e.round_id
--            where g2.league_id = l.id and g2.status <> 'open') as entries_in_closed_rounds
--     from public.game_rounds g join public.leagues l on l.id = g.league_id
--    where l.slug in ('championship', 'primeira_liga')
--    group by l.id, l.slug, g.status order by l.slug, g.status;   -- open: Championship 17.., Primeira 12..; entries 0
--
--   select count(*) from public.game_rounds g
--    where g.status = 'open' and g.deadline_utc > now() + interval '21 days';  -- 0
--
--   select count(*) from public.game_rounds g
--    where g.status = 'open' and g.deadline_utc < now();                     -- 0 (the lock step closes them)
--
-- The first open Championship round has a full pick list (tiers 1-5 and some unranked):
--   select count(*), count(distinct team_id), count(*) filter (where tier is null) as unranked
--     from public.game_pickable_players((
--       select g.id from public.game_rounds g join public.leagues l on l.id = g.league_id
--        where l.slug = 'championship' and g.status = 'open' order by g.deadline_utc limit 1));
