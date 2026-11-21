-- 040 — The Europa League and the Conference League (C-2, 22 Nov 2026)
--
-- Data only; needs 039 (leagues.type and the cup model). Re-runnable: one
-- INSERT … ON CONFLICT per competition on its API id. Nothing is deleted.
--
-- Both are cups like the Champions League (039): tracked (matches, live,
-- table, panels, club pages), NOT playable, from the league phase on (no
-- qualifying rounds), never part of a club's domestic picture. Values from
-- api/_lib/leagues.js (tests/cups.test.js checks this file against it):
--   Europa League      API-Football 3,   league phase 16 Sep 2026 – 28 Jan 2027,
--                      final 26 May 2027 (Frankfurt, UEFA)
--   Conference League  API-Football 848, league phase 15 Oct – 17 Dec 2026,
--                      final 2 June 2027 (Istanbul, UEFA)
-- season_end is the final, not the API's season end (the league phase's).
-- On a re-run each row is set active, not playable, a cup, with these dates:
-- this file only ever switches them ON.

insert into public.leagues (api_league_id, slug, name, country, country_code, current_season,
                            season_start, season_end, active, playable, stats_coverage, region, tier, type)
values (3,   'europa_league',     'Europa League',     'Europe', 'UEFA', 2026, date '2026-09-16', date '2027-05-26', true, false, true, null, 1, 'cup'),
       (848, 'conference_league', 'Conference League', 'Europe', 'UEFA', 2026, date '2026-10-15', date '2027-06-02', true, false, true, null, 1, 'cup')
on conflict (api_league_id) do update
   set active         = true,
       playable       = false,
       type           = 'cup',
       country_code   = excluded.country_code,
       season_start   = excluded.season_start,
       season_end     = excluded.season_end,
       stats_coverage = excluded.stats_coverage,
       updated_at     = now();

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- 22 active (19 leagues + 3 cups), 7 playable, no round outside the game:
--   select count(*) filter (where active) as active,
--          count(*) filter (where active and type = 'league') as leagues,
--          count(*) filter (where active and type = 'cup') as cups,
--          count(*) filter (where active and playable) as playable,
--          (select count(*) from public.game_rounds g join public.leagues l on l.id = g.league_id where not l.playable) as rounds_outside_the_game
--     from public.leagues;                                                    -- 22, 19, 3, 7, 0
--
-- After the calls (teams, fixtures full, standings for both):
--   cup-only clubs per cup (17 Europa, 24 Conference, 8 Champions), none with a room:
--   select l.slug, count(t.*) as cup_only,
--          count(g.*) as rooms
--     from public.leagues l join public.teams t on t.league_id = l.id
--     left join public.groups g on g.club_id = t.id and g.is_official
--    where l.type = 'cup' group by l.slug order by l.slug;                     -- champions 8/0, conference 24/0, europa 17/0
--
--   league-phase fixtures, no qualifying round (144 Europa, 108 Conference):
--   select l.slug, count(*), count(*) filter (where f.round ilike '%qualifying%' or f.round in ('Play-offs', 'Playoff round'))
--     from public.fixtures f join public.leagues l on l.id = f.league_id
--    where l.type = 'cup' group by l.slug order by l.slug;
--
--   a cup's season_end is never earlier than its last fixture held (expect 0 rows):
--   select l.slug, l.season_end, max(f.kickoff_utc)::date as last_fixture
--     from public.leagues l join public.fixtures f on f.league_id = l.id and f.season = l.current_season
--    where l.type = 'cup' group by l.slug, l.season_end having max(f.kickoff_utc)::date > l.season_end;
