-- 014_soft_delete_read.sql — soft deletes of comments and chat messages work.
--
-- Run in the Supabase SQL editor BEFORE pushing the client change that ships
-- with it. Safe to run more than once. Depends on 008 (comments, is_admin) and
-- 011 (group_messages).
--
-- WHAT WAS BROKEN
-- ---------------------------------------------------------------------------
-- Deleting a reported message from the admin queue failed on production with
-- 403 "new row violates row-level security policy". The UPDATE policy allowed
-- it. The READ policy refused it.
--
-- When an UPDATE has to read the row (any WHERE on a column, which every
-- PostgREST PATCH has: `id=eq.<id>`), Postgres also checks the NEW row against
-- the SELECT policies. The only SELECT policy was `deleted_at is null`, and a
-- soft delete is precisely the update that makes that false. So every soft
-- delete was refused, whatever Prefer header was sent: the live client already
-- sent `return=minimal`.
--
-- `comments` has the same shape, so author and admin deletes of comments fail
-- the same way. Fixed here for both tables.
--
-- THE FIX
-- ---------------------------------------------------------------------------
-- A second, narrower read policy: an author can see their own rows and an admin
-- can see every row, deleted or not. Policies are permissive, so a row is
-- readable if either one passes.
--
-- It is a SEPARATE policy, for `authenticated` only, rather than an OR folded
-- into the public one. `anon` cannot execute is_admin() (008 grants it to
-- authenticated only), and Postgres checks EXECUTE on every function in the
-- expression when it sets it up, not only when it reaches it. Folding it in
-- would make every guest read of comments and chat fail.
--
-- What this exposes: an author can read back their own deleted rows, and an
-- admin can read any deleted row. Nobody else, and never a guest. Every feed,
-- thread and chat query also filters `deleted_at=is.null` itself, so deleted
-- rows do not reappear on screen.

begin;

-- ---------------------------------------------------------------------------
-- 1. comments
-- ---------------------------------------------------------------------------
-- The public policy is unchanged; it is recreated so a re-run lands in a known
-- state. 008 created it without a role, which is equivalent to PUBLIC.
drop policy if exists "comments public read"          on public.comments;
drop policy if exists "comments own or admin read"    on public.comments;

create policy "comments public read" on public.comments
  for select using (deleted_at is null);

create policy "comments own or admin read" on public.comments
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. group_messages
-- ---------------------------------------------------------------------------
-- System messages have a null user_id, so the author branch never matches
-- them; only an admin can read one back once deleted.
drop policy if exists "group_messages read"               on public.group_messages;
drop policy if exists "group_messages own or admin read"  on public.group_messages;

create policy "group_messages read" on public.group_messages
  for select to anon, authenticated
  using (deleted_at is null);

create policy "group_messages own or admin read" on public.group_messages
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. GRANTS
-- ---------------------------------------------------------------------------
-- Unchanged from 008 and 011, restated so this file leaves both tables in a
-- known state. Guests read and never write. `content` stays immutable: the
-- only UPDATE anyone holds is on the two soft-delete columns.
grant select on public.comments       to anon, authenticated;
grant select on public.group_messages to anon, authenticated;
grant update (deleted_at, deleted_by) on public.comments       to authenticated;
grant update (deleted_at, deleted_by) on public.group_messages to authenticated;

revoke insert, update, delete on public.comments       from anon;
revoke insert, update, delete on public.group_messages from anon;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Policies. Expect per table: one SELECT for everyone with deleted_at is null,
-- one SELECT for authenticated with the author/admin check, and the existing
-- INSERT and UPDATE policies:
--   select tablename, policyname, cmd, roles, qual
--     from pg_policies
--    where schemaname='public' and tablename in ('comments','group_messages')
--    order by tablename, cmd, policyname;
--
-- Guests still read nothing deleted. Expect 0 from both, and no error:
--   begin;
--   set local role anon;
--   select count(*) from public.comments       where deleted_at is not null;
--   select count(*) from public.group_messages where deleted_at is not null;
--   rollback;
--
-- Behaviour, run as the real role. Each block rolls back, so nothing changes.
--
-- 1. Admin soft-deletes someone else's message. Expect one row back. This is
--    the call that returned 403 before this migration:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<admin uuid>","role":"authenticated"}',true);
--   update public.group_messages
--      set deleted_at = now(), deleted_by = '<admin uuid>'
--    where id = '<message uuid>'
--   returning id, deleted_at;
--   rollback;
--
-- 2. An author soft-deletes their own comment. Expect one row back:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<author uuid>","role":"authenticated"}',true);
--   update public.comments
--      set deleted_at = now(), deleted_by = '<author uuid>'
--    where id = <comment id>
--   returning id, deleted_at;
--   rollback;
--
-- 3. A non-admin cannot delete someone else's message. Expect zero rows, and
--    the message still live afterwards:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<other uuid>","role":"authenticated"}',true);
--   update public.group_messages
--      set deleted_at = now(), deleted_by = '<other uuid>'
--    where id = '<message uuid>'
--   returning id;
--   rollback;
--
-- 4. Content is still immutable. Expect "permission denied":
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"sub":"<author uuid>","role":"authenticated"}',true);
--   update public.comments set content = 'rewritten' where id = <comment id>;
--   rollback;
