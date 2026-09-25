-- 007_accounts_clubs.sql — a user's clubs and content languages live on the
-- account, not in localStorage.
--
-- Run in the Supabase SQL editor. Safe to run more than once: every statement
-- is guarded. Depends on 003 (teams) and 006.
--
-- `profiles` predates these migrations and holds (id, name, email, plan,
-- created_at), so everything here is additive.

-- ---------------------------------------------------------------------------
-- SCHEMA PATCHES — profiles
-- ---------------------------------------------------------------------------
-- The club a user identifies with. NULL is a real state and the default: no
-- one is "Botafogo" unless they chose it.
alter table public.profiles
  add column if not exists main_club_id bigint references public.teams(id) on delete set null;

-- Which languages this user wants to read. NULL means "not set yet" — the app
-- falls back to the browser language plus English, exactly like a guest.
alter table public.profiles
  add column if not exists content_langs text[];

-- Set when onboarding finishes OR is skipped, so a user who declined to pick a
-- club is not asked again on every load. Also the guard for the one-time
-- localStorage migration.
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Opt-in to seeing news about your clubs in languages you did not pick.
-- OFF by default: a feed that quietly mixes languages is a worse default than
-- one that occasionally misses a story.
alter table public.profiles
  add column if not exists show_club_news_all_langs boolean not null default false;

comment on column public.profiles.main_club_id is
  'The user''s club. NULL is normal — there is no default club.';
comment on column public.profiles.content_langs is
  'Languages the Home feed shows. NULL = fall back to the browser language alone.';
comment on column public.profiles.show_club_news_all_langs is
  'Opt-in: also show news about the user''s clubs in languages outside content_langs.';
comment on column public.profiles.onboarded_at is
  'Onboarding completed or skipped. Also guards the one-time localStorage import.';

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
-- Clubs a user follows in addition to their main club. Deliberately a plain
-- join table: the pair is the identity, so following twice is impossible.
create table if not exists public.follows (
  user_id     uuid   not null references auth.users(id) on delete cascade,
  team_id     bigint not null references public.teams(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, team_id)
);

create index if not exists follows_team_idx on public.follows(team_id);
create index if not exists follows_user_idx on public.follows(user_id);

comment on table public.follows is
  'User -> club. Public read so club pages can show real follower counts.';

-- ---------------------------------------------------------------------------
-- RLS — public read, own-row write
-- ---------------------------------------------------------------------------
alter table public.follows enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='follows'
                   and policyname='follows public read') then
    create policy "follows public read"
      on public.follows for select using (true);
  end if;

  -- A user may only ever create or remove their OWN follow. auth.uid() is the
  -- signed-in user; it is null for anon, so guests cannot write at all.
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='follows'
                   and policyname='follows self insert') then
    create policy "follows self insert"
      on public.follows for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='follows'
                   and policyname='follows self delete') then
    create policy "follows self delete"
      on public.follows for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- There is deliberately no UPDATE policy: a follow has nothing to change.
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;

-- ---------------------------------------------------------------------------
-- ge snippets
-- ---------------------------------------------------------------------------
-- ge now stores the same 300-character sentence-clamped snippet as every other
-- source, instead of headline only. Still never the article: the clamp is in
-- api/_lib/tagger.js and the cron never fetches the article page.
--
-- Existing ge rows keep summary = '' until the cron sees them in the feed
-- again; no backfill by design.
update public.news_sources
   set headline_only = false
 where slug = 'ge_futebol' and headline_only;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='profiles'
--      and column_name in ('main_club_id','content_langs','onboarded_at',
--                          'show_club_news_all_langs');
--   -- expect 4 rows
--
--   select count(*) from public.profiles where show_club_news_all_langs;
--   -- 0: the cross-language exception is opt-in
--
--   select count(*) from public.follows;                        -- 0 at first
--   select slug, headline_only from public.news_sources
--    where slug = 'ge_futebol';                                 -- false
--
-- Policies on follows (expect exactly 3: read, self insert, self delete):
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='follows' order by policyname;
--
-- Nobody should have a club they did not choose (expect 0 before onboarding):
--   select count(*) from public.profiles where main_club_id is not null;
