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
-- /iplayer/ was added after the first run, once the path audit at the bottom of
-- this file showed what else the feed carries: sport 702, sounds 31, news 13,
-- iplayer 6. Same reasoning as Sounds — an iPlayer programme page is a video,
-- not an article, and its headline reads like any other.
--
-- `news 13` is deliberately left alone: those are bbc.co.uk/news/ articles,
-- which are articles.
update public.news_sources s
   set exclude_patterns = coalesce(s.exclude_patterns, '{}') || w.missing
  from (
    select array(
      select p from unnest(array['bbc\.co\.uk/sounds/', 'bbc\.co\.uk/iplayer/']) p
       where not coalesce(
         (select exclude_patterns from public.news_sources where slug = 'bbc_football'),
         '{}'
       ) @> array[p]
    ) as missing
  ) w
 where s.slug = 'bbc_football'
   and array_length(w.missing, 1) > 0;

-- ---------------------------------------------------------------------------
-- 2. Mark the ones already stored
-- ---------------------------------------------------------------------------
-- Matched on the URL, not the headline. The headlines are indistinguishable
-- from article headlines — that is the whole problem.
update public.news_items
   set football_ok = false
 where football_ok
   and (source_url ilike '%bbc.co.uk/sounds/%'
     or source_url ilike '%bbc.co.uk/iplayer/%');

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Each pattern is stored exactly once, however often this file is run:
--   select slug, exclude_patterns from public.news_sources where slug = 'bbc_football';
--   -- expect {"bbc\\.co\\.uk/sounds/","bbc\\.co\\.uk/iplayer/"}
--
-- No Sounds or iPlayer page can reach the feed any more (expect 0):
--   select count(*) from public.news_items
--    where (source_url ilike '%bbc.co.uk/sounds/%'
--        or source_url ilike '%bbc.co.uk/iplayer/%')
--      and football_ok and duplicate_of is null;
--
-- How many were hidden, and what they were:
--   select id, title, source_url from public.news_items
--    where source_url ilike '%bbc.co.uk/sounds/%'
--       or source_url ilike '%bbc.co.uk/iplayer/%'
--    order by published_at desc limit 20;
--
-- THE PATH AUDIT
-- ---------------------------------------------------------------------------
-- What told us iplayer existed. Re-run it when the feed misbehaves rather than
-- guessing at a pattern:
--
--   select split_part(split_part(source_url, 'bbc.co.uk/', 2), '/', 1) as path,
--          count(*)
--     from public.news_items
--    where source_url ilike '%bbc.co.uk/%'
--    group by 1 order by 2 desc;
--
--   28 Sept 2026: sport 702, sounds 31, news 13, iplayer 6.
--   sport and news are articles and stay. The other two are a media player
--   with a headline attached.
