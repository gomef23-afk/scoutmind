-- 002_public_read.sql
-- ScoutMind social pivot, Phase B1 (guest mode).
--
-- Guests (the `anon` role) must be able to READ the social content, because
-- scoutmind.app now opens straight into the feed with no auth guard. Writes
-- stay restricted to signed-in users, and each row can only be changed by the
-- person who created it.
--
-- Shape applied below:
--   analyst_posts / groups / group_messages
--     SELECT          anon + authenticated
--     INSERT          authenticated, own row only
--     UPDATE/DELETE   row owner only
--
--   profiles
--     NOT publicly selectable. The table holds email addresses.
--     A signed-in user can read and update ONLY their own row.
--     Public/social reads go through the `public_profiles` VIEW, which exposes
--     just id, name, plan, credential, created_at — never email.
--
--   badge_applications
--     INSERT          authenticated only (applications are tied to an account)
--     No SELECT at all — applications hold an email and a bio, and only Felipe
--     needs to read them via the Supabase dashboard (service role bypasses RLS).
--
-- Run this in the Supabase SQL editor BEFORE deploying B1.

begin;

-- ---------------------------------------------------------------------------
-- profiles — private table, own-row access only
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles: public read"  on public.profiles;
drop policy if exists "profiles: self read"    on public.profiles;
drop policy if exists "profiles: self insert"  on public.profiles;
drop policy if exists "profiles: self update"  on public.profiles;
drop policy if exists "profiles: self delete"  on public.profiles;

create policy "profiles: self read"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles: self insert"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles: self update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: self delete"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- Belt and braces: even without a policy, anon must not hold a table grant.
revoke all on public.profiles from anon;

-- ---------------------------------------------------------------------------
-- public_profiles — the ONLY public window onto profiles
--
-- Column list is deliberate: email is omitted and must stay omitted.
--
-- The view runs with the OWNER's privileges (security_invoker = false), which
-- is what lets it read past the row-level policies above and serve every row
-- to anon. That is the intended design: the view itself is the access control,
-- and it can only ever return the five safe columns. Supabase's linter flags
-- public views like this as "security definer view" — expected here, not a bug.
-- ---------------------------------------------------------------------------
drop view if exists public.public_profiles;

create view public.public_profiles as
  select id, name, plan, credential, created_at
    from public.profiles;

alter view public.public_profiles set (security_invoker = false);

grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profile creation on signup
--
-- WHY THIS IS NEEDED: email confirmation is enabled, so auth.signUp() returns a
-- user but NO session. The client-side `profiles` upsert in auth.html therefore
-- runs as `anon`, and the own-row INSERT policy above would silently reject it —
-- every new signup would get an auth account with no profile row.
--
-- This trigger creates the row server-side instead. SECURITY DEFINER so it runs
-- as the owner and is not subject to RLS. The client upsert is kept as a
-- harmless fallback for the case where a session does exist.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, plan, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'fan',
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- analyst_posts
-- ---------------------------------------------------------------------------
alter table public.analyst_posts enable row level security;

drop policy if exists "analyst_posts: public read"   on public.analyst_posts;
drop policy if exists "analyst_posts: auth insert"   on public.analyst_posts;
drop policy if exists "analyst_posts: owner update"  on public.analyst_posts;
drop policy if exists "analyst_posts: owner delete"  on public.analyst_posts;

create policy "analyst_posts: public read"
  on public.analyst_posts for select
  to anon, authenticated
  using (true);

create policy "analyst_posts: auth insert"
  on public.analyst_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "analyst_posts: owner update"
  on public.analyst_posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "analyst_posts: owner delete"
  on public.analyst_posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- groups — owner column is `created_by`
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;

drop policy if exists "groups: public read"   on public.groups;
drop policy if exists "groups: auth insert"   on public.groups;
drop policy if exists "groups: owner update"  on public.groups;
drop policy if exists "groups: owner delete"  on public.groups;

create policy "groups: public read"
  on public.groups for select
  to anon, authenticated
  using (true);

create policy "groups: auth insert"
  on public.groups for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "groups: owner update"
  on public.groups for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "groups: owner delete"
  on public.groups for delete
  to authenticated
  using (auth.uid() = created_by);

-- ---------------------------------------------------------------------------
-- group_messages
-- ---------------------------------------------------------------------------
alter table public.group_messages enable row level security;

drop policy if exists "group_messages: public read"  on public.group_messages;
drop policy if exists "group_messages: auth insert"  on public.group_messages;
drop policy if exists "group_messages: owner update" on public.group_messages;
drop policy if exists "group_messages: owner delete" on public.group_messages;

create policy "group_messages: public read"
  on public.group_messages for select
  to anon, authenticated
  using (true);

create policy "group_messages: auth insert"
  on public.group_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "group_messages: owner update"
  on public.group_messages for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "group_messages: owner delete"
  on public.group_messages for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- badge_applications — signed-in applicants only, nobody can read it back
-- ---------------------------------------------------------------------------
alter table public.badge_applications enable row level security;

drop policy if exists "badge_applications: public insert" on public.badge_applications;
drop policy if exists "badge_applications: auth insert"   on public.badge_applications;
drop policy if exists "badge_applications: public read"   on public.badge_applications;

create policy "badge_applications: auth insert"
  on public.badge_applications for insert
  to authenticated
  with check (true);

-- No anon grant: applications must be tied to an account.
revoke all on public.badge_applications from anon;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
--
-- 1. RLS on everywhere:
--   select tablename, rowsecurity
--     from pg_tables
--    where schemaname = 'public'
--      and tablename in ('profiles','analyst_posts','groups',
--                        'group_messages','badge_applications');
--
-- 2. Policy inventory:
--   select tablename, policyname, cmd, roles
--     from pg_policies
--    where schemaname = 'public'
--    order by tablename, cmd;
--
-- 3. The view exists and hides email:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'public_profiles';
--   -- expect exactly: id, name, plan, credential, created_at
--
-- ---------------------------------------------------------------------------
-- CLIENT RULE (keep this true in every future phase)
--
--   * Another user's profile data  -> read from `public_profiles`
--   * The signed-in user's own row -> read from `profiles`
--
-- As of B1 the app has FOUR profiles accesses and all four are own-row:
--   auth.html      login lookup      (own)
--   auth.html      signup upsert     (own)
--   community.html own credential    (own, behind the sign-in gate)
--   index.html     _hydrate()        (own)
--
-- There are no cross-user profile reads yet, because analyst_posts and
-- group_messages denormalise user_name/credential onto the row. When Phase C
-- adds follows, public profiles or post authors, those reads go to
-- `public_profiles` — never to `profiles`.
-- ---------------------------------------------------------------------------
