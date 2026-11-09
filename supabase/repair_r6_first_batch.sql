-- repair_r6_first_batch.sql — re-derive the R6 rows written before the
-- counting-stats fix (9 Nov 2026).
--
-- ONE-OFF. Run in the Supabase SQL editor AFTER the fix is deployed (Vercel
-- shows Ready), never before: until then the old code would re-fetch and write
-- the same null goals again.
--
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
-- The first parser read "null for every player in the fixture" as "not
-- provided" and kept it null. But the API sends goals.total null for zero, so
-- in a 0-0, or a 0-1 decided by an own goal, every player's goals came out null.
--
-- WHY A RE-FETCH, NOT AN UPDATE IN PLACE
-- ---------------------------------------------------------------------------
-- An UPDATE could coalesce the nulls, but it would have to re-implement the
-- reduced-feed rule in SQL, which needs the raw goalkeeper figure, and two
-- copies of that rule would drift. Re-queueing costs 1 API request per 20
-- fixtures (12 for the 238 ingested when this was written), runs the fixed
-- parser over every affected row, and re-runs both refresh functions per chunk
-- of 20, because the job does that as part of every ingest.
--
-- Nothing is deleted. The job upserts on (fixture_id, player_id) and
-- (fixture_id, seq), so every row is overwritten in place.

-- 1. Before: how many fixtures are affected, and how many null rows.
select count(*) as fixtures_to_refetch
  from public.fixtures
 where players_fetched_at is not null;

select count(*) as null_goal_or_assist_rows
  from public.player_fixture_stats
 where goals is null or assists is null;

-- 2. Re-queue every fixture ingested so far. Oldest first is how the queue
--    drains, and these are the oldest, so the next runs take them first.
begin;
update public.fixtures
   set players_fetched_at   = null,
       players_attempts     = 0,
       players_last_attempt = null,
       players_retry_after  = null
 where players_fetched_at is not null;
commit;

-- 3. After each run: re-derived fixtures carry no null goals. Expect 0 at any
--    time. After step 2 every non-null players_fetched_at was written by the
--    fixed code, and fixtures still waiting to be re-fetched are not counted.
--   select count(*) from public.player_fixture_stats s
--     join public.fixtures f on f.id = s.fixture_id
--    where f.players_fetched_at is not null
--      and (s.goals is null or s.assists is null);
--
-- 4. Done when this is 0 across the whole table:
--   select count(*) from public.player_fixture_stats where goals is null or assists is null;
