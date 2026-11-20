-- 039 — Cups, and the Champions League (C-1, 22 Nov 2026)
--
-- Run in the Supabase SQL editor. Re-runnable; nothing is deleted (rule 13).
-- The front end and the jobs deploy first and work before this runs (rule 21):
-- no cup exists until this file inserts one, and every new column below is
-- written only for a cup.
--
-- 1. leagues.type: 'league' | 'cup' | 'mixed'. Every existing row is a league.
-- 2. fixtures.pen_home / pen_away: a shoot-out's score (a cup tie decided on
--    penalties; the stored goals already include extra time).
-- 3. standings_groups.description: a cup table's qualification zone, as the
--    API words it ("… (Play Offs: 1/8-finals)"); the table shows it as text.
-- 4. The Champions League 2026-27: tracked (matches, live, table, panels),
--    NOT playable (sync_game_rounds() needs active AND playable), from the
--    league phase on (api/_lib/leagues.js fromRound; no qualifying rounds).
--    season_end = the final, 5 June 2027 (UEFA), not the API's 27 Jan.
-- 5. Cup-only clubs (clubs of a cup that play in no league we track) get no
--    room; a club that later moves to a tracked league gets its room then.
-- 6. Season stats stay domestic: a cup match never enters a player's or a
--    club's season row (the Scout Game's pick list reads those rows; its
--    tiers and eligibility already read the round's own league).

begin;

-- ---------------------------------------------------------------------------
-- 1. COMPETITION TYPE
-- ---------------------------------------------------------------------------
alter table public.leagues add column if not exists type text not null default 'league';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leagues_type_check') then
    alter table public.leagues add constraint leagues_type_check check (type in ('league', 'cup', 'mixed'));
  end if;
end $$;
comment on column public.leagues.type is
  'league | cup | mixed (039). A cup is tracked like a league but never playable, never feeds a club''s season stats, form or position; its clubs that play in no tracked league are cup-only (no room).';

-- ---------------------------------------------------------------------------
-- 2. PENALTIES, 3. ZONES
-- ---------------------------------------------------------------------------
alter table public.fixtures
  add column if not exists pen_home integer,
  add column if not exists pen_away integer;
comment on column public.fixtures.pen_home is 'Penalty shoot-out goals (score.penalty.home), for a match decided on penalties. Null otherwise.';

alter table public.standings_groups add column if not exists description text;
comment on column public.standings_groups.description is
  'A cup table''s qualification zone as API-Football words it (039). Null for leagues.';

-- ---------------------------------------------------------------------------
-- 4. THE CHAMPIONS LEAGUE
-- ---------------------------------------------------------------------------
-- Values from api/_lib/leagues.js (tests/cups.test.js checks this row).
-- On a re-run the row is set active, not playable, a cup, with these dates;
-- this file only ever switches the competition ON.
insert into public.leagues (api_league_id, slug, name, country, country_code, current_season,
                            season_start, season_end, active, playable, stats_coverage, region, tier, type)
values (2, 'champions_league', 'Champions League', 'Europe', 'UEFA', 2026,
        date '2026-09-08', date '2027-06-05', true, false, true, null, 1, 'cup')
on conflict (api_league_id) do update
   set active         = true,
       playable       = false,
       type           = 'cup',
       country_code   = excluded.country_code,
       season_start   = excluded.season_start,
       season_end     = excluded.season_end,
       stats_coverage = excluded.stats_coverage,
       updated_at     = now();

-- ---------------------------------------------------------------------------
-- 5. ROOMS: never for a cup-only club; on arrival in a tracked league
-- ---------------------------------------------------------------------------
create or replace function public.ensure_club_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;   -- groups.id is a uuid (011), like 019's v_room. It was bigint here until 035b.
begin
  -- A cup-only club (its league is a cup, 039) has no room.
  if exists (select 1 from public.leagues l where l.id = new.league_id and l.type = 'cup') then
    return new;
  end if;
  select g.id into v_group from public.groups g where g.club_id = new.id and g.is_official limit 1;
  if v_group is null then
    insert into public.groups (club_id, name, description, is_official, active)
    values (new.id, new.name || ' Community',
            'Match days, transfers, arguments. The official ' || new.name || ' room.', true, true)
    returning id into v_group;
  end if;
  if not exists (select 1 from public.group_messages m
                  where m.group_id = v_group and m.is_system and m.pinned and m.deleted_at is null) then
    insert into public.group_messages (group_id, user_id, content, pinned, is_system)
    values (v_group, null,
            'Bem-vindos à sala oficial da torcida: ' || new.name
              || '. Dia de jogo, mercado, discussão. Respeito sempre.'
              || ' · Welcome to the official ' || new.name
              || ' room. Match days, transfers, arguments. Be decent.',
            true, true);
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_club_room() from public, anon, authenticated;

drop trigger if exists teams_ensure_club_room on public.teams;
create trigger teams_ensure_club_room
  after insert on public.teams
  for each row execute function public.ensure_club_room();

-- A cup-only club moved to a league we start tracking gets its room then.
drop trigger if exists teams_ensure_club_room_moved on public.teams;
create trigger teams_ensure_club_room_moved
  after update of league_id on public.teams
  for each row when (old.league_id is distinct from new.league_id)
  execute function public.ensure_club_room();

-- ---------------------------------------------------------------------------
-- 6. SEASON STATS STAY DOMESTIC
-- ---------------------------------------------------------------------------
-- As in 015, with one change each: only fixtures of a league-type competition
-- count (a cup match keeps its player rows for the match panel, but never
-- enters a season row). Re-running is harmless: both recompute from scratch.
create or replace function public.refresh_player_season_stats(p_fixture_ids bigint[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with touched as (
    select distinct player_id, team_id, season
      from public.player_fixture_stats
     where fixture_id = any(p_fixture_ids)
  ),
  rows_ as (
    select s.*, f.league_id
      from public.player_fixture_stats s
      join touched t using (player_id, team_id, season)
      join public.fixtures f on f.id = s.fixture_id
      join public.leagues lg on lg.id = f.league_id and lg.type <> 'cup'
  ),
  -- Season position: the one played for the most minutes.
  pos as (
    select distinct on (player_id, team_id, season)
           player_id, team_id, season, position
      from rows_
     group by player_id, team_id, season, position
     order by player_id, team_id, season, sum(minutes) desc, position
  ),
  agg as (
    select player_id, team_id, season,
           min(league_id)                                   as league_id,
           count(*)                                         as apps,
           count(*) filter (where started)                  as lineups,
           sum(minutes)                                     as minutes,
           round(avg(rating), 2)                            as rating,
           count(rating)                                    as rated_apps,
           sum(goals)            as goals,
           sum(assists)          as assists,
           sum(goals_conceded)   as conceded,
           sum(saves)            as saves,
           sum(shots_total)      as shots_total,
           sum(shots_on)         as shots_on,
           sum(passes_total)     as passes_total,
           sum(passes_key)       as passes_key,
           sum(passes_accurate)  as passes_accurate,
           case when sum(passes_total) > 0
                then round(100.0 * sum(passes_accurate) / sum(passes_total))::integer end
                                 as passes_accuracy,
           sum(tackles)          as tackles,
           sum(blocks)           as blocks,
           sum(interceptions)    as interceptions,
           sum(duels_total)      as duels_total,
           sum(duels_won)        as duels_won,
           sum(dribbles_attempts) as dribbles_attempts,
           sum(dribbles_success) as dribbles_success,
           sum(fouls_drawn)      as fouls_drawn,
           sum(fouls_committed)  as fouls_committed,
           sum(yellow)           as yellow,
           sum(red)              as red,
           sum(pen_scored)       as pen_scored,
           sum(pen_missed)       as pen_missed,
           count(*) filter (where clean_sheet) as clean_sheets
      from rows_
     group by player_id, team_id, season
  ),
  up as (
    insert into public.player_season_stats as p (
      player_id, team_id, league_id, season, position,
      apps, lineups, minutes, rating, rated_apps,
      goals, assists, conceded, saves, shots_total, shots_on,
      passes_total, passes_key, passes_accurate, passes_accuracy,
      tackles, blocks, interceptions, duels_total, duels_won,
      dribbles_attempts, dribbles_success, fouls_drawn, fouls_committed,
      yellow, red, pen_scored, pen_missed, clean_sheets, updated_at)
    select a.player_id, a.team_id, a.league_id, a.season,
           case pos.position when 'G' then 'Goalkeeper' when 'D' then 'Defender'
                             when 'M' then 'Midfielder' when 'F' then 'Attacker' end,
           a.apps, a.lineups, a.minutes, a.rating, a.rated_apps,
           a.goals, a.assists, a.conceded, a.saves, a.shots_total, a.shots_on,
           a.passes_total, a.passes_key, a.passes_accurate, a.passes_accuracy,
           a.tackles, a.blocks, a.interceptions, a.duels_total, a.duels_won,
           a.dribbles_attempts, a.dribbles_success, a.fouls_drawn, a.fouls_committed,
           a.yellow, a.red, a.pen_scored, a.pen_missed, a.clean_sheets, now()
      from agg a
      join pos using (player_id, team_id, season)
    on conflict (player_id, team_id, season) do update set
      league_id = excluded.league_id, position = excluded.position,
      apps = excluded.apps, lineups = excluded.lineups, minutes = excluded.minutes,
      rating = excluded.rating, rated_apps = excluded.rated_apps,
      goals = excluded.goals, assists = excluded.assists, conceded = excluded.conceded,
      saves = excluded.saves, shots_total = excluded.shots_total, shots_on = excluded.shots_on,
      passes_total = excluded.passes_total, passes_key = excluded.passes_key,
      passes_accurate = excluded.passes_accurate, passes_accuracy = excluded.passes_accuracy,
      tackles = excluded.tackles, blocks = excluded.blocks, interceptions = excluded.interceptions,
      duels_total = excluded.duels_total, duels_won = excluded.duels_won,
      dribbles_attempts = excluded.dribbles_attempts, dribbles_success = excluded.dribbles_success,
      fouls_drawn = excluded.fouls_drawn, fouls_committed = excluded.fouls_committed,
      yellow = excluded.yellow, red = excluded.red,
      pen_scored = excluded.pen_scored, pen_missed = excluded.pen_missed,
      clean_sheets = excluded.clean_sheets, updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer from up;
$$;

create or replace function public.refresh_team_player_stats(p_fixture_ids bigint[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with touched as (
    select distinct team_id, season
      from public.player_fixture_stats
     where fixture_id = any(p_fixture_ids)
  ),
  per_fixture as (
    select s.team_id, s.season, s.fixture_id,
           sum(s.tackles)       as tk,
           sum(s.interceptions) as itc,
           sum(s.duels_won)     as dw,
           sum(s.duels_total)   as dt
      from public.player_fixture_stats s
      join touched t using (team_id, season)
      join public.fixtures f on f.id = s.fixture_id
      join public.leagues lg on lg.id = f.league_id and lg.type <> 'cup'
     group by s.team_id, s.season, s.fixture_id
  ),
  agg as (
    select team_id, season,
           count(tk)   as n,
           avg(tk)     as tk,
           avg(itc)    as itc,
           sum(dw)     as dw,
           sum(dt)     as dt
      from per_fixture
     group by team_id, season
  ),
  up as (
    update public.team_season_stats t
       set tk_pg         = round(a.tk, 3),
           int_pg        = round(a.itc, 3),
           duels_won_pct = case when a.dt > 0 then round(100.0 * a.dw / a.dt, 2) end,
           player_sample = a.n,
           updated_at    = now()
      from agg a
     where t.team_id = a.team_id and t.season = a.season
    returning 1
  )
  select count(*)::integer from up;
$$;

revoke all on function public.refresh_player_season_stats(bigint[]) from public, anon, authenticated;
revoke all on function public.refresh_team_player_stats(bigint[])   from public, anon, authenticated;
grant execute on function public.refresh_player_season_stats(bigint[]) to service_role;
grant execute on function public.refresh_team_player_stats(bigint[])   to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- 20 active (19 leagues + 1 cup), 7 playable, no round outside the game:
--   select count(*) filter (where active) as active,
--          count(*) filter (where active and type = 'league') as leagues,
--          count(*) filter (where active and type = 'cup') as cups,
--          count(*) filter (where active and playable) as playable,
--          (select count(*) from public.game_rounds g join public.leagues l on l.id = g.league_id where not l.playable) as rounds_outside_the_game
--     from public.leagues;                                                    -- 20, 19, 1, 7, 0
--
-- After the calls (teams, fixtures full, standings): 8 cup-only clubs, no room for any of them,
-- 144 league-phase fixtures, no qualifying round, the 36-club table:
--   select count(*) from public.teams t join public.leagues l on l.id = t.league_id where l.slug = 'champions_league';   -- 8
--   select count(*) from public.groups g join public.teams t on t.id = g.club_id
--     join public.leagues l on l.id = t.league_id where l.type = 'cup';                                                  -- 0
--   select count(*), count(*) filter (where round ilike '%qualifying%' or round in ('Play-offs', 'Playoff round'))
--     from public.fixtures f join public.leagues l on l.id = f.league_id where l.slug = 'champions_league';            -- 144, 0
--   select count(*), count(description) from public.standings_groups s join public.leagues l on l.id = s.league_id
--    where l.slug = 'champions_league';                                                                                 -- 36, 24
--
-- A cup's season_end is never earlier than its last fixture we hold (expect 0 rows):
--   select l.slug, l.season_end, max(f.kickoff_utc)::date as last_fixture
--     from public.leagues l join public.fixtures f on f.league_id = l.id and f.season = l.current_season
--    where l.type = 'cup' group by l.slug, l.season_end having max(f.kickoff_utc)::date > l.season_end;
