-- 023_formation_and_history.sql — the Scout Game's fixed formation.
--
-- Run in the Supabase SQL editor BEFORE pushing. Safe to run more than once.
-- Depends on 017 (the game) and 020 (which this replaces).
--
-- 1. submit_picks(): exactly 1 GK, exactly 2 DEF, and 2 from MID or FWD in
--    any mix, replacing 020's caps. The slots are written in formation order,
--    whatever order the picks arrive in: slot 1 GK, 2-3 DEF, 4-5 MID/FWD
--    (each group in the order picked), so every view of a saved entry can
--    render GK · DEF · DEF · MID/FWD · MID/FWD from the slot number alone.
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
