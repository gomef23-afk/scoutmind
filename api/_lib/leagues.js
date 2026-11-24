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
//   type          'league' | 'cup' | 'mixed' (C-1, 22 Nov 2026; leagues.type,
//                 migration 039). A cup is tracked like a league (matches,
//                 live, table, match panels) but never playable, never feeds a
//                 club's season stats, form or position, and its clubs that
//                 play in no tracked league are CUP-ONLY clubs: a row with name
//                 and crest under the cup, a page, no room, never offered as a
//                 club to follow, never tagged in news. A cup is not in 035's
//                 seed: its own migration inserts it (039, 040).
//   fromRound     cups: the first round we load ('League Stage'); qualifying
//                 rounds before it are skipped (api/_lib/cups.js).
//   seasonEnd     for a cup: the date of its FINAL (UEFA), never the API's
//                 season end (which stops at the league phase).

export const LEAGUES = [
  // ── The original seven of the Scout Game (the Championship and the Primeira
  //    Liga, below, are playable since 041) ──
  { slug: 'serie_a', apiId: 71, name: 'Série A', country: 'Brazil', code: 'BRA', season: 2026, seasonStart: '2026-01-28', seasonEnd: '2026-12-02',
    active: true, playable: true, statsCoverage: null, region: 'brazil', langs: ['pt-BR'], tagNews: true, type: 'league' },
  { slug: 'premier_league', apiId: 39, name: 'Premier League', country: 'England', code: 'ENG', season: 2026, seasonStart: '2026-08-21', seasonEnd: '2027-05-30',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['en'], tagNews: true, type: 'league' },
  { slug: 'la_liga', apiId: 140, name: 'La Liga', country: 'Spain', code: 'ESP', season: 2026, seasonStart: '2026-08-15', seasonEnd: '2027-05-30',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['es'], tagNews: true, type: 'league' },
  { slug: 'bundesliga', apiId: 78, name: 'Bundesliga', country: 'Germany', code: 'GER', season: 2026, seasonStart: '2026-08-28', seasonEnd: '2027-05-22',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['de'], tagNews: true, type: 'league' },
  { slug: 'serie_a_it', apiId: 135, name: 'Serie A', country: 'Italy', code: 'ITA', season: 2026, seasonStart: '2026-08-22', seasonEnd: '2027-05-30',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['it'], tagNews: true, type: 'league' },
  { slug: 'ligue_1', apiId: 61, name: 'Ligue 1', country: 'France', code: 'FRA', season: 2026, seasonStart: '2026-08-21', seasonEnd: '2027-05-29',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['fr'], tagNews: true, type: 'league' },
  { slug: 'argentina', apiId: 128, name: 'Liga Profesional', country: 'Argentina', code: 'ARG', season: 2026, seasonStart: '2026-01-22', seasonEnd: '2026-11-22',
    active: true, playable: true, statsCoverage: null, region: null, langs: ['es'], tagNews: true, type: 'league' },

  // ── Tracked only: matches, live, tables, clubs, rooms; not in the Scout Game ──
  // Championship switched on in 035 (17 Nov 2026), the other ten in 036
  // (18 Nov 2026). News tagging for all eleven since the measured check of
  // 18 Nov (tests/tagger-new-leagues.test.js). langs: the press languages our
  // sources write in for that league (LANGS in tagger.js). Since C1 (21 Nov
  // 2026, tests/tagger-press.test.js): Dutch for the Eredivisie, European
  // Portuguese (pt-PT, never the Brazilian sources) for the Primeira Liga,
  // French and Dutch for Belgium, Turkish for the Süper Lig, English for the
  // Saudi Pro League (our Saudi press is English; Arabic sources are skipped).
  // 3.2c (041, 24 Nov 2026): the Championship and the Primeira Liga are
  // playable too (backtest of 23 Nov on the full points table: tiers ordered,
  // fan round median ~40), keeping the game in seven leagues through December
  // after Argentina and Série A end. The Eredivisie can follow with the same
  // one-line migration.
  { slug: 'championship', apiId: 40, name: 'Championship', country: 'England', code: 'ENG', season: 2026, seasonStart: '2026-08-14', seasonEnd: '2027-05-01',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['en'], tagNews: true, type: 'league' },
  { slug: 'eredivisie', apiId: 88, name: 'Eredivisie', country: 'Netherlands', code: 'NED', season: 2026, seasonStart: '2026-08-07', seasonEnd: '2027-05-23',
    active: true, playable: false, statsCoverage: null, region: 'europe', langs: ['nl'], tagNews: true, type: 'league' },
  { slug: 'primeira_liga', apiId: 94, name: 'Primeira Liga', country: 'Portugal', code: 'POR', season: 2026, seasonStart: '2026-08-07', seasonEnd: '2027-05-16',
    active: true, playable: true, statsCoverage: null, region: 'europe', langs: ['pt-PT'], tagNews: true, type: 'league' },
  { slug: 'belgian_pro_league', apiId: 144, name: 'Jupiler Pro League', country: 'Belgium', code: 'BEL', season: 2026, seasonStart: '2026-08-07', seasonEnd: '2027-05-22',
    active: true, playable: false, statsCoverage: null, region: 'europe', langs: ['fr', 'nl'], tagNews: true, type: 'league' },
  { slug: 'scottish_premiership', apiId: 179, name: 'Premiership', country: 'Scotland', code: 'SCO', season: 2026, seasonStart: '2026-07-31', seasonEnd: '2027-04-10',
    active: true, playable: false, statsCoverage: null, region: 'europe', langs: ['en'], tagNews: true, type: 'league' },
  { slug: 'super_lig', apiId: 203, name: 'Süper Lig', country: 'Turkey', code: 'TUR', season: 2026, seasonStart: '2026-08-14', seasonEnd: '2027-05-23',
    active: true, playable: false, statsCoverage: null, region: 'europe', langs: ['tr'], tagNews: true, type: 'league' },
  { slug: 'saudi_pro_league', apiId: 307, name: 'Saudi Pro League', country: 'Saudi Arabia', code: 'KSA', season: 2026, seasonStart: '2026-08-13', seasonEnd: '2027-05-29',
    active: true, playable: false, statsCoverage: null, region: null, langs: ['en'], tagNews: true, type: 'league' },
  { slug: 'mls', apiId: 253, name: 'MLS', country: 'USA', code: 'USA', season: 2026, seasonStart: '2026-02-21', seasonEnd: '2026-11-29',
    active: true, playable: false, statsCoverage: null, region: null, langs: ['en'], tagNews: true, type: 'league' },
  { slug: 'liga_mx', apiId: 262, name: 'Liga MX', country: 'Mexico', code: 'MEX', season: 2026, seasonStart: '2026-07-17', seasonEnd: '2026-11-23',
    active: true, playable: false, statsCoverage: null, region: null, langs: ['es'], tagNews: true, type: 'league' },
  { slug: 'serie_b', apiId: 72, name: 'Série B', country: 'Brazil', code: 'BRA', season: 2026, seasonStart: '2026-03-21', seasonEnd: '2026-11-28',
    active: true, playable: false, statsCoverage: null, region: 'brazil', langs: ['pt-BR'], tagNews: true, type: 'league' },
  { slug: 'serie_c', apiId: 75, name: 'Série C', country: 'Brazil', code: 'BRA', season: 2026, seasonStart: '2026-04-04', seasonEnd: '2026-10-25',
    active: true, playable: false, statsCoverage: false, region: 'brazil', langs: ['pt-BR'], tagNews: true, type: 'league' },
  // Added 19 Nov 2026 (migration 037). API-Football 268, verified: season 2026
  // (6 Feb - 23 Nov), standings and team match stats, NO player stats (the
  // match panel shows score, events and team stats only). Its table comes as
  // five groups: Tabla Anual, Promedios, Torneo Intermedio, Apertura,
  // Clausura. Club names that are ordinary words or other clubs' names match
  // only in full (QUALIFIED_NAMES in tagger.js: Club Nacional, Wanderers...).
  { slug: 'uruguay', apiId: 268, name: 'Primera División', country: 'Uruguay', code: 'URU', season: 2026, seasonStart: '2026-02-06', seasonEnd: '2026-11-23',
    active: true, playable: false, statsCoverage: null, region: null, langs: ['es'], tagNews: true, type: 'league' },

  // ── Cups (C-1, 22 Nov 2026; migration 039) ──
  // API-Football 2, season 2026: one 36-club league-phase table (8 matchdays,
  // 8 Sep 2026 – 27 Jan 2027), then knockout ties. Final: 5 June 2027,
  // Estadio Metropolitano, Madrid (UEFA). The API's own season end
  // (2027-01-27) is the end of the league phase only.
  { slug: 'champions_league', apiId: 2, name: 'Champions League', country: 'Europe', code: 'UEFA', season: 2026, seasonStart: '2026-09-08', seasonEnd: '2027-06-05',
    active: true, playable: false, statsCoverage: true, region: null, langs: [], tagNews: false, type: 'cup', fromRound: 'League Stage' },
  // C-2 (22 Nov 2026; migration 040). Europa League: API-Football 3, a
  // 36-club league phase of 8 matchdays (16 Sep 2026 – 28 Jan 2027); final
  // 26 May 2027, Frankfurt (UEFA). Conference League: API-Football 848, a
  // 36-club league phase of 6 matchdays (15 Oct – 17 Dec 2026); final 2 June
  // 2027, Istanbul (UEFA). The API's season ends are the league phases'.
  { slug: 'europa_league', apiId: 3, name: 'Europa League', country: 'Europe', code: 'UEFA', season: 2026, seasonStart: '2026-09-16', seasonEnd: '2027-05-26',
    active: true, playable: false, statsCoverage: true, region: null, langs: [], tagNews: false, type: 'cup', fromRound: 'League Stage' },
  { slug: 'conference_league', apiId: 848, name: 'Conference League', country: 'Europe', code: 'UEFA', season: 2026, seasonStart: '2026-10-15', seasonEnd: '2027-06-02',
    active: true, playable: false, statsCoverage: true, region: null, langs: [], tagNews: false, type: 'cup', fromRound: 'League Stage' },
];

/** The cups among them (type 'cup'). */
export const CUPS = LEAGUES.filter((l) => l.type === 'cup');

/** By slug. */
export const BY_SLUG = Object.fromEntries(LEAGUES.map((l) => [l.slug, l]));

/** The press languages of each league, for the tagger (only leagues that tag news). */
export const LEAGUE_LANG = Object.fromEntries(LEAGUES.filter((l) => l.tagNews).map((l) => [l.slug, l.langs.slice()]));

/**
 * The country of each league's domestic press, as news_sources.country writes
 * it (ISO 3166-1 alpha-2; England and Scotland are both GB, as the BBC is).
 * The tagger lets a source's own country decide a name clash and unlocks the
 * names meant only in that press (tagger.js, C1, 21 Nov 2026).
 */
export const COUNTRY_ISO = { Brazil: 'BR', England: 'GB', Scotland: 'GB', Spain: 'ES', Italy: 'IT', Germany: 'DE', France: 'FR', Argentina: 'AR',
  Netherlands: 'NL', Portugal: 'PT', Belgium: 'BE', Turkey: 'TR', 'Saudi Arabia': 'SA', USA: 'US', Mexico: 'MX', Uruguay: 'UY' };
export const LEAGUE_COUNTRY = Object.fromEntries(LEAGUES.map((l) => [l.slug, COUNTRY_ISO[l.country] || null]));

/** Slugs whose clubs the news tagger indexes. */
export const TAGGED_SLUGS = new Set(LEAGUES.filter((l) => l.tagNews).map((l) => l.slug));

/**
 * The leagues whose clubs were tagged before 18 Nov 2026. In a name clash
 * with a club from any other league, the tagger never lets one of these lose
 * its tag (buildIndex, `established`; decision 5).
 */
export const ESTABLISHED_SLUGS = new Set(['serie_a', 'premier_league', 'la_liga', 'bundesliga', 'serie_a_it', 'ligue_1', 'argentina']);

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
