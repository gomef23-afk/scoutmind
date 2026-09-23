-- 003_football_data.sql
-- Phase R (real data) — API-Football ingestion targets + RSS news.
--
-- ACCESS MODEL
--   anon + authenticated : SELECT only. The browser reads these tables directly
--                          and never writes to them.
--   service_role         : full access. Supabase's service role bypasses RLS,
--                          so the cron functions need no policies of their own.
--                          That key lives only in Vercel env, never in the client.
--
-- DECISIONS BAKED IN (Sept 2026)
--   * No market value column anywhere — API-Football does not provide it and we
--     dropped the budget filter and currency switcher rather than fake it.
--   * No aerial-duel column — the API exposes total duels only, not aerial.
--     `duels_won_pct` replaces the old `aer` metric and the "Aerial vulnerability"
--     weakness type becomes "Duel vulnerability".
--   * No clearances column — not available at any level.
--   * Season is per league (`leagues.current_season`). Brasileirão and Argentina
--     run calendar-year; Europe's 2026-27 campaign is coded 2026 by
--     API-Football. All seven therefore read 2026 right now, but the column is
--     per league precisely so they can diverge in January.
--   * `leagues.active` gates ingestion. On the Pro plan (7,500 req/day) all
--     seven are active. NOTE: the free plan serves only seasons 2022-2024 and
--     rejects the `next`/`last` fixture parameters, which is why the ingest
--     uses from/to date ranges.

begin;

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------
create table if not exists public.leagues (
  id              bigserial primary key,
  api_league_id   integer not null unique,
  slug            text    not null unique,   -- matches the old leagues_data.js keys
  name            text    not null,
  country         text,
  flag            text,                      -- emoji, kept from the old data
  tier            smallint default 1,
  current_season  integer not null,
  active          boolean not null default false,
  updated_at      timestamptz not null default now()
);

comment on column public.leagues.active is
  'Only active leagues are ingested. All seven are active on the Pro plan.';

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id              bigserial primary key,
  api_team_id     integer not null unique,
  league_id       bigint  references public.leagues(id) on delete cascade,
  slug            text,
  name            text not null,
  short_name      text,
  country         text,
  founded         integer,
  venue_name      text,
  venue_city      text,
  venue_capacity  integer,
  logo_url        text,
  coach_name      text,
  updated_at      timestamptz not null default now()
);
create index if not exists teams_league_idx on public.teams(league_id);
create index if not exists teams_name_idx   on public.teams(lower(name));

-- Alias table drives RSS club tagging: "Man Utd", "Mengão", "Los Blancos".
create table if not exists public.team_aliases (
  team_id  bigint not null references public.teams(id) on delete cascade,
  alias    text   not null,
  primary key (team_id, alias)
);
create index if not exists team_aliases_alias_idx on public.team_aliases(lower(alias));

-- ---------------------------------------------------------------------------
-- standings
-- ---------------------------------------------------------------------------
create table if not exists public.standings (
  league_id       bigint  not null references public.leagues(id) on delete cascade,
  season          integer not null,
  team_id         bigint  not null references public.teams(id) on delete cascade,
  rank            integer,
  points          integer,
  played          integer,
  win             integer,
  draw            integer,
  lose            integer,
  goals_for       integer,
  goals_against   integer,
  goal_diff       integer,
  form            text,
  -- Which standings table this rank came from ("Serie A", "Zona A",
  -- "Tabla Anual"...). Leagues that publish several tables are collapsed to one
  -- row per team by the ingest, keeping the best rank; this says which.
  group_label     text,
  updated_at      timestamptz not null default now(),
  primary key (league_id, season, team_id)
);
create index if not exists standings_rank_idx on public.standings(league_id, season, rank);

-- ---------------------------------------------------------------------------
-- fixtures
-- ---------------------------------------------------------------------------
create table if not exists public.fixtures (
  id              bigserial primary key,
  api_fixture_id  integer not null unique,
  league_id       bigint  references public.leagues(id) on delete cascade,
  season          integer not null,
  round           text,
  kickoff_utc     timestamptz,
  status_short    text,        -- NS, 1H, HT, 2H, ET, PEN, FT, PST, CANC...
  elapsed         integer,
  home_team_id    bigint references public.teams(id),
  away_team_id    bigint references public.teams(id),
  home_goals      integer,
  away_goals      integer,
  venue_name      text,
  updated_at      timestamptz not null default now()
);
create index if not exists fixtures_kickoff_idx on public.fixtures(kickoff_utc);
create index if not exists fixtures_league_idx  on public.fixtures(league_id, kickoff_utc);
create index if not exists fixtures_status_idx  on public.fixtures(status_short);

-- Per-fixture, per-team panel. This is what team_season_stats is aggregated
-- from: possession, passing, shots and fouls exist only at fixture level.
--
-- Column <- /fixtures/statistics `type` string. All 18 types the API returns
-- are captured; verified against tests/fixtures/api-football/fixtures_statistics.json.
--   shots_on        <- "Shots on Goal"      int
--   shots_off       <- "Shots off Goal"     int
--   shots_total     <- "Total Shots"        int
--   shots_blocked   <- "Blocked Shots"      int
--   shots_inside    <- "Shots insidebox"    int
--   shots_outside   <- "Shots outsidebox"   int
--   fouls           <- "Fouls"              int
--   corners         <- "Corner Kicks"       int
--   offsides        <- "Offsides"           int
--   possession_pct  <- "Ball Possession"    STRING "34%"  -> pctToNumber()
--   yellow          <- "Yellow Cards"       int
--   red             <- "Red Cards"          int OR NULL when none -> coalesce 0
--   gk_saves        <- "Goalkeeper Saves"   int
--   passes_total    <- "Total passes"       int
--   passes_accurate <- "Passes accurate"    int
--   passes_pct      <- "Passes %"           STRING "77%"  -> pctToNumber()
--   expected_goals  <- "expected_goals"     STRING "1.02" -> parseFloat
--   goals_prevented <- "goals_prevented"    STRING "-0.03" -> parseFloat, can be negative
--
-- NOTE the naming inconsistency: sixteen types are Title Case With Spaces, the
-- last two are snake_case. Match on the exact string, do not normalise.
-- NOTE null means "none happened", not "unknown", for the counting stats.
create table if not exists public.fixture_stats (
  fixture_id       bigint not null references public.fixtures(id) on delete cascade,
  team_id          bigint not null references public.teams(id) on delete cascade,
  shots_total      integer,
  shots_on         integer,
  shots_off        integer,
  shots_blocked    integer,
  shots_inside     integer,
  shots_outside    integer,
  fouls            integer,
  corners          integer,
  offsides         integer,
  possession_pct   numeric(5,2),
  yellow           integer,
  red              integer,
  gk_saves         integer,
  passes_total     integer,
  passes_accurate  integer,
  passes_pct       numeric(5,2),
  expected_goals   numeric(5,2),   -- xG for this team in this match
  goals_prevented  numeric(5,2),   -- GK shot-stopping vs xG; negative is bad
  primary key (fixture_id, team_id)
);

-- ---------------------------------------------------------------------------
-- team_season_stats — the weakness engine reads this
-- ---------------------------------------------------------------------------
create table if not exists public.team_season_stats (
  team_id           bigint  not null references public.teams(id) on delete cascade,
  league_id         bigint  not null references public.leagues(id) on delete cascade,
  season            integer not null,
  matches           integer,
  gc                numeric(6,3),   -- goals conceded / game
  gs                numeric(6,3),   -- goals scored / game
  yel_pg            numeric(6,3),
  pa                numeric(5,2),   -- pass accuracy %
  pos_pct           numeric(5,2),   -- possession %
  fouls_pg          numeric(6,3),
  sh_pg             numeric(6,3),
  sot_pg            numeric(6,3),
  tk_pg             numeric(6,3),   -- derived: squad tackles / matches
  int_pg            numeric(6,3),   -- derived: squad interceptions / matches
  duels_won_pct     numeric(5,2),   -- replaces the old `aer`
  -- xG arrived with the R0 probe and is better than raw shot counts for
  -- "Poor finishing" (gs vs xg_pg) and "Goalkeeper weakness" (goals_prevented).
  -- Aggregated in R5 from fixture_stats.
  xg_pg             numeric(6,3),   -- expected goals for / match
  xga_pg            numeric(6,3),   -- expected goals against / match
  goals_prevented   numeric(6,3),   -- season total, GK shot-stopping vs xG
  clean_sheets      integer,
  failed_to_score   integer,
  fixtures_sampled  integer,        -- how many fixtures fed the averages
  updated_at        timestamptz not null default now(),
  primary key (team_id, season)
);

create table if not exists public.league_averages (
  league_id      bigint  not null references public.leagues(id) on delete cascade,
  season         integer not null,
  gc             numeric(6,3),
  gs             numeric(6,3),
  yel            numeric(6,3),
  pa             numeric(5,2),
  pos            numeric(5,2),
  fouls          numeric(6,3),
  sh             numeric(6,3),
  sot            numeric(6,3),
  tk             numeric(6,3),
  int            numeric(6,3),
  duels_won_pct  numeric(5,2),
  teams_sampled  integer,
  updated_at     timestamptz not null default now(),
  primary key (league_id, season)
);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id             bigserial primary key,
  api_player_id  integer not null unique,
  name           text not null,
  firstname      text,
  lastname       text,
  age            integer,
  birth_date     date,
  nationality    text,
  -- API is inconsistent: height arrives as "178" AND as "188 cm" in the same
  -- response (same for weight: "72" / "83 kg"). parseInt handles both.
  height_cm      integer,
  weight_kg      integer,
  photo_url      text,
  injured        boolean,
  updated_at     timestamptz not null default now()
);
create index if not exists players_name_idx on public.players(lower(name));

-- A player can appear for more than one club in a season (mid-season transfer),
-- hence team_id in the primary key.
create table if not exists public.player_season_stats (
  player_id          bigint  not null references public.players(id) on delete cascade,
  team_id            bigint  not null references public.teams(id) on delete cascade,
  league_id          bigint  not null references public.leagues(id) on delete cascade,
  season             integer not null,
  position           text,          -- Goalkeeper | Defender | Midfielder | Attacker
  apps               integer,
  lineups            integer,
  minutes            integer,
  rating             numeric(4,2),
  goals              integer,
  assists            integer,
  conceded           integer,
  saves              integer,
  shots_total        integer,
  shots_on           integer,
  passes_total       integer,
  passes_key         integer,
  passes_accuracy    integer,
  tackles            integer,
  blocks             integer,
  interceptions      integer,
  duels_total        integer,
  duels_won          integer,
  dribbles_attempts  integer,
  dribbles_success   integer,
  fouls_drawn        integer,
  fouls_committed    integer,
  yellow             integer,
  red                integer,
  pen_scored         integer,
  pen_missed         integer,
  updated_at         timestamptz not null default now(),
  primary key (player_id, team_id, season)
);
create index if not exists pss_league_season_idx on public.player_season_stats(league_id, season);
create index if not exists pss_position_idx      on public.player_season_stats(league_id, season, position);
create index if not exists pss_team_idx          on public.player_season_stats(team_id, season);

-- Per-90 / per-appearance values are computed, never stored, so a formula fix
-- never needs a re-ingest. Scout Mode reads this view.
create or replace view public.player_season_rates as
select
  s.player_id, s.team_id, s.league_id, s.season, s.position,
  p.name, p.age, p.nationality, p.height_cm, p.photo_url, p.injured,
  t.name as club_name,
  s.apps, s.minutes, s.rating,
  case when s.apps > 0 then round(s.goals::numeric        / s.apps, 3) end as goals_pg,
  case when s.apps > 0 then round(s.assists::numeric      / s.apps, 3) end as assists_pg,
  case when s.apps > 0 then round(s.passes_key::numeric   / s.apps, 3) end as key_passes_pg,
  case when s.apps > 0 then round(s.tackles::numeric      / s.apps, 3) end as tackles_pg,
  case when s.apps > 0 then round(s.interceptions::numeric/ s.apps, 3) end as interceptions_pg,
  case when s.apps > 0 then round(s.shots_on::numeric     / s.apps, 3) end as shots_on_tgt_pg,
  case when s.apps > 0 then round(s.saves::numeric        / s.apps, 3) end as saves_pg,
  case when s.apps > 0 then round(s.conceded::numeric     / s.apps, 3) end as gc_pg,
  s.passes_accuracy as pass_acc,
  case when s.duels_total > 0
       then round(100.0 * s.duels_won / s.duels_total, 2) end as duels_won_pct
from public.player_season_stats s
join public.players p on p.id = s.player_id
join public.teams   t on t.id = s.team_id;

-- ---------------------------------------------------------------------------
-- news_items — RSS ingestion
-- Headline, short summary and link only. Never full article text: storing that
-- would be republishing, not linking.
-- ---------------------------------------------------------------------------
create table if not exists public.news_items (
  id            bigserial primary key,
  source        text not null,          -- 'ge' | 'espn_br' | 'bbc' | 'sky'
  source_guid   text not null,
  url           text not null,
  title         text not null,
  summary       text,
  image_url     text,
  published_at  timestamptz,
  lang          text,                   -- 'pt-BR' | 'en'
  content_hash  text,                   -- sha256(title|url), dedupe fallback
  created_at    timestamptz not null default now(),
  unique (source, source_guid)
);
create index if not exists news_published_idx on public.news_items(published_at desc);
create unique index if not exists news_hash_idx on public.news_items(content_hash);

create table if not exists public.news_item_teams (
  news_item_id  bigint not null references public.news_items(id) on delete cascade,
  team_id       bigint not null references public.teams(id) on delete cascade,
  confidence    numeric(3,2) default 1.0,
  primary key (news_item_id, team_id)
);
create index if not exists nit_team_idx on public.news_item_teams(team_id);

-- ---------------------------------------------------------------------------
-- ingest_runs — observability + the resumable cursor for the paged player job
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_runs (
  id             bigserial primary key,
  job            text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  ok             boolean,
  requests_used  integer default 0,
  rows_written   integer default 0,
  error          text,
  cursor         jsonb,      -- e.g. {"league_id":71,"page":7} so a timed-out
                             -- players run resumes instead of restarting
  created_at     timestamptz not null default now()
);
create index if not exists ingest_runs_job_idx on public.ingest_runs(job, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS — public read on everything, writes only via service_role (bypasses RLS)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'leagues','teams','team_aliases','standings','fixtures','fixture_stats',
    'team_season_stats','league_averages','players','player_season_stats',
    'news_items','news_item_teams'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s: public read" on public.%I', t, t);
    execute format(
      'create policy "%s: public read" on public.%I for select to anon, authenticated using (true)',
      t, t);
  end loop;
end $$;

-- ingest_runs is operational telemetry, not public content: no read policy at
-- all, so anon and authenticated get nothing. Felipe reads it in the dashboard.
alter table public.ingest_runs enable row level security;
revoke all on public.ingest_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
--
-- Every `create table` above is `if not exists`, which means that on a database
-- where an earlier version of this file has ALREADY run, those statements are
-- no-ops and any column added later would never appear. This section closes
-- that gap so the whole file is safe to re-run and always brings an existing
-- database up to date.
--
-- Put every future additive change here as well. `add column if not exists` is
-- a no-op on a fresh database where the create already included the column.
--
-- 2026-09-23 - xG. The R0 probe showed /fixtures/statistics returns 18 stat
-- types, not the 16 originally mapped: `expected_goals` and `goals_prevented`
-- were being discarded. xg_pg / xga_pg / goals_prevented on team_season_stats
-- are where R5 aggregates them.
-- ---------------------------------------------------------------------------
alter table public.fixture_stats
  add column if not exists expected_goals   numeric(5,2),
  add column if not exists goals_prevented  numeric(5,2);

alter table public.team_season_stats
  add column if not exists xg_pg            numeric(6,3),
  add column if not exists xga_pg           numeric(6,3),
  add column if not exists goals_prevented  numeric(6,3);

-- 2026-09-23 - standings groups. The first live run of /api/cron/standings died
-- with Postgres 21000, "ON CONFLICT DO UPDATE command cannot affect row a
-- second time". `league.standings` is an array of GROUPS: Brazil returns one,
-- but Argentina returns zone tables PLUS aggregate tables (tabla anual,
-- promedios) and the same team appears in several of them, so the flattened
-- batch contained a team twice and collided on (league_id, season, team_id).
-- The job now keeps the best rank per team; this records which table that rank
-- came from, so an Argentine "rank 3" is interpretable.
alter table public.standings
  add column if not exists group_label text;

commit;

-- ---------------------------------------------------------------------------
-- Seed the seven leagues. league 71 = Série A (Brazil) is CONFIRMED against
-- tests/fixtures/api-football/leagues.json. The other six api_league_id values
-- are the documented API-Football ids and should be spot-checked after the
-- first /api/cron/teams run (a wrong id yields zero teams for that league).
-- ---------------------------------------------------------------------------
insert into public.leagues (api_league_id, slug, name, country, flag, tier, current_season, active) values
  ( 71, 'serie_a',        'Série A',            'Brazil',    '🇧🇷', 1, 2026, true),
  ( 39, 'premier_league', 'Premier League',     'England',   '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 1, 2026, true),
  (140, 'la_liga',        'La Liga',            'Spain',     '🇪🇸', 1, 2026, true),
  ( 78, 'bundesliga',     'Bundesliga',         'Germany',   '🇩🇪', 1, 2026, true),
  (135, 'serie_a_it',     'Serie A',            'Italy',     '🇮🇹', 1, 2026, true),
  ( 61, 'ligue_1',        'Ligue 1',            'France',    '🇫🇷', 1, 2026, true),
  (128, 'argentina',      'Liga Profesional',   'Argentina', '🇦🇷', 1, 2026, true)
on conflict (api_league_id) do update
  set slug = excluded.slug,
      name = excluded.name,
      country = excluded.country,
      flag = excluded.flag,
      current_season = excluded.current_season,
      active = excluded.active,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- team_aliases — RSS club tagging
--
-- API-Football returns unaccented, sometimes abbreviated names ("Sao Paulo",
-- "Gremio", "Atletico-MG", "Vasco DA Gama"), while Brazilian and British press
-- use nicknames. Without these rows the news tagger silently matches nothing.
--
-- Joined on teams.name so a spelling that does not exist yet simply inserts
-- nothing instead of attaching an alias to the wrong club. Re-runnable: run it
-- again after /api/cron/teams to pick up any that did not match first time.
--
-- Deliberately OMITTED as too ambiguous for a plain-text matcher:
--   "Inter" (Internacional vs Inter Milan), "United", "City", "Tricolor",
--   "FFC" (Fulham vs Fluminense), "Juventus"/"Ju", bare "Leao" (Fortaleza,
--   Remo and Mirassol all use it) and bare "Alvinegro" (Santos, Botafogo,
--   Corinthians, Atletico-MG).
-- Keep every alias unique across leagues; the matcher is longest-match-first.
--
-- Squad churn: this list covers the 2024 AND 2026 Serie A fields, so five rows
-- are for currently-relegated clubs and attach to nothing. That is intentional
-- and costs nothing. Re-run this block after every promotion/relegation.
-- ---------------------------------------------------------------------------
insert into public.team_aliases (team_id, alias)
select t.id, a.alias
from (values
  -- Serie A (Brazil) - team names confirmed from the R0 probe
  ('Flamengo','Mengao'),('Flamengo','Mengão'),('Flamengo','Rubro-Negro'),('Flamengo','CRF'),
  ('Palmeiras','Verdao'),('Palmeiras','Verdão'),('Palmeiras','SEP'),('Palmeiras','Alviverde'),
  ('Botafogo','Fogao'),('Botafogo','Fogão'),('Botafogo','Glorioso'),('Botafogo','BFR'),
  ('Fluminense','Fluminense FC'),('Fluminense','Tricolor Carioca'),
  ('Sao Paulo','São Paulo'),('Sao Paulo','SPFC'),('Sao Paulo','Tricolor Paulista'),
  ('Corinthians','Timao'),('Corinthians','Timão'),('Corinthians','SCCP'),('Corinthians','Coringao'),
  ('Gremio','Grêmio'),('Gremio','Imortal'),('Gremio','Tricolor Gaucho'),
  ('Internacional','Colorado'),('Internacional','SC Internacional'),('Internacional','Inter de Porto Alegre'),
  ('Cruzeiro','Raposa'),('Cruzeiro','Cabuloso'),
  ('Atletico-MG','Atlético-MG'),('Atletico-MG','Atletico Mineiro'),('Atletico-MG','Atlético Mineiro'),('Atletico-MG','Galo'),
  ('Vasco DA Gama','Vasco'),('Vasco DA Gama','Vasco da Gama'),('Vasco DA Gama','Gigante da Colina'),
  ('Bahia','EC Bahia'),('Bahia','Esquadrao de Aco'),('Bahia','Tricolor de Aço'),
  ('Fortaleza EC','Fortaleza'),('Fortaleza EC','Leao do Pici'),
  ('Atletico Paranaense','Athletico-PR'),('Atletico Paranaense','Athletico Paranaense'),('Atletico Paranaense','Furacão'),
  ('RB Bragantino','Bragantino'),('RB Bragantino','Red Bull Bragantino'),('RB Bragantino','Massa Bruta'),
  ('Vitoria','Vitória'),('Vitoria','EC Vitoria'),('Vitoria','Leao da Barra'),
  ('Juventude','EC Juventude'),('Juventude','Papo'),
  ('Criciuma','Criciúma'),('Criciuma','Tigre'),
  ('Atletico Goianiense','Atlético-GO'),('Atletico Goianiense','Atletico-GO'),('Atletico Goianiense','Dragao'),
  ('Cuiaba','Cuiabá'),('Cuiaba','Dourado'),
  -- Promoted into the 2026 division (the five rows above them were relegated;
  -- those aliases simply will not attach until the clubs come back up).
  ('Santos','Peixe'),('Santos','Santos FC'),('Santos','Alvinegro Praiano'),
  ('Chapecoense-sc','Chapecoense'),('Chapecoense-sc','Chape'),
  ('Coritiba','Coxa'),('Coritiba','Coxa Branca'),('Coritiba','Coritiba FC'),
  ('Remo','Clube do Remo'),('Remo','Leao Azul'),('Remo','Leão Azul'),
  ('Mirassol','Mirassol FC'),
  -- Premier League - names not yet probed; unmatched rows are simply skipped
  ('Manchester United','Man Utd'),('Manchester United','Man United'),('Manchester United','MUFC'),('Manchester United','Red Devils'),
  ('Manchester City','Man City'),('Manchester City','MCFC'),('Manchester City','Citizens'),
  ('Liverpool','LFC'),('Liverpool','The Reds'),
  ('Arsenal','AFC'),('Arsenal','Gunners'),
  ('Chelsea','CFC'),('Chelsea','The Blues'),
  ('Tottenham','Spurs'),('Tottenham','Tottenham Hotspur'),('Tottenham','THFC'),
  ('Newcastle','Newcastle United'),('Newcastle','Magpies'),('Newcastle','NUFC'),
  ('Aston Villa','Villa'),('Aston Villa','AVFC'),
  ('West Ham','West Ham United'),('West Ham','Hammers'),('West Ham','WHUFC'),
  ('Brighton','Brighton & Hove Albion'),('Brighton','Seagulls'),('Brighton','BHAFC'),
  ('Wolves','Wolverhampton Wanderers'),('Wolves','Wolverhampton'),
  ('Nottingham Forest','Forest'),('Nottingham Forest','NFFC'),
  ('Everton','Toffees'),('Everton','EFC'),
  ('Fulham','Cottagers'),
  ('Crystal Palace','Palace'),('Crystal Palace','CPFC'),('Crystal Palace','Eagles'),
  ('Brentford','Bees'),
  ('Bournemouth','AFC Bournemouth'),('Bournemouth','Cherries'),
  ('Leicester','Leicester City'),('Leicester','Foxes'),('Leicester','LCFC'),
  ('Southampton','Saints'),('Southampton','SFC'),
  ('Ipswich','Ipswich Town'),('Ipswich','Tractor Boys'),
  ('Leeds','Leeds United'),('Leeds','Whites'),
  ('Burnley','Clarets'),
  ('Sunderland','Black Cats'),('Sunderland','SAFC')
) as a(team_name, alias)
join public.teams t on t.name = a.team_name
on conflict (team_id, alias) do nothing;

-- ---------------------------------------------------------------------------
-- VERIFY
--   select slug, current_season, active from public.leagues order by slug;
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename in ('fixtures','players','news_items');
--
-- After running /api/cron/teams, check the alias seed landed. Re-running this
-- whole migration is safe and will fill in anything that missed:
--   select l.slug, count(distinct t.id) as teams, count(a.alias) as aliases
--     from public.teams t
--     join public.leagues l on l.id = t.league_id
--     left join public.team_aliases a on a.team_id = t.id
--    group by l.slug order by l.slug;
--
-- Any Premier League club showing 0 aliases means API-Football spells its name
-- differently from the guess above - read the real name and add a row.
-- ---------------------------------------------------------------------------
