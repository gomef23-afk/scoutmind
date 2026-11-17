-- 033 — The pinned room welcome, in Portuguese and English (Sequence 2
-- commit 4b-8, 17 Nov 2026)
--
-- Re-runnable: the UPDATE sets every welcome to the same text each time, and
-- the INSERT only adds a welcome to an official room that has none. Run it
-- whole in the SQL editor (as the table owner: group_messages has no UPDATE
-- grant for the browser, and the insert guard lets system rows through).
--
-- Why: 011 wrote one English welcome per official room ("Welcome to the
-- <club> community. Match days, transfers, arguments. Be decent."). Since
-- 4b-5 the app speaks Portuguese to most readers; the welcome is the first
-- line of every room and stayed English. One line, Portuguese first, then
-- English, with the club's name from `teams.name` (as 011 used it).
--
-- The Portuguese avoids "do/da <club>" (the article depends on the club:
-- o Flamengo, a Juventus), so it names the club after a colon.
--
-- Scope: is_system AND pinned messages in official rooms only. The Scout Game
-- round posts (019) are is_system but NOT pinned, so they are untouched.
-- Soft-deleted rows stay as they are. Nothing is deleted.
-- Longest club name today is well under the 500-character limit (011's
-- group_messages_content_len); the CHECK below fails loudly if one is not.

begin;

-- 1. Rewrite every existing pinned welcome.
update public.group_messages m
   set content = 'Bem-vindos à sala oficial da torcida: ' || t.name
                 || '. Dia de jogo, mercado, discussão. Respeito sempre.'
                 || ' · Welcome to the official ' || t.name
                 || ' room. Match days, transfers, arguments. Be decent.'
  from public.groups g
  join public.teams t on t.id = g.club_id
 where m.group_id = g.id
   and g.is_official
   and m.is_system
   and m.pinned
   and m.deleted_at is null;

-- 2. A room created after 011 (a league expansion) that never got a welcome.
insert into public.group_messages (group_id, user_id, content, pinned, is_system)
select g.id,
       null,
       'Bem-vindos à sala oficial da torcida: ' || t.name
         || '. Dia de jogo, mercado, discussão. Respeito sempre.'
         || ' · Welcome to the official ' || t.name
         || ' room. Match days, transfers, arguments. Be decent.',
       true,
       true
  from public.groups g
  join public.teams t on t.id = g.club_id
 where g.is_official
   and not exists (
     select 1 from public.group_messages m
      where m.group_id = g.id and m.is_system and m.pinned and m.deleted_at is null
   );

-- 3. Fail the whole run rather than leave a room half-done.
do $$
declare
  v_rooms    int;
  v_welcomes int;
  v_old      int;
begin
  select count(*) into v_rooms from public.groups where is_official;
  select count(distinct m.group_id) into v_welcomes
    from public.group_messages m
    join public.groups g on g.id = m.group_id and g.is_official
   where m.is_system and m.pinned and m.deleted_at is null
     and m.content like 'Bem-vindos à sala oficial da torcida: %· Welcome to the official % room.%';
  select count(*) into v_old
    from public.group_messages m
    join public.groups g on g.id = m.group_id and g.is_official
   where m.is_system and m.pinned and m.deleted_at is null
     and m.content like 'Welcome to the % community.%';
  if v_welcomes <> v_rooms or v_old <> 0 then
    raise exception '033: % official rooms, % with the bilingual welcome, % still English-only', v_rooms, v_welcomes, v_old;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (run after; read-only)
-- ---------------------------------------------------------------------------
-- Expect: rooms = with_bilingual_welcome, english_only = 0, extra_pinned = 0,
-- and longest under 500.
--
--   select
--     (select count(*) from public.groups where is_official)                       as rooms,
--     count(distinct m.group_id) filter (
--       where m.content like 'Bem-vindos à sala oficial da torcida: %· Welcome to the official % room.%')
--                                                                                   as with_bilingual_welcome,
--     count(*) filter (where m.content like 'Welcome to the % community.%')         as english_only,
--     count(*) - count(distinct m.group_id)                                         as extra_pinned,
--     max(char_length(m.content))                                                   as longest
--   from public.group_messages m
--   join public.groups g on g.id = m.group_id and g.is_official
--  where m.is_system and m.pinned and m.deleted_at is null;
--
-- And three rooms to read with your own eyes:
--
--   select t.name, m.content
--     from public.group_messages m
--     join public.groups g on g.id = m.group_id and g.is_official
--     join public.teams t on t.id = g.club_id
--    where m.is_system and m.pinned and m.deleted_at is null
--    order by t.name
--    limit 3;
