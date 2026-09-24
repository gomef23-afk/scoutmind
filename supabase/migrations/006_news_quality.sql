-- 006_news_quality.sql — football-only feed, and headline-vs-summary ranking.
--
-- Run in the Supabase SQL editor. Safe to run more than once: every statement
-- is guarded, and the backfill only ever sets football_ok = false on rows that
-- still match the rule. Nothing is deleted (rule 13).
--
-- Depends on 005.

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
-- ---------------------------------------------------------------------------
-- news_items.football_ok — false hides the row from the feed without deleting
-- it, so a filter mistake is reversible with an UPDATE.
alter table public.news_items
  add column if not exists football_ok boolean not null default true;

-- news_item_teams.in_title — the club was named in the headline, not just
-- mentioned in the summary. Drives ranking on club pages.
alter table public.news_item_teams
  add column if not exists in_title boolean not null default false;

-- news_sources.exclude_patterns — per-source regexes, so a feed that starts
-- leaking a new kind of non-football content can be fixed from the dashboard
-- without a deploy. Applied only to items with no club tag.
alter table public.news_sources
  add column if not exists exclude_patterns text[];

comment on column public.news_items.football_ok is
  'False = not football (TV listings, NFL, F1, tennis). Hidden from the feed, never deleted.';
comment on column public.news_item_teams.in_title is
  'Club was named in the headline. Headline mentions rank above summary mentions.';
comment on column public.news_sources.exclude_patterns is
  'Extra non-football regexes for this feed. Only applied to untagged items.';

-- The feed reads football_ok + published_at together.
create index if not exists news_items_football_idx
  on public.news_items(football_ok, published_at desc);

-- ---------------------------------------------------------------------------
-- BACKFILL
-- ---------------------------------------------------------------------------
-- Mirrors api/_lib/football-filter.js: a club tag proves the item is football,
-- so only UNTAGGED items are ever hidden. On the 502-row first run this rule
-- flagged 8 items and zero false positives.
--
-- Accented and unaccented spellings are both listed because this runs without
-- the unaccent extension.
update public.news_items i
   set football_ok = false
 where i.football_ok
   and not exists (
     select 1 from public.news_item_teams t where t.news_item_id = i.id
   )
   and (i.title || ' ' || coalesce(i.summary, '')) ~*
       ('(o que assistir|onde assistir na tv|disney ?\+|star ?\+|guia de tv'
     || '|\mnfl\M|\mnba\M|\mmlb\M|\mnhl\M|super bowl|flag football'
     || '|formula ?1|\mf1\M|motogp|nascar|grand prix|gran premio'
     || '|\mtenis\M|\mtênis\M|\mtennis\M|wimbledon|roland garros'
     || '|\mufc\M|\mmma\M|basquete|baloncesto|pallacanestro'
     || '|\mvolei\M|\mvôlei\M|voleibol|volleyball'
     || '|ciclismo|tour de france|\mcricket\M|\mrugby\M'
     || '|\mgolf\M|ryder cup|presidents cup|\mpga\M)');

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- What got hidden, and why it is safe:
--
--   select count(*) filter (where football_ok) as football,
--          count(*) filter (where not football_ok) as hidden
--     from public.news_items;
--   -- after the first run: 494 football, 8 hidden
--
--   select s.slug, i.id, i.title
--     from public.news_items i join public.news_sources s on s.id = i.source_id
--    where not i.football_ok
--    order by s.slug, i.id;
--   -- expect: ge x4 (NFL in Rio), espn_br x2 (F1, Disney+), sky x2 (F1, tennis)
--
-- Nothing tagged to a club should ever be hidden (must return 0):
--
--   select count(*) from public.news_items i
--    where not i.football_ok
--      and exists (select 1 from public.news_item_teams t where t.news_item_id = i.id);
--
-- To un-hide something the filter got wrong:
--   update public.news_items set football_ok = true where id = <id>;
--
-- in_title is backfilled by the next /api/cron/news run for current items;
-- older rows keep the default false, which only affects ranking, never
-- whether an item appears.
