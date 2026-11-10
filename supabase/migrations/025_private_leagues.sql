-- 025_private_leagues.sql — private Scout Game leagues: a group of friends,
-- one competition, one invite code, a table of everyone's season points.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 008
-- (public_profiles), 011 (moderation_check), 017 (the game), 024 (account
-- deletion, whose two functions are replaced here with league handling added).
-- The front end degrades without it (CLAUDE.md rule 21): the leagues strip
-- stays hidden and Rankings -> Leagues says leagues are not available yet.
--
-- THE RULES (decided Day 6)
-- ---------------------------------------------------------------------------
--   * A league belongs to one competition and its current season. Its table
--     ranks the active members by WHOLE-SEASON points in that competition
--     (rounds before they joined count too), from game_round_results. A closed
--     league counts only rounds whose deadline fell before it closed.
--   * Limits: run at most 10 open leagues; be in at most 20 open leagues;
--     name 3-40 characters through the community-rules check; 50 members.
--   * The invite code is 8 characters from a 31-character alphabet (no 0 O 1
--     I L), about 850 billion combinations, made from gen_random_uuid()
--     bytes. It can only be used by typing it exactly: no read lists codes
--     except a member reading their own league, so they can share it.
--   * Leaving is recorded (left_at) and can be undone by joining again.
--     Removal by the owner is recorded (removed_at) and is permanent.
--   * The owner can make a new code; the old one stops working at once.
--   * When the owner leaves, or deletes their account, the longest-standing
--     member becomes the owner. Only when nobody is left does it close.
--   * Closing freezes the table and stops joins. NOTHING here deletes a row:
--     rows are closed, left or removed (in the spirit of rule 13). The one
--     deletion is a person's own account (024), whose memberships cascade.
--   * No room auto-post for leagues.
--
-- Every write goes through the functions below (security definer, caller =
-- auth.uid()); the browser holds SELECT only, and only on its own leagues.

begin;

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------
create table if not exists public.game_leagues (
  id            bigserial primary key,
  name          text        not null check (char_length(name) between 3 and 40),
  league_id     bigint      not null references public.leagues(id),
  season        integer     not null,
  owner_id      uuid        references auth.users(id) on delete set null,
  invite_code   text        not null,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz
);
create unique index if not exists game_leagues_invite_code_key on public.game_leagues (invite_code);
create index if not exists game_leagues_owner_idx on public.game_leagues (owner_id);

create table if not exists public.game_league_members (
  league_id     bigint      not null references public.game_leagues(id),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  removed_at    timestamptz,
  primary key (league_id, user_id)
);
create index if not exists game_league_members_user_idx on public.game_league_members (user_id);

comment on table public.game_leagues is
  'Private Scout Game leagues (025). Written only by the league functions; members read their own.';
comment on table public.game_league_members is
  'League membership. Active = left_at and removed_at both null. Leaving and removal are recorded, never deleted.';

-- ---------------------------------------------------------------------------
-- 2. HELPERS (not callable from the browser, except is_game_league_member)
-- ---------------------------------------------------------------------------
-- Used by the read policies. Security definer so the policy on
-- game_league_members can ask about game_league_members without recursing.
create or replace function public.is_game_league_member(p_league bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.game_league_members m
                  where m.league_id = p_league and m.user_id = auth.uid()
                    and m.left_at is null and m.removed_at is null);
$$;

/** 8 characters, 31-letter alphabet, from random UUID bytes; never one in use. */
create or replace function public.game_league_new_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_abc  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_raw  bytea;
  v_code text;
  i      integer;
begin
  for attempt in 1..20 loop
    v_raw := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_abc, 1 + (get_byte(v_raw, i) % 31), 1);
    end loop;
    if not exists (select 1 from public.game_leagues where invite_code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Could not make a league code. Try again.';
end;
$$;

/** What a person typed, as a code: letters and digits only, upper case. */
create or replace function public.game_league_norm_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

/**
 * The league's table: every active member, whole-season points in its
 * competition, rank among those who have points (members without a scored
 * round get rank null and sort last). Ties as the public standings: captain
 * points, first submission, user id.
 */
create or replace function public.game_league_table(p_id bigint)
returns table (user_id uuid, total numeric, captain_points numeric, rounds_played integer,
               rank integer, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with gl as (
    select l.* from public.game_leagues l where l.id = p_id
  ),
  m as (
    select mm.user_id, mm.joined_at
      from public.game_league_members mm
     where mm.league_id = p_id and mm.left_at is null and mm.removed_at is null
  ),
  pts as (
    select res.user_id, sum(res.total) as total, sum(res.captain_points) as cp,
           count(*)::integer as n, min(res.submitted_at) as first_sub
      from public.game_round_results res
      join public.game_rounds g on g.id = res.round_id
      join gl on g.league_id = gl.league_id and g.season = gl.season
     where g.status <> 'open'
       and (gl.closed_at is null or g.deadline_utc < gl.closed_at)
       and res.user_id in (select m.user_id from m)
     group by res.user_id
  ),
  ranked as (
    select m.user_id, pts.total, pts.cp, coalesce(pts.n, 0) as n, m.joined_at,
           pts.user_id is not null as scored,
           row_number() over (order by (pts.user_id is null), pts.total desc, pts.cp desc,
                                       pts.first_sub, m.user_id)::integer as rn
      from m left join pts on pts.user_id = m.user_id
  )
  select r.user_id, r.total, r.cp, r.n, case when r.scored then r.rn end, r.joined_at
    from ranked r;
$$;

/**
 * The owner is going (leaving, or deleting their account): the
 * longest-standing other active member takes over; with nobody left, the
 * league closes. Returns the new owner, or null when it closed.
 */
create or replace function public.game_league_hand_over(p_id bigint, p_from uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  select m.user_id into v_next
    from public.game_league_members m
   where m.league_id = p_id and m.user_id <> p_from
     and m.left_at is null and m.removed_at is null
   order by m.joined_at, m.user_id
   limit 1;
  if v_next is null then
    update public.game_leagues set closed_at = coalesce(closed_at, now()) where id = p_id;
  else
    update public.game_leagues set owner_id = v_next where id = p_id;
  end if;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. WHAT THE BROWSER CALLS
-- ---------------------------------------------------------------------------
-- Messages are written for people and shown as they are (index.html maps
-- each exact text to Portuguese through i18n.js; tests/i18n.test.js checks
-- that every message here has a translation).

/** Start a league in a competition's current season. Returns {id, code}. */
create or replace function public.create_game_league(p_name text, p_league_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_season integer;
  v_code   text;
  v_id     bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    raise exception 'A league name needs 3 to 40 characters.';
  end if;
  begin
    perform public.moderation_check(v_name);
  exception when check_violation then
    raise exception 'That name breaks the community rules. Please choose another.';
  end;

  select l.current_season into v_season from public.leagues l where l.id = p_league_id;
  if v_season is null
     or not exists (select 1 from public.game_rounds g where g.league_id = p_league_id and g.season = v_season) then
    raise exception 'That competition is not in the Scout Game.';
  end if;

  -- One person's creates and joins one at a time, so two taps cannot both
  -- slip under a limit.
  perform pg_advisory_xact_lock(hashtext('game_league_user:' || v_uid::text));
  if (select count(*) from public.game_leagues gl where gl.owner_id = v_uid and gl.closed_at is null) >= 10 then
    raise exception 'You already run 10 leagues. Close one to start another.';
  end if;
  if (select count(*) from public.game_league_members m join public.game_leagues gl on gl.id = m.league_id
       where m.user_id = v_uid and m.left_at is null and m.removed_at is null and gl.closed_at is null) >= 20 then
    raise exception 'You are in 20 leagues already. Leave one to join another.';
  end if;

  v_code := public.game_league_new_code();
  insert into public.game_leagues (name, league_id, season, owner_id, invite_code)
  values (v_name, p_league_id, v_season, v_uid, v_code)
  returning id into v_id;
  insert into public.game_league_members (league_id, user_id) values (v_id, v_uid);
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

/**
 * What a code leads to, before joining: name, competition, members, owner,
 * whether it is closed and whether the caller is in it or was removed. Null
 * when no league has the code. Exact codes only.
 */
create or replace function public.preview_game_league(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  gl    public.game_leagues%rowtype;
  m     public.game_league_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  select * into gl from public.game_leagues where invite_code = public.game_league_norm_code(p_code);
  if not found then
    return null;
  end if;
  select * into m from public.game_league_members where league_id = gl.id and user_id = v_uid;
  return jsonb_build_object(
    'id', gl.id,
    'name', gl.name,
    'competition', (select l.name from public.leagues l where l.id = gl.league_id),
    'flag', (select l.flag from public.leagues l where l.id = gl.league_id),
    'season', gl.season,
    'members', (select count(*) from public.game_league_members x
                 where x.league_id = gl.id and x.left_at is null and x.removed_at is null),
    'owner_name', (select p.name from public.public_profiles p where p.id = gl.owner_id),
    'closed', gl.closed_at is not null,
    'is_member', m.user_id is not null and m.left_at is null and m.removed_at is null,
    'removed', m.removed_at is not null);
end;
$$;

/** Join by exact code (or rejoin after leaving). Returns the league id. */
create or replace function public.join_game_league(p_code text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  gl    public.game_leagues%rowtype;
  m     public.game_league_members%rowtype;
  v_was boolean;                                    -- a membership row exists (left, or active)
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('game_league_user:' || v_uid::text));
  -- The league row is locked so two joins cannot both take the 50th place.
  select * into gl from public.game_leagues where invite_code = public.game_league_norm_code(p_code) for update;
  if not found then
    raise exception 'No league has that code. Check it and try again.';
  end if;
  if gl.closed_at is not null then
    raise exception 'That league is closed.';
  end if;
  select * into m from public.game_league_members where league_id = gl.id and user_id = v_uid;
  v_was := found;
  if v_was and m.removed_at is not null then
    raise exception 'You were removed from that league.';
  end if;
  if v_was and m.left_at is null then
    return gl.id;                                   -- already in: nothing to do
  end if;
  if (select count(*) from public.game_league_members x
       where x.league_id = gl.id and x.left_at is null and x.removed_at is null) >= 50 then
    raise exception 'That league is full.';
  end if;
  if (select count(*) from public.game_league_members x join public.game_leagues l on l.id = x.league_id
       where x.user_id = v_uid and x.left_at is null and x.removed_at is null and l.closed_at is null) >= 20 then
    raise exception 'You are in 20 leagues already. Leave one to join another.';
  end if;
  if v_was then
    -- Back after leaving: the clock starts again for "longest-standing".
    update public.game_league_members set left_at = null, joined_at = now()
     where league_id = gl.id and user_id = v_uid;
  else
    insert into public.game_league_members (league_id, user_id) values (gl.id, v_uid);
  end if;
  return gl.id;
end;
$$;

/** Leave. An owner who leaves hands the league on (or it closes). */
create or replace function public.leave_game_league(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  gl    public.game_leagues%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  select * into gl from public.game_leagues where id = p_id for update;
  if not found or not exists (select 1 from public.game_league_members m
                               where m.league_id = p_id and m.user_id = v_uid
                                 and m.left_at is null and m.removed_at is null) then
    raise exception 'You are not in that league.';
  end if;
  update public.game_league_members set left_at = now() where league_id = p_id and user_id = v_uid;
  if gl.owner_id = v_uid then
    perform public.game_league_hand_over(p_id, v_uid);
  end if;
end;
$$;

/** The owner removes a member, for good. */
create or replace function public.remove_game_league_member(p_id bigint, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  gl    public.game_leagues%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  select * into gl from public.game_leagues where id = p_id for update;
  if not found or gl.owner_id is distinct from v_uid then
    raise exception 'Only the league owner can do that.';
  end if;
  if gl.closed_at is not null then
    raise exception 'That league is closed.';
  end if;
  if p_user = v_uid then
    raise exception 'Leave the league instead of removing yourself.';
  end if;
  update public.game_league_members set removed_at = now()
   where league_id = p_id and user_id = p_user and left_at is null and removed_at is null;
  if not found then
    raise exception 'That person is not in this league.';
  end if;
end;
$$;

/** The owner closes the league: no more joins, the table freezes. */
create or replace function public.close_game_league(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  gl    public.game_leagues%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  select * into gl from public.game_leagues where id = p_id for update;
  if not found or gl.owner_id is distinct from v_uid then
    raise exception 'Only the league owner can do that.';
  end if;
  update public.game_leagues set closed_at = coalesce(closed_at, now()) where id = p_id;
end;
$$;

/** The owner makes a new code. The old one stops working at once. */
create or replace function public.regenerate_league_code(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  gl     public.game_leagues%rowtype;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  select * into gl from public.game_leagues where id = p_id for update;
  if not found or gl.owner_id is distinct from v_uid then
    raise exception 'Only the league owner can do that.';
  end if;
  if gl.closed_at is not null then
    raise exception 'That league is closed.';
  end if;
  v_code := public.game_league_new_code();
  update public.game_leagues set invite_code = v_code where id = p_id;
  return v_code;
end;
$$;

/** One league, for its members: details, code, and the table. */
create or replace function public.game_league_standings(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  gl    public.game_leagues%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to play.' using errcode = '42501';
  end if;
  select * into gl from public.game_leagues where id = p_id;
  if not found or not public.is_game_league_member(p_id) then
    raise exception 'You are not in that league.';
  end if;
  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', gl.id, 'name', gl.name, 'code', gl.invite_code,
      'league_id', gl.league_id, 'season', gl.season,
      'competition', (select l.name from public.leagues l where l.id = gl.league_id),
      'flag', (select l.flag from public.leagues l where l.id = gl.league_id),
      'is_owner', gl.owner_id = v_uid,
      'owner_name', (select p.name from public.public_profiles p where p.id = gl.owner_id),
      'created_at', gl.created_at, 'closed_at', gl.closed_at),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', t.user_id, 'name', p.name, 'main_club_id', p.main_club_id,
               'total', t.total, 'rounds_played', t.rounds_played, 'rank', t.rank,
               'is_owner', t.user_id = gl.owner_id)
             order by t.rank nulls last, p.name, t.user_id)
        from public.game_league_table(p_id) t
        left join public.public_profiles p on p.id = t.user_id), '[]'::jsonb));
end;
$$;

/** Every league I am in, open first, with my rank: the "My leagues" strip. */
create or replace function public.my_game_leagues()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', gl.id, 'name', gl.name, 'league_id', gl.league_id, 'season', gl.season,
           'competition', l.name, 'flag', l.flag,
           'is_owner', gl.owner_id = auth.uid(), 'closed_at', gl.closed_at,
           'members', t.members, 'my_rank', t.my_rank, 'my_total', t.my_total)
           order by gl.closed_at nulls first, gl.created_at), '[]'::jsonb)
    from public.game_league_members m
    join public.game_leagues gl on gl.id = m.league_id
    join public.leagues l on l.id = gl.league_id
    cross join lateral (
      select count(*)::integer as members,
             max(x.rank) filter (where x.user_id = auth.uid()) as my_rank,
             max(x.total) filter (where x.user_id = auth.uid()) as my_total
        from public.game_league_table(gl.id) x
    ) t
   where m.user_id = auth.uid() and m.left_at is null and m.removed_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS + GRANTS
-- ---------------------------------------------------------------------------
alter table public.game_leagues        enable row level security;
alter table public.game_league_members enable row level security;

drop policy if exists "game_leagues: members read"        on public.game_leagues;
drop policy if exists "game_league_members: members read" on public.game_league_members;
create policy "game_leagues: members read" on public.game_leagues
  for select to authenticated
  using (owner_id = auth.uid() or public.is_game_league_member(id));
create policy "game_league_members: members read" on public.game_league_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_game_league_member(league_id));

revoke all on public.game_leagues, public.game_league_members from anon;
revoke insert, update, delete on public.game_leagues, public.game_league_members from authenticated;
grant select on public.game_leagues, public.game_league_members to authenticated;
revoke all on sequence public.game_leagues_id_seq from anon, authenticated;

revoke all on function public.is_game_league_member(bigint) from public, anon;
grant execute on function public.is_game_league_member(bigint) to authenticated;
revoke all on function public.game_league_new_code() from public, anon, authenticated;
revoke all on function public.game_league_table(bigint) from public, anon, authenticated;
revoke all on function public.game_league_hand_over(bigint, uuid) from public, anon, authenticated;

revoke all on function public.create_game_league(text, bigint) from public, anon;
revoke all on function public.preview_game_league(text) from public, anon;
revoke all on function public.join_game_league(text) from public, anon;
revoke all on function public.leave_game_league(bigint) from public, anon;
revoke all on function public.remove_game_league_member(bigint, uuid) from public, anon;
revoke all on function public.close_game_league(bigint) from public, anon;
revoke all on function public.regenerate_league_code(bigint) from public, anon;
revoke all on function public.game_league_standings(bigint) from public, anon;
revoke all on function public.my_game_leagues() from public, anon;
grant execute on function public.create_game_league(text, bigint) to authenticated;
grant execute on function public.preview_game_league(text) to authenticated;
grant execute on function public.join_game_league(text) to authenticated;
grant execute on function public.leave_game_league(bigint) to authenticated;
grant execute on function public.remove_game_league_member(bigint, uuid) to authenticated;
grant execute on function public.close_game_league(bigint) to authenticated;
grant execute on function public.regenerate_league_code(bigint) to authenticated;
grant execute on function public.game_league_standings(bigint) to authenticated;
grant execute on function public.my_game_leagues() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. ACCOUNT DELETION AND EXPORT (024, with leagues added)
-- ---------------------------------------------------------------------------
-- delete_account_data(): the leagues the person runs pass to their
-- longest-standing member (or close), and their memberships are marked left
-- at once; the rows themselves go when the auth user is deleted (cascade).
-- Everything else is 024 unchanged.
create or replace function public.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ghost uuid := gen_random_uuid();
  v_out   jsonb := '{}'::jsonb;
  v_n     integer;
  v_l     bigint;
begin
  if p_user is null then
    raise exception 'No user given.';
  end if;

  -- Content that stays, without its author.
  update public.comments set user_id = null where user_id = p_user;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('comments', v_n);

  update public.group_messages set user_id = null, user_name = null where user_id = p_user;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('messages', v_n);

  if to_regclass('public.analyst_posts') is not null then
    -- community.html prints user_name and credential as they are.
    execute 'update public.analyst_posts set user_id = null, user_name = ''[deleted user]'', credential = '''' where user_id = $1'
      using p_user;
    get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('analyst_posts', v_n);
  end if;

  update public.reports set reporter_id = null where reporter_id = p_user;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('reports_filed', v_n);

  -- Stamps.
  update public.comments       set deleted_by  = null where deleted_by  = p_user;
  update public.group_messages set deleted_by  = null where deleted_by  = p_user;
  update public.reports        set resolved_by = null where resolved_by = p_user;
  update public.groups         set created_by  = null where created_by  = p_user;

  -- Private leagues (025): hand on what they run, step out of the rest.
  v_n := 0;
  for v_l in select gl.id from public.game_leagues gl where gl.owner_id = p_user loop
    perform public.game_league_hand_over(v_l, p_user);
    v_n := v_n + 1;
  end loop;
  v_out := v_out || jsonb_build_object('leagues_handed_on', v_n);
  update public.game_league_members set left_at = coalesce(left_at, now())
   where user_id = p_user and removed_at is null;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('league_memberships', v_n);

  -- The Scout Game, under one ghost id for this account. Badges go.
  update public.game_entries       set user_id = v_ghost where user_id = p_user;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('game_entries', v_n);
  update public.game_picks         set user_id = v_ghost where user_id = p_user;
  update public.game_round_results set user_id = v_ghost where user_id = p_user;
  delete from public.user_badges where user_id = p_user;

  -- Personal records.
  if to_regclass('public.badge_applications') is not null then
    execute 'delete from public.badge_applications where user_id = $1' using p_user;
  end if;
  update public.events set user_id = null where user_id = p_user;

  -- Last, the profile itself (its children above no longer point at it).
  delete from public.profiles where id = p_user;
  get diagnostics v_n = row_count; v_out := v_out || jsonb_build_object('profile', v_n);

  -- follows, reactions, comment_likes, message_likes, game_league_members and
  -- anything else that cascades from auth.users goes when the route deletes
  -- the auth user.
  return v_out;
end;
$$;

comment on function public.delete_account_data(uuid) is
  'Step 2 of an account deletion (LGPD art. 18): anonymises content that stays, hands on private leagues the person runs, erases personal records and the profile. Service role only; called by /api/account/delete before it deletes the auth user.';

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as uid)
  select case when (select uid from me) is null then null else jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at,
                                          'last_sign_in_at', u.last_sign_in_at)
                  from auth.users u join me on u.id = me.uid),
    'profile', (select to_jsonb(p) - 'plan' - 'credential'
                  from public.profiles p join me on p.id = me.uid),
    'follows', coalesce((select jsonb_agg(to_jsonb(f)) from public.follows f join me on f.user_id = me.uid), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
                            from public.comments c join me on c.user_id = me.uid), '[]'::jsonb),
    'room_messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'group_id', m.group_id,
                                         'content', m.content, 'created_at', m.created_at, 'deleted_at', m.deleted_at)
                                         order by m.created_at)
                                 from public.group_messages m join me on m.user_id = me.uid), '[]'::jsonb),
    'reactions', coalesce((select jsonb_agg(to_jsonb(r)) from public.reactions r join me on r.user_id = me.uid), '[]'::jsonb),
    'comment_likes', coalesce((select jsonb_agg(to_jsonb(l)) from public.comment_likes l join me on l.user_id = me.uid), '[]'::jsonb),
    'message_likes', coalesce((select jsonb_agg(to_jsonb(l)) from public.message_likes l join me on l.user_id = me.uid), '[]'::jsonb),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
                                 from public.reports r join me on r.reporter_id = me.uid), '[]'::jsonb),
    'scout_game', jsonb_build_object(
      'entries', coalesce((select jsonb_agg(jsonb_build_object(
                             'round_id', e.round_id, 'submitted_at', e.submitted_at,
                             'picks', (select jsonb_agg(jsonb_build_object('slot', gp.slot, 'player_id', gp.player_id,
                                                         'is_captain', gp.is_captain, 'locked_multiplier', gp.locked_multiplier)
                                                         order by gp.slot)
                                         from public.game_picks gp where gp.entry_id = e.id))
                             order by e.round_id)
                             from public.game_entries e join me on e.user_id = me.uid), '[]'::jsonb),
      'results', coalesce((select jsonb_agg(to_jsonb(r) order by r.round_id)
                             from public.game_round_results r join me on r.user_id = me.uid), '[]'::jsonb),
      'badges', coalesce((select jsonb_agg(to_jsonb(b)) from public.user_badges b join me on b.user_id = me.uid), '[]'::jsonb),
      -- 025: the private leagues I am or was in, and the ones I run.
      'league_memberships', coalesce((select jsonb_agg(jsonb_build_object(
                             'league_id', gm.league_id, 'name', gl.name, 'competition_id', gl.league_id,
                             'season', gl.season, 'joined_at', gm.joined_at, 'left_at', gm.left_at,
                             'removed_at', gm.removed_at) order by gm.joined_at)
                             from public.game_league_members gm
                             join public.game_leagues gl on gl.id = gm.league_id
                             join me on gm.user_id = me.uid), '[]'::jsonb),
      'leagues_owned', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', gl.id, 'name', gl.name, 'competition_id', gl.league_id, 'season', gl.season,
                             'invite_code', gl.invite_code, 'created_at', gl.created_at, 'closed_at', gl.closed_at)
                             order by gl.created_at)
                             from public.game_leagues gl join me on gl.owner_id = me.uid), '[]'::jsonb)
    ),
    'activity_events', coalesce((select jsonb_agg(jsonb_build_object('type', ev.type, 'ref_type', ev.ref_type,
                                         'ref_id', ev.ref_id, 'created_at', ev.created_at) order by ev.created_at)
                                   from public.events ev join me on ev.user_id = me.uid), '[]'::jsonb)
  ) end;
$$;

comment on function public.export_my_data() is
  'LGPD portability: every row we hold about auth.uid(), as one JSON document (private leagues since 025). Signed-in callers only, and only ever their own data.';

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Both tables have RLS, and the browser can only read. Expect two rows, true:
--   select relname, relrowsecurity from pg_class
--    where relname in ('game_leagues', 'game_league_members');
--
-- Who may call what. Expect false, true, false, false:
--   select has_function_privilege('anon', 'public.join_game_league(text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.join_game_league(text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.game_league_table(bigint)', 'EXECUTE'),
--          has_table_privilege('authenticated', 'public.game_leagues', 'INSERT');
--
-- The code alphabet. Expect 8 characters, none of 0 O 1 I L:
--   select public.game_league_new_code();
--
-- In the SQL editor there is no auth.uid(). Expect '[]' and an error
-- "Sign in to play.":
--   select public.my_game_leagues();
--   select public.create_game_league('Test', 1);
