-- 028_club_features.sql — polls, the transfer wishlist and analyst insights
-- on the club page (public/community.html), in the database at last.
--
-- Run in the Supabase SQL editor. Safe to run more than once. Depends on 003
-- (teams), 007 (follows, profiles.main_club_id), 008 (is_admin, public_profiles,
-- reports, moderation), 011 (moderation_check), 012 (reports.target_id is text)
-- and 025 (export_my_data, replaced below with three more sections).
--
-- What was there before: polls and the wishlist lived only in the page's
-- memory (rule 10), so nobody else ever saw them. analyst_posts existed, with
-- three holes: any signed-in user could insert (the analysts-only rule lived
-- in the page), the credential badge was whatever the browser sent, and
-- reactions were a JSON counter only the author could update, so everyone
-- else's reactions silently did nothing.
--
-- Decisions (16 Nov 2026):
--   * Creating a poll, voting, suggesting and upvoting a player: members of
--     that club's room only = the club is your main club or one you follow
--     (the same derived membership as club_chat_overview in 011).
--   * A poll vote is final: no update, no delete.
--   * Poll length is the creator's choice: 24 h, 3 days or 7 days.
--   * Wishlist position: GK, DF, MF, FW or none. No free text.
--   * Removal is a SOFT delete (deleted_at), by the author or an admin only.
--     Reports go to `reports` and are reviewed in the dashboard; nothing is
--     hidden automatically.
--
-- Counts are COUNT(*) over the vote tables, exposed through views that carry
-- counts only. Who voted for what is never readable by anyone but the voter.

begin;

-- ---------------------------------------------------------------------------
-- 0. FRESH-ENVIRONMENT ONLY — analyst_posts predates this folder
-- ---------------------------------------------------------------------------
-- Created in the dashboard in May 2026; only its RLS reached the repo (002).
-- A best reconstruction from SCOUTMIND_PROJECT_CONTEXT.md, and a no-op on
-- production, where the table exists.
create table if not exists public.analyst_posts (
  id          uuid primary key default gen_random_uuid(),
  team_id     text,
  user_id     uuid references public.profiles(id) on delete set null,
  user_name   text,
  credential  text,
  content     text not null,
  reactions   jsonb default '{"fire": 0, "clap": 0, "mind_blown": 0}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1. SCHEMA PATCHES
-- ---------------------------------------------------------------------------
create table if not exists public.polls (
  id          bigserial primary key,
  club_id     bigint not null references public.teams(id) on delete restrict,
  question    text   not null,
  options     text[] not null,
  closes_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.polls
  add column if not exists created_by     uuid references auth.users(id) on delete set null,
  add column if not exists duration_hours smallint not null default 24,
  add column if not exists deleted_at     timestamptz,
  add column if not exists deleted_by     uuid references auth.users(id) on delete set null;

create table if not exists public.poll_votes (
  poll_id     bigint   not null references public.polls(id) on delete cascade,
  user_id     uuid     not null references auth.users(id) on delete cascade,
  option_idx  smallint not null,
  created_at  timestamptz not null default now(),
  primary key (poll_id, user_id)            -- one vote per person, by the schema
);

create table if not exists public.wishlist_items (
  id           bigserial primary key,
  club_id      bigint not null references public.teams(id) on delete restrict,
  player_name  text   not null,
  name_key     text   not null default '',
  created_at   timestamptz not null default now()
);
alter table public.wishlist_items
  add column if not exists created_by    uuid references auth.users(id) on delete set null,
  add column if not exists current_club  text,
  add column if not exists position      text,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references auth.users(id) on delete set null;

create table if not exists public.wishlist_votes (
  item_id     bigint not null references public.wishlist_items(id) on delete cascade,
  user_id     uuid   not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (item_id, user_id)            -- one upvote per person per player
);

alter table public.analyst_posts
  add column if not exists club_id     bigint references public.teams(id) on delete restrict,
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references auth.users(id) on delete set null;

create table if not exists public.analyst_post_reactions (
  post_id     uuid not null references public.analyst_posts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id, kind)      -- one of each reaction per person
);

-- Checks, added once (an `add constraint` has no `if not exists`).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'polls_question_len') then
    alter table public.polls add constraint polls_question_len check (char_length(question) between 5 and 140);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'polls_options_count') then
    alter table public.polls add constraint polls_options_count check (array_length(options, 1) between 2 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'polls_duration') then
    alter table public.polls add constraint polls_duration check (duration_hours in (24, 72, 168));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wishlist_items_name_len') then
    alter table public.wishlist_items add constraint wishlist_items_name_len check (char_length(player_name) between 2 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wishlist_items_club_len') then
    alter table public.wishlist_items add constraint wishlist_items_club_len check (current_club is null or char_length(current_club) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wishlist_items_position') then
    alter table public.wishlist_items add constraint wishlist_items_position check (position is null or position in ('GK', 'DF', 'MF', 'FW'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'analyst_post_reactions_kind') then
    alter table public.analyst_post_reactions add constraint analyst_post_reactions_kind check (kind in ('fire', 'clap', 'mind_blown'));
  end if;
end $$;

comment on column public.polls.closes_at is
  'Set by poll_guard() from duration_hours at insert; the browser cannot choose it.';
comment on column public.wishlist_items.name_key is
  'moderation_normalise(player_name): the duplicate key. "Neymar Jr." and "neymar jr" are one player.';
comment on column public.analyst_posts.team_id is
  'DEPRECATED. The pre-package-2 25-slug club key. Never written since 028 — join on club_id.';
comment on column public.analyst_posts.user_name is
  'DEPRECATED. Emptied by analyst_post_guard(); authors come from public_profiles.';
comment on column public.analyst_posts.reactions is
  'DEPRECATED. A JSON counter only the author could update. Counts come from analyst_post_reactions since 028.';
comment on column public.analyst_posts.credential is
  'Copied from profiles.credential by analyst_post_guard() — never trusted from the browser.';

create index if not exists polls_club_idx          on public.polls(club_id, created_at desc) where deleted_at is null;
create index if not exists polls_author_idx        on public.polls(created_by, created_at desc);
create index if not exists poll_votes_user_idx     on public.poll_votes(user_id);
create unique index if not exists wishlist_items_club_key on public.wishlist_items(club_id, name_key) where deleted_at is null;
create index if not exists wishlist_items_author_idx on public.wishlist_items(created_by, created_at desc);
create index if not exists wishlist_votes_user_idx on public.wishlist_votes(user_id, created_at desc);
create index if not exists analyst_posts_club_idx  on public.analyst_posts(club_id, created_at desc) where deleted_at is null;
create index if not exists analyst_posts_author_idx on public.analyst_posts(user_id, created_at desc);
create index if not exists analyst_reactions_user_idx on public.analyst_post_reactions(user_id, created_at desc);

-- reports learns the three new targets (011 added group_message).
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
  check (target_type in ('comment', 'group_message', 'poll', 'wishlist_item', 'analyst_post'));

-- ---------------------------------------------------------------------------
-- 2. WHO IS WHO
-- ---------------------------------------------------------------------------
-- Membership is not a table (011): your main club or a follow.
create or replace function public.is_club_member(p_club bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.main_club_id = p_club)
    or exists (select 1 from public.follows f where f.user_id = auth.uid() and f.team_id = p_club)
  );
$$;

comment on function public.is_club_member(bigint) is
  'True when the club is the caller''s main club or one they follow. Answers only about auth.uid().';

-- Roles change only from the dashboard (013): plan is never written by the app.
create or replace function public.is_analyst()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan in ('analyst', 'admin'));
$$;

-- ---------------------------------------------------------------------------
-- 3. GUARDS — limits enforced in the database (the 011 pattern)
-- ---------------------------------------------------------------------------
-- A BEFORE trigger runs before the policy's WITH CHECK, so these raise a
-- readable message (translated in the page through tServer) where the policy
-- alone would answer "violates row-level security policy". The policies below
-- still hold on their own.
--
-- Rates count every row the person created, removed ones included, so
-- creating and removing cannot reset a limit. Change them here and nowhere else.

create or replace function public.poll_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  opts   text[];
  o      text;
  n      integer;
begin
  if not public.is_club_member(new.club_id) then
    raise exception 'Follow this club to start a poll in its room.' using errcode = 'check_violation';
  end if;

  new.question := btrim(coalesce(new.question, ''));
  if char_length(new.question) not between 5 and 140 then
    raise exception 'A poll question needs 5 to 140 characters.' using errcode = 'check_violation';
  end if;

  opts := array[]::text[];
  foreach o in array coalesce(new.options, array[]::text[]) loop
    o := btrim(coalesce(o, ''));
    if o <> '' then opts := opts || o; end if;
  end loop;
  if coalesce(array_length(opts, 1), 0) not between 2 and 4 then
    raise exception 'A poll needs 2 to 4 options.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(opts) x where char_length(x) > 60) then
    raise exception 'Each option can have up to 60 characters.' using errcode = 'check_violation';
  end if;
  if (select count(distinct lower(x)) from unnest(opts) x) <> array_length(opts, 1) then
    raise exception 'Each option must be different.' using errcode = 'check_violation';
  end if;
  new.options := opts;

  if new.duration_hours is null or new.duration_hours not in (24, 72, 168) then
    raise exception 'A poll runs for 24 hours, 3 days or 7 days.' using errcode = 'check_violation';
  end if;
  new.created_at := now();
  new.closes_at  := now() + make_interval(hours => new.duration_hours);
  new.deleted_at := null;
  new.deleted_by := null;

  select count(*) into n from public.polls
   where created_by = new.created_by and created_at > now() - interval '30 seconds';
  if n > 0 then
    raise exception 'Slow down a moment before posting again.' using errcode = 'check_violation';
  end if;
  select count(*) into n from public.polls
   where created_by = new.created_by and created_at > now() - interval '1 day';
  if n >= 3 then
    raise exception 'You can start 3 polls a day. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.polls
              where created_by = new.created_by and club_id = new.club_id
                and deleted_at is null and closes_at > now()) then
    raise exception 'You already have an open poll in this room. Wait for it to close.' using errcode = 'check_violation';
  end if;

  perform public.moderation_check(new.question || ' ' || array_to_string(opts, ' '));
  return new;
end;
$$;

drop trigger if exists polls_guard on public.polls;
create trigger polls_guard before insert on public.polls
  for each row execute function public.poll_guard();

create or replace function public.poll_vote_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
begin
  select club_id, options, closes_at, deleted_at into p from public.polls where id = new.poll_id;
  if not found or p.deleted_at is not null then
    raise exception 'That poll is no longer here.' using errcode = 'check_violation';
  end if;
  if p.closes_at <= now() then
    raise exception 'This poll is closed.' using errcode = 'check_violation';
  end if;
  if not public.is_club_member(p.club_id) then
    raise exception 'Follow this club to vote.' using errcode = 'check_violation';
  end if;
  if new.option_idx is null or new.option_idx < 0 or new.option_idx >= array_length(p.options, 1) then
    raise exception 'That option does not exist.' using errcode = 'check_violation';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists poll_votes_guard on public.poll_votes;
create trigger poll_votes_guard before insert on public.poll_votes
  for each row execute function public.poll_vote_guard();

create or replace function public.wishlist_item_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not public.is_club_member(new.club_id) then
    raise exception 'Follow this club to suggest a player.' using errcode = 'check_violation';
  end if;

  new.player_name := btrim(coalesce(new.player_name, ''));
  if char_length(new.player_name) not between 2 and 60 then
    raise exception 'A player name needs 2 to 60 characters.' using errcode = 'check_violation';
  end if;
  new.current_club := nullif(btrim(coalesce(new.current_club, '')), '');
  if new.current_club is not null and char_length(new.current_club) > 60 then
    raise exception 'A club name can have up to 60 characters.' using errcode = 'check_violation';
  end if;
  if new.position is not null and new.position not in ('GK', 'DF', 'MF', 'FW') then
    raise exception 'Choose a position from the list.' using errcode = 'check_violation';
  end if;
  new.name_key   := public.moderation_normalise(new.player_name);
  new.created_at := now();
  new.deleted_at := null;
  new.deleted_by := null;

  if exists (select 1 from public.wishlist_items
              where club_id = new.club_id and name_key = new.name_key and deleted_at is null) then
    raise exception 'That player is already on the list. Upvote them instead.' using errcode = 'check_violation';
  end if;

  select count(*) into n from public.wishlist_items
   where created_by = new.created_by and created_at > now() - interval '30 seconds';
  if n > 0 then
    raise exception 'Slow down a moment before posting again.' using errcode = 'check_violation';
  end if;
  select count(*) into n from public.wishlist_items
   where created_by = new.created_by and created_at > now() - interval '1 day';
  if n >= 5 then
    raise exception 'You can suggest 5 players a day. Try again tomorrow.' using errcode = 'check_violation';
  end if;

  perform public.moderation_check(new.player_name || ' ' || coalesce(new.current_club, ''));
  return new;
end;
$$;

drop trigger if exists wishlist_items_guard on public.wishlist_items;
create trigger wishlist_items_guard before insert on public.wishlist_items
  for each row execute function public.wishlist_item_guard();

-- The person who suggests a player wants them: their upvote comes with it.
create or replace function public.wishlist_item_self_vote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is not null then
    insert into public.wishlist_votes (item_id, user_id) values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists wishlist_items_self_vote on public.wishlist_items;
create trigger wishlist_items_self_vote after insert on public.wishlist_items
  for each row execute function public.wishlist_item_self_vote();

-- Upvotes and reactions: the primary key stops a double vote. The hourly cap
-- counts the rows a person holds from the last hour, which stops a script
-- upvoting every player on every club; toggling one vote on and off cannot
-- change any count, so it is not limited further.
create or replace function public.wishlist_vote_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i record;
  n integer;
begin
  select club_id, deleted_at into i from public.wishlist_items where id = new.item_id;
  if not found or i.deleted_at is not null then
    raise exception 'That player is no longer on the list.' using errcode = 'check_violation';
  end if;
  if not public.is_club_member(i.club_id) then
    raise exception 'Follow this club to vote.' using errcode = 'check_violation';
  end if;
  select count(*) into n from public.wishlist_votes
   where user_id = new.user_id and created_at > now() - interval '1 hour';
  if n >= 60 then
    raise exception 'You have hit the hourly vote limit. Try again later.' using errcode = 'check_violation';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists wishlist_votes_guard on public.wishlist_votes;
create trigger wishlist_votes_guard before insert on public.wishlist_votes
  for each row execute function public.wishlist_vote_guard();

create or replace function public.analyst_post_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not public.is_analyst() then
    raise exception 'Only verified analysts can post insights.' using errcode = 'check_violation';
  end if;
  if new.club_id is null then
    raise exception 'An insight needs a club.' using errcode = 'check_violation';
  end if;
  new.content := btrim(coalesce(new.content, ''));
  if char_length(new.content) not between 20 and 2000 then
    raise exception 'An insight needs 20 to 2,000 characters.' using errcode = 'check_violation';
  end if;

  -- Never trusted from the browser.
  new.credential := (select p.credential from public.profiles p where p.id = new.user_id);
  new.user_name  := null;
  new.team_id    := null;
  new.created_at := now();
  new.deleted_at := null;
  new.deleted_by := null;

  select count(*) into n from public.analyst_posts
   where user_id = new.user_id and created_at > now() - interval '10 minutes';
  if n > 0 then
    raise exception 'You can post one insight every 10 minutes.' using errcode = 'check_violation';
  end if;
  select count(*) into n from public.analyst_posts
   where user_id = new.user_id and created_at > now() - interval '1 day';
  if n >= 5 then
    raise exception 'You can post 5 insights a day. Try again tomorrow.' using errcode = 'check_violation';
  end if;

  perform public.moderation_check(new.content);
  return new;
end;
$$;

drop trigger if exists analyst_posts_guard on public.analyst_posts;
create trigger analyst_posts_guard before insert on public.analyst_posts
  for each row execute function public.analyst_post_guard();

create or replace function public.analyst_reaction_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.analyst_posts where id = new.post_id and deleted_at is null) then
    raise exception 'That insight is no longer here.' using errcode = 'check_violation';
  end if;
  select count(*) into n from public.analyst_post_reactions
   where user_id = new.user_id and created_at > now() - interval '1 hour';
  if n >= 60 then
    raise exception 'You have hit the hourly reaction limit. Try again later.' using errcode = 'check_violation';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists analyst_post_reactions_guard on public.analyst_post_reactions;
create trigger analyst_post_reactions_guard before insert on public.analyst_post_reactions
  for each row execute function public.analyst_reaction_guard();

-- Removal: ONE function, the only way the app can change these rows. The
-- browser holds no UPDATE on polls, wishlist_items or analyst_posts at all
-- (section 6), so text can never be edited after people voted on it, and a
-- removal is final. A function rather than an UPDATE policy because an UPDATE
-- that hides the row from its own read policy (deleted_at is null) is refused
-- by PostgREST as "new row violates row-level security policy".
create or replace function public.remove_club_item(p_kind text, p_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_deleted timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = 'check_violation';
  end if;
  if p_kind = 'poll' then
    select created_by, deleted_at into v_owner, v_deleted from public.polls where id = p_id::bigint;
  elsif p_kind = 'wishlist_item' then
    select created_by, deleted_at into v_owner, v_deleted from public.wishlist_items where id = p_id::bigint;
  elsif p_kind = 'analyst_post' then
    select user_id, deleted_at into v_owner, v_deleted from public.analyst_posts where id = p_id::uuid;
  else
    raise exception 'Nothing to remove.' using errcode = 'check_violation';
  end if;
  if not found or v_deleted is not null then
    raise exception 'That has already been removed.' using errcode = 'check_violation';
  end if;
  if v_owner is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the author or an admin can remove this.' using errcode = 'check_violation';
  end if;

  if p_kind = 'poll' then
    update public.polls set deleted_at = now(), deleted_by = auth.uid() where id = p_id::bigint;
  elsif p_kind = 'wishlist_item' then
    update public.wishlist_items set deleted_at = now(), deleted_by = auth.uid() where id = p_id::bigint;
  else
    update public.analyst_posts set deleted_at = now(), deleted_by = auth.uid() where id = p_id::uuid;
  end if;
end;
$$;

comment on function public.remove_club_item(text, text) is
  'Soft-deletes a poll, wishlist entry or analyst insight. Author or admin only; nothing is ever hard-deleted from the app.';

-- ---------------------------------------------------------------------------
-- 4. COUNTS — views that carry numbers, never voters
-- ---------------------------------------------------------------------------
-- Plain views run with the owner's rights (like club_chat_overview in 011), so
-- they can count rows the reader cannot see. Removed items are left out.
-- Columns are APPENDED ONLY on any future change.
create or replace view public.poll_results as
select v.poll_id, v.option_idx, count(*)::integer as votes
  from public.poll_votes v
  join public.polls p on p.id = v.poll_id and p.deleted_at is null
 group by v.poll_id, v.option_idx;

create or replace view public.wishlist_ranked as
select i.id, i.club_id, i.created_by, i.player_name, i.current_club, i.position, i.created_at,
       coalesce(c.upvotes, 0)::integer as upvotes
  from public.wishlist_items i
  left join (select item_id, count(*) as upvotes from public.wishlist_votes group by item_id) c
    on c.item_id = i.id
 where i.deleted_at is null;

create or replace view public.analyst_reaction_counts as
select r.post_id, r.kind, count(*)::integer as reactions
  from public.analyst_post_reactions r
  join public.analyst_posts a on a.id = r.post_id and a.deleted_at is null
 group by r.post_id, r.kind;

comment on view public.poll_results is 'Votes per option of live polls. Counts only; who voted is in poll_votes, readable only by the voter.';
comment on view public.wishlist_ranked is 'Live wishlist entries with their upvote count.';
comment on view public.analyst_reaction_counts is 'Reactions per kind on live insights. Counts only.';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.polls                  enable row level security;
alter table public.poll_votes             enable row level security;
alter table public.wishlist_items         enable row level security;
alter table public.wishlist_votes         enable row level security;
alter table public.analyst_posts          enable row level security;
alter table public.analyst_post_reactions enable row level security;

-- No UPDATE or DELETE policy on the three content tables: removal goes
-- through remove_club_item() only.
drop policy if exists "polls read live"          on public.polls;
drop policy if exists "polls member insert"      on public.polls;
create policy "polls read live" on public.polls
  for select to anon, authenticated using (deleted_at is null);
create policy "polls member insert" on public.polls
  for insert to authenticated
  with check (auth.uid() = created_by and public.is_club_member(club_id));

-- Your own votes only. Nobody, guest or member, can list who voted for what.
drop policy if exists "poll_votes own read"      on public.poll_votes;
drop policy if exists "poll_votes member insert" on public.poll_votes;
create policy "poll_votes own read" on public.poll_votes
  for select to authenticated using (auth.uid() = user_id);
create policy "poll_votes member insert" on public.poll_votes
  for insert to authenticated
  with check (auth.uid() = user_id
              and public.is_club_member((select p.club_id from public.polls p where p.id = poll_id)));

drop policy if exists "wishlist_items read live"     on public.wishlist_items;
drop policy if exists "wishlist_items member insert" on public.wishlist_items;
create policy "wishlist_items read live" on public.wishlist_items
  for select to anon, authenticated using (deleted_at is null);
create policy "wishlist_items member insert" on public.wishlist_items
  for insert to authenticated
  with check (auth.uid() = created_by and public.is_club_member(club_id));

drop policy if exists "wishlist_votes own read"      on public.wishlist_votes;
drop policy if exists "wishlist_votes member insert" on public.wishlist_votes;
drop policy if exists "wishlist_votes own delete"    on public.wishlist_votes;
create policy "wishlist_votes own read" on public.wishlist_votes
  for select to authenticated using (auth.uid() = user_id);
create policy "wishlist_votes member insert" on public.wishlist_votes
  for insert to authenticated
  with check (auth.uid() = user_id
              and public.is_club_member((select i.club_id from public.wishlist_items i where i.id = item_id)));
-- Taking your own upvote back is a toggle, not a removal of content.
create policy "wishlist_votes own delete" on public.wishlist_votes
  for delete to authenticated using (auth.uid() = user_id);

-- analyst_posts: 002's four policies are replaced. "auth insert" let anyone
-- post; "owner delete" was a hard delete; "owner update" let an author rewrite
-- a post after people had reacted to it.
drop policy if exists "analyst_posts: public read"   on public.analyst_posts;
drop policy if exists "analyst_posts: auth insert"   on public.analyst_posts;
drop policy if exists "analyst_posts: owner update"  on public.analyst_posts;
drop policy if exists "analyst_posts: owner delete"  on public.analyst_posts;
drop policy if exists "analyst_posts read live"      on public.analyst_posts;
drop policy if exists "analyst_posts analyst insert" on public.analyst_posts;
create policy "analyst_posts read live" on public.analyst_posts
  for select to anon, authenticated using (deleted_at is null);
create policy "analyst_posts analyst insert" on public.analyst_posts
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_analyst() and club_id is not null);

drop policy if exists "analyst_reactions own read"   on public.analyst_post_reactions;
drop policy if exists "analyst_reactions own insert" on public.analyst_post_reactions;
drop policy if exists "analyst_reactions own delete" on public.analyst_post_reactions;
create policy "analyst_reactions own read" on public.analyst_post_reactions
  for select to authenticated using (auth.uid() = user_id);
create policy "analyst_reactions own insert" on public.analyst_post_reactions
  for insert to authenticated with check (auth.uid() = user_id);
create policy "analyst_reactions own delete" on public.analyst_post_reactions
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. GRANTS — explicit, so a policy mistake is never the only barrier
-- ---------------------------------------------------------------------------
-- Guests read content and counts; they write nothing and never see a vote row.
revoke all on public.polls, public.poll_votes, public.wishlist_items, public.wishlist_votes,
              public.analyst_posts, public.analyst_post_reactions from anon;
grant select on public.polls, public.wishlist_items, public.analyst_posts to anon;

grant select, insert on public.polls, public.wishlist_items, public.analyst_posts to authenticated;
-- No UPDATE (not even per column) and no DELETE: removal is remove_club_item().
revoke update, delete, truncate on public.polls, public.wishlist_items, public.analyst_posts from authenticated;
-- A column-level UPDATE (from a hand edit in the dashboard) survives a
-- table-level revoke; take back any that exist, for both roles.
do $$
declare r record;
begin
  for r in select distinct table_name, column_name, grantee
             from information_schema.column_privileges
            where table_schema = 'public' and privilege_type = 'UPDATE'
              and grantee in ('anon', 'authenticated')
              and table_name in ('polls', 'wishlist_items', 'analyst_posts')
  loop
    execute format('revoke update (%I) on public.%I from %I', r.column_name, r.table_name, r.grantee);
  end loop;
end $$;

-- A poll vote is final: select (your own, by policy) and insert only.
grant select, insert on public.poll_votes to authenticated;
revoke update, delete on public.poll_votes from authenticated;
-- An upvote or reaction can be taken back, never edited.
grant select, insert, delete on public.wishlist_votes, public.analyst_post_reactions to authenticated;
revoke update on public.wishlist_votes, public.analyst_post_reactions from authenticated;

grant usage, select on sequence public.polls_id_seq, public.wishlist_items_id_seq to authenticated;
revoke all on sequence public.polls_id_seq, public.wishlist_items_id_seq from anon;

grant select on public.poll_results, public.wishlist_ranked, public.analyst_reaction_counts to anon, authenticated;
revoke insert, update, delete on public.poll_results, public.wishlist_ranked, public.analyst_reaction_counts from anon, authenticated;

-- The page asks these two about the signed-in reader, to show or hide forms.
revoke all on function public.is_club_member(bigint) from public, anon;
revoke all on function public.is_analyst() from public, anon;
grant execute on function public.is_club_member(bigint) to authenticated;
grant execute on function public.is_analyst() to authenticated;

-- Trigger functions are never called directly.
revoke all on function public.poll_guard()              from public, anon, authenticated;
revoke all on function public.poll_vote_guard()         from public, anon, authenticated;
revoke all on function public.wishlist_item_guard()     from public, anon, authenticated;
revoke all on function public.wishlist_item_self_vote() from public, anon, authenticated;
revoke all on function public.wishlist_vote_guard()     from public, anon, authenticated;
revoke all on function public.analyst_post_guard()      from public, anon, authenticated;
revoke all on function public.analyst_reaction_guard()  from public, anon, authenticated;

revoke all on function public.remove_club_item(text, text) from public, anon;
grant execute on function public.remove_club_item(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. LGPD — export_my_data() gains the club page (025's body + four sections)
-- ---------------------------------------------------------------------------
-- Account deletion needs no change: votes and reactions go with the account
-- (on delete cascade), and polls, suggestions and insights stay with no author
-- (on delete set null; analyst_posts is anonymised by delete_account_data).
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
    -- 028: the club page.
    'club_page', jsonb_build_object(
      'polls_created', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', p.id, 'club_id', p.club_id, 'question', p.question, 'options', to_jsonb(p.options),
                             'duration_hours', p.duration_hours, 'closes_at', p.closes_at, 'created_at', p.created_at,
                             'deleted_at', p.deleted_at) order by p.created_at)
                             from public.polls p join me on p.created_by = me.uid), '[]'::jsonb),
      'poll_votes', coalesce((select jsonb_agg(jsonb_build_object(
                             'poll_id', v.poll_id, 'option_idx', v.option_idx, 'created_at', v.created_at)
                             order by v.created_at)
                             from public.poll_votes v join me on v.user_id = me.uid), '[]'::jsonb),
      'wishlist_suggested', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'club_id', i.club_id, 'player_name', i.player_name, 'current_club', i.current_club,
                             'position', i.position, 'created_at', i.created_at, 'deleted_at', i.deleted_at)
                             order by i.created_at)
                             from public.wishlist_items i join me on i.created_by = me.uid), '[]'::jsonb),
      'wishlist_upvotes', coalesce((select jsonb_agg(jsonb_build_object('item_id', w.item_id, 'created_at', w.created_at)
                             order by w.created_at)
                             from public.wishlist_votes w join me on w.user_id = me.uid), '[]'::jsonb),
      'analyst_insights', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', a.id, 'club_id', a.club_id, 'content', a.content, 'credential', a.credential,
                             'created_at', a.created_at, 'deleted_at', a.deleted_at) order by a.created_at)
                             from public.analyst_posts a join me on a.user_id = me.uid), '[]'::jsonb),
      'insight_reactions', coalesce((select jsonb_agg(jsonb_build_object('post_id', r.post_id, 'kind', r.kind,
                             'created_at', r.created_at) order by r.created_at)
                             from public.analyst_post_reactions r join me on r.user_id = me.uid), '[]'::jsonb)
    ),
    'activity_events', coalesce((select jsonb_agg(jsonb_build_object('type', ev.type, 'ref_type', ev.ref_type,
                                         'ref_id', ev.ref_id, 'created_at', ev.created_at) order by ev.created_at)
                                   from public.events ev join me on ev.user_id = me.uid), '[]'::jsonb)
  ) end;
$$;

comment on function public.export_my_data() is
  'LGPD portability: every row we hold about auth.uid(), as one JSON document (private leagues since 025, the club page since 028). Signed-in callers only, and only ever their own data.';

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY — one query, every row should say ok = true
-- ---------------------------------------------------------------------------
--   select * from (values
--     ('rls on all six tables', (select bool_and(relrowsecurity) from pg_class
--         where relnamespace = 'public'::regnamespace and relname in
--         ('polls','poll_votes','wishlist_items','wishlist_votes','analyst_posts','analyst_post_reactions'))),
--     ('guests cannot write', not (has_table_privilege('anon','public.polls','INSERT')
--         or has_table_privilege('anon','public.poll_votes','INSERT')
--         or has_table_privilege('anon','public.wishlist_items','INSERT')
--         or has_table_privilege('anon','public.wishlist_votes','INSERT')
--         or has_table_privilege('anon','public.analyst_posts','INSERT')
--         or has_table_privilege('anon','public.analyst_post_reactions','INSERT'))),
--     ('guests cannot read votes', not (has_table_privilege('anon','public.poll_votes','SELECT')
--         or has_table_privilege('anon','public.wishlist_votes','SELECT'))),
--     ('no hard delete of content', not (has_table_privilege('authenticated','public.polls','DELETE')
--         or has_table_privilege('authenticated','public.wishlist_items','DELETE')
--         or has_table_privilege('authenticated','public.analyst_posts','DELETE'))),
--     ('content cannot be edited', not (has_any_column_privilege('authenticated','public.polls','UPDATE')
--         or has_any_column_privilege('authenticated','public.wishlist_items','UPDATE')
--         or has_any_column_privilege('authenticated','public.analyst_posts','UPDATE'))),
--     ('removal is the function', has_function_privilege('authenticated','public.remove_club_item(text,text)','EXECUTE')
--         and not has_function_privilege('anon','public.remove_club_item(text,text)','EXECUTE')),
--     ('a poll vote is final', not (has_table_privilege('authenticated','public.poll_votes','UPDATE')
--         or has_table_privilege('authenticated','public.poll_votes','DELETE'))),
--     ('counts readable by guests', has_table_privilege('anon','public.poll_results','SELECT')
--         and has_table_privilege('anon','public.wishlist_ranked','SELECT')
--         and has_table_privilege('anon','public.analyst_reaction_counts','SELECT')),
--     ('helpers not callable by guests', not has_function_privilege('anon','public.is_club_member(bigint)','EXECUTE')
--         and has_function_privilege('authenticated','public.is_club_member(bigint)','EXECUTE')),
--     ('six guards in place', (select count(*) = 6 from pg_trigger where not tgisinternal and tgname in
--         ('polls_guard','poll_votes_guard','wishlist_items_guard','wishlist_votes_guard',
--          'analyst_posts_guard','analyst_post_reactions_guard'))),
--     ('reports accept the new targets', (select pg_get_constraintdef(oid) like '%analyst_post%'
--         from pg_constraint where conname = 'reports_target_type_check')),
--     ('export covers the club page', (select prosrc like '%club_page%' from pg_proc
--         where proname = 'export_my_data' and pronamespace = 'public'::regnamespace))
--   ) as t(check_name, ok);
