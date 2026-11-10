-- 024_account_deletion.sql — self-service account deletion and data export
-- (LGPD art. 18).
--
-- Run in the Supabase SQL editor BEFORE pushing. Safe to run more than once.
-- Depends on 008, 011, 012, 017 and the dashboard-era tables (profiles,
-- analyst_posts, badge_applications), each touched only if it exists.
--
-- HOW A DELETION RUNS (api/account/delete.js, service role, in this order)
-- ---------------------------------------------------------------------------
--   1. the route checks the caller's session, the typed confirmation and
--      their password;
--   2. it calls delete_account_data(user) below: anonymises what stays,
--      erases what goes, and deletes the profiles row;
--   3. it deletes the auth.users row through the Auth admin API; the foreign
--      keys fixed in section 1 then remove or detach everything else.
-- Step 2 is idempotent, so if step 3 fails the user simply tries again.
--
-- WHAT HAPPENS TO EACH KIND OF ROW
-- ---------------------------------------------------------------------------
--   erased:     profiles row; follows, reactions, comment/message likes,
--               user_badges (cascade from auth.users); badge_applications
--               (they hold an email and a bio)
--   kept, without the person:
--               comments, group_messages, analyst_posts -> author null, shown
--                 as "[deleted user]"; text kept so threads still read
--               reports they filed -> reporter null (moderation record)
--               game_entries, game_picks, game_round_results -> a random
--                 "ghost" id per deleted account, so other players' ranks and
--                 the round's participant count do not move
--               events -> user null (already the rule since 008)
--               deleted_by / resolved_by / created_by stamps -> null
--
-- RULE 13 (no DELETE in api/) is about scheduled ingest jobs: a job that
-- deleted outside its window would wipe backfilled data. A person erasing
-- their own account under LGPD art. 18 is a different thing. The one
-- exception, /api/account/delete, is named in CLAUDE.md.

begin;

-- ---------------------------------------------------------------------------
-- 1. FOREIGN KEYS: what each reference does when its parent goes
-- ---------------------------------------------------------------------------
-- Several references were NO ACTION (blocking the delete of anyone who had
-- ever deleted their own comment, or who moderated) or CASCADE where the row
-- must survive. Each is dropped and re-created with the intended rule. The
-- constraint is found by column, not by name, because the dashboard-era
-- tables have generated names.
create or replace function pg_temp.refk(p_table text, p_col text, p_parent text, p_rule text)
returns void language plpgsql as $$
declare
  c record;
begin
  if to_regclass(p_table) is null then return; end if;
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
     where con.contype = 'f'
       and con.conrelid = to_regclass(p_table)
       and a.attname = p_col
  loop
    execute format('alter table %s drop constraint %I', p_table, c.conname);
  end loop;
  if p_parent is not null then
    execute format('alter table %s add constraint %I foreign key (%I) references %s(id) on delete %s',
                   p_table, replace(p_table, 'public.', '') || '_' || p_col || '_fkey', p_col, p_parent, p_rule);
  end if;
end $$;

create or replace function pg_temp.nullable(p_table text, p_col text)
returns void language plpgsql as $$
begin
  if to_regclass(p_table) is not null then
    execute format('alter table %s alter column %I drop not null', p_table, p_col);
  end if;
end $$;

-- Authors: the row stays, the person goes.
select pg_temp.nullable('public.comments', 'user_id');
select pg_temp.refk('public.comments',        'user_id',    'auth.users',      'set null');
select pg_temp.refk('public.group_messages',  'user_id',    'public.profiles', 'set null');
select pg_temp.nullable('public.analyst_posts', 'user_id');
select pg_temp.refk('public.analyst_posts',   'user_id',    'public.profiles', 'set null');
select pg_temp.nullable('public.reports', 'reporter_id');
select pg_temp.refk('public.reports',         'reporter_id','auth.users',      'set null');

-- Stamps: who deleted, resolved or created something.
select pg_temp.refk('public.comments',        'deleted_by', 'auth.users',      'set null');
select pg_temp.refk('public.group_messages',  'deleted_by', 'auth.users',      'set null');
select pg_temp.refk('public.reports',         'resolved_by','auth.users',      'set null');
select pg_temp.refk('public.groups',          'created_by', 'public.profiles', 'set null');

-- Personal records that go with the account.
select pg_temp.refk('public.badge_applications', 'user_id', 'public.profiles', 'cascade');
select pg_temp.refk('public.profiles',        'id',         'auth.users',      'cascade');

-- The Scout Game: entries and results move to a ghost id, which has no
-- auth.users row, so these two lose their foreign key (rows are still only
-- ever written by submit_picks() for auth.uid() and by the job).
select pg_temp.refk('public.game_entries',       'user_id', null, null);
select pg_temp.refk('public.game_round_results', 'user_id', null, null);

-- ---------------------------------------------------------------------------
-- 2. delete_account_data(user) — step 2 of a deletion (service role only)
-- ---------------------------------------------------------------------------
-- Idempotent: a second run finds nothing left to change. Returns what it did,
-- for the route's log. Never called from the browser.
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

  -- follows, reactions, comment_likes, message_likes and anything else that
  -- cascades from auth.users goes when the route deletes the auth user.
  return v_out;
end;
$$;

comment on function public.delete_account_data(uuid) is
  'Step 2 of an account deletion (LGPD art. 18): anonymises content that stays, erases personal records and the profile. Service role only; called by /api/account/delete before it deletes the auth user.';

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. export_my_data() — portability (LGPD art. 18, V)
-- ---------------------------------------------------------------------------
-- Everything we hold about the caller, as one JSON document. SECURITY DEFINER
-- so it can read rows RLS hides from the browser (the reports they filed,
-- their events), but every query is pinned to auth.uid(): it can only ever
-- return the caller's own data.
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
      'badges', coalesce((select jsonb_agg(to_jsonb(b)) from public.user_badges b join me on b.user_id = me.uid), '[]'::jsonb)
    ),
    'activity_events', coalesce((select jsonb_agg(jsonb_build_object('type', ev.type, 'ref_type', ev.ref_type,
                                         'ref_id', ev.ref_id, 'created_at', ev.created_at) order by ev.created_at)
                                   from public.events ev join me on ev.user_id = me.uid), '[]'::jsonb)
  ) end;
$$;

comment on function public.export_my_data() is
  'LGPD portability: every row we hold about auth.uid(), as one JSON document. Signed-in callers only, and only ever their own data.';

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The reference rules. Expect, per row: comments.user_id n (SET NULL),
-- comments.deleted_by n, group_messages.user_id n, group_messages.deleted_by n,
-- reports.reporter_id n, reports.resolved_by n, groups.created_by n,
-- analyst_posts.user_id n, badge_applications.user_id c (CASCADE),
-- profiles.id c; and NO rows for game_entries.user_id or
-- game_round_results.user_id:
--   select conrelid::regclass as tbl, a.attname as col, confrelid::regclass as parent, confdeltype
--     from pg_constraint con
--     join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
--    where con.contype = 'f' and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
--    order by 1, 2;
--
-- Who may call what. Expect false, false, true:
--   select has_function_privilege('authenticated', 'public.delete_account_data(uuid)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.export_my_data()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.export_my_data()', 'EXECUTE');
--
-- In the SQL editor there is no auth.uid(). Expect null:
--   select public.export_my_data();
