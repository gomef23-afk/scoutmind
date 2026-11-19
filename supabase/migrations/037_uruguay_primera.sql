-- 037 — Uruguay's Primera División, tracked (19 Nov 2026)
--
-- Data only. Re-runnable: one INSERT … ON CONFLICT on the league's API id.
--
-- Adds the league as tracked (matches, live, tables, clubs, rooms) and NOT
-- playable: sync_game_rounds() (035) builds Scout Game rounds only for active
-- AND playable leagues. Values from api/_lib/leagues.js (the one league list;
-- tests/leagues-config.test.js checks this file against it). API-Football
-- 268, season 2026 (6 Feb - 23 Nov 2026), verified on 19 Nov 2026.
--
-- On a re-run, an existing row keeps its name, slug and season and is set
-- active and not playable again: this file only ever switches the league ON.
-- Its clubs arrive with /api/cron/teams?league=uruguay; their rooms and the
-- bilingual welcome come from 035's trigger.

insert into public.leagues (api_league_id, slug, name, country, country_code, current_season,
                            season_start, season_end, active, playable, stats_coverage, region, tier)
values (268, 'uruguay', 'Primera División', 'Uruguay', 'URU', 2026,
        date '2026-02-06', date '2026-11-23', true, false, null, null, 1)
on conflict (api_league_id) do update
   set active       = true,
       playable     = false,
       country_code = excluded.country_code,
       season_start = excluded.season_start,
       season_end   = excluded.season_end,
       updated_at   = now();

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- 19 active leagues, 7 playable, no Scout Game round outside them (expect 19, 7, 0),
-- and the new row:
--
--   select count(*) filter (where active)              as active,
--          count(*) filter (where active and playable) as playable,
--          (select count(*) from public.game_rounds g join public.leagues l on l.id = g.league_id
--            where not l.playable)                      as rounds_outside_the_game
--     from public.leagues;
--
--   select id, slug, name, country_code, current_season, season_end, active, playable
--     from public.leagues where slug = 'uruguay';
