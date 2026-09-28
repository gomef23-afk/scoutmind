-- 008_social.sql — comments, reactions, reports, moderation and events.
--
-- Run in the Supabase SQL editor. Safe to run more than once: every statement
-- is guarded. Depends on 002 (profiles, public_profiles), 005/006 (news_items)
-- and 007 (main_club_id).
--
-- Nothing is ever hard-deleted (rule 13). A removed comment keeps its row and
-- gains deleted_at / deleted_by, so moderation is auditable and reversible.
--
-- The database is live: ~2,000 news items and 87 real profiles at the time of
-- writing. Every policy below is written to fail closed.

-- ---------------------------------------------------------------------------
-- is_admin() — the one place "is this person a moderator" is decided
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because profiles is not readable by the calling user for
-- anyone but themselves; this function needs to check the CALLER's own row, so
-- it stays safe. search_path is pinned so it cannot be hijacked by a shadowed
-- table on the caller's path.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and plan = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'True when the calling user has profiles.plan = ''admin''. Used by RLS; never trust a client-side role check.';

-- ---------------------------------------------------------------------------
-- public_profiles — add main_club_id for comment-author crests
-- ---------------------------------------------------------------------------
-- profiles is deliberately NOT publicly readable (it holds email addresses).
-- Social reads go through this view. Adding main_club_id lets a comment show
-- the author's club crest without exposing anything else.
--
-- security_invoker = false so the view runs as its owner and bypasses the
-- profiles row policy, exposing only the columns listed here.
--
-- !! COLUMN ORDER MATTERS !! CREATE OR REPLACE VIEW can only APPEND columns.
-- It cannot insert one in the middle, rename one, or reorder them — Postgres
-- matches the existing view position by position. Putting main_club_id before
-- created_at fails with:
--   cannot change name of view column "created_at" to "main_club_id"
--
-- So new columns go on the END, always. Readers must select by name, never by
-- position, which everything here already does.
create or replace view public.public_profiles
with (security_invoker = false) as
  select id, name, plan, credential, created_at, main_club_id
    from public.profiles;

grant select on public.public_profiles to anon, authenticated;

comment on view public.public_profiles is
  'The ONLY public view of profiles. Never exposes email. main_club_id added in 008 for comment-author crests.';

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id            bigserial primary key,
  news_item_id  bigint not null references public.news_items(id) on delete cascade,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  content       text   not null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    uuid references auth.users(id),
  constraint comments_content_len check (char_length(content) between 1 and 500)
);

create index if not exists comments_item_idx on public.comments(news_item_id, created_at);
-- Feeds the rate-limit trigger without scanning the whole table.
create index if not exists comments_user_time_idx on public.comments(user_id, created_at desc);

comment on column public.comments.deleted_at is
  'Soft delete. Rule 13: rows are never removed, so moderation stays auditable.';
comment on column public.comments.deleted_by is
  'Who removed it — the author, or an admin.';

-- ---------------------------------------------------------------------------
-- reactions
-- ---------------------------------------------------------------------------
-- Positive only, by design: there is no downvote. One of each type per user
-- per item, enforced by the primary key. Counts are always COUNT(*) over this
-- table — never a denormalised counter that can drift.
create table if not exists public.reactions (
  news_item_id  bigint not null references public.news_items(id) on delete cascade,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  type          text   not null check (type in ('fire','clap','mind_blown')),
  created_at    timestamptz not null default now(),
  primary key (news_item_id, user_id, type)
);

create index if not exists reactions_item_idx on public.reactions(news_item_id, type);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id           bigserial primary key,
  target_type  text not null check (target_type in ('comment')),
  target_id    bigint not null,
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  reason       text not null check (reason in ('spam','abuse','hate','off_topic','other')),
  detail       text,
  status       text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id),
  constraint reports_detail_len check (detail is null or char_length(detail) <= 300)
);

-- One OPEN report per person per target. Re-reporting after a decision is
-- allowed; spamming the queue with the same target is not.
create unique index if not exists reports_one_open_per_user
  on public.reports(target_type, target_id, reporter_id)
  where status = 'open';

create index if not exists reports_open_idx on public.reports(status, created_at desc);

-- ---------------------------------------------------------------------------
-- events — product measurement, insert-only
-- ---------------------------------------------------------------------------
-- The north-star metric is weekly active users who took a social action.
-- There is deliberately NO select policy: the anon key cannot read this table
-- at all. Felipe reads it with SQL in the dashboard (service role bypasses RLS).
create table if not exists public.events (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  type        text not null check (type in
                ('session','comment','reaction','follow','unfollow','report','club_set')),
  ref_type    text,
  ref_id      bigint,
  created_at  timestamptz not null default now()
);

create index if not exists events_user_time_idx on public.events(user_id, created_at desc);
create index if not exists events_type_time_idx on public.events(type, created_at desc);

comment on table public.events is
  'Insert-only product telemetry. No SELECT policy by design — read it with SQL as the service role.';

-- ---------------------------------------------------------------------------
-- MODERATION — the blocklist lives here, and only here
-- ---------------------------------------------------------------------------
-- A table rather than a hardcoded array so it can be extended from the
-- dashboard without a migration or a deploy. Server-side only: it is never
-- shipped to the browser, so the list is not published to every visitor and
-- cannot be read out of the JS bundle.
--
-- Slurs only. Ordinary swearing is not moderated — people swear about
-- football. This list is a speed bump, not a guarantee; it will never be
-- complete, and real moderation is the reports queue.
--
-- `mode` decides how hard the pattern bites, and WHICH normaliser the pattern
-- must be stored with. Get that pairing wrong and the entry silently never
-- matches, so there is one rule: use the normaliser named after the mode.
--
--   mode 'word'      -> store with public.moderation_words(...)
--   mode 'substring' -> store with public.moderation_normalise(...)
--
--   'word'      match whole words only, on a copy that keeps word breaks.
--               Use for anything with an innocent sense or that is a
--               substring of a real word — "paki" is inside "Pakistan",
--               "retard" is French for "delay", "bicha" and "macaco" have
--               everyday Portuguese meanings.
--
--   'substring' match anywhere, on a copy with separators stripped and
--               repeats collapsed, so "v-i-a-d-o" and "viiiado" are caught.
--               Use only for terms with no innocent reading at all.
--
-- Default is the safer 'word'. Reach for 'substring' deliberately.
create table if not exists public.moderation_blocklist (
  pattern     text primary key,
  mode        text not null default 'word' check (mode in ('word','substring')),
  lang        text,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.moderation_blocklist is
  'Normalised substrings that block a comment. Slurs only — not swearing. Extend here; nothing else needs changing.';

-- unaccent is an extension and may not be enabled, so this is a plain
-- fallback covering the Portuguese and Spanish accents we actually see.
-- Defined FIRST: moderation_normalise calls it, and Postgres validates
-- function bodies at creation time.
create or replace function public.unaccent_fallback(txt text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(txt, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- Legitimate words that collide with a pattern once repeats are collapsed.
-- "nigger" collapses to "niger", which would otherwise block "Niger" and
-- "Nigeria" — both perfectly likely in a football conversation.
--
-- These are removed from the text BEFORE the substring check, so the word
-- itself is safe while an actual slur beside it is still caught:
--   "Nigeria played well"        -> passes
--   "Nigeria you <slur>"         -> still blocked
create table if not exists public.moderation_allowlist (
  word        text primary key,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.moderation_allowlist is
  'Words removed before blocklist matching, for legitimate terms that collide with a collapsed pattern.';

-- Normalisation used by both the seed and the guard. Keep them in step: a
-- pattern that is not already normalised can never match.
--
-- Order matters. Separators are stripped BEFORE repeats are collapsed, so
-- "v-i-a-d-o" and "viiiado" both land on "viado". Doing it the other way round
-- would leave the separated form intact.
create or replace function public.moderation_normalise(txt text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             lower(public.unaccent_fallback(coalesce(txt, ''))),
             '[^a-z0-9]', '', 'g'         -- drop spaces and punctuation first
           ),
           '(.)\1+', '\1', 'g'            -- then collapse repeated characters
         );
$$;

-- The gentler form, for 'word' patterns: lowercased and unaccented, with every
-- run of non-letters turned into a single space. Word breaks survive, so
-- "Pakistan" cannot match the pattern "paki".
create or replace function public.moderation_words(txt text)
returns text
language sql
immutable
as $$
  select btrim(
           regexp_replace(
             lower(public.unaccent_fallback(coalesce(txt, ''))),
             '[^a-z0-9]+', ' ', 'g'
           )
         );
$$;

-- ---------------------------------------------------------------------------
-- comment_guard — length, rate limit and blocklist, enforced in the database
-- ---------------------------------------------------------------------------
-- Client-side checks are for feedback only. This is the one that counts: it
-- cannot be bypassed by calling PostgREST directly.
create or replace function public.comment_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent   integer;
  hourly   integer;
  hit      text;
  norm     text;
  words    text;
  cleaned  text;
  allowed  text;
begin
  -- Trim first; a comment of only whitespace is not a comment.
  new.content := btrim(new.content);
  if char_length(new.content) = 0 then
    raise exception 'Comment is empty.' using errcode = 'check_violation';
  end if;

  -- 1 per 10 seconds.
  select count(*) into recent
    from public.comments
   where user_id = new.user_id
     and created_at > now() - interval '10 seconds';
  if recent > 0 then
    raise exception 'Slow down a moment before posting again.'
      using errcode = 'check_violation';
  end if;

  -- 20 per hour.
  select count(*) into hourly
    from public.comments
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';
  if hourly >= 20 then
    raise exception 'You have hit the hourly comment limit. Try again later.'
      using errcode = 'check_violation';
  end if;

  -- Blocklist. 'word' patterns match whole words on the space-preserving
  -- copy; 'substring' patterns match anywhere on the stripped copy.
  words := ' ' || public.moderation_words(new.content) || ' ';

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
    raise exception 'That comment breaks the community rules. Please rephrase it.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before insert on public.comments
  for each row execute function public.comment_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.comments             enable row level security;
alter table public.reactions            enable row level security;
alter table public.reports              enable row level security;
alter table public.events               enable row level security;
alter table public.moderation_blocklist enable row level security;
alter table public.moderation_allowlist enable row level security;

do $$
begin
  -- comments ---------------------------------------------------------------
  -- Public read, but a soft-deleted comment is invisible to everyone.
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='comments' and policyname='comments public read') then
    create policy "comments public read" on public.comments
      for select using (deleted_at is null);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='comments' and policyname='comments self insert') then
    create policy "comments self insert" on public.comments
      for insert with check (auth.uid() = user_id);
  end if;

  -- Author or admin may soft-delete. The column grant below means this can
  -- only ever touch deleted_at / deleted_by — content is immutable once posted.
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='comments' and policyname='comments soft delete') then
    create policy "comments soft delete" on public.comments
      for update
      using (auth.uid() = user_id or public.is_admin())
      with check (auth.uid() = user_id or public.is_admin());
  end if;

  -- reactions --------------------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='reactions' and policyname='reactions public read') then
    create policy "reactions public read" on public.reactions
      for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='reactions' and policyname='reactions self insert') then
    create policy "reactions self insert" on public.reactions
      for insert with check (auth.uid() = user_id);
  end if;
  -- Un-reacting is a real delete: a reaction is a toggle, not a record of
  -- history, and there is nothing to audit.
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='reactions' and policyname='reactions self delete') then
    create policy "reactions self delete" on public.reactions
      for delete using (auth.uid() = user_id);
  end if;

  -- reports ----------------------------------------------------------------
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='reports' and policyname='reports self insert') then
    create policy "reports self insert" on public.reports
      for insert with check (auth.uid() = reporter_id);
  end if;
  -- You can see your own reports; admins see the queue.
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='reports' and policyname='reports own or admin read') then
    create policy "reports own or admin read" on public.reports
      for select using (auth.uid() = reporter_id or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='reports' and policyname='reports admin resolve') then
    create policy "reports admin resolve" on public.reports
      for update using (public.is_admin()) with check (public.is_admin());
  end if;

  -- events -----------------------------------------------------------------
  -- Insert only, and only as yourself. No SELECT policy anywhere: with RLS on
  -- and no policy, every read returns nothing.
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='events' and policyname='events self insert') then
    create policy "events self insert" on public.events
      for insert with check (auth.uid() = user_id);
  end if;

  -- moderation_blocklist ---------------------------------------------------
  -- RLS on, no policy at all: unreadable and unwritable through the API by
  -- anyone. Only the service role (dashboard) and the SECURITY DEFINER guard
  -- can see it, which is the point — the list is never published.
end $$;

-- Grants. Note the COLUMN-level update on comments: this is what makes
-- `content` immutable. A table-level grant would let a user rewrite a comment
-- after it was quoted or reported.
grant select on public.comments  to anon, authenticated;
grant insert on public.comments  to authenticated;
grant update (deleted_at, deleted_by) on public.comments to authenticated;

grant select on public.reactions to anon, authenticated;
grant insert, delete on public.reactions to authenticated;

grant insert on public.reports to authenticated;
grant select on public.reports to authenticated;
grant update (status, resolved_at, resolved_by) on public.reports to authenticated;

grant insert on public.events to authenticated;
revoke select on public.events from anon, authenticated;

revoke all on public.moderation_blocklist from anon, authenticated;
revoke all on public.moderation_allowlist from anon, authenticated;

-- Defence in depth: Supabase hands `anon` broad table privileges by default,
-- so without these revokes a guest's write reaches RLS and is only stopped
-- there. RLS does stop it — verified against production, every guest write
-- returns 401 or affects zero rows — but one policy mistake should not be the
-- only thing between a guest and the table.
--
-- anon keeps SELECT on comments, reactions and public_profiles. That is the
-- whole point of guest mode: read everything, write nothing.
revoke insert, update, delete on public.comments  from anon;
revoke insert, update, delete on public.reactions from anon;
revoke all                    on public.reports   from anon;
revoke all                    on public.events    from anon;

-- Sequences need to be usable by the inserting role.
grant usage, select on sequence public.comments_id_seq to authenticated;
grant usage, select on sequence public.reports_id_seq  to authenticated;
grant usage, select on sequence public.events_id_seq   to authenticated;

revoke all on sequence public.comments_id_seq from anon;
revoke all on sequence public.reports_id_seq  from anon;
revoke all on sequence public.events_id_seq   from anon;

-- ---------------------------------------------------------------------------
-- SEED: blocklist
-- ---------------------------------------------------------------------------
-- Deliberately short. These are unambiguous slurs in Portuguese and English,
-- stored in normalised form (lowercase, no accents, repeats collapsed).
-- Ordinary swearing is NOT here and should not be added: people swear about
-- football, and moderating that would make the product worse.
--
-- TO EXTEND — the normaliser must match the mode, or the entry never fires.
--
--   Whole-word match (safer; use when the term has any innocent sense, or is
--   a substring of an ordinary word):
--     insert into public.moderation_blocklist (pattern, mode, lang, note)
--     values (public.moderation_words('<the term>'), 'word', 'pt', 'why');
--
--   Match anywhere, obfuscation included (only for terms with no innocent
--   reading at all):
--     insert into public.moderation_blocklist (pattern, mode, lang, note)
--     values (public.moderation_normalise('<the term>'), 'substring', 'pt', 'why');
--
-- Check what a term becomes before inserting — note they differ:
--   select public.moderation_words('Exãmple');      -- 'example'
--   select public.moderation_normalise('faggot');   -- 'fagot'  (gg collapsed)
--
-- If a new 'substring' pattern collapses onto a real word, add that word to
-- moderation_allowlist rather than weakening the pattern.
insert into public.moderation_blocklist (pattern, mode, lang, note) values
  -- 'word': has an innocent sense, or is a substring of an ordinary word.
  (public.moderation_words('macaco'),    'word', 'pt', 'racist abuse in football; also the ordinary word for monkey'),
  (public.moderation_words('bicha'),     'word', 'pt', 'anti-gay slur; also means queue in some dialects'),
  (public.moderation_words('retardado'), 'word', 'pt', 'ableist slur'),
  (public.moderation_words('retard'),    'word', 'en', 'ableist slur; also French for delay'),
  (public.moderation_words('paki'),      'word', 'en', 'racist slur; substring of Pakistan, so word-match only'),
  -- 'substring': no innocent reading, so catch obfuscated spellings too.
  (public.moderation_normalise('viado'),   'substring', 'pt', 'anti-gay slur'),
  (public.moderation_normalise('crioulo'), 'substring', 'pt', 'racist slur'),
  (public.moderation_normalise('faggot'),  'substring', 'en', 'anti-gay slur'),
  (public.moderation_normalise('tranny'),  'substring', 'en', 'anti-trans slur'),
  (public.moderation_normalise('nigger'),  'substring', 'en', 'racist slur')
on conflict (pattern) do nothing;

-- Legitimate words that collide with a collapsed pattern. Extend as needed.
insert into public.moderation_allowlist (word, note) values
  ('niger',    'country and national team; collides with a collapsed slur'),
  ('nigeria',  'country and national team'),
  ('nigerian', 'nationality')
on conflict (word) do nothing;

-- ---------------------------------------------------------------------------
-- Re-flag non-football items the earlier filter missed
-- ---------------------------------------------------------------------------
-- Measured on 600 live rows: 2 slipped through, both Sky, both naming an event
-- without naming the sport ("Alcaraz beats Fritz as Team Europe lead Laver
-- Cup"). Competition names are stable; athlete names are not, so we add the
-- former and deliberately keep no list of the latter.
--
-- Same rule as always: a club tag proves football, so only UNTAGGED items are
-- touched, and nothing is deleted.
update public.news_items i
   set football_ok = false
 where i.football_ok
   and not exists (select 1 from public.news_item_teams t where t.news_item_id = i.id)
   and (i.title || ' ' || coalesce(i.summary, '')) ~*
       '(laver cup|davis cup|team europe|grand slam|\matp\M|\mwta\M)';

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Tables and policies:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname='public'
--      and tablename in ('comments','reactions','reports','events')
--    order by tablename, policyname;
--   -- comments 3, reactions 3, reports 3, events 1 (insert only)
--
-- events must have NO select policy (expect 0):
--   select count(*) from pg_policies
--    where schemaname='public' and tablename='events' and cmd='SELECT';
--
-- anon must hold SELECT only, and only on the two social tables (expect
-- exactly comments/SELECT and reactions/SELECT, nothing else):
--   select table_name, privilege_type from information_schema.table_privileges
--    where grantee='anon' and table_schema='public'
--      and table_name in ('comments','reactions','reports','events')
--    order by table_name, privilege_type;
--
-- content must be immutable — expect exactly deleted_at and deleted_by:
--   select column_name from information_schema.column_privileges
--    where table_name='comments' and privilege_type='UPDATE' and grantee='authenticated';
--
-- public_profiles must expose main_club_id and NOT email. main_club_id is
-- LAST because CREATE OR REPLACE VIEW can only append:
--   select ordinal_position, column_name from information_schema.columns
--    where table_name='public_profiles' order by ordinal_position;
--   -- id, name, plan, credential, created_at, main_club_id
--
-- Normalisation sanity:
--   select public.moderation_normalise('Vi  aaa-do!!');   -- 'viado'
--   select public.moderation_normalise('v-i-a-d-o');      -- 'viado'
--   select public.moderation_words('Pakistani cricket');  -- 'pakistani cricket'
--
-- List sizes (10 and 3 at first run):
--   select mode, count(*) from public.moderation_blocklist group by mode;
--   select count(*) from public.moderation_allowlist;
--
-- The guard, end to end. Run as a signed-in user; the first should insert and
-- the rest should raise. Use a real news_items id.
--   insert into public.comments (news_item_id, user_id, content)
--   values (<id>, auth.uid(), 'Nigeria played really well today');   -- passes
--   -- 'Vamos Flamengo, que merda de arbitragem'                     -- passes (swearing is not moderated)
--   -- 'v-i-a-d-o'                                                   -- blocked
--   -- two inserts within 10 seconds                                 -- blocked by the rate limit
--
-- ---------------------------------------------------------------------------
-- THE TWO WEEKLY QUERIES
-- ---------------------------------------------------------------------------
-- (a) North star: weekly active users who took at least one SOCIAL action.
--     'session' is deliberately excluded — opening the app is not an action.
--     Run as the service role; events has no read policy.
--
--   select date_trunc('week', created_at)::date as week,
--          count(distinct user_id)              as social_wau,
--          count(*)                             as actions
--     from public.events
--    where type in ('comment','reaction','follow','unfollow','report','club_set')
--      and user_id is not null
--      and created_at >= now() - interval '12 weeks'
--    group by 1
--    order by 1 desc;
--
-- (b) Retention: of accounts created before a date, how many came back in the
--     last 7 days. Change the cutoff to whatever cohort you are asking about.
--
--   with cohort as (
--     select id from public.profiles where created_at < date '2026-09-01'
--   ),
--   active as (
--     select distinct user_id from public.events
--      where created_at >= now() - interval '7 days'
--   )
--   select (select count(*) from cohort)                                as cohort_size,
--          (select count(*) from cohort c join active a on a.user_id = c.id) as returned_7d,
--          round(100.0 * (select count(*) from cohort c join active a on a.user_id = c.id)
--                / nullif((select count(*) from cohort), 0), 1)          as pct;
--
-- A useful third, for reading the funnel:
--   select type, count(*), count(distinct user_id) as users
--     from public.events where created_at >= now() - interval '7 days'
--    group by type order by 2 desc;
--
-- KNOWN FALSE POSITIVES, accepted deliberately. These words have innocent
-- senses and are still blocked, because the abusive use is far more likely in
-- a football comment than the innocent one:
--   "bicha"  (queue, in some dialects)
--   "macaco" (the animal)
--   "retard" (French for delay)
-- Remove any of them with:
--   delete from public.moderation_blocklist where pattern = 'macaco';
