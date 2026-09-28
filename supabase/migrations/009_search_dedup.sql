-- 009_search_dedup.sql — full-text search over news, and duplicate handling.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 005
-- and 006. Independent of 008 — this one can be applied first.
--
-- Nothing is deleted (rule 13). Duplicates are marked and filtered out.

-- ---------------------------------------------------------------------------
-- unaccent_fallback — also defined identically in 008
-- ---------------------------------------------------------------------------
-- The headline pass below needs it, and 009 must not depend on the order the
-- two files are run in. `create or replace` with an identical body means
-- whichever runs second is a no-op. If you change one, change both.
create or replace function public.unaccent_fallback(txt text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(txt, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
-- ---------------------------------------------------------------------------
-- Points at the row this one duplicates. NULL means "this is the original",
-- which is also the default, so existing rows stay visible until the backfill
-- below decides otherwise.
alter table public.news_items
  add column if not exists duplicate_of bigint references public.news_items(id) on delete set null;

comment on column public.news_items.duplicate_of is
  'Set when this row repeats an earlier story from the same source. Filtered out of the feed; never deleted.';

-- Full-text search over headline + snippet.
--
-- The text config follows the row's language: Portuguese stemming on a
-- Portuguese headline, English on an English one. Everything else falls back
-- to 'simple', which does no stemming but still tokenises — better than
-- stemming Italian text with English rules.
--
-- GENERATED ALWAYS means it can never drift from title/summary, and needs no
-- trigger to maintain.
--
-- The expression MUST be immutable, which is why the config is written as an
-- explicit `'english'::regconfig` cast rather than relying on the one-argument
-- to_tsvector(). The one-argument form reads default_text_search_config, is
-- only STABLE, and Postgres rejects it here with:
--   generation expression is not immutable
-- If this statement ever fails that way, the cause is a config that is not a
-- literal cast — not the column itself.
alter table public.news_items
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector(
      case lang
        when 'pt-BR' then 'portuguese'::regconfig
        when 'en'    then 'english'::regconfig
        when 'es'    then 'spanish'::regconfig
        when 'it'    then 'italian'::regconfig
        when 'de'    then 'german'::regconfig
        when 'fr'    then 'french'::regconfig
        else 'simple'::regconfig
      end,
      coalesce(title, '') || ' ' || coalesce(summary, '')
    )
  ) stored;

create index if not exists news_items_search_idx
  on public.news_items using gin (search_vector);

-- The feed always filters on these three together.
create index if not exists news_items_live_idx
  on public.news_items (published_at desc)
  where football_ok and duplicate_of is null;

-- ---------------------------------------------------------------------------
-- BACKFILL: mark existing duplicates
-- ---------------------------------------------------------------------------
-- Measured before writing this: 519 of 2,005 rows (25.9%) are repeats, and
-- 517 of them are BBC.
--
-- The cause is the guid. BBC emits "<article-url>#<position-in-feed>", so the
-- same article comes back with a new guid every time it moves up or down the
-- feed — seven, eight, nine copies of one story, all with the same URL and the
-- same publish time. api/_lib/rss.js now strips the fragment, which stops new
-- ones; this marks the ones already stored.
--
-- Keyed on source + URL-without-fragment rather than on the headline: it
-- caught exactly the same 519 rows in testing, and two different articles can
-- share a headline far more easily than they can share a URL.
--
-- The oldest row in each group wins and stays visible.
with grouped as (
  select id,
         first_value(id) over (
           partition by source_id, split_part(source_url, '#', 1)
           order by published_at, id
         ) as keeper
    from public.news_items
   where duplicate_of is null
)
update public.news_items i
   set duplicate_of = g.keeper
  from grouped g
 where i.id = g.id
   and g.keeper <> i.id;

-- Second pass: same source and same normalised headline within 48 hours, for
-- sources that change the URL as well as the guid. Expect this to catch very
-- little — it is the safety net, not the main fix.
with norm as (
  select id, source_id, published_at,
         regexp_replace(lower(public.unaccent_fallback(title)), '[^a-z0-9]+', ' ', 'g') as t
    from public.news_items
   where duplicate_of is null
),
pairs as (
  select b.id as dup_id, a.id as keeper
    from norm a
    join norm b
      on a.source_id = b.source_id
     and a.t = b.t
     and a.id < b.id
     and b.published_at between a.published_at - interval '48 hours'
                            and a.published_at + interval '48 hours'
)
update public.news_items i
   set duplicate_of = p.keeper
  from (select dup_id, min(keeper) as keeper from pairs group by dup_id) p
 where i.id = p.dup_id
   and i.duplicate_of is null;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
--   select count(*) filter (where duplicate_of is null) as originals,
--          count(*) filter (where duplicate_of is not null) as duplicates
--     from public.news_items;
--   -- first run: roughly 1,486 originals and 519 duplicates
--
-- Which sources were repeating themselves:
--   select s.slug, count(*) as duplicates
--     from public.news_items i join public.news_sources s on s.id = i.source_id
--    where i.duplicate_of is not null
--    group by s.slug order by 2 desc;
--   -- expect bbc_football to dominate
--
-- No row may point at itself, and no chains (both expect 0):
--   select count(*) from public.news_items where duplicate_of = id;
--   select count(*) from public.news_items a
--     join public.news_items b on a.duplicate_of = b.id
--    where b.duplicate_of is not null;
--
-- Search sanity — the generated column and the Portuguese config:
--   select id, title from public.news_items
--    where search_vector @@ websearch_to_tsquery('portuguese', 'Flamengo')
--      and football_ok and duplicate_of is null
--    order by published_at desc limit 5;
--
--   select id, title from public.news_items
--    where search_vector @@ websearch_to_tsquery('english', 'transfer')
--      and football_ok and duplicate_of is null
--    order by published_at desc limit 5;
--
-- NOTE: websearch_to_tsquery's config must match the row's language to stem
-- correctly, so the client queries with the config for the language it is
-- searching in. A pt query against an English row still matches on exact
-- tokens, just without stemming — acceptable, and better than no results.
