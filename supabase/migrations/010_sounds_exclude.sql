-- 010_sounds_exclude.sql — keep BBC Sounds out of the feed.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 006
-- (news_sources.exclude_patterns) and 005.
--
-- Nothing is deleted (rule 13). The rows stay; they just stop being football.
--
-- WHAT THIS IS FOR
-- ----------------
-- Trending surfaced "Monday Night Club - Man City reaction" twice. Two separate
-- faults sat behind that one symptom:
--
--   1. The feed query never filtered `duplicate_of is null`, so 009's work was
--      invisible on Home, For You and Trending. Fixed in the front end, not
--      here.
--   2. Neither row should have been in the feed at all. Both are
--      bbc.co.uk/sounds/play/... pages — a live radio stream and a podcast
--      episode, not articles.
--
-- This file is fault 2. It needs the matching change in
-- api/_lib/football-filter.js to have any effect on NEW items, because until
-- that change exclude_patterns were matched against the headline and summary
-- only, and were skipped entirely for any item tagged to a club. A Sounds
-- episode is tagged to Man City and has a perfectly ordinary football headline,
-- so it slipped past both. The pattern below is matched against the URL and is
-- now checked before the club-tag shortcut.

-- ---------------------------------------------------------------------------
-- 1. Stop new ones arriving
-- ---------------------------------------------------------------------------
-- Appended, not assigned: if someone has added a pattern to this source from
-- the dashboard, overwriting the array would silently discard it. The
-- `not ... @>` guard is what makes the statement re-runnable without stacking
-- the same pattern up over and over.
update public.news_sources
   set exclude_patterns = coalesce(exclude_patterns, '{}') || array['bbc\.co\.uk/sounds/']
 where slug = 'bbc_football'
   and not coalesce(exclude_patterns, '{}') @> array['bbc\.co\.uk/sounds/'];

-- ---------------------------------------------------------------------------
-- 2. Mark the ones already stored
-- ---------------------------------------------------------------------------
-- Matched on the URL, not the headline. The headlines are indistinguishable
-- from article headlines — that is the whole problem.
update public.news_items
   set football_ok = false
 where football_ok
   and source_url ilike '%bbc.co.uk/sounds/%';

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The pattern is stored exactly once:
--   select slug, exclude_patterns from public.news_sources where slug = 'bbc_football';
--
-- No Sounds page can reach the feed any more (expect 0):
--   select count(*) from public.news_items
--    where source_url ilike '%bbc.co.uk/sounds/%'
--      and football_ok and duplicate_of is null;
--
-- How many were hidden, and what they were:
--   select id, title, source_url from public.news_items
--    where source_url ilike '%bbc.co.uk/sounds/%'
--    order by published_at desc limit 20;
--
-- WORTH A LOOK, NOT DONE HERE
-- ---------------------------------------------------------------------------
-- Sounds is the case we caught. This lists every other BBC path type in the
-- table, so the same question can be asked of the rest rather than guessed at.
-- /iplayer/ is the likely next one; add it to the array above if it shows up
-- with a real count.
--
--   select split_part(split_part(source_url, 'bbc.co.uk/', 2), '/', 1) as path,
--          count(*)
--     from public.news_items
--    where source_url ilike '%bbc.co.uk/%'
--    group by 1 order by 2 desc;
