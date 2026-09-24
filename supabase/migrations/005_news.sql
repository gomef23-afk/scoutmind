-- 005_news.sql — RSS news ingest and club tagging.
--
-- Run in the Supabase SQL editor. Safe to run more than once: every statement
-- is idempotent and the alias seed joins on teams.api_team_id, so it does not
-- care whether the teams job has run yet or in what order.
--
-- Nothing here stores article text. We keep a headline, a short snippet and a
-- link out; the snippet is clamped in api/_lib/tagger.js and suppressed
-- entirely for sources marked headline_only.
--
-- !! ORDERING !! This file SUPERSEDES the news_items / news_item_teams tables
-- created by 003. Do not re-run 003 after this file: its
-- `create unique index news_hash_idx on news_items(content_hash)` refers to a
-- column that no longer exists and will error.

-- ---------------------------------------------------------------------------
-- Replace the legacy 003 news tables
-- ---------------------------------------------------------------------------
-- 003 built these with a different shape (source, source_guid, url,
-- content_hash, confidence). `create table if not exists` would silently skip
-- them, leaving the new columns absent and the category index failing, so the
-- legacy layout has to go.
--
-- Two safeguards make this re-runnable rather than destructive:
--   * it only fires when a legacy column is actually present, so a second run
--     over the new layout does nothing;
--   * it refuses outright if either table holds rows.
do $$
declare
  n bigint;
  legacy_items boolean;
  legacy_tags  boolean;
begin
  legacy_items := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'news_items'
       and column_name = 'source_guid'
  );
  legacy_tags := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'news_item_teams'
       and column_name = 'confidence'
  );

  if legacy_items or legacy_tags then
    if to_regclass('public.news_item_teams') is not null then
      select count(*) into n from public.news_item_teams;
      if n > 0 then
        raise exception
          'news_item_teams holds % row(s). 005 stopped rather than drop them. Export or truncate first.', n;
      end if;
    end if;

    if to_regclass('public.news_items') is not null then
      select count(*) into n from public.news_items;
      if n > 0 then
        raise exception
          'news_items holds % row(s). 005 stopped rather than drop them. Export or truncate first.', n;
      end if;
    end if;

    -- Child first: news_item_teams references news_items.
    drop table if exists public.news_item_teams;
    drop table if exists public.news_items;
    raise notice 'Dropped the legacy 003 news tables (both were empty).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- news_sources
-- ---------------------------------------------------------------------------
create table if not exists public.news_sources (
  id                    bigserial primary key,
  slug                  text not null unique,
  name                  text not null,
  url                   text not null,
  lang                  text not null,
  country               text,
  headline_only         boolean not null default false,
  active                boolean not null default true,
  last_fetched_at       timestamptz,
  last_status           text,
  consecutive_failures  integer not null default 0,
  created_at            timestamptz not null default now()
);

comment on column public.news_sources.lang is
  'Drives club tagging and the Home feed language filter. One of pt-BR, en, es, it, de, fr.';
comment on column public.news_sources.country is
  'Only used to bucket Brazil/Europe for items we could not tag to a club.';
comment on column public.news_sources.headline_only is
  'True for feeds that ship the full article body (ge). Store the headline only.';

-- ---------------------------------------------------------------------------
-- news_items
-- ---------------------------------------------------------------------------
create table if not exists public.news_items (
  id            bigserial primary key,
  source_id     bigint not null references public.news_sources(id) on delete cascade,
  guid          text not null,
  title         text not null,
  summary       text not null default '',
  source_url    text not null,
  lang          text not null,
  category      text not null default 'general',
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  unique (source_id, guid)
);

comment on column public.news_items.source_url is
  'Permalink to the article on the publisher''s site. Cards link out to it.';
comment on column public.news_items.summary is
  'Plain-text snippet, <= 300 chars, clamped at a sentence boundary. Empty for headline_only sources.';
comment on column public.news_items.category is
  'transfer | rumor | contract | match | general. The Home "Transfers" filter is transfer+rumor+contract.';

create index if not exists news_items_published_idx
  on public.news_items(published_at desc);
create index if not exists news_items_category_idx
  on public.news_items(category, published_at desc);
create index if not exists news_items_lang_idx
  on public.news_items(lang, published_at desc);

-- ---------------------------------------------------------------------------
-- news_item_teams — which clubs an article is about
-- ---------------------------------------------------------------------------
create table if not exists public.news_item_teams (
  news_item_id  bigint not null references public.news_items(id) on delete cascade,
  team_id       bigint not null references public.teams(id) on delete cascade,
  via           text,
  primary key (news_item_id, team_id)
);

comment on column public.news_item_teams.via is
  'The alias that matched. Keeps a surprising tag debuggable from the table alone.';

create index if not exists news_item_teams_team_idx
  on public.news_item_teams(team_id);

-- ---------------------------------------------------------------------------
-- team_aliases — language scoping and match kind
-- ---------------------------------------------------------------------------
-- 003 created (team_id, alias). Tagging needs three more facts per alias.
alter table public.team_aliases add column if not exists kind     text    not null default 'o';
alter table public.team_aliases add column if not exists langs    text[];
alter table public.team_aliases add column if not exists short_ok boolean not null default false;

comment on column public.team_aliases.kind is
  'o official/short name | n nickname (own-language sources only) | a acronym (all caps only)';
comment on column public.team_aliases.langs is
  'NULL = every source language. Otherwise only these — this is what makes "Inter" Internacional in pt and Inter Milan elsewhere.';
comment on column public.team_aliases.short_ok is
  'Allow an alias under 4 characters. Only Fla, Flu, PSG, BVB.';

-- The alias seed below uses `on conflict (team_id, alias)`, which needs a
-- unique index on exactly those columns. 003 declares them as the primary key,
-- so this is normally a no-op — but the seed fails outright if that ever is not
-- true in the live database, so verify instead of assuming.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.team_aliases'::regclass
       and contype in ('p', 'u')
       and array_length(conkey, 1) = 2
       and conkey @> array[
             (select attnum from pg_attribute
               where attrelid = 'public.team_aliases'::regclass and attname = 'team_id'),
             (select attnum from pg_attribute
               where attrelid = 'public.team_aliases'::regclass and attname = 'alias')
           ]::int2[]
  ) then
    create unique index if not exists team_aliases_team_alias_uidx
      on public.team_aliases(team_id, alias);
    raise notice 'Added the missing unique index on team_aliases(team_id, alias).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — public read, no public write. Cron writes with the service key.
-- ---------------------------------------------------------------------------
alter table public.news_sources    enable row level security;
alter table public.news_items      enable row level security;
alter table public.news_item_teams enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='news_sources'
                   and policyname='news_sources public read') then
    create policy "news_sources public read" on public.news_sources for select using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='news_items'
                   and policyname='news_items public read') then
    create policy "news_items public read" on public.news_items for select using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='news_item_teams'
                   and policyname='news_item_teams public read') then
    create policy "news_item_teams public read" on public.news_item_teams for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SEED: news sources
-- ---------------------------------------------------------------------------
insert into public.news_sources (slug, name, url, lang, country, headline_only, active)
values
  ('ge_futebol',   'ge',                     'https://pox.globo.com/rss/ge/futebol',                        'pt-BR', 'BR', true,  true),
  ('espn_br',      'ESPN Brasil',            'https://www.espn.com.br/rss/futebol.xml',                     'pt-BR', 'BR', false, true),
  ('bbc_football', 'BBC Sport',              'https://feeds.bbci.co.uk/sport/football/rss.xml',             'en',    'GB', false, true),
  ('sky_football', 'Sky Sports',             'https://www.skysports.com/rss/12040',                         'en',    'GB', false, true),
  ('ole_ar',       'Olé',                    'https://www.ole.com.ar/rss/futbol-primera/',                  'es',    'AR', false, true),
  ('as_es',        'AS',                     'https://as.com/rss/futbol/primera.xml',                       'es',    'ES', false, true),
  ('marca_es',     'Marca',                  'https://e00-marca.uecdn.es/rss/futbol/primera-division.xml',  'es',    'ES', false, true),
  ('gazzetta_it',  'La Gazzetta dello Sport','https://www.gazzetta.it/rss/calcio.xml',                      'it',    'IT', false, true),
  ('kicker_de',    'kicker',                 'https://newsfeed.kicker.de/news/bundesliga',                  'de',    'DE', false, true),
  ('rmc_fr',       'RMC Sport',              'https://rmcsport.bfmtv.com/rss/football/',                    'fr',    'FR', false, true)
on conflict (slug) do update
  set name          = excluded.name,
      url           = excluded.url,
      lang          = excluded.lang,
      country       = excluded.country,
      headline_only = excluded.headline_only;

-- ---------------------------------------------------------------------------
-- SEED: team aliases
-- ---------------------------------------------------------------------------
-- Generated from api/_lib/aliases.js, which is the source of truth.
-- tests/tagger.test.js asserts this block and that module stay in step.
--
-- Keyed on api_team_id and joined to teams, so it is order-independent: rows
-- for clubs we have not ingested yet are simply skipped, and re-running after
-- the teams job picks them up.
--
-- MAINTENANCE: promoted clubs arrive each season with no aliases. Add them to
-- api/_lib/aliases.js, regenerate this block, and re-run.
insert into public.team_aliases (team_id, alias, kind, langs, short_ok)
select t.id, v.alias, v.kind, v.langs, v.short_ok
from (values
  -- Serie A (Brazil)
  (134, 'Athletico-PR', 'o', null::text[], false),
  (134, 'Athletico Paranaense', 'o', null, false),
  (134, 'Furacao', 'n', null, false),
  (1062, 'Atletico Mineiro', 'o', null, false),
  (1062, 'Galo', 'n', null, false),
  (118, 'EC Bahia', 'o', null, false),
  (118, 'Esquadrao de Aco', 'n', null, false),
  (118, 'Tricolor de Aco', 'n', null, false),
  (120, 'Botafogo-RJ', 'o', null, false),
  (120, 'Fogao', 'n', null, false),
  (120, 'Glorioso', 'n', null, false),
  (132, 'Chapecoense', 'o', null, false),
  (132, 'Chape', 'n', null, false),
  (131, 'SCCP', 'o', null, false),
  (131, 'Timao', 'n', null, false),
  (131, 'Coringao', 'n', null, false),
  (147, 'Coritiba FC', 'o', null, false),
  (147, 'Coxa', 'n', null, false),
  (147, 'Coxa Branca', 'n', null, false),
  (135, 'Raposa', 'n', null, false),
  (135, 'Cabuloso', 'n', null, false),
  (127, 'Mengao', 'n', null, false),
  (127, 'Nacao Rubro-Negra', 'n', null, false),
  (127, 'Fla', 'n', array['pt-BR'], true),
  (124, 'Fluminense FC', 'o', null, false),
  (124, 'Tricolor Carioca', 'n', null, false),
  (124, 'Flu', 'n', array['pt-BR'], true),
  (130, 'Imortal', 'n', null, false),
  (130, 'Tricolor Gaucho', 'n', null, false),
  (119, 'SC Internacional', 'o', null, false),
  (119, 'Inter de Porto Alegre', 'o', null, false),
  (119, 'Colorado', 'n', null, false),
  (119, 'Inter', 'o', array['pt-BR'], false),
  (7848, 'Mirassol FC', 'o', null, false),
  (121, 'Verdao', 'n', null, false),
  (121, 'Alviverde', 'n', null, false),
  (121, 'Porco', 'n', null, false),
  (794, 'Bragantino', 'o', null, false),
  (794, 'Red Bull Bragantino', 'o', null, false),
  (794, 'Massa Bruta', 'n', null, false),
  (1198, 'Clube do Remo', 'o', null, false),
  (1198, 'Leao Azul', 'n', null, false),
  (128, 'Santos FC', 'o', null, false),
  (128, 'Peixe', 'n', null, false),
  (128, 'Alvinegro Praiano', 'n', null, false),
  (126, 'Sao Paulo FC', 'o', null, false),
  (126, 'SPFC', 'o', null, false),
  (126, 'Tricolor Paulista', 'n', null, false),
  (126, 'Soberano', 'n', null, false),
  (133, 'Vasco', 'o', null, false),
  (133, 'Vasco da Gama', 'o', null, false),
  (133, 'CRVG', 'o', null, false),
  (133, 'Gigante da Colina', 'n', null, false),
  (136, 'EC Vitoria', 'o', null, false),
  (136, 'Leao da Barra', 'n', null, false),
  -- Premier League
  (42, 'Gunners', 'n', null, false),
  -- "Villa" alone is David Villa in Spanish/Italian copy. Foreign press uses
  -- "Aston Villa", which matches on the team name in every language.
  (66, 'Villa', 'o', array['en'], false),
  (66, 'AVFC', 'o', null, false),
  (35, 'AFC Bournemouth', 'o', null, false),
  (35, 'Cherries', 'n', null, false),
  (55, 'Bees', 'n', null, false),
  (51, 'Brighton and Hove Albion', 'o', null, false),
  (51, 'BHAFC', 'o', null, false),
  (51, 'Seagulls', 'n', null, false),
  (1346, 'Coventry City', 'o', null, false),
  (1346, 'CCFC', 'o', null, false),
  (1346, 'Sky Blues', 'n', null, false),
  (52, 'Palace', 'o', null, false),
  (52, 'CPFC', 'o', null, false),
  (52, 'Eagles', 'n', null, false),
  (45, 'Toffees', 'n', null, false),
  (36, 'Cottagers', 'n', null, false),
  (64, 'Hull', 'o', null, false),
  (64, 'Tigers', 'n', null, false),
  (57, 'Ipswich Town', 'o', null, false),
  (57, 'Tractor Boys', 'n', null, false),
  (63, 'Leeds United', 'o', null, false),
  (63, 'Whites', 'n', null, false),
  (40, 'Reds', 'n', null, false),
  (50, 'Man City', 'o', null, false),
  (50, 'MCFC', 'o', null, false),
  (50, 'Citizens', 'n', null, false),
  (33, 'Man Utd', 'o', null, false),
  (33, 'Man United', 'o', null, false),
  (33, 'MUFC', 'o', null, false),
  (33, 'Red Devils', 'n', null, false),
  (34, 'Newcastle United', 'o', null, false),
  (34, 'NUFC', 'o', null, false),
  (34, 'Magpies', 'n', null, false),
  (65, 'Forest', 'o', null, false),
  (65, 'NFFC', 'o', null, false),
  (746, 'SAFC', 'o', null, false),
  (746, 'Black Cats', 'n', null, false),
  (47, 'Tottenham Hotspur', 'o', null, false),
  (47, 'THFC', 'o', null, false),
  (47, 'Spurs', 'n', null, false),
  -- La Liga
  (542, 'Deportivo Alaves', 'o', null, false),
  (531, 'Athletic Bilbao', 'o', null, false),
  (531, 'Athletic de Bilbao', 'o', null, false),
  (531, 'Leones', 'n', null, false),
  (530, 'Atletico de Madrid', 'o', null, false),
  (530, 'Atleti', 'n', null, false),
  (530, 'Colchoneros', 'n', null, false),
  (529, 'FC Barcelona', 'o', null, false),
  (529, 'Barca', 'n', null, false),
  (529, 'Blaugrana', 'n', null, false),
  (538, 'Celta', 'o', null, false),
  (538, 'RC Celta', 'o', null, false),
  (544, 'Deportivo', 'o', null, false),
  (544, 'RC Deportivo', 'o', null, false),
  (544, 'Depor', 'n', null, false),
  (797, 'Elche CF', 'o', null, false),
  (540, 'RCD Espanyol', 'o', null, false),
  (540, 'Periquitos', 'n', null, false),
  (546, 'Getafe CF', 'o', null, false),
  (539, 'Levante UD', 'o', null, false),
  (539, 'Granotas', 'n', null, false),
  (535, 'Malaga CF', 'o', null, false),
  (727, 'CA Osasuna', 'o', null, false),
  (727, 'Rojillos', 'n', null, false),
  (4665, 'Racing de Santander', 'o', null, false),
  (728, 'Rayo', 'o', null, false),
  (728, 'Franjirrojos', 'n', null, false),
  (543, 'Betis', 'o', null, false),
  (543, 'Verdiblancos', 'n', null, false),
  (541, 'Los Blancos', 'n', null, false),
  (541, 'Merengues', 'n', null, false),
  (548, 'La Real', 'n', null, false),
  (548, 'Txuri-urdin', 'n', null, false),
  (536, 'Sevilla FC', 'o', null, false),
  (536, 'Sevillistas', 'n', null, false),
  (532, 'Valencia CF', 'o', null, false),
  (533, 'Villarreal CF', 'o', null, false),
  (533, 'Submarino Amarillo', 'n', null, false),
  -- Bundesliga
  (192, 'FC Koln', 'o', null, false),
  (192, 'Koln', 'o', null, false),
  (192, 'Cologne', 'o', null, false),
  (192, 'Effzeh', 'n', null, false),
  (167, 'Hoffenheim', 'o', null, false),
  (167, 'TSG Hoffenheim', 'o', null, false),
  (168, 'Leverkusen', 'o', null, false),
  (168, 'Werkself', 'n', null, false),
  (157, 'Bayern', 'o', null, false),
  (157, 'Bayern Munich', 'o', null, false),
  (157, 'FC Bayern', 'o', null, false),
  (165, 'Dortmund', 'o', null, false),
  (165, 'BVB', 'a', null, true),
  (163, 'Gladbach', 'o', null, false),
  (163, 'Monchengladbach', 'o', null, false),
  (169, 'Frankfurt', 'o', null, false),
  (169, 'Eintracht', 'o', null, false),
  (170, 'Augsburg', 'o', null, false),
  (174, 'Schalke', 'o', null, false),
  (174, 'Schalke 04', 'o', null, false),
  (164, 'Mainz', 'o', null, false),
  (164, 'Mainz 05', 'o', null, false),
  (175, 'Hamburg', 'o', null, false),
  (173, 'Leipzig', 'o', null, false),
  (173, 'RasenBallsport', 'o', null, false),
  (160, 'Freiburg', 'o', null, false),
  (185, 'Paderborn', 'o', null, false),
  (1660, 'Elversberg', 'o', null, false),
  (182, '1. FC Union Berlin', 'o', null, false),
  (182, 'Eisern', 'n', null, false),
  (172, 'Stuttgart', 'o', null, false),
  (162, 'Bremen', 'o', null, false),
  (162, 'Werder', 'o', null, false),
  -- Serie A (Italy)
  (489, 'Milan', 'o', null, false),
  (489, 'Rossoneri', 'n', null, false),
  (497, 'Roma', 'o', null, false),
  (497, 'Giallorossi', 'n', null, false),
  (499, 'Atalanta BC', 'o', null, false),
  (500, 'Bologna FC', 'o', null, false),
  (490, 'Cagliari Calcio', 'o', null, false),
  (895, 'Como 1907', 'o', null, false),
  (502, 'ACF Fiorentina', 'o', null, false),
  (502, 'Viola', 'n', null, false),
  (512, 'Frosinone Calcio', 'o', null, false),
  (495, 'Genoa CFC', 'o', null, false),
  (495, 'Grifone', 'n', null, false),
  (505, 'Inter Milan', 'o', null, false),
  (505, 'Internazionale', 'o', null, false),
  (505, 'Nerazzurri', 'n', null, false),
  (505, 'Inter', 'o', array['it','en','es'], false),
  (496, 'Juve', 'n', null, false),
  (496, 'Bianconeri', 'n', null, false),
  (496, 'Vecchia Signora', 'n', null, false),
  (487, 'SS Lazio', 'o', null, false),
  (487, 'Biancocelesti', 'n', null, false),
  (867, 'US Lecce', 'o', null, false),
  (1579, 'AC Monza', 'o', null, false),
  (492, 'SSC Napoli', 'o', null, false),
  (492, 'Partenopei', 'n', null, false),
  (523, 'Parma Calcio', 'o', null, false),
  (488, 'US Sassuolo', 'o', null, false),
  (488, 'Neroverdi', 'n', null, false),
  (503, 'Toro', 'n', null, false),
  (503, 'Granata', 'n', null, false),
  (494, 'Udinese Calcio', 'o', null, false),
  (494, 'Zebrette', 'n', null, false),
  (517, 'Venezia FC', 'o', null, false),
  -- Ligue 1
  (77, 'Angers SCO', 'o', null, false),
  (108, 'AJ Auxerre', 'o', null, false),
  (110, 'Troyes', 'o', null, false),
  (110, 'ESTAC', 'o', null, false),
  (111, 'Le Havre AC', 'o', null, false),
  (1298, 'Le Mans FC', 'o', null, false),
  (116, 'RC Lens', 'o', null, false),
  (116, 'Sang et Or', 'n', null, false),
  (79, 'LOSC', 'o', null, false),
  (79, 'Lille OSC', 'o', null, false),
  (79, 'Dogues', 'n', null, false),
  (97, 'FC Lorient', 'o', null, false),
  (97, 'Merlus', 'n', null, false),
  (80, 'Olympique Lyonnais', 'o', null, false),
  (81, 'Olympique de Marseille', 'o', null, false),
  (81, 'Phoceens', 'n', null, false),
  (91, 'AS Monaco', 'o', null, false),
  (84, 'OGC Nice', 'o', null, false),
  (84, 'Aiglons', 'n', null, false),
  (85, 'Paris SG', 'o', null, false),
  (85, 'Paris Saint-Germain', 'o', null, false),
  (85, 'PSG', 'a', null, true),
  (94, 'Stade Rennais', 'o', null, false),
  (94, 'SRFC', 'o', null, false),
  (106, 'Brest', 'o', null, false),
  (106, 'Stade Brestois', 'o', null, false),
  (95, 'RC Strasbourg', 'o', null, false),
  (95, 'RCSA', 'o', null, false),
  (96, 'Toulouse FC', 'o', null, false),
  -- Liga Profesional (Argentina)
  (463, 'CA Aldosivi', 'o', null, false),
  (463, 'Tiburon', 'n', null, false),
  (458, 'Argentinos Juniors', 'o', null, false),
  (458, 'Bicho', 'n', null, false),
  (455, 'Decano', 'n', null, false),
  (449, 'CA Banfield', 'o', null, false),
  (449, 'Taladro', 'n', null, false),
  (2432, 'Barracas', 'o', null, false),
  (440, 'Belgrano', 'o', null, false),
  (440, 'Pirata', 'n', null, false),
  (451, 'Boca', 'o', null, false),
  (451, 'CABJ', 'o', null, false),
  (451, 'Xeneize', 'n', null, false),
  (1065, 'Central Cordoba', 'o', null, false),
  (1065, 'Ferroviario', 'n', null, false),
  (442, 'Defensa y Justicia', 'o', null, false),
  (442, 'Halcon', 'n', null, false),
  (476, 'Riestra', 'o', null, false),
  (2424, 'Estudiantes Rio Cuarto', 'o', null, false),
  (450, 'Estudiantes de La Plata', 'o', null, false),
  (450, 'Pincha', 'n', null, false),
  (434, 'Gimnasia La Plata', 'o', null, false),
  (434, 'Lobo', 'n', null, false),
  (1066, 'Gimnasia Mendoza', 'o', null, false),
  (445, 'CA Huracan', 'o', null, false),
  (445, 'Globo', 'n', null, false),
  (473, 'Independiente Rivadavia', 'o', null, false),
  (453, 'CA Independiente', 'o', null, false),
  (478, 'Instituto', 'o', null, false),
  (478, 'Gloria', 'n', null, false),
  (446, 'CA Lanus', 'o', null, false),
  (446, 'Granate', 'n', null, false),
  (457, 'Newells', 'o', null, false),
  (457, 'Leprosos', 'n', null, false),
  (1064, 'CA Platense', 'o', null, false),
  (1064, 'Calamar', 'n', null, false),
  (436, 'Academia', 'n', null, false),
  (435, 'River', 'o', null, false),
  (435, 'CARP', 'o', null, false),
  (435, 'Millonarios', 'n', null, false),
  (437, 'Canalla', 'n', null, false),
  (460, 'CASLA', 'o', null, false),
  (460, 'Ciclon', 'n', null, false),
  (474, 'Sarmiento', 'o', null, false),
  (456, 'Talleres', 'o', null, false),
  (452, 'CA Tigre', 'o', null, false),
  (441, 'Tatengue', 'n', null, false),
  (438, 'Velez', 'o', null, false),
  (438, 'Fortin', 'n', null, false)
) as v(api_team_id, alias, kind, langs, short_ok)
join public.teams t on t.api_team_id = v.api_team_id
on conflict (team_id, alias) do update
  set kind     = excluded.kind,
      langs    = excluded.langs,
      short_ok = excluded.short_ok;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Expect 10 sources and 279 aliases. Fewer aliases means the teams job has not
-- ingested every club yet — the seed skips clubs that are missing from `teams`.
-- Run /api/cron/teams, then re-run this file; nothing is lost either way.
--
--   select count(*) from public.news_sources;   -- 10
--   select count(*) from public.team_aliases;   -- 279
--
--   select l.slug, count(*) from public.team_aliases a
--     join public.teams t   on t.id = a.team_id
--     join public.leagues l on l.id = t.league_id
--    group by l.slug order by l.slug;
--   -- serie_a 55, premier_league 41, la_liga 38, bundesliga 33,
--   -- serie_a_it 34, ligue_1 29, argentina 49
--
-- Language-scoped aliases — the ones that make "Inter" ambiguous-by-design:
--   select t.name, a.alias, a.kind, a.langs, a.short_ok
--     from public.team_aliases a join public.teams t on t.id = a.team_id
--    where a.langs is not null or a.short_ok
--    order by a.alias;
--   -- expect exactly 7:
--   --   BVB   {}          short_ok   Fla   {pt-BR}     short_ok
--   --   Flu   {pt-BR}     short_ok   PSG   {}          short_ok
--   --   Inter {pt-BR}     -> Internacional
--   --   Inter {it,en,es}  -> Inter Milan
--   --   Villa {en}        -> Aston Villa (David Villa otherwise)
--
-- Confirm the legacy 003 columns are gone (all three should return no rows):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='news_items'
--      and column_name in ('source_guid','content_hash','image_url');
--
-- RETENTION: rule 13 forbids DELETE in api/, so news_items only grows. Prune
-- by hand when it gets big:
--   delete from public.news_items where published_at < now() - interval '90 days';
