// THE league list: the one place a competition is added, renamed or switched.
//
// Everything else follows from it:
//   - supabase/migrations/035_leagues_config.sql: its seed block is GENERATED
//     from this file (node scripts/sync-leagues.mjs), and the crons read the
//     resulting `leagues` rows (activeLeagues());
//   - public/league-names.js: its LEAGUES block is GENERATED from this file
//     (names, country codes, regions), so every page names a league the same;
//   - api/_lib/tagger.js: LEAGUE_LANG comes from `langs` below, and news.js
//     indexes only the clubs of leagues with tagNews: true.
// tests/leagues-config.test.js fails if a generated block drifts from this file.
//
// Fields
//   slug          leagues.slug (never changes once a league exists)
//   apiId         API-Football league id (verified 17 Nov 2026, /leagues?id=)
//   name          the display name, without the country ("Série B")
//   country       the country as stored in leagues.country
//   code          FIFA-style three-letter code, the same in every language
//   season        current_season: API-Football names a season by the year it
//                 STARTS, so Europe's 2026-27 is 2026, like Brazil's 2026
//   seasonStart   first and last day of that season (API-Football seasons[].
//   seasonEnd     start / end). After seasonEnd + 8 days the daily jobs stop
//                 asking for the league (its final table and results stay).
//   active        ingested (matches, live, tables, clubs, rooms). Written on
//                 INSERT only: switching an existing league is a data
//                 migration of its own (rule: re-running 035 never toggles it).
//   playable      in the Scout Game. sync_game_rounds() builds rounds only for
//                 active AND playable leagues. Tracked ≠ playable.
//   statsCoverage false = API-Football has no team / player match stats for
//                 the season (fixture-stats skips it); null = not known yet
//   region        the news filter it belongs to ('brazil' | 'europe' | null)
//   langs         its domestic press languages, for the tagger
//   tagNews       its clubs are tagged in news headlines. Off for the new
//                 leagues until the measured check (commit 3, decision 5).

export const LEAGUES = [
  // ── The seven of the Scout Game ──
  { slug: 'serie_a', apiId: 71, name: 'Série A', country: 'Brazil', code: 'BRA', season: 2026, seasonStart: '2026-01-28', seasonEnd: '2026-12-02',
    active: true, playable: true, statsCoverage: null, region: 'brazil', langs: ['pt-BR'], tagNews: true },
  { slug: 'premier_league', apiId: 39, name: 'Premier League', country: 'England', code: 'ENG', season: 2026, seasonStart: '2026-08-21', seasonEnd: '2027-05-30',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['en'], tagNews: true },
  { slug: 'la_liga', apiId: 140, name: 'La Liga', country: 'Spain', code: 'ESP', season: 2026, seasonStart: '2026-08-15', seasonEnd: '2027-05-30',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['es'], tagNews: true },
  { slug: 'bundesliga', apiId: 78, name: 'Bundesliga', country: 'Germany', code: 'GER', season: 2026, seasonStart: '2026-08-28', seasonEnd: '2027-05-22',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['de'], tagNews: true },
  { slug: 'serie_a_it', apiId: 135, name: 'Serie A', country: 'Italy', code: 'ITA', season: 2026, seasonStart: '2026-08-22', seasonEnd: '2027-05-30',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['it'], tagNews: true },
  { slug: 'ligue_1', apiId: 61, name: 'Ligue 1', country: 'France', code: 'FRA', season: 2026, seasonStart: '2026-08-21', seasonEnd: '2027-05-29',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['fr'], tagNews: true },
  { slug: 'argentina', apiId: 128, name: 'Liga Profesional', country: 'Argentina', code: 'ARG', season: 2026, seasonStart: '2026-01-22', seasonEnd: '2026-11-22',
    active: true, playable: true, statsCoverage: null, region: null, langs: ['es'], tagNews: true },

  // ── Tracked only (17 Nov 2026): matches, live, tables, clubs, rooms; not in the Scout Game ──
  { slug: 'championship', apiId: 40, name: 'Championship', country: 'England', code: 'ENG', season: 2026, seasonStart: '2026-08-14', seasonEnd: '2027-05-01',
    active: true, playable: false, statsCoverage: null, region: 'europe', langs: ['en'], tagNews: false },
  { slug: 'eredivisie', apiId: 88, name: 'Eredivisie', country: 'Netherlands', code: 'NED', season: 2026, seasonStart: '2026-08-07', seasonEnd: '2027-05-23',
    active: false, playable: false, statsCoverage: null, region: 'europe', langs: [], tagNews: false },
  { slug: 'primeira_liga', apiId: 94, name: 'Primeira Liga', country: 'Portugal', code: 'POR', season: 2026, seasonStart: '2026-08-07', seasonEnd: '2027-05-16',
    active: false, playable: false, statsCoverage: null, region: 'europe', langs: [], tagNews: false },
  { slug: 'belgian_pro_league', apiId: 144, name: 'Jupiler Pro League', country: 'Belgium', code: 'BEL', season: 2026, seasonStart: '2026-08-07', seasonEnd: '2027-05-22',
    active: false, playable: false, statsCoverage: null, region: 'europe', langs: ['fr'], tagNews: false },
  { slug: 'scottish_premiership', apiId: 179, name: 'Premiership', country: 'Scotland', code: 'SCO', season: 2026, seasonStart: '2026-07-31', seasonEnd: '2027-04-10',
    active: false, playable: false, statsCoverage: null, region: 'europe', langs: ['en'], tagNews: false },
  { slug: 'super_lig', apiId: 203, name: 'Süper Lig', country: 'Turkey', code: 'TUR', season: 2026, seasonStart: '2026-08-14', seasonEnd: '2027-05-23',
    active: false, playable: false, statsCoverage: null, region: 'europe', langs: [], tagNews: false },
  { slug: 'saudi_pro_league', apiId: 307, name: 'Saudi Pro League', country: 'Saudi Arabia', code: 'KSA', season: 2026, seasonStart: '2026-08-13', seasonEnd: '2027-05-29',
    active: false, playable: false, statsCoverage: null, region: null, langs: [], tagNews: false },
  { slug: 'mls', apiId: 253, name: 'MLS', country: 'USA', code: 'USA', season: 2026, seasonStart: '2026-02-21', seasonEnd: '2026-11-29',
    active: false, playable: false, statsCoverage: null, region: null, langs: ['en'], tagNews: false },
  { slug: 'liga_mx', apiId: 262, name: 'Liga MX', country: 'Mexico', code: 'MEX', season: 2026, seasonStart: '2026-07-17', seasonEnd: '2026-11-23',
    active: false, playable: false, statsCoverage: null, region: null, langs: ['es'], tagNews: false },
  { slug: 'serie_b', apiId: 72, name: 'Série B', country: 'Brazil', code: 'BRA', season: 2026, seasonStart: '2026-03-21', seasonEnd: '2026-11-28',
    active: false, playable: false, statsCoverage: null, region: 'brazil', langs: ['pt-BR'], tagNews: false },
  { slug: 'serie_c', apiId: 75, name: 'Série C', country: 'Brazil', code: 'BRA', season: 2026, seasonStart: '2026-04-04', seasonEnd: '2026-10-25',
    active: false, playable: false, statsCoverage: false, region: 'brazil', langs: ['pt-BR'], tagNews: false },
];

/** By slug. */
export const BY_SLUG = Object.fromEntries(LEAGUES.map((l) => [l.slug, l]));

/** The press languages of each league, for the tagger (only leagues that tag news). */
export const LEAGUE_LANG = Object.fromEntries(LEAGUES.filter((l) => l.tagNews).map((l) => [l.slug, l.langs.slice()]));

/** Slugs whose clubs the news tagger indexes. */
export const TAGGED_SLUGS = new Set(LEAGUES.filter((l) => l.tagNews).map((l) => l.slug));

/**
 * Rough API-Football requests per league per day with the cron schedule of
 * commit 1 (tests/cron-budget.test.js sums it against the 7,500 a day):
 * fixtures 1 (+1 season-less retry when the window is empty), standings 1,
 * teams + weekly coaches ~3, fixture-stats ~1 per finished match, player-stats
 * ~1 per 20 finished matches, squads (players.js, playable only) ~5.
 */
export function requestsPerDay(l, { matchesPerDay = 1.5 } = {}) {
  if (!l.active) return 0;
  const stats = l.statsCoverage === false ? 0 : matchesPerDay;
  return 1 + 1 + 1 + 3 + stats + matchesPerDay / 20 + (l.playable ? 5 : 0);
}
