-- 023_formation_and_history.sql — the Scout Game's fixed formation, and the
-- player's own history in one call.
--
-- Run in the Supabase SQL editor BEFORE pushing. Safe to run more than once.
-- Depends on 017 (the game) and 020 (which this replaces).
--
-- 1. submit_picks(): exactly 1 GK, exactly 2 DEF, and 2 from MID or FWD in
--    any mix, replacing 020's caps. The slots are written in formation order,
--    whatever order the picks arrive in: slot 1 GK, 2-3 DEF, 4-5 MID/FWD
--    (each group in the order picked), so every view of a saved entry can
--    render GK · DEF · DEF · MID/FWD · MID/FWD from the slot number alone.
-- 2. my_game_history(): every round the caller entered, newest first, with
--    points, rank of N, best pick and badges, plus a season summary. Reads
--    for auth.uid() only. One call instead of five reads from the browser.
--
-- A player's position is the one he has played most minutes in, in this
-- competition this season, ties broken by position letter: what
-- player_tiers_at() and the pick board show.
--
-- No entries exist yet, so nothing stored has to be re-slotted.

begin;

-- ---------------------------------------------------------------------------
-- 1. submit_picks() — the formation
-- ---------------------------------------------------------------------------
create or replace function public.submit_picks(p_round_id bigint, p_player_ids bigint[], p_captain_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  r         public.game_rounds%rowtype;
  v_entry   bigint;
  v_ordered bigint[];
  v_g       integer;
  v_d       integer;
  v_mf      integer;
  v_unknown integer;
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

  -- Each pick's main position this season, then the five in formation order.
  with pl as (
    select u.x as player_id, u.ord,
           (select s."position" from public.player_fixture_stats s
              join public.fixtures f on f.id = s.fixture_id
             where s.player_id = u.x and f.league_id = r.league_id and f.season = r.season
               and s."position" is not null
             group by s."position" order by sum(s.minutes) desc, s."position" limit 1) as p
      from unnest(p_player_ids) with ordinality as u(x, ord)
  )
  select array_agg(pl.player_id order by case pl.p when 'G' then 1 when 'D' then 2 else 3 end, pl.ord),
         count(*) filter (where pl.p = 'G'),
         count(*) filter (where pl.p = 'D'),
         count(*) filter (where pl.p in ('M', 'F')),
         count(*) filter (where pl.p is null)
    into v_ordered, v_g, v_d, v_mf, v_unknown
    from pl;

  if v_unknown > 0 then
    raise exception 'Every pick needs a known position. Pick another player.';
  elsif v_g <> 1 then
    raise exception 'Pick one goalkeeper.';
  elsif v_d <> 2 then
    raise exception 'Pick two defenders.';
  elsif v_mf <> 2 then
    raise exception 'Pick two midfielders or forwards.';
  end if;

  insert into public.game_entries as e (user_id, round_id, submitted_at, updated_at)
  values (v_uid, r.id, now(), now())
  on conflict (user_id, round_id) do update set submitted_at = now(), updated_at = now()
  returning e.id into v_entry;

  insert into public.game_picks as gp (entry_id, slot, user_id, round_id, player_id, is_captain, updated_at)
  select v_entry, i, v_uid, r.id, v_ordered[i], v_ordered[i] = p_captain_id, now()
    from generate_series(1, 5) i
  on conflict (entry_id, slot) do update set
    player_id = excluded.player_id, is_captain = excluded.is_captain, updated_at = now();

  return v_entry;
end;
$$;

comment on function public.submit_picks(bigint, bigint[], bigint) is
  'The one door for Scout Game picks: five different players, a captain among them, all eligible for the round, exactly 1 GK, 2 DEF and 2 MID/FWD, before the deadline. Slots are written in formation order: 1 GK, 2-3 DEF, 4-5 MID/FWD.';

revoke all on function public.submit_picks(bigint, bigint[], bigint) from public, anon;
grant execute on function public.submit_picks(bigint, bigint[], bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. my_game_history() — the caller's rounds and season, in one call
-- ---------------------------------------------------------------------------
-- Returns jsonb:
--   summary  { season_total, rounds_played, best_round {round_id, league,
--              flag, round_label, round_no, total} | null, current_streak }
--   rounds   [ { round_id, league_id, league, flag, season, round_label,
--                round_no, status, deadline_utc, submitted_at, total, rank,
--                participants, best_pick {name, points} | null,
--                badges [ {id, name} ] } ]  newest deadline first
--
-- Every row is the caller's own: entries are filtered on auth.uid(), and RLS
-- already limits game_entries to the caller's rows before a round locks.
-- total / rank / best_pick are null for an open round (nothing is scored
-- yet). Season = each competition's leagues.current_season.
--
-- current_streak: the longest run still alive. For each competition, the
-- streak (game_round_results.streak) at the caller's latest played round,
-- counted only if that round is the competition's latest locked or final
-- round, i.e. no round has gone by unplayed since. The highest across
-- competitions.
create or replace function public.my_game_history()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select auth.uid() as uid),
  mine as (
    select e.id as entry_id, e.round_id, e.submitted_at,
           g.league_id, g.season, g.round_label, g.round_no, g.status, g.deadline_utc,
           l.name as league, l.flag, (l.current_season = g.season) as this_season,
           res.total, res.streak
      from public.game_entries e
      join me on e.user_id = me.uid
      join public.game_rounds g on g.id = e.round_id
      join public.leagues l on l.id = g.league_id
      left join public.game_round_results res on res.user_id = e.user_id and res.round_id = e.round_id
  ),
  ranks as (
    select k.round_id, k.rank, k.participants
      from public.game_round_rankings k join me on k.user_id = me.uid
  ),
  best as (
    select distinct on (x.entry_id) x.entry_id, x.name, x.points
      from (
        select s.entry_id, p.name, sum(s.total) as points
          from public.game_pick_scores s
          join mine m on m.entry_id = s.entry_id
          join public.game_picks gp on gp.entry_id = s.entry_id and gp.slot = s.slot
          join public.players p on p.id = gp.player_id
         group by s.entry_id, s.slot, p.name
      ) x
     order by x.entry_id, x.points desc, x.name
  ),
  badges as (
    select ub.round_id, jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.sort) as list
      from public.user_badges ub
      join me on ub.user_id = me.uid
      join public.badges b on b.id = ub.badge_id
     where ub.round_id is not null
     group by ub.round_id
  ),
  played as (
    select * from mine where status <> 'open' and this_season
  ),
  latest_round as (
    select g.league_id, max(g.deadline_utc) as deadline_utc
      from public.game_rounds g
     where g.status <> 'open'
     group by g.league_id
  ),
  alive as (
    select distinct on (p.league_id) p.league_id, p.streak, p.deadline_utc
      from played p
     order by p.league_id, p.deadline_utc desc
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'season_total',   coalesce((select round(sum(p.total), 2) from played p), 0),
      'rounds_played',  (select count(*) from played),
      'best_round',     (select jsonb_build_object('round_id', p.round_id, 'league', p.league, 'flag', p.flag,
                                                   'round_label', p.round_label, 'round_no', p.round_no, 'total', p.total)
                           from played p where p.total is not null
                          order by p.total desc, p.deadline_utc desc limit 1),
      'current_streak', coalesce((select max(a.streak) from alive a
                                    join latest_round lr on lr.league_id = a.league_id
                                                        and lr.deadline_utc = a.deadline_utc), 0)
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round_id', m.round_id, 'league_id', m.league_id, 'league', m.league, 'flag', m.flag,
               'season', m.season, 'round_label', m.round_label, 'round_no', m.round_no,
               'status', m.status, 'deadline_utc', m.deadline_utc, 'submitted_at', m.submitted_at,
               'total', case when m.status = 'open' then null else m.total end,
               'rank', r.rank, 'participants', r.participants,
               'best_pick', case when b.entry_id is null then null
                                 else jsonb_build_object('name', b.name, 'points', round(b.points, 2)) end,
               'badges', coalesce(bd.list, '[]'::jsonb))
             order by m.deadline_utc desc)
        from mine m
        left join ranks r on r.round_id = m.round_id
        left join best b on b.entry_id = m.entry_id
        left join badges bd on bd.round_id = m.round_id
    ), '[]'::jsonb)
  );
$$;

comment on function public.my_game_history() is
  'The caller''s Scout Game history: every round entered (newest first) with points, rank of N, best pick and badges, plus season total, rounds played, best round and current streak. auth.uid() only.';

-- Signed-in only: for anon auth.uid() is null and the answer would be empty.
revoke all on function public.my_game_history() from public, anon;
grant execute on function public.my_game_history() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The formation messages are in the function. Expect true, true:
--   select prosrc like '%Pick one goalkeeper.%', prosrc like '%Pick two defenders.%'
--     from pg_proc where proname = 'submit_picks';
--
-- Still the signed-in player's door only. Expect false, true:
--   select has_function_privilege('anon', 'public.submit_picks(bigint, bigint[], bigint)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.submit_picks(bigint, bigint[], bigint)', 'EXECUTE');
--
-- History is signed-in only. Expect false, true:
--   select has_function_privilege('anon', 'public.my_game_history()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.my_game_history()', 'EXECUTE');
--
-- In the SQL editor there is no auth.uid(), so the call answers for nobody.
-- Expect {"summary": {"season_total": 0, "rounds_played": 0, ...}, "rounds": []}:
--   select public.my_game_history();
