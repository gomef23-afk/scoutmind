-- audit_leaked_follows.sql — find accounts that may have inherited another
-- account's clubs from the localStorage import.
--
-- READ-ONLY. Nothing here writes or deletes. The clean-up statements at the
-- bottom are commented out and take an explicit user id.
--
-- Not a migration: it is a diagnostic, run by hand and kept in the repo so the
-- next person can re-run it rather than reconstruct it.
--
-- ---------------------------------------------------------------------------
-- RESULT, 28 Sept 2026 — run BEFORE the fix shipped: NOTHING TO CLEAN UP
-- ---------------------------------------------------------------------------
-- Only two accounts hold any follows at all (Felipe's, and one real user with a
-- single follow). So no account ever had another account's follows written to
-- it: the leak was display-only, in the onboarding UI, from the shared
-- localStorage cache.
--
-- The write path in importLocalClubs() was real, so this could have happened —
-- it just did not. The likeliest reason is the session-expiry bug fixed
-- alongside it: the import wrote through apiSend(), which was sending the anon
-- key once a session had lapsed, and its failure went to console.warn and
-- nowhere else. One bug quietly preventing another.
--
-- Kept because it is the query that established that, and the one to re-run if
-- this is ever suspected again.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG
-- ---------------------------------------------------------------------------
-- Until this fix, `importLocalClubs()` ran for any signed-in user whose
-- `profiles.onboarded_at` was null. It read the UNKEYED localStorage names
-- `sm_main_club` and `sm_following_clubs` — one shared slot for the whole
-- browser, not one per account — and wrote what it found onto the account.
--
-- So: account A signs in on a browser and picks clubs. A signs out. B signs in
-- on the same browser. B's `onboarded_at` is null, the unkeyed cache still
-- holds A's picks, and the import writes A's main club and A's follows onto B
-- as real rows. B's onboarding then shows them pre-ticked, because they are
-- genuinely B's follows by then.
--
-- The signature is timing plus an exact set match: the import writes every
-- follow in one PostgREST call and stamps `onboarded_at` in the same moment, so
-- the follows land within a second or two of it. A human picking clubs in the
-- onboarding UI produces the same closeness, which is why the set-equality test
-- below matters more than the timing one — a genuine picker rarely chooses the
-- exact same set as someone else.

-- ---------------------------------------------------------------------------
-- 1. THE CANDIDATES
-- ---------------------------------------------------------------------------
-- Accounts whose entire follow set was written within 10 seconds of
-- onboarded_at AND is identical to at least one other account's set.
--
-- `array_agg(... order by team_id)` is what makes the sets comparable; without
-- the ORDER BY, two identical sets inserted in a different order would not
-- match and the query would quietly find nothing.
with onboard_batch as (
  select f.user_id,
         p.onboarded_at,
         p.main_club_id,
         count(*)                                  as follows,
         min(f.created_at)                         as first_follow,
         max(f.created_at)                         as last_follow,
         array_agg(f.team_id order by f.team_id)    as club_set
    from public.follows f
    join public.profiles p on p.id = f.user_id
   where p.onboarded_at is not null
   group by 1, 2, 3
  having min(f.created_at) >= p.onboarded_at - interval '10 seconds'
     and max(f.created_at) <= p.onboarded_at + interval '10 seconds'
),
-- Only sets that more than one account holds. A set of one club is far too
-- common to mean anything, so those are excluded.
shared_sets as (
  select club_set, count(*) as accounts
    from onboard_batch
   where follows >= 2
   group by club_set
  having count(*) > 1
)
select b.user_id,
       u.email,
       b.main_club_id,
       t.name                                as main_club,
       b.follows,
       b.club_set,
       s.accounts                            as accounts_sharing_this_set,
       b.onboarded_at,
       b.first_follow,
       -- How tightly the writes cluster. A batch insert is milliseconds apart;
       -- a person tapping through a list is seconds apart.
       extract(epoch from (b.last_follow - b.first_follow)) as follow_span_seconds,
       extract(epoch from (b.first_follow - b.onboarded_at)) as seconds_after_onboard
  from onboard_batch b
  join shared_sets  s on s.club_set = b.club_set
  left join auth.users u on u.id = b.user_id
  left join public.teams t on t.id = b.main_club_id
 order by b.club_set, b.onboarded_at;

-- ---------------------------------------------------------------------------
-- 2. WHICH ONE IS THE ORIGINAL
-- ---------------------------------------------------------------------------
-- Within each duplicated set, the EARLIEST account is the one that chose those
-- clubs; the later ones are the suspects. This does not prove anything — two
-- friends signing up together legitimately look identical — so treat it as a
-- list to look at, not a list to delete.
with onboard_batch as (
  select f.user_id, p.onboarded_at,
         count(*) as follows,
         array_agg(f.team_id order by f.team_id) as club_set
    from public.follows f
    join public.profiles p on p.id = f.user_id
   where p.onboarded_at is not null
   group by 1, 2
  having min(f.created_at) >= p.onboarded_at - interval '10 seconds'
     and max(f.created_at) <= p.onboarded_at + interval '10 seconds'
     and count(*) >= 2
)
select club_set,
       count(*)                                     as accounts,
       min(onboarded_at)                            as first_seen,
       max(onboarded_at)                            as last_seen,
       (array_agg(user_id order by onboarded_at))[1] as likely_original,
       (array_agg(user_id order by onboarded_at))[2:] as likely_inherited
  from onboard_batch
 group by club_set
having count(*) > 1
 order by count(*) desc, min(onboarded_at);

-- ---------------------------------------------------------------------------
-- 3. SAME DAY, SAME SET — the tightest signal
-- ---------------------------------------------------------------------------
-- Two accounts onboarding on the same calendar day with an identical set is the
-- pattern a single browser produces. Expect this to be the shortest list and
-- the one worth acting on.
with onboard_batch as (
  select f.user_id, p.onboarded_at,
         array_agg(f.team_id order by f.team_id) as club_set
    from public.follows f
    join public.profiles p on p.id = f.user_id
   where p.onboarded_at is not null
   group by 1, 2
  having min(f.created_at) >= p.onboarded_at - interval '10 seconds'
     and max(f.created_at) <= p.onboarded_at + interval '10 seconds'
     and count(*) >= 2
)
select a.onboarded_at::date          as day,
       a.club_set,
       a.user_id                     as earlier_account,
       ua.email                      as earlier_email,
       b.user_id                     as later_account,
       ub.email                      as later_email,
       extract(epoch from (b.onboarded_at - a.onboarded_at)) as seconds_apart
  from onboard_batch a
  join onboard_batch b
    on a.club_set = b.club_set
   and a.onboarded_at < b.onboarded_at
   and a.onboarded_at::date = b.onboarded_at::date
  left join auth.users ua on ua.id = a.user_id
  left join auth.users ub on ub.id = b.user_id
 order by 1 desc, seconds_apart;

-- ---------------------------------------------------------------------------
-- 4. CLEAN-UP — commented out. Run only for an account you have confirmed.
-- ---------------------------------------------------------------------------
-- Replace the uuid and run one statement at a time. Look before you clear:
--
--   select f.team_id, t.name, f.created_at
--     from public.follows f join public.teams t on t.id = f.team_id
--    where f.user_id = '00000000-0000-0000-0000-000000000000'
--    order by f.created_at;
--
-- Clear the follows:
--   delete from public.follows
--    where user_id = '00000000-0000-0000-0000-000000000000';
--
-- Clear the main club, and reset onboarding so they are asked again properly:
--   update public.profiles
--      set main_club_id = null,
--          onboarded_at = null
--    where id = '00000000-0000-0000-0000-000000000000';
--
-- NOTE ON RULE 13: rule 13 forbids DELETE in the ingest jobs in api/, where a
-- job running outside its window would wipe backfilled football data. A user's
-- own follow rows are not that: they are this person's preference, they were
-- written by mistake, and there is no version of "soft-deleted follow" that
-- means anything to them. Clearing them is the correct repair. The clubs
-- themselves are untouched.
--
-- Setting onboarded_at back to null is safe now that the import is gone — it
-- makes the onboarding modal appear again, and nothing reads localStorage to
-- fill it in.
