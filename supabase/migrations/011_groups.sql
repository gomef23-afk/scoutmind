-- 011_groups.sql — one official community chat per club.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 003
-- (teams), 007 (follows, profiles.main_club_id) and 008 (is_admin,
-- moderation_blocklist, reports, events).
--
-- Nothing is deleted (rule 13). The eight May groups are deactivated, not
-- dropped, and their test messages stay attached to them.
--
-- ---------------------------------------------------------------------------
-- READ THIS FIRST: these two tables are older than this folder
-- ---------------------------------------------------------------------------
-- `groups` and `group_messages` were created in the Supabase dashboard before
-- migrations were tracked. Only their RLS reached the repo, in 002. So the
-- `create table if not exists` blocks below are a best reconstruction from the
-- code that queries them (public/community.html) and from 002's policies:
--
--   groups          id, team_id (the OLD 25-slug text key), name, description,
--                   created_by, created_at
--   group_messages  id, group_id, user_id, user_name, content, created_at
--
-- On production both blocks are no-ops — the tables exist, so nothing in them
-- runs. They matter only for a fresh environment. Every change this file makes
-- to the LIVE tables goes through a guarded `do` block or `add column if not
-- exists`, so an inaccurate reconstruction cannot corrupt anything.
--
-- Before trusting the reconstruction, compare it:
--
--   select table_name, column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('groups','group_messages')
--    order by table_name, ordinal_position;
--
-- If it differs, fix the blocks below so the repo tells the truth.
--
-- ---------------------------------------------------------------------------
-- WHY THE OLD GROUPS CANNOT SIMPLY BE REUSED
-- ---------------------------------------------------------------------------
-- `groups.team_id` holds the 25-slug club key that package 2 deleted. The app
-- now keys every club on `teams.id` across 146 clubs, and nothing in the
-- product produces those slugs any more. Rather than translate a dead key, the
-- eight legacy rows are retired and 146 official groups are created fresh from
-- `teams`. `team_id` stays on the table, nullable, holding history.

begin;

-- ---------------------------------------------------------------------------
-- 0. FRESH-ENVIRONMENT ONLY — skipped entirely on production
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id          bigserial primary key,
  team_id     text,
  name        text not null,
  description text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_messages (
  id         bigserial primary key,
  group_id   bigint not null references public.groups(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  user_name  text,
  content    text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1. SCHEMA PATCHES
-- ---------------------------------------------------------------------------
alter table public.groups
  add column if not exists club_id     bigint references public.teams(id) on delete cascade,
  add column if not exists is_official boolean not null default false,
  add column if not exists active      boolean not null default true,
  add column if not exists created_at  timestamptz not null default now();

comment on column public.groups.team_id is
  'DEPRECATED. The pre-package-2 25-slug club key. Kept for the eight legacy rows only — join on club_id.';
comment on column public.groups.club_id is
  'teams(id). The live club key.';
comment on column public.groups.is_official is
  'True for the one group ScoutMind creates per club. Users cannot create groups — insert is revoked.';

alter table public.group_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists pinned     boolean not null default false,
  add column if not exists is_system  boolean not null default false;

comment on column public.group_messages.user_name is
  'DEPRECATED. Denormalised at write time by the May implementation, so a rename never reached old messages. Never written or read now — authors come from public_profiles.';
comment on column public.group_messages.is_system is
  'ScoutMind itself speaking. user_id is null; there is deliberately no system auth account to compromise.';

-- The legacy columns must accept nulls: official groups have no slug and no
-- creator, and a pinned system message has no user. `drop not null` on an
-- already-nullable column is a no-op, but it errors if the column is absent —
-- hence the guards, since the live schema is a reconstruction.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='groups' and column_name='team_id') then
    alter table public.groups alter column team_id drop not null;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='groups' and column_name='created_by') then
    alter table public.groups alter column created_by drop not null;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='group_messages' and column_name='user_id') then
    alter table public.group_messages alter column user_id drop not null;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='group_messages' and column_name='user_name') then
    alter table public.group_messages alter column user_name drop not null;
  end if;
end $$;

-- A human message must have an author; a system message must not have one.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='group_messages_author') then
    alter table public.group_messages
      add constraint group_messages_author
      check ((is_system and user_id is null) or (not is_system and user_id is not null))
      not valid;
  end if;
end $$;

-- 500 characters, matching comments. NOT VALID on purpose: the May test
-- chatter is grandfathered rather than rewritten or deleted, and every new row
-- is checked. Validate it later with
--   alter table public.group_messages validate constraint group_messages_content_len;
-- once you are satisfied the old rows are within range.
--
-- One edge to know about: NOT VALID skips the initial scan, but the constraint
-- IS re-checked whenever a row is updated. So if a legacy message is longer
-- than 500 characters, soft-deleting it would fail. Those rooms are retired and
-- unreachable, so it cannot bite in normal use. Check first if it ever matters:
--   select count(*) from public.group_messages where char_length(content) > 500;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='group_messages_content_len') then
    alter table public.group_messages
      add constraint group_messages_content_len
      check (char_length(content) between 1 and 500)
      not valid;
  end if;
end $$;

-- The only read pattern: one room, oldest first, deleted rows skipped.
create index if not exists group_messages_room_idx
  on public.group_messages(group_id, created_at)
  where deleted_at is null;

create index if not exists groups_club_idx on public.groups(club_id) where active;

-- ---------------------------------------------------------------------------
-- 2. RETIRE THE EIGHT LEGACY GROUPS
-- ---------------------------------------------------------------------------
-- Everything that predates club_id is May test chatter. Hidden, not deleted:
-- the rows and their messages stay, and `active` is what the read policy
-- filters on.
update public.groups
   set active = false
 where club_id is null
   and active;

-- ---------------------------------------------------------------------------
-- 3. ONE OFFICIAL GROUP PER CLUB
-- ---------------------------------------------------------------------------
-- Idempotent: the `not exists` is what lets this file run again after new
-- clubs are added by a league expansion, creating only the missing rooms.
insert into public.groups (club_id, name, description, is_official, active)
select t.id,
       t.name || ' Community',
       'Match days, transfers, arguments. The official ' || t.name || ' room.',
       true,
       true
  from public.teams t
 where not exists (
   select 1 from public.groups g
    where g.club_id = t.id and g.is_official
 );

-- Exactly one official room per club, enforced rather than assumed. Partial, so
-- the retired legacy rows (club_id null, is_official false) are unaffected.
create unique index if not exists groups_one_official_per_club
  on public.groups(club_id)
  where is_official;

-- ---------------------------------------------------------------------------
-- 4. THE PINNED WELCOME
-- ---------------------------------------------------------------------------
-- An empty room reads as a dead product. One system message per official group
-- means nobody is ever the first person talking to nobody.
--
-- It is pinned and is_system with a null user_id: there is no ScoutMind auth
-- account, so there is no password, no session and nothing to take over. The
-- front end renders is_system rows as ScoutMind.
insert into public.group_messages (group_id, user_id, content, pinned, is_system)
select g.id,
       null,
       'Welcome to the ' || t.name || ' community. Match days, transfers, arguments. Be decent.',
       true,
       true
  from public.groups g
  join public.teams t on t.id = g.club_id
 where g.is_official
   and not exists (
     select 1 from public.group_messages m
      where m.group_id = g.id and m.is_system
   );

-- ---------------------------------------------------------------------------
-- 5. EXTEND THE 008 ENUMS
-- ---------------------------------------------------------------------------
-- reports.target_type and events.type are CHECK constraints, so widening them
-- means replacing the constraint. Both are rewritten from the full list rather
-- than appended to, so the file states the whole truth and stays re-runnable.
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('comment','group_message'));

alter table public.events drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check
  check (type in ('session','comment','reaction','follow','unfollow','report',
                  'club_set','group_message'));

-- ---------------------------------------------------------------------------
-- 6. MODERATION, DEFINED ONCE
-- ---------------------------------------------------------------------------
-- 008 put the blocklist logic inside comment_guard(), where a second trigger
-- could not reach it. Copying it into a group trigger would leave two
-- definitions to drift apart — the same failure that let the feed query and
-- the search query disagree about duplicates. So it moves out here, and
-- comment_guard() is rewritten to call it. Identical behaviour: the body below
-- is 008's, lifted unchanged.
create or replace function public.moderation_check(txt text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hit     text;
  norm    text;
  words   text;
  cleaned text;
  allowed text;
begin
  words := ' ' || public.moderation_words(txt) || ' ';

  -- Strip allowlisted words before the substring pass, so "Nigeria" does not
  -- trip the collapsed form of a slur while a real slur beside it still does.
  cleaned := words;
  for allowed in select a.word from public.moderation_allowlist a loop
    cleaned := replace(cleaned, ' ' || allowed || ' ', ' ');
  end loop;
  norm := public.moderation_normalise(cleaned);

  select b.pattern into hit
    from public.moderation_blocklist b
   where (b.mode = 'substring' and norm  like '%' || b.pattern || '%')
      or (b.mode = 'word'      and words like '% ' || b.pattern || ' %')
   limit 1;

  if hit is not null then
    raise exception 'That message breaks the community rules. Please rephrase it.'
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.moderation_check(text) from public, anon, authenticated;

create or replace function public.comment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent integer;
  hourly integer;
begin
  new.content := btrim(new.content);
  if char_length(new.content) = 0 then
    raise exception 'Comment is empty.' using errcode = 'check_violation';
  end if;

  select count(*) into recent
    from public.comments
   where user_id = new.user_id
     and created_at > now() - interval '10 seconds';
  if recent > 0 then
    raise exception 'Slow down a moment before posting again.'
      using errcode = 'check_violation';
  end if;

  select count(*) into hourly
    from public.comments
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';
  if hourly >= 20 then
    raise exception 'You have hit the hourly comment limit. Try again later.'
      using errcode = 'check_violation';
  end if;

  perform public.moderation_check(new.content);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- group_message_guard
-- ---------------------------------------------------------------------------
-- Same blocklist as comments, DIFFERENT rate limits, and the difference is
-- deliberate.
--
-- A comment is a considered reply to an article; 20 an hour is generous. A
-- match-day room is a conversation — 20 an hour is one message every three
-- minutes, which throttles the product hardest at the exact moment it is worth
-- using. 1 per 5 seconds still stops a flood, and 60 an hour still stops a
-- sustained one.
--
-- Change them here and nowhere else.
create or replace function public.group_message_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent integer;
  hourly integer;
  room   record;
begin
  -- System messages are inserted by migrations as the table owner, never
  -- through PostgREST, and skip every user-facing rule.
  if new.is_system then
    return new;
  end if;

  new.content := btrim(new.content);
  if char_length(new.content) = 0 then
    raise exception 'Message is empty.' using errcode = 'check_violation';
  end if;

  -- The room has to be open. Without this, the eight retired groups would
  -- still accept writes from anyone who kept an old group id.
  select g.active, g.is_official into room
    from public.groups g where g.id = new.group_id;
  if not found or not room.active then
    raise exception 'That room is closed.' using errcode = 'check_violation';
  end if;

  -- Never trusted from the client: the May implementation stored a display
  -- name alongside every message, and renaming yourself left every old message
  -- showing the old name. Authors are resolved from public_profiles at read
  -- time now, so this column must stay empty.
  new.user_name := null;

  select count(*) into recent
    from public.group_messages
   where user_id = new.user_id
     and created_at > now() - interval '5 seconds';
  if recent > 0 then
    raise exception 'Slow down a moment before posting again.'
      using errcode = 'check_violation';
  end if;

  select count(*) into hourly
    from public.group_messages
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';
  if hourly >= 60 then
    raise exception 'You have hit the hourly message limit. Try again later.'
      using errcode = 'check_violation';
  end if;

  perform public.moderation_check(new.content);
  return new;
end;
$$;

drop trigger if exists group_messages_guard on public.group_messages;
create trigger group_messages_guard
  before insert on public.group_messages
  for each row execute function public.group_message_guard();

-- ---------------------------------------------------------------------------
-- 7. club_chat_overview — one read for the Clubs page and the Home sidebar
-- ---------------------------------------------------------------------------
-- Membership is not a table. You are in your club's room because it is your
-- club: main club or a follow, nothing to join and nothing to leave. So the
-- member count is derived, which also means it can never drift from the
-- follows that produce it.
--
-- This is a plain view, so it runs with the owner's rights (like
-- public_profiles in 008) and can count rows in `profiles` and `follows`
-- without those tables being readable directly. Only the aggregate escapes —
-- never who is in the room.
--
-- Columns are APPENDED ONLY on any future change: `create or replace view`
-- matches by position, and renaming column 3 is the error that broke 008 on
-- production.
create or replace view public.club_chat_overview as
select
  g.id                        as group_id,
  g.club_id,
  g.name                      as group_name,
  coalesce(m.members, 0)      as member_count,
  last_msg.created_at         as last_message_at,
  left(coalesce(last_msg.content, ''), 120) as last_message_preview,
  last_msg.user_id            as last_message_user_id,
  last_msg.is_system          as last_message_is_system
from public.groups g
left join lateral (
  select count(*) as members
    from (
      select p.id from public.profiles p where p.main_club_id = g.club_id
      union
      select f.user_id from public.follows f where f.team_id = g.club_id
    ) u
) m on true
left join lateral (
  select mm.created_at, mm.content, mm.user_id, mm.is_system
    from public.group_messages mm
   where mm.group_id = g.id
     and mm.deleted_at is null
   order by mm.created_at desc
   limit 1
) last_msg on true
where g.is_official and g.active;

comment on view public.club_chat_overview is
  'Per-club chat summary for the Clubs page and Home sidebar. Member count is derived from main_club_id + follows, so it cannot drift. Exposes the count only, never the members.';

grant select on public.club_chat_overview to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS — replacing the May policies wholesale
-- ---------------------------------------------------------------------------
-- What 002 left in place, and why none of it survives:
--
--   groups: auth insert          anyone could create a group. The product is
--                                one official room per club.
--   groups: owner update/delete  a creator could rename or hard-delete a room,
--                                taking its messages with it (rule 13).
--   group_messages: public read  `using (true)` — soft-deleted messages would
--                                stay readable once deleted_at existed.
--   group_messages: owner update a user could rewrite the text of a message
--                                after other people had replied to it.
alter table public.groups         enable row level security;
alter table public.group_messages enable row level security;

drop policy if exists "groups: public read"           on public.groups;
drop policy if exists "groups: auth insert"           on public.groups;
drop policy if exists "groups: owner update"          on public.groups;
drop policy if exists "groups: owner delete"          on public.groups;
drop policy if exists "groups active read"            on public.groups;
drop policy if exists "groups admin write"            on public.groups;

drop policy if exists "group_messages: public read"   on public.group_messages;
drop policy if exists "group_messages: auth insert"   on public.group_messages;
drop policy if exists "group_messages: owner update"  on public.group_messages;
drop policy if exists "group_messages: owner delete"  on public.group_messages;
drop policy if exists "group_messages read"           on public.group_messages;
drop policy if exists "group_messages self insert"    on public.group_messages;
drop policy if exists "group_messages soft delete"    on public.group_messages;

-- Retired rooms disappear from the API rather than lingering as empty pages.
create policy "groups active read" on public.groups
  for select to anon, authenticated
  using (active);

-- Renaming or retiring a room is an admin action. There is no insert policy
-- and no delete policy at all: rooms are created by migration and never
-- destroyed.
create policy "groups admin write" on public.groups
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "group_messages read" on public.group_messages
  for select to anon, authenticated
  using (deleted_at is null);

-- `is_system` is forced false so nobody can post as ScoutMind. The guard
-- trigger would let a system row through every check.
create policy "group_messages self insert" on public.group_messages
  for insert to authenticated
  with check (auth.uid() = user_id and not is_system and not pinned);

-- Author or admin. The column grant below is what makes `content` immutable:
-- this policy permits the row, the grant decides which columns may change.
create policy "group_messages soft delete" on public.group_messages
  for update to authenticated
  using ((auth.uid() = user_id or public.is_admin()) and deleted_at is null)
  with check (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. GRANTS
-- ---------------------------------------------------------------------------
-- RLS alone is not enough. Without an explicit revoke a guest's write still
-- reaches the policy layer and is stopped there — the right outcome by luck
-- rather than by design, and one policy edit away from being wrong.
grant select on public.groups to anon, authenticated;
grant update (name, description, active) on public.groups to authenticated;
revoke insert, delete on public.groups from anon, authenticated;

grant select on public.group_messages to anon, authenticated;
grant insert on public.group_messages to authenticated;
-- Deliberately NOT content: a message cannot be edited, only withdrawn.
grant update (deleted_at, deleted_by) on public.group_messages to authenticated;

revoke insert, update, delete on public.group_messages from anon;
revoke all                    on public.groups         from anon;
grant  select                 on public.groups         to   anon;

-- The id sequence, only if these tables actually use one — the live schema is
-- a reconstruction and may use uuids.
do $$
begin
  if exists (select 1 from pg_class where relkind='S' and relname='group_messages_id_seq') then
    grant usage, select on sequence public.group_messages_id_seq to authenticated;
    revoke all on sequence public.group_messages_id_seq from anon;
  end if;
  if exists (select 1 from pg_class where relkind='S' and relname='groups_id_seq') then
    revoke all on sequence public.groups_id_seq from anon, authenticated;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- 146 official rooms, 8 retired:
--   select is_official, active, count(*) from public.groups group by 1,2 order by 1,2;
--   -- expect (true, true) = 146 and (false, false) = 8
--
-- One room per club, no club missed:
--   select count(*) from public.teams t
--    where not exists (select 1 from public.groups g
--                       where g.club_id = t.id and g.is_official);
--   -- expect 0
--
-- The legacy messages are still attached to their retired rooms:
--   select g.id, g.name, count(m.id) as messages
--     from public.groups g left join public.group_messages m on m.group_id = g.id
--    where not g.active group by 1,2 order by 3 desc;
--
-- One pinned welcome per official room, and no other system messages:
--   select count(*) from public.group_messages where is_system and pinned;   -- 146
--   select count(*) from public.group_messages where is_system and not pinned; -- 0
--
-- The overview reads:
--   select * from public.club_chat_overview order by member_count desc limit 10;
--
-- Policies are the new set only — nothing from May survives:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public' and tablename in ('groups','group_messages')
--    order by 1,2;
--   -- expect exactly: groups active read (SELECT), groups admin write (UPDATE),
--   --   group_messages read (SELECT), group_messages self insert (INSERT),
--   --   group_messages soft delete (UPDATE)
--
-- anon holds SELECT and nothing else:
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee='anon' and table_schema='public'
--      and table_name in ('groups','group_messages')
--    order by 1,2;
--   -- expect two rows, both SELECT
--
-- authenticated cannot touch message content:
--   select column_name, privilege_type from information_schema.column_privileges
--    where table_name='group_messages' and grantee='authenticated'
--      and privilege_type='UPDATE';
--   -- expect deleted_at and deleted_by only
