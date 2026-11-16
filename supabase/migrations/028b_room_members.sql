-- 028b_room_members.sql — writing in a club room is for its members.
--
-- Run in the Supabase SQL editor AFTER 028_club_features.sql (it uses
-- is_club_member()). Safe to run more than once.
--
-- Found live on 16 Nov 2026: anyone signed in could post in any club's room
-- (011's guard checked only that the room was open). The rule is now the same
-- as polls and the wishlist: you write in a room if the club is your main club
-- or one you follow — is_club_member(). Reading stays open to everyone,
-- guests included; deleting your own message is unchanged.
--
-- Enforced twice, as in 028: the guard trigger raises a readable message, and
-- the insert policy holds on its own if the trigger is ever dropped.

begin;

do $$
begin
  if to_regprocedure('public.is_club_member(bigint)') is null then
    raise exception 'Run 028_club_features.sql first: 028b needs is_club_member().';
  end if;
end $$;

-- 011's guard, unchanged except for the membership check after "the room has
-- to be open". Rate limits stay here and nowhere else.
create or replace function public.group_message_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent integer;
  hourly integer;
  room   record;
begin
  -- System messages are inserted by migrations as the table owner, never
  -- through PostgREST, and skip every user-facing rule.
  if new.is_system then
    return new;
  end if;

  new.content := btrim(new.content);
  if char_length(new.content) = 0 then
    raise exception 'Message is empty.' using errcode = 'check_violation';
  end if;

  -- The room has to be open. Without this, the eight retired groups would
  -- still accept writes from anyone who kept an old group id.
  select g.active, g.is_official, g.club_id into room
    from public.groups g where g.id = new.group_id;
  if not found or not room.active then
    raise exception 'That room is closed.' using errcode = 'check_violation';
  end if;

  -- 028b: members only. A room with no club (the retired May groups) has no
  -- members, so nobody can write in it.
  if room.club_id is null or not public.is_club_member(room.club_id) then
    raise exception 'Follow this club to chat in its room.' using errcode = 'check_violation';
  end if;

  -- Never trusted from the client: authors are resolved from public_profiles
  -- at read time, so this column must stay empty.
  new.user_name := null;

  select count(*) into recent
    from public.group_messages
   where user_id = new.user_id
     and created_at > now() - interval '5 seconds';
  if recent > 0 then
    raise exception 'Slow down a moment before posting again.'
      using errcode = 'check_violation';
  end if;

  select count(*) into hourly
    from public.group_messages
   where user_id = new.user_id
     and created_at > now() - interval '1 hour';
  if hourly >= 60 then
    raise exception 'You have hit the hourly message limit. Try again later.'
      using errcode = 'check_violation';
  end if;

  perform public.moderation_check(new.content);
  return new;
end;
$$;

revoke all on function public.group_message_guard() from public, anon, authenticated;

drop trigger if exists group_messages_guard on public.group_messages;
create trigger group_messages_guard
  before insert on public.group_messages
  for each row execute function public.group_message_guard();

-- 011's insert policy plus membership. `is_system` and `pinned` stay forced
-- false so nobody can post as ScoutMind.
drop policy if exists "group_messages self insert" on public.group_messages;
create policy "group_messages self insert" on public.group_messages
  for insert to authenticated
  with check (auth.uid() = user_id and not is_system and not pinned
              and public.is_club_member((select g.club_id from public.groups g where g.id = group_id)));

-- Reading is untouched: "group_messages read" (011) still lets anon and
-- authenticated read every live message.

commit;

-- ---------------------------------------------------------------------------
-- VERIFY — every row should say ok = true
-- ---------------------------------------------------------------------------
--   select * from (values
--     ('insert policy checks membership', (select pg_get_expr(polwithcheck, polrelid) like '%is_club_member%'
--         from pg_policy where polname = 'group_messages self insert')),
--     ('guard checks membership', (select prosrc like '%is_club_member(room.club_id)%'
--         from pg_proc where proname = 'group_message_guard' and pronamespace = 'public'::regnamespace)),
--     ('guard trigger in place', exists (select 1 from pg_trigger where tgname = 'group_messages_guard' and not tgisinternal)),
--     ('reading still open to guests', (select pg_get_expr(polqual, polrelid) like '%deleted_at IS NULL%'
--         and 'anon' = any (select rolname from pg_roles where oid = any (polroles))
--         from pg_policy where polname = 'group_messages read'))
--   ) as t(check_name, ok);
--
-- OPTIONAL — try it as a real account, rolled back so nothing is written.
-- Put your own user id and a club you do NOT follow (Chapecoense):
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<your-user-uuid>","role":"authenticated"}', true);
--   insert into public.group_messages (group_id, user_id, content)
--   select g.id, '<your-user-uuid>', 'test' from public.groups g
--     join public.teams t on t.id = g.club_id
--    where g.is_official and t.name ilike 'Chapecoense%';
--   -- expect: ERROR  Follow this club to chat in its room.
--   rollback;
