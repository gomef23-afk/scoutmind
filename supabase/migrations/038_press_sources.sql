-- 038_press_sources.sql — the press of the tracked leagues (C2, 21 Nov 2026).
--
-- Run in the Supabase SQL editor. Safe to run more than once: sources and
-- aliases are upserts (by slug; by team and alias). Nothing is deleted (rule 13).
--
-- 1. FIFTEEN NEWS SOURCES for the leagues tracked since 17-19 Nov: BBC Sport
--    (Championship, Scotland), The Guardian (Championship, Scottish football,
--    MLS), AD and Voetbal International (NL), Record (PT), DH Les Sports+ and
--    Sporza (BE), Hürriyet and Sabah (TR), Arab News (SA), Infobae México
--    (MX), Tenfield (UY). Generated from api/_lib/sources.js (PRESS_SOURCES),
--    which is the source of truth; tests/press-sources.test.js keeps them equal.
--    * headline_only for the feeds that carry the whole article (rule 17).
--    * exclude_patterns: each feed's non-football (other sports, the rest of
--      the paper, betting tips), matched against headline, snippet AND link,
--      and stronger than a club tag (api/_lib/football-filter.js): that is
--      what drops Tenfield's "LUB:" basketball, tagged to Peñarol.
--    * A re-run resets name, url, lang, country, headline_only and
--      exclude_patterns to these values; `active` is left as it is, so a
--      source switched off from the dashboard stays off.
--    * lang 'nl', 'tr' and 'pt-PT' are new: the app shows Dutch and Turkish as
--      their own feed languages and reads pt-PT under "Português".
--
-- 2. ALIASES for the clubs of the tracked leagues, generated from
--    api/_lib/aliases-tracked.js. Keyed on api_team_id and joined to teams, so
--    rows for a club not ingested yet are skipped (re-run after /api/cron/teams).
--
-- The news job picks both up on its next run: no deploy needed after this.

begin;

-- ---------------------------------------------------------------------------
-- 1. SOURCES
-- ---------------------------------------------------------------------------
insert into public.news_sources (slug, name, url, lang, country, headline_only, active, exclude_patterns)
values
  ('bbc_championship', 'BBC Sport', 'https://feeds.bbci.co.uk/sport/football/championship/rss.xml', 'en', 'GB', false, true, array['bbc\.co\.uk/sounds/', 'bbc\.co\.uk/iplayer/']::text[]),
  ('guardian_championship', 'The Guardian', 'https://www.theguardian.com/football/championship/rss', 'en', 'GB', true, true, '{}'),
  ('bbc_scottish', 'BBC Sport', 'https://feeds.bbci.co.uk/sport/football/scottish/rss.xml', 'en', 'GB', false, true, array['bbc\.co\.uk/sounds/', 'bbc\.co\.uk/iplayer/']),
  ('guardian_scottish', 'The Guardian', 'https://www.theguardian.com/football/scottish-premiership/rss', 'en', 'GB', true, true, '{}'),
  ('guardian_mls', 'The Guardian', 'https://www.theguardian.com/football/mls/rss', 'en', 'GB', true, true, '{}'),
  ('ad_sportwereld', 'AD', 'https://www.ad.nl/sportwereld/rss.xml', 'nl', 'NL', false, true, array['ad\.nl/(tennis|darts|formule-1|schaatsen|wielrennen|andere-sporten|hockey|volleybal|basketbal|motorsport|atletiek|zwemmen|golf|paardensport|olympische-spelen|handbal|korfbal)/', '\bwielren', '\bschaats']),
  ('vi_nieuws', 'Voetbal International', 'https://www.vi.nl/rss/nieuws', 'nl', 'NL', false, true, '{}'),
  ('record_pt', 'Record', 'https://www.record.pt/rss', 'pt-PT', 'PT', false, true, array['record\.pt/modalidades/', '\bfutsal\b', '\bandebol\b', '\bhoquei\b']),
  ('dh_football', 'DH Les Sports+', 'https://www.dhnet.be/rss/section/sports/football.xml', 'fr', 'BE', false, true, '{}'),
  ('sporza_voetbal', 'Sporza', 'https://sporza.be/nl/categorie/voetbal.rss.xml', 'nl', 'BE', false, true, '{}'),
  ('hurriyet_spor', 'Hürriyet', 'https://www.hurriyet.com.tr/rss/spor', 'tr', 'TR', false, true, array['hurriyet\.com\.tr/(?!sporarena/)', '\beuroleague\b', '\beurocup\b', '\bbsl\b', '\bbasketbol\b', '\bvoleybol\b', '\bmisli\b']),
  ('sabah_spor', 'Sabah', 'https://www.sabah.com.tr/rss/spor.xml', 'tr', 'TR', false, true, array['sabah\.com\.tr/spor/(basketbol|voleybol|tenis|motor-sporlari|atletizm)/', 'cagdas faktoring', '\beuroleague\b', '\beurocup\b', '\bbsl\b', '\bbasketbol\b', '\bvoleybol\b', '\bmisli\b']),
  ('arab_news', 'Arab News', 'https://www.arabnews.com/rss.xml', 'en', 'SA', false, true, array['arabnews\.com/(?!(football|saudi-pro-league|sport)/)']),
  ('infobae_mx', 'Infobae México', 'https://www.infobae.com/arc/outboundfeeds/rss/category/mexico/deportes/', 'es', 'MX', true, true, array['\bonefa\b', '\bborregos\b']),
  ('tenfield', 'Tenfield', 'https://www.tenfield.com.uy/feed/', 'es', 'UY', true, true, array['^lub\b', 'tenfield\.com\.uy/lub-'])
on conflict (slug) do update
  set name             = excluded.name,
      url              = excluded.url,
      lang             = excluded.lang,
      country          = excluded.country,
      headline_only    = excluded.headline_only,
      exclude_patterns = excluded.exclude_patterns;

-- ---------------------------------------------------------------------------
-- 2. ALIASES (on conflict needs team_aliases(team_id, alias) unique: 003's
--    primary key, checked by 005)
-- ---------------------------------------------------------------------------
insert into public.team_aliases (team_id, alias, kind, langs, short_ok)
select t.id, v.alias, v.kind, v.langs, v.short_ok
from (values
  (197, 'PSV', 'a', null::text[], true),
  (201, 'AZ', 'a', null, true),
  (413, 'NEC', 'a', null, true),
  (198, 'ADO', 'a', null, true),
  (415, 'FC Twente', 'o', null, false),
  (207, 'FC Utrecht', 'o', null, false),
  (202, 'FC Groningen', 'o', null, false),
  (210, 'sc Heerenveen', 'o', null, false),
  (212, 'Porto', 'o', array['en', 'es', 'it', 'de', 'fr', 'nl', 'pt-PT', 'tr'], false),
  (217, 'Braga', 'o', array['en', 'es', 'it', 'de', 'fr', 'nl', 'pt-PT', 'tr'], false),
  (217, 'Sporting de Braga', 'o', null, false),
  (217, 'Sporting Braga', 'o', null, false),
  (228, 'Sporting', 'o', array['en', 'it', 'de', 'fr', 'nl', 'pt-PT', 'pt-BR', 'tr'], false),
  (228, 'Sporting Lisbon', 'o', null, false),
  (228, 'Sporting de Lisboa', 'o', null, false),
  (224, 'Vitória de Guimarães', 'o', null, false),
  (224, 'Vitória Guimarães', 'o', null, false),
  (15130, 'Estrela da Amadora', 'o', null, false),
  (15130, 'Estrela Amadora', 'o', null, false),
  (569, 'Club Brugge', 'o', null, false),
  (569, 'Club Bruges', 'o', null, false),
  (741, 'Cercle Bruges', 'o', null, false),
  (733, 'Standard de Liège', 'o', null, false),
  (733, 'Standard', 'o', array['fr', 'nl'], false),
  (1393, 'Union Saint-Gilloise', 'o', null, false),
  (1393, 'Union SG', 'o', null, false),
  (735, 'Sint-Truiden', 'o', null, false),
  (735, 'Saint-Trond', 'o', null, false),
  (735, 'STVV', 'a', null, false),
  (266, 'Mechelen', 'o', null, false),
  (266, 'Malines', 'o', null, false),
  (261, 'Westerlo', 'o', null, false),
  (738, 'Beveren', 'o', null, false),
  (259, 'Lommel', 'o', null, false),
  (5902, 'La Louvière', 'o', null, false),
  (736, 'Sporting Charleroi', 'o', null, false),
  (631, 'La Gantoise', 'o', null, false),
  (734, 'Courtrai', 'o', null, false),
  (260, 'OH Louvain', 'o', null, false),
  (740, 'Royal Antwerp', 'o', null, false),
  (997, 'Gençlerbirliği', 'o', null, false),
  (1009, 'Erzurumspor', 'o', null, false),
  (3579, 'Amedspor', 'o', null, false),
  (1007, 'Çaykur Rizespor', 'o', null, false),
  (2932, 'Al Hilal', 'o', null, false),
  (2938, 'Al Ittihad', 'o', null, false),
  (2929, 'Al Ahli', 'o', null, false),
  (2930, 'Al Faisaly', 'o', null, false),
  (2933, 'Al Qadsiah', 'o', null, false),
  (2933, 'Al Qadisiyah', 'o', null, false),
  (2940, 'Al Shabab FC', 'o', null, false),
  (10513, 'NEOM SC', 'o', null, false),
  (2934, 'Al Ettifaq', 'o', null, false),
  (2936, 'Al Taawoun', 'o', null, false),
  (2278, 'Chivas', 'o', null, false),
  (2279, 'Tigres', 'o', null, false),
  (2286, 'Pumas UNAM', 'o', null, false),
  (2287, 'Club América', 'o', null, false),
  (2292, 'Pachuca', 'o', null, false),
  (2280, 'Tijuana', 'o', null, false),
  (2280, 'Xolos', 'n', null, false),
  (2290, 'Querétaro', 'o', null, false),
  (2312, 'Atlante', 'o', null, false),
  (2289, 'Club León', 'o', null, false),
  (2358, 'Liverpool de Montevideo', 'o', null, false),
  (2359, 'Racing de Montevideo', 'o', null, false),
  (2368, 'Central Español', 'o', null, false)
) as v(api_team_id, alias, kind, langs, short_ok)
join public.teams t on t.api_team_id = v.api_team_id
on conflict (team_id, alias) do update
  set kind     = excluded.kind,
      langs    = excluded.langs,
      short_ok = excluded.short_ok;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only)
-- ---------------------------------------------------------------------------
--   select count(*) from public.news_sources;                            -- 25
--   select count(*) from public.news_sources where active;               -- 25
--   select slug, lang, country, headline_only, cardinality(exclude_patterns) as patterns
--     from public.news_sources order by id desc limit 15;
--   select count(*) from public.team_aliases;                            -- 279 + 67 = 346
--   select t.name, a.alias, a.kind, a.langs from public.team_aliases a
--     join public.teams t on t.id = a.team_id
--    where a.alias in ('PSV', 'Porto', 'Club Brugge', 'Al Hilal', 'Chivas');   -- 5 rows
--
-- After the next news run (all 25 sources fetched, least recently fetched first):
--   select s.slug, count(i.*) as items, count(i.*) filter (where i.football_ok) as football,
--          count(distinct it.news_item_id) as tagged
--     from public.news_sources s
--     left join public.news_items i on i.source_id = s.id and i.created_at > now() - interval '1 day'
--     left join public.news_item_teams it on it.news_item_id = i.id
--    where s.id > (select max(id) - 15 from public.news_sources)
--    group by s.slug order by s.slug;