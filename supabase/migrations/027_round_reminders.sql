-- 027_round_reminders.sql — "your round closes soon" emails.
--
-- Run in the Supabase SQL editor AFTER 026. Safe to run more than once.
-- Depends on 017 (the game), 024/025 (export_my_data, replaced here with the
-- email log added). The job is /api/cron/reminders (every 30 min); the
-- unsubscribe link is /api/email/unsubscribe. Before this runs, the job fails
-- loudly (no reminder_candidates) and the Profile toggle stays hidden.
--
-- WHO GETS A REMINDER (reminder_candidates)
-- ---------------------------------------------------------------------------
--   a round that is open, whose deadline is
--     round_24h   more than 2 h and at most 24 h away
--     round_2h    at most 2 h away
--   and a fan who
--     * has an entry in that competition this season, OR follows a club in
--       it, OR has their main club in it;
--     * has NO entry for that round;
--     * has profiles.notify_round_emails on, and a confirmed email address;
--     * has no email_log row for that round and kind, except a FAILED one
--       with fewer than 3 attempts (a known non-send is retried; a row still
--       "sending" is never retried: its outcome is unknown, and a duplicate
--       is worse than a missed reminder);
--     * for round_2h: was not sent the 24 h mail for it in the last 6 h.
--   Language: user_metadata.lang (set at sign-up since Day 5), else pt-BR
--   when the main club is in a Brazilian league, else en.
--
-- ONE EMAIL PER FAN PER WINDOW: the job batches a fan's closing rounds into
-- one email and logs one row per round, so (user, round, kind) is the key
-- that makes a re-run unable to send twice. Nothing here deletes; the log
-- goes with the account (cascade from auth.users) when a person deletes it.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE OPT-OUT
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_round_emails boolean not null default true;
comment on column public.profiles.notify_round_emails is
  'Round reminder emails on/off. Written by the person (Profile -> Preferences) or the signed unsubscribe link.';
-- Rule 23: authenticated holds UPDATE per column, so the new one needs its own grant.
grant update (notify_round_emails) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE LOG
-- ---------------------------------------------------------------------------
create table if not exists public.email_log (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  round_id    bigint      not null references public.game_rounds(id),
  kind        text        not null check (kind in ('round_24h', 'round_2h')),
  status      text        not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts    smallint    not null default 1,
  resend_id   text,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz,
  primary key (user_id, round_id, kind)
);
create index if not exists email_log_sent_idx on public.email_log (sent_at) where status = 'sent';

comment on table public.email_log is
  'One row per reminder email per round and window (027). The key is what stops a re-run from sending twice. Service role only.';

alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE JOB'S THREE CALLS (service role only)
-- ---------------------------------------------------------------------------
/** Who should get the p_kind reminder now, one row per fan and round. */
create or replace function public.reminder_candidates(p_kind text)
returns table (user_id uuid, email text, name text, lang text, round_id bigint, league_id bigint,
               competition text, flag text, round_no integer, round_label text, deadline_utc timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select g.id, g.league_id, g.season, g.round_no, g.round_label, g.deadline_utc
      from public.game_rounds g
     where g.status = 'open'
       and case p_kind
             when 'round_24h' then g.deadline_utc >  now() + interval '2 hours' and g.deadline_utc <= now() + interval '24 hours'
             when 'round_2h'  then g.deadline_utc >  now()                      and g.deadline_utc <= now() + interval '2 hours'
             else false
           end
  ),
  fans as (
    -- Played this competition this season.
    select distinct r.id as round_id, e.user_id
      from r
      join public.game_rounds g2 on g2.league_id = r.league_id and g2.season = r.season
      join public.game_entries e on e.round_id = g2.id
    union
    -- Follows a club in it.
    select r.id, f.user_id
      from r
      join public.teams t on t.league_id = r.league_id
      join public.follows f on f.team_id = t.id
    union
    -- Main club in it.
    select r.id, p.id
      from r
      join public.teams t on t.league_id = r.league_id
      join public.profiles p on p.main_club_id = t.id
  )
  select fans.user_id, u.email::text, p.name,
         case
           when u.raw_user_meta_data->>'lang' ilike 'pt%' then 'pt-BR'
           when u.raw_user_meta_data->>'lang' is not null then 'en'
           when ml.country = 'Brazil' then 'pt-BR'
           else 'en'
         end as lang,
         r.id, r.league_id, l.name, l.flag, r.round_no, r.round_label, r.deadline_utc
    from fans
    join r on r.id = fans.round_id
    join public.leagues l on l.id = r.league_id
    join auth.users u on u.id = fans.user_id
    join public.profiles p on p.id = fans.user_id
    left join public.teams mt on mt.id = p.main_club_id
    left join public.leagues ml on ml.id = mt.league_id
   where p.notify_round_emails
     and u.email is not null
     and u.email_confirmed_at is not null
     and not exists (select 1 from public.game_entries x where x.user_id = fans.user_id and x.round_id = r.id)
     and not exists (select 1 from public.email_log el
                      where el.user_id = fans.user_id and el.round_id = r.id and el.kind = p_kind
                        and not (el.status = 'failed' and el.attempts < 3))
     and (p_kind <> 'round_2h' or not exists (
            select 1 from public.email_log el
             where el.user_id = fans.user_id and el.round_id = r.id and el.kind = 'round_24h'
               and el.status = 'sent' and el.sent_at > now() - interval '6 hours'))
   order by fans.user_id, r.deadline_utc;
$$;

/**
 * Claim rows before sending: p_items = [{"user_id": "...", "round_ids": [1,2]}].
 * A new (user, round, kind) is inserted as 'sending'; a FAILED one with fewer
 * than 3 attempts goes back to 'sending'. Anything else is left alone. Returns
 * exactly the rows this call claimed: only those may be emailed.
 */
create or replace function public.claim_reminders(p_kind text, p_items jsonb)
returns table (user_id uuid, round_id bigint)
language sql
security definer
set search_path = ''
as $$
  insert into public.email_log as el (user_id, round_id, kind)
  select (i.v->>'user_id')::uuid, rid.v::bigint, p_kind
    from jsonb_array_elements(p_items) as i(v),
         jsonb_array_elements_text(i.v->'round_ids') as rid(v)
  on conflict (user_id, round_id, kind) do update
     set status = 'sending', attempts = el.attempts + 1, error = null, updated_at = now()
   where el.status = 'failed' and el.attempts < 3
  returning el.user_id, el.round_id;
$$;

/**
 * Record the outcome: p_items = [{"user_id": "...", "round_ids": [...],
 * "resend_id": "..." }], all with the same status.
 */
create or replace function public.mark_reminders(p_kind text, p_status text, p_items jsonb, p_error text default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with upd as (
    update public.email_log el
       set status = p_status,
           resend_id = coalesce(i.resend_id, el.resend_id),
           error = case when p_status = 'failed' then left(p_error, 500) end,
           sent_at = case when p_status = 'sent' then now() else el.sent_at end,
           updated_at = now()
      from (select (x.v->>'user_id')::uuid as user_id, rid.v::bigint as round_id, x.v->>'resend_id' as resend_id
              from jsonb_array_elements(p_items) as x(v),
                   jsonb_array_elements_text(x.v->'round_ids') as rid(v)) i
     where el.user_id = i.user_id and el.round_id = i.round_id and el.kind = p_kind
       and p_status in ('sent', 'failed')
    returning 1
  )
  select count(*)::integer from upd;
$$;

revoke all on function public.reminder_candidates(text) from public, anon, authenticated;
revoke all on function public.claim_reminders(text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_reminders(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.reminder_candidates(text) to service_role;
grant execute on function public.claim_reminders(text, jsonb) to service_role;
grant execute on function public.mark_reminders(text, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. export_my_data(): 025's, with the emails we sent added
-- ---------------------------------------------------------------------------
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
    -- 027: the reminder emails we sent (or tried to).
    'emails', coalesce((select jsonb_agg(jsonb_build_object('kind', el.kind, 'round_id', el.round_id,
                                  'status', el.status, 'sent_at', el.sent_at, 'created_at', el.created_at)
                                  order by el.created_at)
                          from public.email_log el join me on el.user_id = me.uid), '[]'::jsonb),
    'activity_events', coalesce((select jsonb_agg(jsonb_build_object('type', ev.type, 'ref_type', ev.ref_type,
                                         'ref_id', ev.ref_id, 'created_at', ev.created_at) order by ev.created_at)
                                   from public.events ev join me on ev.user_id = me.uid), '[]'::jsonb)
  ) end;
$$;

comment on function public.export_my_data() is
  'LGPD portability: every row we hold about auth.uid(), as one JSON document (private leagues since 025, reminder emails since 027). Signed-in callers only, and only ever their own data.';

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- The column, its grant, and the log's RLS. Expect true, true, true:
--   select has_column_privilege('authenticated', 'public.profiles', 'notify_round_emails', 'UPDATE'),
--          (select relrowsecurity from pg_class where relname = 'email_log'),
--          not has_table_privilege('authenticated', 'public.email_log', 'SELECT');
--
-- The browser cannot call the job's functions. Expect false, false:
--   select has_function_privilege('authenticated', 'public.reminder_candidates(text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.claim_reminders(text, jsonb)', 'EXECUTE');
--
-- Who would be emailed right now (reads only):
--   select kind, count(distinct user_id) as fans, count(*) as fan_rounds
--     from (select 'round_24h' as kind, * from public.reminder_candidates('round_24h')
--           union all
--           select 'round_2h', * from public.reminder_candidates('round_2h')) c
--    group by kind;
--
-- What was sent in the last day:
--   select kind, status, count(*), max(sent_at) from public.email_log
--    where created_at > now() - interval '1 day' group by 1, 2;
