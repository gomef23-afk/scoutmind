-- 020_lineup_rule.sql — at most one goalkeeper and two of each outfield
-- position per Scout Game entry.
--
-- Run in the Supabase SQL editor BEFORE pushing. Safe to run more than once.
-- Depends on 017 (submit_picks). Replaces submit_picks() in place: same
-- signature, same grants, same messages, plus three new refusals.
--
-- WHY
-- ---------------------------------------------------------------------------
-- Without it the best lineup is five forwards. The pick board mirrors the rule
-- (the + button is disabled and the status line says why), but the board is
-- feedback only: this function is the rule.
--
-- A player's position is the one he has played the most minutes in, in this
-- competition this season, ties broken by position letter: exactly what
-- player_tiers_at() and the pick list show, so the board and this function
-- never disagree about who is a defender.
--
-- No entries exist yet, so no stored entry can break the new rule.

begin;

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
  v_pos   record;
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

  -- The lineup rule: count the five by their main position this season.
  for v_pos in
    with pos as (
      select x as player_id,
             (select s."position" from public.player_fixture_stats s
                join public.fixtures f on f.id = s.fixture_id
               where s.player_id = x and f.league_id = r.league_id and f.season = r.season
                 and s."position" is not null
               group by s."position" order by sum(s.minutes) desc, s."position" limit 1) as p
        from unnest(p_player_ids) x
    )
    select pos.p, count(*) as n from pos where pos.p is not null group by pos.p
  loop
    if v_pos.p = 'G' and v_pos.n > 1 then
      raise exception 'At most one goalkeeper.';
    elsif v_pos.p = 'D' and v_pos.n > 2 then
      raise exception 'At most two defenders.';
    elsif v_pos.p = 'M' and v_pos.n > 2 then
      raise exception 'At most two midfielders.';
    elsif v_pos.p = 'F' and v_pos.n > 2 then
      raise exception 'At most two forwards.';
    end if;
  end loop;

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

comment on function public.submit_picks(bigint, bigint[], bigint) is
  'The one door for Scout Game picks: five different players, a captain among them, all eligible for the round, at most 1 GK and 2 per outfield position, before the deadline.';

revoke all on function public.submit_picks(bigint, bigint[], bigint) from public, anon;
grant execute on function public.submit_picks(bigint, bigint[], bigint) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The new refusals are in the function. Expect true:
--   select prosrc like '%At most two defenders.%' from pg_proc where proname = 'submit_picks';
--
-- Still the signed-in player's door only. Expect false, true:
--   select has_function_privilege('anon', 'public.submit_picks(bigint, bigint[], bigint)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.submit_picks(bigint, bigint[], bigint)', 'EXECUTE');
--
-- No stored entry breaks the rule. Expect 0 rows:
--   select gp.entry_id, x.p, count(*)
--     from public.game_picks gp
--     join public.game_rounds g on g.id = gp.round_id
--     cross join lateral (
--       select s."position" as p from public.player_fixture_stats s
--         join public.fixtures f on f.id = s.fixture_id
--        where s.player_id = gp.player_id and f.league_id = g.league_id and f.season = g.season
--          and s."position" is not null
--        group by s."position" order by sum(s.minutes) desc, s."position" limit 1) x
--    group by gp.entry_id, x.p
--   having count(*) > case x.p when 'G' then 1 else 2 end;
