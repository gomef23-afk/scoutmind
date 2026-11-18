-- 035b — Fix 035's room trigger: groups.id is a uuid (17 Nov 2026)
--
-- Re-runnable: CREATE OR REPLACE FUNCTION only. Run it whole in the SQL editor.
--
-- What broke: ensure_club_room() (035) declared `v_group bigint` and did
-- `insert into public.groups … returning id into v_group`. groups.id is a uuid
-- (011: "Both primary keys are UUIDs"), so the first brand-new club raised
-- 22P02 "invalid input syntax for type bigint: <the new room's uuid>". The
-- trigger runs inside the teams upsert, so /api/cron/teams?league=championship
-- failed as a whole and rolled back: no team, room or message was written.
-- 035's backfill never used the variable, so it ran clean.
--
-- The fix: v_group uuid. Same body otherwise; the trigger itself (035) is
-- unchanged and keeps calling this function. 035 is corrected too, so a
-- re-run of 035 cannot bring the bug back.

create or replace function public.ensure_club_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;   -- groups.id is a uuid (011), like 019's v_room
begin
  select g.id into v_group from public.groups g where g.club_id = new.id and g.is_official limit 1;
  if v_group is null then
    insert into public.groups (club_id, name, description, is_official, active)
    values (new.id, new.name || ' Community',
            'Match days, transfers, arguments. The official ' || new.name || ' room.', true, true)
    returning id into v_group;
  end if;
  if not exists (select 1 from public.group_messages m
                  where m.group_id = v_group and m.is_system and m.pinned and m.deleted_at is null) then
    insert into public.group_messages (group_id, user_id, content, pinned, is_system)
    values (v_group, null,
            'Bem-vindos à sala oficial da torcida: ' || new.name
              || '. Dia de jogo, mercado, discussão. Respeito sempre.'
              || ' · Welcome to the official ' || new.name
              || ' room. Match days, transfers, arguments. Be decent.',
            true, true);
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_club_room() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY (run after)
-- ---------------------------------------------------------------------------
-- 1. The function now holds a uuid (expect true):
--
--   select pg_get_functiondef('public.ensure_club_room()'::regprocedure) like '%v_group uuid%';
--
-- 2. The trigger path end to end, rolled back (nothing is kept). A throwaway
--    club with no league and a negative API id; expect one room and one
--    pinned welcome, then the rollback removes all three rows:
--
--   begin;
--   insert into public.teams (api_team_id, name) values (-35, 'Trigger Test FC');
--   select g.name, m.content
--     from public.teams t
--     join public.groups g on g.club_id = t.id and g.is_official
--     join public.group_messages m on m.group_id = g.id and m.is_system and m.pinned
--    where t.api_team_id = -35;
--   rollback;
