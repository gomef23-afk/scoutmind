-- 018_scout_game_ladder.sql — store the Scout Game multiplier to two decimals.
--
-- Run in the Supabase SQL editor BEFORE pushing the commit that changes the
-- ladder. Safe to run more than once. Depends on 017.
--
-- WHY
-- ---------------------------------------------------------------------------
-- The backtest (docs/backtest-2026-11.md) replaced the 1x .. 5x ladder with
-- half compensation: 1 / 1.05 / 1.1 / 1.2 / 1.35, unranked 1.35. 017 created
-- game_picks.locked_multiplier as numeric(3,1), one decimal place, which would
-- have stored 1.05 as 1.1 and 1.35 as 1.4: a quietly wrong multiplier on every
-- tier-4 and tier-1 pick. No round had been locked with entries when this
-- ran, so no stored value is affected.
--
-- game_pick_scores.multiplier is already numeric(4,2) and needs no change.

begin;

alter table public.game_picks
  alter column locked_multiplier type numeric(4,2);

comment on column public.game_picks.locked_multiplier is
  'The tier multiplier snapshotted at the deadline, from the ladder in api/_lib/scout-game.js. Two decimals (1.05, 1.35).';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Expect 4 and 2:
--   select numeric_precision, numeric_scale
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'game_picks'
--      and column_name = 'locked_multiplier';
--
-- Nothing was locked with entries before this ran. Expect 0:
--   select count(*) from public.game_picks where locked_multiplier is not null;
