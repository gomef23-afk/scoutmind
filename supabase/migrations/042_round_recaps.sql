-- 042 — Round Recap, the data (R-1, 21 Nov 2026)
--
-- Run in the Supabase SQL editor. Re-runnable: create-if-not-exists, add
-- column if not exists, create or replace; recaps_from is set only once.
-- Nothing is deleted. Depends on 017 (the game), 019 (room posts), 025
-- (private leagues), 029.
--
-- The front end deploys before this runs (rule 21): the job's recap step
-- reports "round_recaps does not exist" and the game steps carry on; nothing
-- on screen reads a recap until R-2.
--
-- WHAT A RECAP IS
-- ---------------------------------------------------------------------------
-- The facts of one final Scout Game round, built ONCE by the job from data we
-- hold (api/_lib/round-recap.js; 0 API-Football requests) and stored as JSON:
-- matches, goals, biggest win, upsets (standings snapshot before the
-- deadline), top scorers, top rating, the tier that paid best, and for the
-- game: most picked, best pick (captain bonus excluded) and who picked him,
-- captains who were their fan's best pick, the round's top 3, the quiet star
-- (20+ entries only). A value we cannot compute is absent, never filled.
--
-- Fans are stored by user id only. round_recap() puts names on them when it
-- is read, from public_profiles, so a deleted account leaves no name behind.
-- No new personal data is stored: the ids point at game results that are
-- already public once a round locks.
--
-- THE READER'S OWN LINES (never stored)
-- ---------------------------------------------------------------------------
-- round_recap() adds, for a signed-in reader: their main club, their points
-- and rank in the round, their season rank in the competition before and
-- after the round, and the round's top 3 in each private league they are in
-- (025: a league's table is for its members only, so it cannot be stored in a
-- recap anyone can read).
--
-- ROOM POSTS (switched on later, R-3)
-- ---------------------------------------------------------------------------
-- One post per club per round, never pinned (pinned is the room welcome: 033
-- rewrites every pinned system message and 035b adds a welcome only where none
-- is pinned). It absorbs 019's torcida top 3. While game_config.recap_posts is
-- false (the default) post_round_messages() does exactly what 019 did, and
-- marks every final round's recap as posted, so switching it on never posts an
-- old round. Rounds final before this migration (recaps_from), and rounds
-- created final (history), are stored as posted: the backfill never posts.

begin;

-- ---------------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.round_recaps (
  round_id      bigint      primary key references public.game_rounds(id),
  league_id     bigint      not null references public.leagues(id),
  season        integer     not null,
  round_no      integer,
  version       smallint    not null default 1,
  data          jsonb       not null,
  generated_at  timestamptz not null default now(),
  posted_at     timestamptz
);

-- SCHEMA PATCHES (no-ops today; later additive columns go here)
alter table public.round_recaps
  add column if not exists round_no     integer,
  add column if not exists version      smallint not null default 1,
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists posted_at    timestamptz;

create index if not exists round_recaps_league_idx on public.round_recaps (league_id, season, round_no desc);

comment on table public.round_recaps is
  'Round Recap per final Scout Game round (042), built once by the job from data we hold. Read through round_recap() and recent_round_recaps() only.';

-- Browsers never touch the table: reads go through the two functions below,
-- writes are the job's (service role). RLS on, no policy.
alter table public.round_recaps enable row level security;
revoke all on public.round_recaps from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. SETTINGS
-- ---------------------------------------------------------------------------
alter table public.game_config
  add column if not exists recap_posts boolean not null default false,
  add column if not exists recaps_from timestamptz;

-- The moment recaps began: a round final before it is history (never posted).
update public.game_config set recaps_from = now() where id and recaps_from is null;

comment on column public.game_config.recap_posts is
  'Round recap room posts (042). Off: post_round_messages() is 019''s torcida post. On: one merged post per club per round.';

-- ---------------------------------------------------------------------------
-- 3. READS
-- ---------------------------------------------------------------------------
/**
 * One recap: the stored facts, names for every fan it mentions, and for a
 * signed-in reader their own lines ("mine"). Null when the round has no recap.
 */
create or replace function public.round_recap(p_round_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  rr        public.round_recaps%rowtype;
  g         public.game_rounds%rowtype;
  v_mine    jsonb := null;
  v_ids     uuid[];
  v_club    bigint;
  v_total   numeric;
  v_rank    bigint;
  v_n       bigint;
  v_after   bigint;
  v_before  bigint;
  v_leagues jsonb;
begin
  select * into rr from public.round_recaps where round_id = p_round_id;
  if not found then
    return null;
  end if;
  select * into g from public.game_rounds where id = p_round_id;

  if v_uid is not null then
    select p.main_club_id into v_club from public.public_profiles p where p.id = v_uid;

    select k.total, k.rank, k.participants into v_total, v_rank, v_n
      from public.game_round_rankings k
     where k.round_id = p_round_id and k.user_id = v_uid;

    -- Season rank in this competition after the round and before it, with
    -- game_competition_standings' order (017).
    with rs as (
      select g2.id, g2.deadline_utc from public.game_rounds g2
       where g2.league_id = g.league_id and g2.season = g.season and g2.status <> 'open'
    ),
    t as (
      select res.user_id,
             sum(res.total)          filter (where rs.deadline_utc <= g.deadline_utc) as a_t,
             sum(res.captain_points) filter (where rs.deadline_utc <= g.deadline_utc) as a_c,
             min(res.submitted_at)   filter (where rs.deadline_utc <= g.deadline_utc) as a_s,
             sum(res.total)          filter (where rs.deadline_utc <  g.deadline_utc) as b_t,
             sum(res.captain_points) filter (where rs.deadline_utc <  g.deadline_utc) as b_c,
             min(res.submitted_at)   filter (where rs.deadline_utc <  g.deadline_utc) as b_s
        from public.game_round_results res
        join rs on rs.id = res.round_id
       group by res.user_id
    ),
    ra as (
      select t.user_id, row_number() over (order by t.a_t desc, t.a_c desc, t.a_s, t.user_id) as rk
        from t where t.a_t is not null
    ),
    rb as (
      select t.user_id, row_number() over (order by t.b_t desc, t.b_c desc, t.b_s, t.user_id) as rk
        from t where t.b_t is not null
    )
    select (select ra.rk from ra where ra.user_id = v_uid),
           (select rb.rk from rb where rb.user_id = v_uid)
      into v_after, v_before;

    -- The round's top 3 in each private league I am in, for this competition.
    select coalesce(jsonb_agg(jsonb_build_object('id', gl.id, 'name', gl.name, 'top3', (
             select coalesce(jsonb_agg(jsonb_build_object('u', x.user_id, 'total', x.total, 'rank', x.rk) order by x.rk), '[]'::jsonb)
               from (
                 select res.user_id, res.total,
                        row_number() over (order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rk
                   from public.game_round_results res
                   join public.game_league_members m
                     on m.league_id = gl.id and m.user_id = res.user_id and m.left_at is null and m.removed_at is null
                  where res.round_id = p_round_id
               ) x
              where x.rk <= 3))
           order by gl.name, gl.id), '[]'::jsonb)
      into v_leagues
      from public.game_leagues gl
      join public.game_league_members me
        on me.league_id = gl.id and me.user_id = v_uid and me.left_at is null and me.removed_at is null
     where gl.league_id = g.league_id and gl.season = g.season
       and (gl.closed_at is null or g.deadline_utc < gl.closed_at);

    v_mine := jsonb_build_object(
      'main_club_id', v_club,
      'total', v_total, 'rank', v_rank, 'participants', v_n,
      'season_rank', v_after, 'season_rank_before', v_before,
      'leagues', v_leagues);
  end if;

  -- Every fan this answer names: the best pick's, the top 3, my leagues' top 3.
  select coalesce(array_agg(distinct x.u), '{}') into v_ids
    from (
      select (jsonb_array_elements_text(coalesce(rr.data #> '{game,best_pick,by}', '[]'::jsonb)))::uuid as u
      union all
      select (e ->> 'u')::uuid from jsonb_array_elements(coalesce(rr.data #> '{game,top3}', '[]'::jsonb)) e
      union all
      select (e #>> '{}')::uuid from jsonb_path_query(coalesce(v_mine, '{}'::jsonb), '$.leagues[*].top3[*].u') e
    ) x
   where x.u is not null;

  return jsonb_build_object(
    'round_id', rr.round_id, 'league_id', rr.league_id, 'season', rr.season,
    'round_no', rr.round_no, 'round_label', g.round_label,
    'finalized_at', g.finalized_at, 'generated_at', rr.generated_at, 'version', rr.version,
    'data', rr.data,
    'names', (select coalesce(jsonb_object_agg(p.id, p.name), '{}'::jsonb)
                from public.public_profiles p where p.id = any(v_ids)),
    'mine', v_mine);
end;
$$;

comment on function public.round_recap(bigint) is
  'Round Recap (042): the stored facts, names for the fans it mentions, and for a signed-in reader their own lines.';

/**
 * The Recaps list: newest first, one competition or all. Headline figures
 * only; the card reads round_recap().
 */
create or replace function public.recent_round_recaps(p_league_id bigint default null, p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.j order by x.deadline desc, x.round_id desc), '[]'::jsonb)
    from (
      select rr.round_id, g.deadline_utc as deadline,
             jsonb_build_object(
               'round_id', rr.round_id, 'league_id', rr.league_id, 'season', rr.season,
               'round_no', rr.round_no, 'round_label', g.round_label,
               'finalized_at', g.finalized_at, 'deadline_utc', g.deadline_utc,
               'played', rr.data #> '{matches,played}', 'goals', rr.data #> '{matches,goals}',
               'entries', rr.data #> '{game,entries}') as j
        from public.round_recaps rr
        join public.game_rounds g on g.id = rr.round_id
       where p_league_id is null or rr.league_id = p_league_id
       order by g.deadline_utc desc, rr.round_id desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) x;
$$;

comment on function public.recent_round_recaps(bigint, integer) is
  'Round Recap list (042): newest first, headline figures only.';

-- ---------------------------------------------------------------------------
-- 4. ROOM POSTS: 019's function, with the merged recap post behind a switch
-- ---------------------------------------------------------------------------
create or replace function public.post_round_messages()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_min   integer;
  v_on    boolean;
  v_posts integer := 0;
  r       record;
  v_room  uuid;    -- groups.id is a uuid (011)
  v_msg   uuid;    -- group_messages.id is a uuid (011)
  v_pt    text;
  v_en    text;
  v_body  text;
begin
  select greatest(3, coalesce(torcida_min_members, 3)), coalesce(recap_posts, false)
    into v_min, v_on
    from public.game_config where id;

  if not coalesce(v_on, false) then
    -- 019, unchanged: the torcida top 3 of each final round, once per club.
    for r in
      with fans as (
        select res.round_id, pp.main_club_id as club_id, pp.name, res.total,
               row_number() over (partition by res.round_id, pp.main_club_id
                                  order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rk,
               count(*) over (partition by res.round_id, pp.main_club_id) as n
          from public.game_round_results res
          join public.game_rounds g on g.id = res.round_id and g.status = 'final'
          join public.public_profiles pp on pp.id = res.user_id
         where pp.main_club_id is not null
      )
      select f.round_id, f.club_id,
             string_agg(f.rk || '. ' || coalesce(nullif(btrim(f.name), ''), 'A fan') || ' '
                        || to_char(f.total, 'FM9990.0'), ' · ' order by f.rk) as top3
        from fans f
       where f.n >= v_min and f.rk <= 3
         and not exists (select 1 from public.game_round_posts p
                          where p.round_id = f.round_id and p.club_id = f.club_id)
       group by f.round_id, f.club_id
    loop
      select g.id into v_room from public.groups g
       where g.club_id = r.club_id and g.is_official and g.active
       limit 1;
      if v_room is null then
        continue;
      end if;

      insert into public.group_messages (group_id, user_id, content, pinned, is_system)
      select v_room, null,
             l.name || ' · '
               || case when g.round_label like 'Regular Season%' then 'Round ' || g.round_no
                       else split_part(g.round_label, ' - ', 1) || ' · Round ' || g.round_no end
               || ' is final. Top of the ' || t.name || ' torcida in the Scout Game: ' || r.top3 || ' pts.',
             false, true
        from public.game_rounds g
        join public.leagues l on l.id = g.league_id
        join public.teams t on t.id = r.club_id
       where g.id = r.round_id
      returning id into v_msg;

      insert into public.game_round_posts (round_id, club_id, message_id)
      values (r.round_id, r.club_id, v_msg)
      on conflict do nothing;
      v_posts := v_posts + 1;
    end loop;

    -- Those rounds are handled: switching recap posts on never posts them.
    update public.round_recaps rr
       set posted_at = now()
      from public.game_rounds g
     where g.id = rr.round_id and g.status = 'final' and rr.posted_at is null;

    return v_posts;
  end if;

  -- Recap posts: one per club that played in the round, Portuguese first, then
  -- English, never pinned. The torcida top 3 is added when the club has
  -- max(3, torcida_min_members) fans in the round.
  for r in
    with due as (
      select rr.round_id, rr.data, g.round_label, g.round_no, l.name as league
        from public.round_recaps rr
        join public.game_rounds g on g.id = rr.round_id and g.status = 'final'
        join public.leagues l on l.id = rr.league_id
       where rr.posted_at is null
    ),
    m as (
      select d.round_id, d.round_label, d.round_no, d.league,
             (x ->> 'h')::bigint as home, (x ->> 'a')::bigint as away,
             (x ->> 'hg')::integer as hg, (x ->> 'ag')::integer as ag
        from due d, jsonb_array_elements(coalesce(d.data #> '{matches,results}', '[]'::jsonb)) x
    ),
    sides as (
      select m.*, m.home as club_id from m
      union all
      select m.*, m.away from m
    ),
    fans as (
      select res.round_id, pp.main_club_id as club_id, pp.name, res.total,
             row_number() over (partition by res.round_id, pp.main_club_id
                                order by res.total desc, res.captain_points desc, res.submitted_at, res.user_id) as rk,
             count(*) over (partition by res.round_id, pp.main_club_id) as n
        from public.game_round_results res
        join public.public_profiles pp on pp.id = res.user_id
       where pp.main_club_id is not null and res.round_id in (select d.round_id from due d)
    ),
    tops as (
      select f.round_id, f.club_id,
             string_agg(f.rk || '. ' || coalesce(nullif(btrim(f.name), ''), 'Um torcedor') || ' '
                        || replace(to_char(f.total, 'FM9990.0'), '.', ','), ' · ' order by f.rk) as top3_pt,
             string_agg(f.rk || '. ' || coalesce(nullif(btrim(f.name), ''), 'A fan') || ' '
                        || to_char(f.total, 'FM9990.0'), ' · ' order by f.rk) as top3_en
        from fans f where f.n >= v_min and f.rk <= 3
       group by f.round_id, f.club_id
    )
    select s.round_id, s.club_id, s.league, s.round_label, s.round_no, s.hg, s.ag,
           th.name as home_name, ta.name as away_name, tc.name as club_name,
           tp.top3_pt, tp.top3_en
      from sides s
      join public.teams th on th.id = s.home
      join public.teams ta on ta.id = s.away
      join public.teams tc on tc.id = s.club_id
      left join tops tp on tp.round_id = s.round_id and tp.club_id = s.club_id
     where not exists (select 1 from public.game_round_posts p
                        where p.round_id = s.round_id and p.club_id = s.club_id)
  loop
    select g.id into v_room from public.groups g
     where g.club_id = r.club_id and g.is_official and g.active
     limit 1;
    if v_room is null then
      continue;
    end if;

    v_pt := case when r.round_label like 'Regular Season%' then 'Rodada ' || r.round_no
                 else split_part(r.round_label, ' - ', 1) || ' · Rodada ' || r.round_no end
            || ' · ' || r.league || ': ' || r.home_name || ' ' || r.hg || '–' || r.ag || ' ' || r.away_name || '.';
    v_en := case when r.round_label like 'Regular Season%' then 'Round ' || r.round_no
                 else split_part(r.round_label, ' - ', 1) || ' · Round ' || r.round_no end
            || ' · ' || r.league || ': ' || r.home_name || ' ' || r.hg || '–' || r.ag || ' ' || r.away_name || '.';
    v_body := v_pt || coalesce(' Torcida no Scout Game: ' || r.top3_pt || ' pts.', '')
              || ' · ' || v_en || coalesce(' Top of the ' || r.club_name || ' torcida in the Scout Game: ' || r.top3_en || ' pts.', '');
    -- group_messages holds 500 characters (011): drop the top 3 before the result.
    if char_length(v_body) > 500 then
      v_body := v_pt || ' · ' || v_en;
    end if;
    if char_length(v_body) > 500 then
      continue;
    end if;

    insert into public.group_messages (group_id, user_id, content, pinned, is_system)
    values (v_room, null, v_body, false, true)
    returning id into v_msg;

    insert into public.game_round_posts (round_id, club_id, message_id)
    values (r.round_id, r.club_id, v_msg)
    on conflict do nothing;
    v_posts := v_posts + 1;
  end loop;

  update public.round_recaps rr
     set posted_at = now()
    from public.game_rounds g
   where g.id = rr.round_id and g.status = 'final' and rr.posted_at is null;

  return v_posts;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. GRANTS
-- ---------------------------------------------------------------------------
revoke all on function public.round_recap(bigint) from public;
revoke all on function public.recent_round_recaps(bigint, integer) from public;
grant execute on function public.round_recap(bigint) to anon, authenticated, service_role;
grant execute on function public.recent_round_recaps(bigint, integer) to anon, authenticated, service_role;
revoke all on function public.post_round_messages() from public, anon, authenticated;
grant execute on function public.post_round_messages() to service_role;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- Browsers cannot read or write the table; the readers are open; posts are off:
--   select has_table_privilege('anon', 'public.round_recaps', 'SELECT') as anon_reads,
--          has_table_privilege('authenticated', 'public.round_recaps', 'INSERT') as auth_writes,
--          has_function_privilege('anon', 'public.round_recap(bigint)', 'EXECUTE') as anon_recap,
--          has_function_privilege('authenticated', 'public.post_round_messages()', 'EXECUTE') as auth_posts,
--          (select recap_posts from public.game_config) as posts_on,
--          (select recaps_from is not null from public.game_config) as from_set;   -- false, false, true, false, false, true
--
-- After the backfill calls (/api/cron/recaps until pending = 0):
--   recaps per competition, none waiting to be posted:
--   select l.slug, count(*) as recaps, count(*) filter (where rr.posted_at is null) as unposted,
--          min(rr.round_no) as first, max(rr.round_no) as last
--     from public.round_recaps rr join public.leagues l on l.id = rr.league_id
--    group by l.slug order by l.slug;                                         -- unposted 0 everywhere
--
--   final rounds still without a recap (incomplete data; expect only a few,
--   each with a fixture whose player rows never arrived):
--   select l.slug, g.round_label from public.game_rounds g join public.leagues l on l.id = g.league_id
--    where g.status = 'final' and not exists (select 1 from public.round_recaps rr where rr.round_id = g.id)
--    order by l.slug, g.deadline_utc;
--
--   one recap, as the app will read it (Série A 35 once it is final, ~21 Nov 21:30 UTC):
--   select public.round_recap((select g.id from public.game_rounds g join public.leagues l on l.id = g.league_id
--                               where l.slug = 'serie_a' and g.round_label = 'Regular Season - 35'));
--
--   no recap post is pinned, and none exists while the switch is off:
--   select count(*) from public.group_messages m join public.game_round_posts p on p.message_id = m.id
--    where m.pinned;                                                           -- 0
