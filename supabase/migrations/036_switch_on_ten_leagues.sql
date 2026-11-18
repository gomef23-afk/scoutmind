-- 036 — Switch on the other ten tracked leagues (18 Nov 2026)
--
-- Data only. Re-runnable: it sets active = true on ten named rows and does
-- nothing else; running it twice changes nothing the second time.
--
-- 035 inserted these ten leagues dormant (active = false, playable = false)
-- and Championship active. This switches the ten on for ingestion: matches,
-- live scores, tables, clubs and rooms. NOT the Scout Game: `playable` stays
-- false, and sync_game_rounds() (035) builds rounds only for active AND
-- playable leagues. api/_lib/leagues.js says the same (active: true,
-- playable: false); tests/leagues-config.test.js checks this file against it.
--
-- Nothing else happens until the jobs run: the clubs arrive with
-- /api/cron/teams (their rooms and welcomes come from 035's trigger), then
-- fixtures and standings. See the commit's verification order.

begin;

update public.leagues
   set active = true, updated_at = now()
 where slug in ('eredivisie', 'primeira_liga', 'belgian_pro_league', 'scottish_premiership', 'super_lig',
                'saudi_pro_league', 'mls', 'liga_mx', 'serie_b', 'serie_c')
   and not active;

-- Belt and braces: none of them is in the Scout Game.
update public.leagues
   set playable = false, updated_at = now()
 where slug in ('eredivisie', 'primeira_liga', 'belgian_pro_league', 'scottish_premiership', 'super_lig',
                'saudi_pro_league', 'mls', 'liga_mx', 'serie_b', 'serie_c')
   and playable;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only; run after)
-- ---------------------------------------------------------------------------
-- Eighteen active leagues, seven playable (expect 18, 7, 0):
--
--   select count(*) filter (where active)                    as active,
--          count(*) filter (where active and playable)       as playable,
--          (select count(*) from public.game_rounds g join public.leagues l on l.id = g.league_id
--            where not l.playable)                            as rounds_outside_the_game
--     from public.leagues;
