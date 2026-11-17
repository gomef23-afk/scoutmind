-- 034 — How many people follow each club, counts only (landing page,
-- 17 Nov 2026)
--
-- Re-runnable: CREATE OR REPLACE VIEW, GRANT. Run it whole in the SQL editor.
--
-- Why: the logged-out landing (public/welcome.html) opens its Home-band mock
-- on the most-followed club. A follower is anyone whose main club it is or
-- who follows it — the same rule as club_chat_overview.member_count (011), so
-- the two numbers can never disagree. That view also fetches every room's
-- last message; this one is the count alone.
--
-- Privacy: a plain view runs with its owner's rights (like public_profiles in
-- 008 and club_chat_overview in 011), so it can count rows in `profiles` and
-- `follows` without exposing them. Only (club_id, followers) leaves: never
-- who. No new table, so no new RLS policy: the view's only grant is SELECT,
-- and anon / authenticated hold nothing else on it.
--
-- Columns are APPENDED ONLY on any future change (create or replace view
-- matches by position).

create or replace view public.club_follow_counts as
select t.id as club_id,
       count(u.user_id)::int as followers
  from public.teams t
  left join (
    select p.id as user_id, p.main_club_id as club_id
      from public.profiles p
     where p.main_club_id is not null
    union
    select f.user_id, f.team_id as club_id
      from public.follows f
  ) u on u.club_id = t.id
 group by t.id;

comment on view public.club_follow_counts is
  'Followers per club (main club or a follow, each person once), counts only. Same rule as club_chat_overview.member_count. Read by the landing page with the anon key.';

revoke all on public.club_follow_counts from anon, authenticated;
grant select on public.club_follow_counts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- 1. One row per club, and the same numbers as the room overview
--    (mismatches = 0):
--
--   select
--     (select count(*) from public.teams)                         as clubs,
--     (select count(*) from public.club_follow_counts)            as rows,
--     (select count(*) from public.club_follow_counts c
--        join public.club_chat_overview o on o.club_id = c.club_id
--       where o.member_count <> c.followers)                      as mismatches;
--
-- 2. The top five, which the landing page will default to:
--
--   select t.name, c.followers
--     from public.club_follow_counts c
--     join public.teams t on t.id = c.club_id
--    order by c.followers desc, t.name
--    limit 5;
--
-- 3. Only SELECT is granted to the browser roles (expect two rows, SELECT):
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'club_follow_counts'
--      and grantee in ('anon', 'authenticated');
