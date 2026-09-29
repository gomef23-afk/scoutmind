-- probe_like_policies.sql — is "B's like removes A's like" a security hole?
--
-- READ-ONLY except for section 3, which is an explicit two-account test that
-- writes two rows and deletes them again.
--
-- WHY THIS EXISTS
-- ---------------------------------------------------------------------------
-- Reported on production: A likes a comment (count 1), B taps the same comment,
-- and the count goes to 0 instead of 2. Two very different causes produce that:
--
--   (a) CLIENT BUG, not a hole. The client decided "liked by me" by comparing
--       a row's user_id against the localStorage copy of the user id. When that
--       copy was stale, A's like read as B's, so B's tap sent a DELETE. RLS
--       matched nothing, PostgREST returned 204, and the client painted the
--       unlike anyway. A's row is untouched; the count returns on refresh.
--
--   (b) POLICY HOLE. The delete policy does not restrict to auth.uid(), so B
--       really can delete A's like.
--
-- Both have been addressed in the client regardless: the user id now comes from
-- the session (the JWT subject, which is what auth.uid() returns), and a DELETE
-- uses return=representation so a delete that removed nothing reverts instead
-- of painting as done. But (b) would still be a hole, so prove it is not.
--
-- Section 1 is the fast answer. Section 3 is the definitive one.

-- ---------------------------------------------------------------------------
-- 1. THE POLICIES AS DEPLOYED
-- ---------------------------------------------------------------------------
-- The DELETE row's `qual` MUST read (auth.uid() = user_id). If it is `true`,
-- or if there is no DELETE policy row at all while authenticated holds the
-- DELETE grant, stop and re-run 012.
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('comment_likes','message_likes')
 order by tablename, cmd;

-- Expect exactly three per table:
--   SELECT  qual = true
--   INSERT  with_check = (auth.uid() = user_id)
--   DELETE  qual       = (auth.uid() = user_id)
-- and no UPDATE row at all.

-- Grants: authenticated must NOT hold UPDATE, anon must hold SELECT only.
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('comment_likes','message_likes')
   and grantee in ('anon','authenticated')
 order by table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 2. WHAT IS ACTUALLY IN THE TABLES
-- ---------------------------------------------------------------------------
-- If A's like row is still here, nothing was deleted and cause (a) is
-- confirmed. If the tables are empty, this is inconclusive on its own — the
-- row may never have been written — so run section 3.
select 'comment_likes' as tbl, comment_id::text as target, user_id, created_at
  from public.comment_likes
union all
select 'message_likes', message_id::text, user_id, created_at
  from public.message_likes
 order by created_at desc
 limit 50;

-- ---------------------------------------------------------------------------
-- 3. THE DEFINITIVE TEST — two real users, run as each in the app
-- ---------------------------------------------------------------------------
-- This cannot be done from the SQL editor: the SQL editor runs as the service
-- role, which BYPASSES RLS entirely, so a delete succeeding here proves nothing
-- about what a signed-in user can do. It has to go through the API as each
-- user.
--
-- In the browser, signed in as A, on a page with a comment thread open:
--
--   // A likes comment <ID>
--   await SMAuth.rest('comment_likes', {
--     method: 'POST',
--     headers: {'Content-Type':'application/json', Prefer:'return=representation'},
--     body: JSON.stringify([{comment_id: <ID>, user_id: SMAuth.userId()}])
--   }).then(r => r.json());
--
-- Then, signed in as B in a different browser or a private window:
--
--   // B tries to delete A's like. `return=representation` is the point:
--   // an empty array means RLS refused, which is the correct outcome.
--   await SMAuth.rest('comment_likes?comment_id=eq.<ID>', {
--     method: 'DELETE',
--     headers: {Prefer: 'return=representation'}
--   }).then(r => r.json());
--
-- Note there is deliberately NO user_id filter on B's delete: this asks the
-- database to delete every like on that comment. If it returns [] the policy is
-- doing its job. If it returns A's row, that is the hole — tell me and revoke
-- DELETE from authenticated on both tables immediately:
--
--   revoke delete on public.comment_likes from authenticated;
--   revoke delete on public.message_likes from authenticated;
--
-- Then confirm from the SQL editor that A's row is still there:
--   select * from public.comment_likes where comment_id = <ID>;
