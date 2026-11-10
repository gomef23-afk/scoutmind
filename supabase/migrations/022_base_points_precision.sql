-- 022_base_points_precision.sql — store a pick's base points to two decimals.
--
-- Run in the Supabase SQL editor BEFORE pushing the scoring v2 commit. Safe to
-- run more than once. Depends on 017.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Scoring v2 (api/_lib/scout-game.js) pays a foul drawn 0.75, so a base can
-- end in .25 or .75. 017 created game_pick_scores.base_points as numeric(6,1),
-- which would store 3.25 as 3.3: the breakdown on the Scout tab would then not
-- add up to the base beside it. total is already numeric(7,2) and needs no
-- change. Only functions read base_points (match_detail, refresh_game_results),
-- no view, so the type changes in place. No round has been scored with entries
-- yet, so no stored value is affected.

begin;

alter table public.game_pick_scores
  alter column base_points type numeric(6,2);

comment on column public.game_pick_scores.base_points is
  'Base points for one pick in one fixture, before the multiplier. Scoring v2 values are in quarters, so two decimals.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Expect 6 and 2:
--   select numeric_precision, numeric_scale
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'game_pick_scores'
--      and column_name = 'base_points';
--
-- After the first player-stats run, the v2 ladder is in game_config. Expect
-- {"1": 1.4, "2": 1.2, "3": 1.1, "4": 1.05, "5": 1} and 1.4:
--   select ladder, unranked_multiplier, rules_synced_at from public.game_config;
