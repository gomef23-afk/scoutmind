-- 001_plan_to_role.sql
-- ScoutMind social pivot, Phase A.
--
-- Subscription tiers are gone. The `profiles.plan` column is kept but
-- repurposed to role semantics:
--
--   'fan'     — default, every user, full access to every feature
--   'analyst' — verified via badge_applications, can post analyst insights
--   'admin'   — Felipe; reserved for moderation tools (Phase C9)
--
-- The app no longer reads 'free' / 'pro' / 'club' / 'clubpro' anywhere.
-- Run this in the Supabase SQL editor.

begin;

-- 1. New rows default to 'fan' (was 'free').
alter table public.profiles
  alter column plan set default 'fan';

-- 2. Collapse every paid/free subscription tier into 'fan'.
--    'analyst' is deliberately left untouched — those are earned roles.
update public.profiles
   set plan = 'fan'
 where plan in ('free', 'pro', 'club', 'clubpro');

-- 3. Rows that never had a plan set. Safe to skip if you would rather
--    leave NULLs alone — the app treats a missing plan as 'fan' anyway.
update public.profiles
   set plan = 'fan'
 where plan is null;

commit;

-- Verify — expect only 'fan', 'analyst' (and 'admin' once it is used):
--   select plan, count(*) from public.profiles group by plan order by 2 desc;
