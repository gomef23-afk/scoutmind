-- 012_likes.sql — one 👍 per person on a comment or a chat message.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 008
-- (comments, reports, events, is_admin) and 011 (group_messages).
--
-- Nothing is deleted (rule 13) — but note that unliking IS a delete, and that
-- is correct: see the note on the tables below.
--
-- ---------------------------------------------------------------------------
-- FIRST, A BUG 011 SHIPPED WITH
-- ---------------------------------------------------------------------------
-- `group_messages.id` is a **uuid**. `reports.target_id` is **bigint**. So
-- reporting a chat message — which package 4 added a button for — could never
-- have worked: PostgREST would reject the uuid before it reached a policy.
--
-- Found by querying production after 011 was applied. 011 reconstructed these
-- tables' schema from the code that queried them, because their `create table`
-- was done in the dashboard years before this folder existed, and the
-- reconstruction guessed bigserial. `create table if not exists` meant the
-- guess was skipped on production and did no damage there, but everything I
-- keyed to a message inherited the wrong assumption.
--
-- `target_id` becomes `text`, so one column holds both a comment's bigint and a
-- message's uuid. The alternative — a second `target_uuid` column — means every
-- reader picking between two columns forever. bigint -> text is lossless, and
-- existing comment reports keep working because '41' still equals '41'.
--
-- `events.ref_id` has the same problem for the same reason, so it is widened
-- too. Telemetry that cannot name the thing it is about is not telemetry.

begin;

-- ---------------------------------------------------------------------------
-- 1. POLYMORPHIC KEYS BECOME TEXT
-- ---------------------------------------------------------------------------
-- The partial unique index on reports is rebuilt automatically by the type
-- change. Re-runnable: the `using` cast is a no-op once the column is text.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='reports'
       and column_name='target_id' and data_type <> 'text'
  ) then
    alter table public.reports alter column target_id type text using target_id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='events'
       and column_name='ref_id' and data_type <> 'text'
  ) then
    alter table public.events alter column ref_id type text using ref_id::text;
  end if;
end $$;

comment on column public.reports.target_id is
  'Text because the target is polymorphic: comments have bigint ids, group_messages have uuids. Read it together with target_type, never alone.';

-- ---------------------------------------------------------------------------
-- 2. THE LIKE TABLES
-- ---------------------------------------------------------------------------
-- Two tables rather than one polymorphic one. The ids are different types
-- (bigint vs uuid), so a shared table would need the same text column as
-- reports and would lose both foreign keys with it. Two tables keep real FKs,
-- which is what makes `on delete cascade` tidy up after a hard-deleted parent
-- without a job to run.
--
-- The pair IS the primary key, so liking twice is impossible at the schema
-- level — there is no count to drift and no idempotency to get wrong.
--
-- Unliking is a genuine DELETE, and that is deliberate. Rule 13 protects the
-- ingest jobs in api/, where a job running outside its window would wipe
-- backfilled football data; it is not a rule that a person's withdrawn 👍 must
-- be kept forever. A soft-deleted like would mean maintaining a `deleted_at`
-- filter on every count for no benefit to anyone.
create table if not exists public.comment_likes (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.message_likes (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Counting likes for a thread means "every like for these 20 comments", which
-- reads the leading column of the primary key — already indexed. These cover
-- the other direction: everything one person liked, for a profile page later.
create index if not exists comment_likes_user_idx on public.comment_likes(user_id);
create index if not exists message_likes_user_idx on public.message_likes(user_id);

comment on table public.comment_likes is
  'One like per user per comment, enforced by the primary key. No downvotes: there is no column for one and no plan to add one.';

-- ---------------------------------------------------------------------------
-- 3. EVENTS: 'like'
-- ---------------------------------------------------------------------------
alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check
  check (type in ('session','comment','reaction','follow','unfollow','report',
                  'club_set','group_message','like'));

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Counts are public, so reads are public. A like is only ever your own: insert
-- and delete are both scoped to auth.uid(), which means one person can never
-- unlike on another's behalf.
alter table public.comment_likes enable row level security;
alter table public.message_likes enable row level security;

drop policy if exists "comment_likes public read" on public.comment_likes;
drop policy if exists "comment_likes self insert" on public.comment_likes;
drop policy if exists "comment_likes self delete" on public.comment_likes;
drop policy if exists "message_likes public read" on public.message_likes;
drop policy if exists "message_likes self insert" on public.message_likes;
drop policy if exists "message_likes self delete" on public.message_likes;

create policy "comment_likes public read" on public.comment_likes
  for select to anon, authenticated using (true);
create policy "comment_likes self insert" on public.comment_likes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "comment_likes self delete" on public.comment_likes
  for delete to authenticated using (auth.uid() = user_id);

create policy "message_likes public read" on public.message_likes
  for select to anon, authenticated using (true);
create policy "message_likes self insert" on public.message_likes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "message_likes self delete" on public.message_likes
  for delete to authenticated using (auth.uid() = user_id);

-- There is deliberately no UPDATE policy on either table. A like has nothing
-- to change: you have one or you do not.

-- ---------------------------------------------------------------------------
-- 5. GRANTS
-- ---------------------------------------------------------------------------
-- The anon revokes are the point. Without them a guest's like reaches RLS and
-- is stopped there — the right answer arrived at by luck, one policy edit away
-- from being wrong. The probes in the VERIFY block check this, not the policy.
grant select on public.comment_likes to anon, authenticated;
grant select on public.message_likes to anon, authenticated;
grant insert, delete on public.comment_likes to authenticated;
grant insert, delete on public.message_likes to authenticated;

revoke insert, update, delete on public.comment_likes from anon;
revoke insert, update, delete on public.message_likes from anon;
revoke update on public.comment_likes from authenticated;
revoke update on public.message_likes from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The type change landed, and no report was damaged by it:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='reports' and column_name='target_id';
--   -- expect text
--   select target_type, count(*) from public.reports group by 1;
--   -- expect the same counts as before this migration
--
-- A uuid target now fits, which is what was broken:
--   select target_type, target_id from public.reports
--    where target_type = 'group_message' limit 5;
--
-- Policies — expect three per table, SELECT/INSERT/DELETE, and no UPDATE:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename in ('comment_likes','message_likes')
--    order by 1,3;
--
-- anon holds SELECT only:
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee='anon' and table_schema='public'
--      and table_name in ('comment_likes','message_likes') order by 1,2;
--   -- expect two rows, both SELECT
--
-- authenticated holds no UPDATE:
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee='authenticated' and table_schema='public'
--      and table_name in ('comment_likes','message_likes') order by 1,2;
--   -- expect SELECT, INSERT, DELETE on each — never UPDATE
--
-- Liking twice is impossible (expect a unique violation, not a second row):
--   -- run as a signed-in user in the app, not here
--
-- Most-liked comments, once there are any:
--   select c.id, left(c.content, 60) as comment, count(l.user_id) as likes
--     from public.comments c
--     left join public.comment_likes l on l.comment_id = c.id
--    where c.deleted_at is null
--    group by 1,2 order by likes desc, c.created_at desc limit 10;
