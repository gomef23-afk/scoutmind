-- 017_scout_game.sql — the Scout Game, part 1: rounds, picks, scores, results.
--
-- Run in the Supabase SQL editor BEFORE pushing the job that calls these
-- functions. Safe to run more than once. Depends on 015 (player_fixture_stats,
-- fixture_events) and 016 (the tier formula behind league_position_rates).
--
-- WHAT THE GAME IS
-- ---------------------------------------------------------------------------
-- Free, points only, nothing of value to win. Per competition per round a
-- player picks 5 footballers and names one captain. Each pick scores base
-- points from what that footballer did in the round (api/_lib/scout-game.js
-- holds the table), times a multiplier from his TIER: the quintile of his
-- season so far within his league and position. Tier 5 (the obvious names)
-- pays least and tier 1 most, so spotting a player nobody rates pays more.
-- The ladder itself lives in api/_lib/scout-game.js (1x .. 1.35x since the
-- backtest in docs/backtest-2026-11.md; 018 widened locked_multiplier for it).
--
-- WHERE THE RULES LIVE
-- ---------------------------------------------------------------------------
-- * The tier formula is here, in player_tiers_at(), so the lock step and the
--   backtest compute the same tier from the same rows.
-- * The points table, the multiplier ladder, the captain rule and the 6x cap
--   live in api/_lib/scout-game.js. The lock step is handed the ladder by the
--   job, so the numbers are written down exactly once.
--
-- SCOPE: regular-season rounds only, in every league. Argentina's Apertura
-- knockouts (Round of 16 to Final) are left out for now.
--
-- Rule 13 applies: nothing in api/ deletes from these tables, and these
-- functions never delete either. A fixture that leaves a round's window is
-- flagged (counts = false), not removed.

begin;

-- ---------------------------------------------------------------------------
-- 1. TABLES (keys first; every later column in SCHEMA PATCHES)
-- ---------------------------------------------------------------------------
create table if not exists public.game_rounds (
  id            bigserial primary key,
  league_id     bigint  not null references public.leagues(id),
  season        integer not null,
  round_label   text    not null,
  unique (league_id, season, round_label)
);

-- Which fixtures a round scores. `counts` is false for a fixture played
-- outside the round's window (postponed, cancelled, abandoned).
create table if not exists public.game_round_fixtures (
  round_id      bigint not null references public.game_rounds(id),
  fixture_id    bigint not null references public.fixtures(id),
  primary key (round_id, fixture_id)
);

create table if not exists public.game_entries (
  id            bigserial primary key,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  round_id      bigint not null references public.game_rounds(id),
  unique (user_id, round_id)
);

-- Five rows per entry, one per slot. The locked_* columns are written once,
-- at the deadline, by lock_due_rounds(): the tier cannot change afterwards.
create table if not exists public.game_picks (
  entry_id      bigint   not null references public.game_entries(id) on delete cascade,
  slot          smallint not null check (slot between 1 and 5),
  primary key (entry_id, slot)
);

-- One row per pick per fixture it scored in. Recomputed, never incremented.
create table if not exists public.game_pick_scores (
  entry_id      bigint   not null,
  slot          smallint not null,
  fixture_id    bigint   not null references public.fixtures(id),
  primary key (entry_id, slot, fixture_id),
  foreign key (entry_id, slot) references public.game_picks(entry_id, slot) on delete cascade
);

create table if not exists public.game_round_results (
  user_id       uuid   not null references auth.users(id) on delete cascade,
  round_id      bigint not null references public.game_rounds(id),
  primary key (user_id, round_id)
);

create table if not exists public.badges (
  id            text primary key
);

create table if not exists public.user_badges (
  user_id       uuid not null references auth.users(id) on delete cascade,
  badge_id      text not null references public.badges(id),
  primary key (user_id, badge_id)
);

-- One row of tunable settings. torcida_min_members is 3 for the beta (~90
-- accounts) and goes to 5 later: one UPDATE, no deploy.
create table if not exists public.game_config (
  id            boolean primary key default true check (id)
);

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES
-- ---------------------------------------------------------------------------
alter table public.game_rounds
  add column if not exists round_no      integer,
  add column if not exists deadline_utc  timestamptz,
  add column if not exists closes_utc    timestamptz,
  add column if not exists fixture_count integer,
  add column if not exists status        text not null default 'open',
  add column if not exists participants  integer,
  add column if not exists locked_at     timestamptz,
  add column if not exists finalized_at  timestamptz,
  add column if not exists updated_at    timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_rounds_status_check') then
    alter table public.game_rounds
      add constraint game_rounds_status_check check (status in ('open', 'locked', 'final'));
  end if;
end $$;

create index if not exists game_rounds_deadline_idx on public.game_rounds (status, deadline_utc);

alter table public.game_round_fixtures
  add column if not exists counts boolean not null default true;
create index if not exists game_round_fixtures_fixture_idx on public.game_round_fixtures (fixture_id);

alter table public.game_entries
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();
create index if not exists game_entries_round_idx on public.game_entries (round_id);

alter table public.game_picks
  add column if not exists user_id              uuid,
  add column if not exists round_id             bigint,
  add column if not exists player_id            bigint references public.players(id),
  add column if not exists is_captain           boolean not null default false,
  add column if not exists locked_tier          smallint,      -- null = below the minutes threshold
  add column if not exists locked_multiplier    numeric(4,2),  -- two decimals: 1.05, 1.35 (018)
  add column if not exists locked_ownership_pct numeric(5,2),
  add column if not exists locked_contrarian    boolean,
  add column if not exists locked_at            timestamptz,
  add column if not exists updated_at           timestamptz not null default now();
create index if not exists game_picks_round_idx on public.game_picks (round_id, player_id);

alter table public.game_pick_scores
  add column if not exists round_id     bigint,
  add column if not exists player_id    bigint,
  add column if not exists base_points  numeric(6,1),
  add column if not exists breakdown    jsonb,
  add column if not exists multiplier   numeric(4,2),
  add column if not exists is_captain   boolean,
  add column if not exists contrarian   boolean,
  add column if not exists total        numeric(7,2),
  add column if not exists scored_at    timestamptz not null default now();
create index if not exists game_pick_scores_round_idx on public.game_pick_scores (round_id);

alter table public.game_round_results
  add column if not exists total          numeric(8,2) not null default 0,
  add column if not exists captain_points numeric(8,2) not null default 0,
  add column if not exists picks_scored   integer not null default 0,
  add column if not exists streak         integer not null default 1,
  add column if not exists submitted_at   timestamptz,
  add column if not exists updated_at     timestamptz not null default now();

alter table public.badges
  add column if not exists name        text,
  add column if not exists description text,
  add column if not exists sort        integer;

alter table public.user_badges
  add column if not exists round_id  bigint references public.game_rounds(id),
  add column if not exists earned_at timestamptz not null default now();

alter table public.game_config
  add column if not exists torcida_min_members integer not null default 3;

insert into public.game_config (id) values (true) on conflict (id) do nothing;

-- The eight badges. Rules are in refresh_game_results() below; nothing here
-- refers to money or anything of value.
insert into public.badges (id, name, description, sort) values
  ('debut',               'Debut',               'Played your first round to the end.', 1),
  ('on_a_run',            'On a run',            'Three rounds in a row in one competition.', 2),
  ('ever_present',        'Ever-present',        'Ten rounds in a row in one competition.', 3),
  ('captains_hat_trick',  'Captain''s hat-trick', 'Your captain scored three goals in one match.', 4),
  ('against_the_grain',   'Against the grain',   'A pick fewer than 5% chose scored 10 points or more.', 5),
  ('talent_spotter',      'Talent spotter',      'A tier-1 or unranked pick scored 8 base points or more.', 6),
  ('top_of_the_torcida',  'Top of the torcida',  'First among your club''s fans in a round.', 7),
  ('top_ten_percent',     'Top 10%',             'Finished a round in the top 10% of its competition.', 8)
on conflict (id) do update set name = excluded.name, description = excluded.description, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- 2. player_tiers_at(league, season, as_of) — the tier at a point in time
-- ---------------------------------------------------------------------------
-- The 016 formula, restricted to fixtures that kicked off before `as_of`, so
-- a round is tiered on what was known at its deadline. Per player per
-- competition, summed across clubs (a transfer inside a league keeps one
-- tier); the club is the one he played for most recently.
--
-- Qualifying: minutes >= max(270, 30% of his club's minutes so far) and a
-- known position. Per-90s are z-scored against the qualifying players of the
-- same position; an SD of 0 or null gives a z of 0. Composites (Day 2):
--   F  goals .5, shots on target .2, assists .2, rating .1
--   M  assists .3, key passes .3, goals .2, rating .2
--   D  rating .5, clean-sheet rate .3, assists + key passes .2
--   G  saves .4, clean-sheet rate .4, rating .2
-- Tier = quintile of the composite within position, 1 lowest to 5 highest.
-- Below the threshold: tier null (the "unranked" default applies).
create or replace function public.player_tiers_at(p_league_id bigint, p_season integer, p_as_of timestamptz)
returns table (player_id bigint, team_id bigint, "position" text, apps integer, minutes integer,
               tier smallint, composite numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with fx as (
    select f.id, f.kickoff_utc, f.home_team_id, f.away_team_id
      from public.fixtures f
     where f.league_id = p_league_id
       and f.season = p_season
       and f.status_short in ('FT', 'AET', 'PEN')
       and f.kickoff_utc < p_as_of
  ),
  r as (
    select s.player_id, s.team_id, s."position", s.minutes, s.goals, s.assists, s.shots_on,
           s.passes_key, s.saves, s.rating, s.clean_sheet, fx.kickoff_utc
      from public.player_fixture_stats s
      join fx on fx.id = s.fixture_id
  ),
  latest as (
    select distinct on (r.player_id) r.player_id, r.team_id
      from r order by r.player_id, r.kickoff_utc desc
  ),
  pos as (
    select distinct on (r.player_id) r.player_id, r."position"
      from r where r."position" is not null
     group by r.player_id, r."position"
     order by r.player_id, sum(r.minutes) desc, r."position"
  ),
  club_matches as (
    select x.team_id, count(*) as matches
      from (select fx.home_team_id as team_id from fx union all select fx.away_team_id from fx) x
     group by x.team_id
  ),
  agg as (
    select r.player_id,
           count(*)                              as apps,
           sum(r.minutes)                        as minutes,
           sum(coalesce(r.goals, 0))             as goals,
           sum(coalesce(r.assists, 0))           as assists,
           sum(coalesce(r.shots_on, 0))          as shots_on,
           sum(coalesce(r.passes_key, 0))        as passes_key,
           sum(coalesce(r.saves, 0))             as saves,
           avg(r.rating)                         as rating,
           count(*) filter (where r.clean_sheet) as cs
      from r group by r.player_id
  ),
  p as (
    select a.player_id, l.team_id, pos."position", a.apps, a.minutes, a.rating,
           (pos."position" is not null
             and a.minutes >= greatest(270, 0.3 * coalesce(cm.matches, 0) * 90)) as qualifies,
           90.0 * a.goals      / a.minutes as g90,
           90.0 * a.assists    / a.minutes as a90,
           90.0 * a.shots_on   / a.minutes as s90,
           90.0 * a.passes_key / a.minutes as k90,
           90.0 * (a.assists + a.passes_key) / a.minutes as ak90,
           90.0 * a.saves      / a.minutes as sv90,
           a.cs::numeric / a.apps          as csr
      from agg a
      join latest l on l.player_id = a.player_id
      left join pos on pos.player_id = a.player_id
      left join club_matches cm on cm.team_id = l.team_id
     where a.minutes > 0
  ),
  b as (
    select q."position",
           avg(q.g90)  as g_m,  stddev_samp(q.g90)  as g_s,
           avg(q.a90)  as a_m,  stddev_samp(q.a90)  as a_s,
           avg(q.s90)  as s_m,  stddev_samp(q.s90)  as s_s,
           avg(q.k90)  as k_m,  stddev_samp(q.k90)  as k_s,
           avg(q.ak90) as ak_m, stddev_samp(q.ak90) as ak_s,
           avg(q.sv90) as sv_m, stddev_samp(q.sv90) as sv_s,
           avg(q.rating) as r_m, stddev_samp(q.rating) as r_s,
           avg(q.csr)  as c_m,  stddev_samp(q.csr)  as c_s
      from p q where q.qualifies group by q."position"
  ),
  z as (
    select p.*,
           case when b.g_s  > 0 then (p.g90  - b.g_m)  / b.g_s  else 0 end as zg,
           case when b.a_s  > 0 then (p.a90  - b.a_m)  / b.a_s  else 0 end as za,
           case when b.s_s  > 0 then (p.s90  - b.s_m)  / b.s_s  else 0 end as zs,
           case when b.k_s  > 0 then (p.k90  - b.k_m)  / b.k_s  else 0 end as zk,
           case when b.ak_s > 0 then (p.ak90 - b.ak_m) / b.ak_s else 0 end as zak,
           case when b.sv_s > 0 then (p.sv90 - b.sv_m) / b.sv_s else 0 end as zsv,
           case when b.r_s  > 0 and p.rating is not null then (p.rating - b.r_m) / b.r_s else 0 end as zr,
           case when b.c_s  > 0 then (p.csr  - b.c_m)  / b.c_s  else 0 end as zc
      from p left join b on b."position" = p."position"
  ),
  c as (
    select z.*,
           case z."position"
             when 'G' then 0.4 * z.zsv + 0.4 * z.zc + 0.2 * z.zr
             when 'D' then 0.5 * z.zr  + 0.3 * z.zc + 0.2 * z.zak
             when 'M' then 0.3 * z.za  + 0.3 * z.zk + 0.2 * z.zg + 0.2 * z.zr
             else          0.5 * z.zg  + 0.2 * z.zs + 0.2 * z.za + 0.1 * z.zr
           end as comp
      from z
  )
  select c.player_id, c.team_id, c."position", c.apps::integer, c.minutes::integer,
         case when c.qualifies
              then (ntile(5) over (partition by c."position", c.qualifies order by c.comp, c.player_id))::smallint
         end as tier,
         round(c.comp, 4) as composite
    from c;
$$;

comment on function public.player_tiers_at(bigint, integer, timestamptz) is
  'Scout Game tier per player in one competition, from fixtures that kicked off before as_of. 1 = lowest quintile of the position composite, 5 = highest, null = below max(270, 30% of club minutes).';

-- ---------------------------------------------------------------------------
-- 3. sync_game_rounds() — rounds and their windows, from fixtures
-- ---------------------------------------------------------------------------
-- A round is (league, season, round label) for a regular-season label
-- ("Regular Season - 34", "Apertura - 7", "Clausura - 7"; knockouts excluded).
-- Deadline: the earliest kickoff among its fixtures that are not postponed,
-- cancelled, abandoned or awarded. Window: from the deadline until the next
-- round's deadline, or 6 days, whichever is sooner. A fixture outside it is
-- not scored for this round.
--
-- Open rounds follow the fixtures; a locked round's deadline and window are
-- frozen. Fixture flags keep updating until a round is final, so a game
-- rescheduled inside the window still counts.
create or replace function public.sync_game_rounds()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rounds integer;
begin
  with r as (
    select f.league_id, f.season, f.round as round_label,
           min(f.kickoff_utc) filter (where f.status_short not in ('PST','CANC','ABD','AWD','WO')) as deadline,
           count(*)           filter (where f.status_short not in ('PST','CANC','ABD','AWD','WO')) as fixture_n
      from public.fixtures f
      join public.leagues l on l.id = f.league_id and l.active and l.current_season = f.season
     where f.round ~ ' - [0-9]+$'
     group by f.league_id, f.season, f.round
  ),
  w as (
    select r.*,
           least(
             (select min(r2.deadline) from r r2
               where r2.league_id = r.league_id and r2.season = r.season and r2.deadline > r.deadline),
             r.deadline + interval '6 days') as closes
      from r
     where r.deadline is not null
  )
  -- A round first seen after its deadline was never playable (the game did not
  -- exist yet): it starts locked, or final once its window has closed, so the
  -- lock step never has to process a backlog of empty historical rounds.
  insert into public.game_rounds as g
    (league_id, season, round_label, round_no, deadline_utc, closes_utc, fixture_count, status)
  select w.league_id, w.season, w.round_label,
         substring(w.round_label from '([0-9]+)$')::integer,
         w.deadline, coalesce(w.closes, w.deadline + interval '6 days'), w.fixture_n,
         case when coalesce(w.closes, w.deadline + interval '6 days') + interval '1 day' < now() then 'final'
              when w.deadline <= now() then 'locked'
              else 'open' end
    from w
  on conflict (league_id, season, round_label) do update set
    round_no      = excluded.round_no,
    deadline_utc  = excluded.deadline_utc,
    closes_utc    = excluded.closes_utc,
    fixture_count = excluded.fixture_count,
    updated_at    = now()
  where g.status = 'open';
  get diagnostics v_rounds = row_count;

  -- Every round gets its fixture rows (historical ones too: the backtest scores
  -- them); only rounds that are not final keep updating their flags.
  insert into public.game_round_fixtures (round_id, fixture_id, counts)
  select g.id, f.id,
         (f.status_short not in ('PST','CANC','ABD','AWD','WO')
          and f.kickoff_utc >= g.deadline_utc and f.kickoff_utc < g.closes_utc)
    from public.game_rounds g
    join public.fixtures f
      on f.league_id = g.league_id and f.season = g.season and f.round = g.round_label
  on conflict (round_id, fixture_id) do nothing;

  update public.game_round_fixtures gf
     set counts = x.counts
    from (
      select g.id as round_id, f.id as fixture_id,
             (f.status_short not in ('PST','CANC','ABD','AWD','WO')
              and f.kickoff_utc >= g.deadline_utc and f.kickoff_utc < g.closes_utc) as counts
        from public.game_rounds g
        join public.fixtures f
          on f.league_id = g.league_id and f.season = g.season and f.round = g.round_label
       where g.status <> 'final'
    ) x
   where gf.round_id = x.round_id and gf.fixture_id = x.fixture_id
     and gf.counts is distinct from x.counts;

  return v_rounds;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. lock_due_rounds(ladder, unranked, contrarian %, min participants)
-- ---------------------------------------------------------------------------
-- For every open round whose deadline has passed: snapshot each pick's tier
-- AT THE DEADLINE, its multiplier from the ladder the job passes in, its
-- ownership in this round, and whether it is contrarian (ownership under the
-- threshold, with enough participants for that to mean anything). Then lock.
-- Returns the ids of the rounds it locked.
create or replace function public.lock_due_rounds(
  p_ladder jsonb, p_unranked numeric, p_contrarian_pct numeric, p_contrarian_min integer)
returns setof bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  v_n integer;
begin
  for r in
    select * from public.game_rounds
     where status = 'open' and deadline_utc <= now()
     order by deadline_utc
  loop
    select count(*) into v_n from public.game_entries e where e.round_id = r.id;

    -- Nobody played: nothing to snapshot, and no reason to compute tiers.
    if v_n = 0 then
      update public.game_rounds
         set status = 'locked', locked_at = now(), participants = 0, updated_at = now()
       where id = r.id;
      return next r.id;
      continue;
    end if;

    with t as (
      select * from public.player_tiers_at(r.league_id, r.season, r.deadline_utc)
    ),
    own as (
      select gp.player_id, 100.0 * count(distinct gp.entry_id) / nullif(v_n, 0) as pct
        from public.game_picks gp where gp.round_id = r.id
       group by gp.player_id
    )
    update public.game_picks gp
       set locked_tier          = (select t.tier from t where t.player_id = gp.player_id),
           locked_multiplier    = coalesce(
                                    (p_ladder ->> ((select t.tier from t where t.player_id = gp.player_id))::text)::numeric,
                                    p_unranked),
           locked_ownership_pct = (select round(own.pct, 2) from own where own.player_id = gp.player_id),
           locked_contrarian    = (v_n >= p_contrarian_min
                                   and coalesce((select own.pct from own where own.player_id = gp.player_id), 100) < p_contrarian_pct),
           locked_at            = now()
     where gp.round_id = r.id;

    update public.game_rounds
       set status = 'locked', locked_at = now(), participants = v_n, updated_at = now()
     where id = r.id;

    return next r.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. submit_picks(round, five players, captain) — the only way to write picks
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the browser holds no write grant on any game
-- table. Every rule is checked here, as the signed-in user, in one
-- transaction: before the deadline, five different players, captain among
-- them, at most one goalkeeper, every player has played in this competition
-- this season and his club plays in this round. Re-submitting before the
-- deadline replaces the five picks and moves submitted_at (the last
-- tie-breaker) to now.
create or replace function public.submit_picks(p_round_id bigint, p_player_ids bigint[], p_captain_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  r       public.game_rounds%rowtype;
  v_entry bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;

  select * into r from public.game_rounds where id = p_round_id;
  if not found then
    raise exception 'That round does not exist.';
  end if;
  if r.status <> 'open' or now() >= r.deadline_utc then
    raise exception 'This round is locked: picks closed at the first kickoff.';
  end if;

  if coalesce(array_length(p_player_ids, 1), 0) <> 5
     or (select count(distinct x) from unnest(p_player_ids) x) <> 5 then
    raise exception 'Pick five different players.';
  end if;
  if p_captain_id is null or not (p_captain_id = any(p_player_ids)) then
    raise exception 'Your captain must be one of your five.';
  end if;

  if exists (
    with pl as (select x as player_id from unnest(p_player_ids) x),
    info as (
      select pl.player_id,
             (select s.team_id from public.player_fixture_stats s
                join public.fixtures f on f.id = s.fixture_id
               where s.player_id = pl.player_id and f.league_id = r.league_id and f.season = r.season
               order by f.kickoff_utc desc limit 1) as team_id
        from pl
    )
    select 1 from info i
     where i.team_id is null
        or not exists (
             select 1 from public.game_round_fixtures gf
               join public.fixtures f on f.id = gf.fixture_id
              where gf.round_id = r.id and gf.counts
                and (f.home_team_id = i.team_id or f.away_team_id = i.team_id))
  ) then
    raise exception 'Every pick must have played in this competition this season, for a club that plays in this round.';
  end if;

  if (
    select count(*) from unnest(p_player_ids) x
     where (select s."position" from public.player_fixture_stats s
              join public.fixtures f on f.id = s.fixture_id
             where s.player_id = x and f.league_id = r.league_id and f.season = r.season
               and s."position" is not null
             group by s."position" order by sum(s.minutes) desc limit 1) = 'G'
  ) > 1 then
    raise exception 'At most one goalkeeper.';
  end if;

  insert into public.game_entries as e (user_id, round_id, submitted_at, updated_at)
  values (v_uid, r.id, now(), now())
  on conflict (user_id, round_id) do update set submitted_at = now(), updated_at = now()
  returning e.id into v_entry;

  insert into public.game_picks as gp (entry_id, slot, user_id, round_id, player_id, is_captain, updated_at)
  select v_entry, i, v_uid, r.id, p_player_ids[i], p_player_ids[i] = p_captain_id, now()
    from generate_series(1, 5) i
  on conflict (entry_id, slot) do update set
    player_id = excluded.player_id, is_captain = excluded.is_captain, updated_at = now();

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. refresh_game_results(round_ids) — totals, streaks, final, badges
-- ---------------------------------------------------------------------------
-- Totals are recomputed from game_pick_scores, never incremented. Streak:
-- consecutive rounds of one competition with an entry, in deadline order.
-- A locked round becomes final a day after its window closes. Badges are
-- inserted once per user (on conflict do nothing), so re-running is harmless.
create or replace function public.refresh_game_results(p_round_ids bigint[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rows integer := 0;
  v_min  integer;
begin
  select torcida_min_members into v_min from public.game_config where id;

  insert into public.game_round_results as res
    (user_id, round_id, total, captain_points, picks_scored, submitted_at, updated_at)
  select e.user_id, e.round_id,
         coalesce(sum(s.total), 0),
         coalesce(sum(s.total) filter (where s.is_captain), 0),
         count(distinct s.slot),
         e.submitted_at, now()
    from public.game_entries e
    join public.game_rounds g on g.id = e.round_id and g.status <> 'open'
    left join public.game_pick_scores s on s.entry_id = e.id
   where e.round_id = any(coalesce(p_round_ids, '{}'))
   group by e.user_id, e.round_id, e.submitted_at
  on conflict (user_id, round_id) do update set
    total = excluded.total, captain_points = excluded.captain_points,
    picks_scored = excluded.picks_scored, submitted_at = excluded.submitted_at, updated_at = now();
  get diagnostics v_rows = row_count;

  with rr as (
    select g.id, g.league_id, g.season,
           row_number() over (partition by g.league_id, g.season order by g.deadline_utc, g.id) as rn
      from public.game_rounds g
  ),
  ue as (
    select e.user_id, rr.league_id, rr.season, e.round_id, rr.rn,
           rr.rn - row_number() over (partition by e.user_id, rr.league_id, rr.season order by rr.rn) as grp
      from public.game_entries e join rr on rr.id = e.round_id
  ),
  st as (
    select ue.user_id, ue.round_id,
           row_number() over (partition by ue.user_id, ue.league_id, ue.season, ue.grp order by ue.rn) as streak
      from ue
  )
  update public.game_round_results res
     set streak = st.streak
    from st
   where st.user_id = res.user_id and st.round_id = res.round_id
     and res.streak is distinct from st.streak;

  update public.game_rounds
     set status = 'final', finalized_at = now(), updated_at = now()
   where status = 'locked' and now() > closes_utc + interval '1 day';

  -- Badges. Final rounds only, except the streak badges, which a locked
  -- entry has already earned.
  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (res.user_id) res.user_id, 'debut', res.round_id
    from public.game_round_results res join public.game_rounds g on g.id = res.round_id and g.status = 'final'
   order by res.user_id, g.deadline_utc
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (res.user_id) res.user_id, 'on_a_run', res.round_id
    from public.game_round_results res where res.streak >= 3
   order by res.user_id, res.round_id
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (res.user_id) res.user_id, 'ever_present', res.round_id
    from public.game_round_results res where res.streak >= 10
   order by res.user_id, res.round_id
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (e.user_id) e.user_id, 'captains_hat_trick', s.round_id
    from public.game_pick_scores s join public.game_entries e on e.id = s.entry_id
   where s.is_captain and coalesce((s.breakdown -> 'goals' ->> 'count')::integer, 0) >= 3
   order by e.user_id, s.round_id
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (x.user_id) x.user_id, 'against_the_grain', x.round_id
    from (
      select e.user_id, s.round_id, s.entry_id, s.slot, sum(s.total) as pts
        from public.game_pick_scores s
        join public.game_entries e on e.id = s.entry_id
        join public.game_rounds g on g.id = s.round_id and g.status = 'final'
       where s.contrarian
       group by e.user_id, s.round_id, s.entry_id, s.slot
    ) x
   where x.pts >= 10
   order by x.user_id, x.round_id
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (x.user_id) x.user_id, 'talent_spotter', x.round_id
    from (
      select gp.user_id, gp.round_id, gp.entry_id, gp.slot, sum(s.base_points) as base
        from public.game_picks gp
        join public.game_pick_scores s on s.entry_id = gp.entry_id and s.slot = gp.slot
        join public.game_rounds g on g.id = gp.round_id and g.status = 'final'
       where gp.locked_tier is null or gp.locked_tier = 1
       group by gp.user_id, gp.round_id, gp.entry_id, gp.slot
    ) x
   where x.base >= 8
   order by x.user_id, x.round_id
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (x.user_id) x.user_id, 'top_of_the_torcida', x.round_id
    from (
      select res.user_id, res.round_id, pp.main_club_id,
             row_number() over (partition by res.round_id, pp.main_club_id
                                order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rk,
             count(*) over (partition by res.round_id, pp.main_club_id) as fans
        from public.game_round_results res
        join public.game_rounds g on g.id = res.round_id and g.status = 'final'
        join public.public_profiles pp on pp.id = res.user_id
       where pp.main_club_id is not null
    ) x
   where x.rk = 1 and x.fans >= v_min
   order by x.user_id, x.round_id
  on conflict do nothing;

  insert into public.user_badges (user_id, badge_id, round_id)
  select distinct on (x.user_id) x.user_id, 'top_ten_percent', x.round_id
    from (
      select res.user_id, res.round_id,
             row_number() over (partition by res.round_id
                                order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rk,
             count(*) over (partition by res.round_id) as n
        from public.game_round_results res
        join public.game_rounds g on g.id = res.round_id and g.status = 'final'
    ) x
   where x.n >= 50 and x.rk <= ceil(0.1 * x.n)
   order by x.user_id, x.round_id
  on conflict do nothing;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RANKINGS — views; ties broken by total, captain points, earliest final
--    submission, then user id, so every rank is unique and stable
-- ---------------------------------------------------------------------------
create or replace view public.game_round_rankings with (security_invoker = true) as
select res.round_id, g.league_id, g.season, g.round_label, g.status,
       res.user_id, pp.name, pp.main_club_id,
       res.total, res.captain_points, res.picks_scored, res.streak,
       row_number() over (partition by res.round_id
                          order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rank,
       count(*) over (partition by res.round_id) as participants
  from public.game_round_results res
  join public.game_rounds g on g.id = res.round_id
  left join public.public_profiles pp on pp.id = res.user_id
 where g.status <> 'open';

create or replace view public.game_competition_standings with (security_invoker = true) as
with t as (
  select g.league_id, g.season, res.user_id,
         sum(res.total) as total, sum(res.captain_points) as captain_points,
         count(*) as rounds_played, min(res.submitted_at) as first_submitted
    from public.game_round_results res
    join public.game_rounds g on g.id = res.round_id and g.status <> 'open'
   group by g.league_id, g.season, res.user_id
)
select t.*, pp.name, pp.main_club_id,
       row_number() over (partition by t.league_id, t.season
                          order by t.total desc, t.captain_points desc, t.first_submitted, t.user_id) as rank
  from t left join public.public_profiles pp on pp.id = t.user_id;

-- Overall: the sum across competitions, rounds played beside it.
create or replace view public.game_overall_standings with (security_invoker = true) as
with t as (
  select res.user_id,
         sum(res.total) as total, sum(res.captain_points) as captain_points,
         count(*) as rounds_played, count(distinct g.league_id) as competitions,
         min(res.submitted_at) as first_submitted
    from public.game_round_results res
    join public.game_rounds g on g.id = res.round_id and g.status <> 'open'
    join public.leagues l on l.id = g.league_id and l.current_season = g.season
   group by res.user_id
)
select t.*, pp.name, pp.main_club_id,
       row_number() over (order by t.total desc, t.captain_points desc, t.first_submitted, t.user_id) as rank
  from t left join public.public_profiles pp on pp.id = t.user_id;

-- Each fan's place among fans of the same main club.
create or replace view public.game_torcida_standings with (security_invoker = true) as
select o.user_id, o.name, o.main_club_id, o.total, o.rounds_played,
       row_number() over (partition by o.main_club_id
                          order by o.total desc, o.captain_points desc, o.first_submitted, o.user_id) as rank,
       count(*) over (partition by o.main_club_id) as members
  from public.game_overall_standings o
 where o.main_club_id is not null;

-- Clubs against each other: the mean of each club's top 10 fans, for clubs
-- with at least game_config.torcida_min_members playing.
create or replace view public.game_torcida_table with (security_invoker = true) as
with top as (
  select s.main_club_id, s.total, s.members from public.game_torcida_standings s where s.rank <= 10
),
t as (
  select top.main_club_id, max(top.members) as members, round(avg(top.total), 2) as top10_mean
    from top group by top.main_club_id
)
select t.main_club_id, tm.name as club, t.members, t.top10_mean,
       row_number() over (order by t.top10_mean desc, t.members desc, t.main_club_id) as rank
  from t
  join public.teams tm on tm.id = t.main_club_id
 where t.members >= (select c.torcida_min_members from public.game_config c where c.id);

-- ---------------------------------------------------------------------------
-- 8. RLS + GRANTS
-- ---------------------------------------------------------------------------
-- Browsers read; nothing in the browser writes a game table directly. Picks
-- go through submit_picks(); scores, results, rounds and badges are written by
-- the service role (the job), which bypasses RLS.
alter table public.game_rounds         enable row level security;
alter table public.game_round_fixtures enable row level security;
alter table public.game_entries        enable row level security;
alter table public.game_picks          enable row level security;
alter table public.game_pick_scores    enable row level security;
alter table public.game_round_results  enable row level security;
alter table public.badges              enable row level security;
alter table public.user_badges         enable row level security;
alter table public.game_config         enable row level security;

drop policy if exists "game_rounds: public read"         on public.game_rounds;
drop policy if exists "game_round_fixtures: public read" on public.game_round_fixtures;
drop policy if exists "game_entries: own, or after lock" on public.game_entries;
drop policy if exists "game_picks: own, or after lock"   on public.game_picks;
drop policy if exists "game_picks: insert only before the deadline" on public.game_picks;
drop policy if exists "game_picks: update only before the deadline" on public.game_picks;
drop policy if exists "game_picks: delete only before the deadline" on public.game_picks;
drop policy if exists "game_pick_scores: after lock"     on public.game_pick_scores;
drop policy if exists "game_round_results: after lock"   on public.game_round_results;
drop policy if exists "badges: public read"              on public.badges;
drop policy if exists "user_badges: public read"         on public.user_badges;
drop policy if exists "game_config: public read"         on public.game_config;

create policy "game_rounds: public read" on public.game_rounds
  for select to anon, authenticated using (true);
create policy "game_round_fixtures: public read" on public.game_round_fixtures
  for select to anon, authenticated using (true);

-- Your own entry and picks at any time; everyone's once the round is locked.
create policy "game_entries: own, or after lock" on public.game_entries
  for select to anon, authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.game_rounds g where g.id = round_id and g.status <> 'open'));
create policy "game_picks: own, or after lock" on public.game_picks
  for select to anon, authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.game_rounds g where g.id = round_id and g.status <> 'open'));

-- Belt and braces: authenticated holds no write grant on game_picks at all.
-- If one were ever granted, these restrictive policies would still refuse any
-- write once the deadline has passed.
create policy "game_picks: insert only before the deadline" on public.game_picks
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.game_rounds g
                       where g.id = round_id and g.status = 'open' and now() < g.deadline_utc));
create policy "game_picks: update only before the deadline" on public.game_picks
  as restrictive for update to authenticated
  using (exists (select 1 from public.game_rounds g
                  where g.id = round_id and g.status = 'open' and now() < g.deadline_utc))
  with check (exists (select 1 from public.game_rounds g
                       where g.id = round_id and g.status = 'open' and now() < g.deadline_utc));
create policy "game_picks: delete only before the deadline" on public.game_picks
  as restrictive for delete to authenticated
  using (exists (select 1 from public.game_rounds g
                  where g.id = round_id and g.status = 'open' and now() < g.deadline_utc));

create policy "game_pick_scores: after lock" on public.game_pick_scores
  for select to anon, authenticated
  using (exists (select 1 from public.game_rounds g where g.id = round_id and g.status <> 'open'));
create policy "game_round_results: after lock" on public.game_round_results
  for select to anon, authenticated
  using (exists (select 1 from public.game_rounds g where g.id = round_id and g.status <> 'open'));

create policy "badges: public read" on public.badges
  for select to anon, authenticated using (true);
create policy "user_badges: public read" on public.user_badges
  for select to anon, authenticated using (true);
create policy "game_config: public read" on public.game_config
  for select to anon, authenticated using (true);

grant select on public.game_rounds, public.game_round_fixtures, public.game_entries, public.game_picks,
                public.game_pick_scores, public.game_round_results, public.badges, public.user_badges,
                public.game_config
  to anon, authenticated;
revoke insert, update, delete on public.game_rounds, public.game_round_fixtures, public.game_entries,
                public.game_picks, public.game_pick_scores, public.game_round_results, public.badges,
                public.user_badges, public.game_config
  from anon, authenticated;

grant select on public.game_round_rankings, public.game_competition_standings, public.game_overall_standings,
                public.game_torcida_standings, public.game_torcida_table
  to anon, authenticated;
revoke insert, update, delete on public.game_round_rankings, public.game_competition_standings,
                public.game_overall_standings, public.game_torcida_standings, public.game_torcida_table
  from anon, authenticated;

-- Functions. Tiers read public data, so the backtest may call them with the
-- anon key. The writers run as the job (service role) only, except
-- submit_picks, which is the signed-in player's one door.
revoke all on function public.player_tiers_at(bigint, integer, timestamptz) from public;
grant execute on function public.player_tiers_at(bigint, integer, timestamptz) to anon, authenticated, service_role;

revoke all on function public.sync_game_rounds() from public, anon, authenticated;
revoke all on function public.lock_due_rounds(jsonb, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public.refresh_game_results(bigint[]) from public, anon, authenticated;
grant execute on function public.sync_game_rounds() to service_role;
grant execute on function public.lock_due_rounds(jsonb, numeric, numeric, integer) to service_role;
grant execute on function public.refresh_game_results(bigint[]) to service_role;

revoke all on function public.submit_picks(bigint, bigint[], bigint) from public, anon;
grant execute on function public.submit_picks(bigint, bigint[], bigint) to authenticated;

-- First sync, so rounds exist as soon as this has run.
select public.sync_game_rounds();

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Rounds per league match its regular-season round labels (knockouts excluded):
--   select l.slug,
--          (select count(distinct f.round) from public.fixtures f
--            where f.league_id = l.id and f.season = l.current_season and f.round ~ ' - [0-9]+$') as labels,
--          (select count(*) from public.game_rounds g where g.league_id = l.id and g.season = l.current_season) as rounds
--     from public.leagues l where l.active order by l.slug;
--
-- Historical rounds were created final or locked, never open. Expect 0:
--   select count(*) from public.game_rounds where status = 'open' and deadline_utc <= now() - interval '1 hour';
--
-- Every deadline is the first eligible kickoff of its round. Expect 0:
--   select count(*) from public.game_rounds g
--    where g.status = 'open' and g.deadline_utc <> (
--      select min(f.kickoff_utc) from public.fixtures f
--       where f.league_id = g.league_id and f.season = g.season and f.round = g.round_label
--         and f.status_short not in ('PST','CANC','ABD','AWD','WO'));
--
-- No Argentine knockout became a round. Expect 0:
--   select count(*) from public.game_rounds where round_label !~ ' - [0-9]+$';
--
-- Windows never overlap within a league. Expect 0:
--   select count(*) from public.game_rounds a join public.game_rounds b
--     on a.league_id = b.league_id and a.season = b.season and a.id < b.id
--    and a.deadline_utc < b.closes_utc and b.deadline_utc < a.closes_utc;
--
-- Tiers: five quintiles per position, roughly equal in size, nulls below the
-- threshold. Série A at the current moment:
--   select "position", tier, count(*)
--     from public.player_tiers_at((select id from public.leagues where slug = 'serie_a'), 2026, now())
--    group by 1, 2 order by 1, 2;
--
-- Tier qualifiers line up with league_position_rates (016). Differences only
-- for players who changed club inside the league, whom the tier sums across
-- clubs while 016 counts per club:
--   select v.slug, v.position, v.n_players,
--          (select count(*) from public.player_tiers_at(v.league_id, v.season, now()) t
--            where t.tier is not null
--              and t."position" = case v.position when 'Goalkeeper' then 'G' when 'Defender' then 'D'
--                                                 when 'Midfielder' then 'M' else 'F' end) as tiered
--     from public.league_position_rates v where v.is_current order by v.slug, v.position;
--
-- After a lock: no locked pick without a multiplier. Expect 0:
--   select count(*) from public.game_picks gp join public.game_rounds g on g.id = gp.round_id
--    where g.status <> 'open' and gp.locked_multiplier is null;
--
-- One score per pick per fixture, and round totals equal their scores. Expect 0, 0:
--   select count(*) - count(distinct (entry_id, slot, fixture_id)) from public.game_pick_scores;
--   select count(*) from public.game_round_results res
--    where res.total <> coalesce((select sum(s.total) from public.game_pick_scores s
--                                   join public.game_entries e on e.id = s.entry_id
--                                  where e.user_id = res.user_id and e.round_id = res.round_id), 0);
--
-- The deadline holds, run as a real user (rolls back). Pick a LOCKED round id.
-- Expect "This round is locked":
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true);
--   select public.submit_picks(<locked round id>, array[1,2,3,4,5]::bigint[], 1);
--   rollback;
--
-- The browser cannot write picks directly. Expect "permission denied":
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<uuid>","role":"authenticated"}',true);
--   update public.game_picks set locked_multiplier = 5 where user_id = '<uuid>';
--   rollback;
--
-- Browser roles hold no write on any game table or view. Expect no rows:
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name like 'game\_%'
--      and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE');
--
-- The writer functions are closed to the browser. Expect false, false, false, true:
--   select has_function_privilege('anon', 'public.sync_game_rounds()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.lock_due_rounds(jsonb,numeric,numeric,integer)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.refresh_game_results(bigint[])', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.submit_picks(bigint,bigint[],bigint)', 'EXECUTE');
