// Cups, and the Champions League end to end (C-1, 22 Nov 2026).
//
//   node tests/cups.test.js
//
// Real data: API-Football's UCL 2026 (qualifying + league stage + the
// 36-club table) and the UCL 2025-26 knockouts (Round of 32 to the Final),
// frozen and trimmed in tests/fixtures/api-football/. Covered:
// 1. rounds: every real round name classified; the server's qualifying rule
//    and the browser's agree; a cup keeps nothing before its league phase;
// 2. ties: pairs by round, aggregates with extra time, the per-match `winner`
//    ignored, penalties on the last leg, the final single and neutral, an
//    unfinished tie undecided;
// 3. the config and migration 039: type, not playable, not tagged, from the
//    league stage, season_end = the final and never before a fixture we hold;
//    the row, the columns, rooms never for cup-only clubs, season stats that
//    only count league competitions;
// 4. the jobs: every club mapped (a cup's fixtures are between other leagues'
//    clubs), penalties and zones written only once a cup exists (rule 21),
//    cup-only clubs insert-only, no coach requests for them, a club's season
//    row from its own league only;
// 5. the pages: cup-only clubs never offered or listed, positions domestic,
//    the band naming a cup match, the picker's Cups section, the table's zone
//    text and the knockout list, "19 leagues + N cups";
// 6. news: no club gains or loses a tag; competition names tag nobody.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isQualifying, keepRound, penalties, isCupRow } from '../api/_lib/cups.js';
import { LEAGUES, BY_SLUG, CUPS, TAGGED_SLUGS } from '../api/_lib/leagues.js';
import { buildIndex, tagText } from '../api/_lib/tagger.js';
import { TEAM_ALIASES } from '../api/_lib/aliases.js';
import { TRACKED_ALIASES } from '../api/_lib/aliases-tracked.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const U26 = JSON.parse(read('tests/fixtures/api-football/ucl-2026.json'));
const KO25 = JSON.parse(read('tests/fixtures/api-football/ucl-2025-knockouts.json')).fixtures;
const box = {}; vm.createContext(box); vm.runInContext(read('public/cup-ties.js'), box);
const CT = box.CupTies;

// ── 1. Rounds ──
const rounds26 = [...new Set(U26.fixtures.map((f) => f.league.round))];
const rounds25 = [...new Set(KO25.map((f) => f.league.round))];
eq('UCL 2026 rounds, classified', Object.fromEntries(rounds26.map((r) => [r, CT.stage(r)])), {
  '1st Qualifying Round': null, '2nd Qualifying Round': null, '3rd Qualifying Round': null, 'Play-offs': null,
  'League Stage - 1': 'league', 'League Stage - 2': 'league', 'League Stage - 3': 'league', 'League Stage - 4': 'league',
  'League Stage - 5': 'league', 'League Stage - 6': 'league', 'League Stage - 7': 'league', 'League Stage - 8': 'league' });
eq('UCL 2025 knockout rounds, classified (Round of 32 = the knockout play-off)', rounds25.map((r) => CT.stage(r)), ['kpo', 'r16', 'qf', 'sf', 'f']);
eq('older names too, and the Conference League\'s "Playoff round"', ['Knockout Round Play-offs', 'Playoff round', 'Final', '8th Finals'].map((r) => CT.stage(r)), ['kpo', null, 'f', 'r16']);
check('the server\'s qualifying rule and the browser\'s agree on every real round', [...rounds26, ...rounds25, 'Playoff round'].every((r) => isQualifying(r) === (CT.stage(r) === null)));
const ucl = { id: 99, slug: 'champions_league' };
const kept = U26.fixtures.filter((f) => keepRound(ucl, f.league.round));
eq('a cup keeps its league phase only (234 fixtures → the 144 of the 8 matchdays)', [U26.fixtures.length, kept.length, kept.every((f) => /^League Stage/.test(f.league.round))], [234, 144, true]);
check('a league keeps every round', U26.fixtures.every((f) => keepRound({ slug: 'premier_league' }, f.league.round)) && keepRound({ slug: 'argentina' }, 'Play-offs'));
eq('penalties from score.penalty', [penalties({ score: { penalty: { home: 4, away: 3 } } }), penalties({ score: {} })], [{ pen_home: 4, pen_away: 3 }, { pen_home: null, pen_away: null }]);
check('isCupRow by the config (the DB row needs no type column)', isCupRow({ slug: 'champions_league' }) && !isCupRow({ slug: 'serie_a' }) && isCupRow({ slug: 'x', type: 'cup' }));

// ── 2. Ties, on the real UCL 2025-26 knockouts ──
const row = (f) => ({ id: f.fixture.id, round: f.league.round, kickoff: f.fixture.date, status_short: f.fixture.status.short, home_id: f.teams.home.id, away_id: f.teams.away.id,
  home_goals: f.goals.home, away_goals: f.goals.away, pen_home: f.score.penalty.home, pen_away: f.score.penalty.away, venue_name: f.fixture.venue.name });
const NAME = new Map(KO25.flatMap((f) => [[f.teams.home.id, f.teams.home.name], [f.teams.away.id, f.teams.away.name]]));
const ties = CT.build(KO25.map(row));
eq('ties per round: 8 play-offs, 8 last-16, 4 quarters, 2 semis, 1 final', CT.STAGES.map((s) => ties.filter((t) => t.stage === s).length), [8, 8, 4, 2, 1]);
const tieOf = (a, b) => ties.find((t) => [NAME.get(t.a), NAME.get(t.b)].sort().join() === [a, b].sort().join());
const gj = tieOf('Galatasaray', 'Juventus');
eq('Galatasaray–Juventus: 5–2 then 2–3 aet → 7–5, Galatasaray through (the API calls Juventus the second leg\'s "winner")',
  [NAME.get(gj.a), gj.aggA, gj.aggB, NAME.get(gj.winner), gj.done], ['Galatasaray', 7, 5, 'Galatasaray', true]);
const sa = tieOf('Sporting CP', 'Arsenal');
eq('Sporting–Arsenal: 0–1, 0–0 → Arsenal 1–0 on aggregate', [sa.aggA, sa.aggB, NAME.get(sa.winner)], [0, 1, 'Arsenal']);
const pb = tieOf('Paris Saint Germain', 'Bayern München');
eq('PSG–Bayern: 5–4, 1–1 → PSG 6–5', [pb.aggA, pb.aggB, NAME.get(pb.winner)], [6, 5, 'Paris Saint Germain']);
const fin = ties.find((t) => t.stage === 'f');
eq('the Final: one match, neutral, 1–1, PSG on penalties 4–3, in Budapest', [fin.single, fin.neutral, fin.aggA, fin.aggB, fin.penA, fin.penB, NAME.get(fin.winner), fin.legs[0].venue_name],
  [true, true, 1, 1, 4, 3, 'Paris Saint Germain', 'Ferenc Puskás Stadium']);
check('every finished tie has a winner (no level aggregate without penalties)', ties.every((t) => t.done && t.winner != null));
const half = CT.build([row(KO25.find((f) => f.league.round === 'Round of 16'))]);
check('a tie with only its first leg played is undecided', half.length === 1 && half[0].played === 1 && !half[0].done && half[0].winner === null && half[0].aggA != null);
const none = CT.build([{ ...row(KO25.find((f) => f.league.round === 'Semi-finals')), status_short: 'NS', home_goals: null, away_goals: null }]);
check('a tie not yet played has no score', none[0].played === 0 && none[0].aggA === null && none[0].winner === null);
check('league-phase fixtures are never ties', CT.build(U26.fixtures.map(row)).length === 0 || CT.build(U26.fixtures.map(row)).every((t) => t.stage !== 'league'));

// ── 3. Config and migration 039 ──
const C = BY_SLUG.champions_league;
check('the Champions League: API-Football 2, a cup, tracked, not playable, not tagged, from the league stage',
  C && C.apiId === 2 && C.type === 'cup' && C.active && !C.playable && !C.tagNews && C.fromRound === 'League Stage' && C.code === 'UEFA' && CUPS.some((c) => c.slug === 'champions_league'));
const lsDates = U26.fixtures.filter((f) => /^League Stage/.test(f.league.round)).map((f) => f.fixture.date.slice(0, 10)).sort();
eq('seasonStart = the first league-stage match day', C.seasonStart, lsDates[0]);
check('season_end = the final (5 June 2027), never earlier than the last fixture we hold, nor the API\'s league-phase end',
  C.seasonEnd === '2027-06-05' && CUPS.every((c) => c.seasonEnd >= U26.fixtures.map((f) => f.fixture.date.slice(0, 10)).sort().pop()) && C.seasonEnd > '2027-01-27');
check('no cup is tagged in news, and 035\'s seed never inserts a cup (its own migration does)', CUPS.every((c) => !TAGGED_SLUGS.has(c.slug)) && !/champions_league/.test(read('supabase/migrations/035_leagues_config.sql')));
const sql = read('supabase/migrations/039_cups_champions_league.sql');
const body = sql.replace(/^\s*--[^\n]*$/gm, '');
check('039: one transaction, nothing deleted or dropped but its own triggers', /^\s*begin;/m.test(body) && /^\s*commit;/m.test(body) && !/\bdelete from\b|\btruncate\b|drop table|drop column/i.test(body));
check('039: leagues.type with its check, fixtures.pen_home/pen_away, standings_groups.description', /add column if not exists type text not null default 'league'/.test(body)
  && /check \(type in \('league', 'cup', 'mixed'\)\)/.test(body) && /add column if not exists pen_home integer/.test(body) && /add column if not exists pen_away integer/.test(body)
  && /alter table public\.standings_groups add column if not exists description text/.test(body));
const ins = (/values \(2, 'champions_league', 'Champions League', 'Europe', 'UEFA', 2026,\s*date '([\d-]+)', date '([\d-]+)', (true|false), (true|false), (true|false|null), null, 1, 'cup'\)/.exec(body) || []);
eq('039 inserts the config\'s Champions League (dates, active, not playable, a cup)', ins.slice(1), [C.seasonStart, C.seasonEnd, 'true', 'false', 'true']);
check('039: a re-run switches it on and keeps it a cup; never playable', /on conflict \(api_league_id\) do update[\s\S]*?set active\s*= true,\s*playable\s*= false,\s*type\s*= 'cup'/.test(body));
check('039: a cup-only club gets no room; a club moved to a tracked league gets one', /if exists \(select 1 from public\.leagues l where l\.id = new\.league_id and l\.type = 'cup'\) then\s*return new;/.test(body)
  && /after update of league_id on public\.teams[\s\S]*?when \(old\.league_id is distinct from new\.league_id\)/.test(body));
check('039: season stats count league competitions only (player and team rows)', (body.match(/join public\.leagues lg on lg\.id = f\.league_id and lg\.type <> 'cup'/g) || []).length === 2
  && /create or replace function public\.refresh_player_season_stats/.test(body) && /create or replace function public\.refresh_team_player_stats/.test(body));
check('039 VERIFY checks season_end against the last fixture held', /having max\(f\.kickoff_utc\)::date > l\.season_end/.test(sql));

// ── 4. The jobs ──
const src = (f) => read('api/_cron/' + f + '.js');
for (const f of ['fixtures', 'standings']) check(`${f}.js maps every tracked club (a cup's fixtures are between other leagues' clubs)`, /const teams = await teamIdMap\(all\.map\(\(l\) => l\.id\)\);/.test(src(f)));
check('live.js maps every active league\'s clubs (already) and skips a cup\'s qualifying rounds', /teamIdMap\(leagues\.map\(\(l\) => l\.id\)\)/.test(src('live')) && /keepRound\(byApiId\.get\(r\.league\.id\), r\.league\?\.round\)/.test(src('live')));
check('penalties are written only once a cup is active (039 ran; rule 21), on every row of the batch', /const withPens = all\.some\(isCupRow\);/.test(src('fixtures')) && /\.\.\.\(withPens \? penalties\(r\) : \{\}\)/.test(src('fixtures'))
  && /const withPens = leagues\.some\(isCupRow\);/.test(src('live')) && (src('live').match(/withPens \? penalties\(r\) : \{\}/g) || []).length === 2);
check('fixtures.js skips a cup\'s qualifying rounds and warns when a fixture is after season_end', /if \(!keepRound\(lg, r\.league\?\.round\)\) \{ qualifyingSkipped\+\+; continue; \}/.test(src('fixtures')) && /season_end_before_last_fixture/.test(src('fixtures')));
check('standings.js writes a zone description for a cup only', /\.\.\.\(cup \? \{ description: s\.description \|\| null \} : \{\}\)/.test(src('standings')) && /const cup = isCupRow\(lg\);/.test(src('standings')));
check('teams.js: a cup\'s clubs from its league-phase table, insert-only, under the cup; no coach requests for them',
  /if \(isCupRow\(lg\)\) \{ rows \+= await cupOnlyClubs\(api, lg\); continue; \}/.test(src('teams')) && /api\.get\('standings', \{ league: lg\.api_league_id/.test(src('teams'))
  && /ignoreDuplicates: true/.test(src('teams')) && /const coachLeagues = leagues\.filter\(\(l\) => !isCupRow\(l\)\);/.test(src('teams'))
  // C-2: only clubs we do not hold are sent, so rows_written counts the ones created.
  && /filter\(\(t\) => !held\.has\(t\.id\)\)/.test(src('teams')));
check('fixture-stats: a club\'s season row from its own league\'s fixtures; no row for a cup-only club', /f\.league_id === homeLeague\.get\(teamId\)/.test(src('fixture-stats'))
  && /if \(!lg \|\| isCupRow\(lg\)\) touched\.delete\(id\);/.test(src('fixture-stats')));

// ── 5. The pages ──
const idx = read('public/index.html');
const fn = (s, name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(s); return m ? m[0] : ''; };
check('index: cup-only clubs flagged, never in the club picker, the suggestions or the Clubs grid', /cupOnly:LeagueNames\.isCup\(t\.leagues&&t\.leagues\.slug\)/.test(idx)
  && /if\(row\.cupOnly\) continue;/.test(fn(idx, 'clubsByLeague')) && /if\(c\.cupOnly\) continue;/.test(fn(idx, 'popularClubs'))
  && /filter\(c=>!c\.cupOnly\)/.test(fn(idx, 'clubsLeagues')) && /filter\(c=>!c\.cupOnly&&pass\(c\)\)/.test(fn(idx, 'renderClubsGrid')) && /LeagueNames\.LEAGUES\.filter\(l=>l\.type!=='cup'\)/.test(idx));
check('index: a club\'s position from its own league\'s standings only', /if\(!row\|\|row\.cupOnly\|\|s\.league_id!==row\.leagueId\) continue;/.test(idx) && /standings\?select=team_id,league_id,rank,points,played/.test(idx));
const comm = read('public/community.html');
check('club page: position from its own league; a cup-only club has a page but no position, room or club features, and is not in the list',
  /s\.league_id!==c\.leagueId/.test(comm) && /if\(club\.cupOnly\)return;/.test(comm) && /c\.cupOnly\?'':realStatsRow\(c\)/.test(comm) && /if\(!c\.cupOnly\) loadFeatures\(c\);/.test(comm));
// The band, run.
const hb = {}; vm.createContext(hb); vm.runInContext(read('public/home-band.js'), hb);
const now = Date.parse('2026-11-23T12:00:00Z');
const s = hb.HomeBand.matchSlot(7, [{ id: 5, kickoff: now + 2 * 86400000, status_short: 'NS', home_id: 7, away_id: 9, opponent: 'Inter', comp: 'Champions League · UEFA' }], now);
const sl = hb.HomeBand.matchSlot(7, [{ id: 6, kickoff: now + 86400000, status_short: 'NS', home_id: 7, away_id: 8, opponent: 'Chelsea', comp: null }], now);
const ctx = { t: (k) => ({ 'hb.next': 'Next' }[k] || k), tOrd: String, esc: (x) => String(x), locale: 'en', now };
check('band: a cup match next names its competition in the slot label; a league match does not', s.comp === 'Champions League · UEFA' && /<div class="hb-lab">Next · Champions League · UEFA<\/div>/.test(hb.HomeBand.slotHtml(s, '', ctx))
  && sl.comp === null && /<div class="hb-lab">Next<\/div>/.test(hb.HomeBand.slotHtml(sl, '', ctx)));
check('band: the fixtures read every competition, and only a match outside the club\'s league is named', /league:leagues!fixtures_league_id_fkey\(name,slug,country\)/.test(fn(idx, 'loadHomeBand'))
  && /comp:own\|\|!f\.league\?null:LeagueNames\.label\(f\.league\)/.test(fn(idx, 'loadHomeBand')));
check('picker: a "Cups" section; "My leagues" on Matches includes a cup my clubs play in', /<div class="lp-country lp-cups-h">'\+sanitize\(t\('lp\.cups'\)\)/.test(fn(idx, 'lpFilter'))
  && /if\(key==='mx'\) for\(const s of \(MX\.myCups\|\|\[\]\)\) m\.add\(s\);/.test(fn(idx, 'lpMine')) && /standings\?select=league_id&league_id=in\./.test(fn(idx, 'mxLoadMyCups')));
// The table: zones and ties, run with the real knockouts.
const dict = { 'tb.zone.r16': 'Round of 16', 'tb.zone.kpo': 'Knockout play-off', 'tb.zone.out': 'Not in a qualifying place', 'tb.ko.kpo': 'Knockout play-offs', 'tb.ko.r16': 'Round of 16',
  'tb.ko.qf': 'Quarter-finals', 'tb.ko.sf': 'Semi-finals', 'tb.ko.f': 'Final', 'tb.agg': 'agg', 'tb.aet': 'aet', 'tb.pens': 'pens {a}–{b}', 'tb.vs': 'v', 'tb.firstLeg': 'first leg',
  'tb.neutralAt': 'at {venue}', 'tb.advances': '{club} advances' };
const tctx = { CupTies: CT, t: (k, v) => String(dict[k] || k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)), sanitize: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  clubLabel: (id) => NAME.get(id) || '', clubCrestById: () => '', mxDate: () => 'Tue 16 Feb', Number, String, Map };
vm.createContext(tctx);
vm.runInContext(fn(idx, 'mxZone') + '\n' + fn(idx, 'mxTiesHtml') + '\nthis.mxZone=mxZone;this.mxTiesHtml=mxTiesHtml;', tctx);
const descs = [...new Set(U26.standings.league.standings[0].map((r) => r.description))];
eq('zone text from the real descriptions (top 8, 9–24, the rest)', descs.map((d) => tctx.mxZone(d)), ['Round of 16', 'Knockout play-off', 'Not in a qualifying place']);
const tiesHtml = tctx.mxTiesHtml(ties);
check('ties: by round, aggregate with the legs read from A\'s side, extra time marked, the winner named', /Knockout play-offs[\s\S]*Round of 16[\s\S]*Quarter-finals[\s\S]*Semi-finals[\s\S]*Final/.test(tiesHtml)
  && tiesHtml.includes('<b class="tb-tie-v num">7–5</b>') && tiesHtml.includes('agg (5–2, 2–3 aet) · Galatasaray advances'));
check('the final: single, on penalties, at its neutral venue', tiesHtml.includes('pens 4–3 · at Ferenc Puskás Stadium · Paris Saint Germain advances'));
check('the winner is bold by markup (class win), not by colour alone', /<span class="tb-tie-t win">/.test(tiesHtml));
check('the table reads a cup\'s zones (039) and builds its ties from the fixtures held', /\+\(cup\?',description':''\)/.test(fn(idx, 'mxFetchTable')) && /CupTies\.build\(/.test(fn(idx, 'mxFetchTable'))
  && /round=not\.like\.League\*/.test(fn(idx, 'mxFetchTable')) && /'description' in r\?'<span class="tb-zone">'/.test(idx));
check('a cup opens on Knockouts once there are ties, else its league phase', /MX\.tablePick\.set\(MX\.league\.id,chips\[chips\.length-1\]\.key\)/.test(fn(idx, 'mxTableHtml')) && /if\(cur\.ko\) return final\+chipHtml\+mxTiesHtml\(data\.ties\);/.test(fn(idx, 'mxTableHtml')));
const about = read('public/about.html');
check('about: "19 leagues + N cups" (cups counted apart, a Cups tile and chip group)', /'about\.proofCupsN'/.test(about) && /<div id="st-cups-box" hidden>/.test(about) && /id="proof-cups"/.test(about));
const ib = {}; vm.createContext(ib);
vm.runInContext(read('public/i18n.js'), Object.assign(ib, { window: ib, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, document: { documentElement: {}, querySelectorAll: () => [] } }));
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, x) => v[x]);
eq('the counts copy, both languages', [fmt(ib.I18N.en['about.proofCupsN'], { leagues: 19, cups: 3, clubs: 376, game: 7 }), fmt(ib.I18N['pt-BR']['about.proofCupsN'], { leagues: 19, cups: 3, clubs: 376, game: 7 })],
  ['19 leagues + 3 cups, 376 clubs · 7 in the Scout Game', '19 ligas + 3 copas, 376 clubes · 7 no Scout Game']);
check('landing: a Cups list, cups out of the league lists and the club picker', /id="comps-cups"/.test(read('public/welcome.html')) && /if\(!LeagueNames\.isCup\(l\)\) active\[l\.id\]=true;/.test(read('public/welcome.html')));
check('the shared cup logic is precached and stamped (rule 24)', /'\/cup-ties\.js',/.test(read('public/sw.js')) && /<script src="\/cup-ties\.js\?v=[0-9a-f]+"><\/script>/.test(idx));

// ── 6. News ──
const teams = [...JSON.parse(read('tests/fixtures/teams.json')), ...JSON.parse(read('tests/fixtures/teams-new-leagues.json')).map((t) => ({ ...t, established: false })),
  ...JSON.parse(read('tests/fixtures/teams-uruguay.json')).map((t) => ({ ...t, established: false }))];
const held = new Set(teams.map((t) => t.api_team_id));
const cupOnly = U26.standings.league.standings[0].map((r) => r.team).filter((t) => !held.has(t.id)).map((t) => ({ api_team_id: t.id, name: t.name, league: 'champions_league', established: false }));
eq('eight cup-only clubs in the UCL league phase', cupOnly.map((t) => t.name).sort(),
  ['AEK Athens FC', 'Bodo/Glimt', 'Lask Linz', 'Sabah FA', 'Shakhtar Donetsk', 'Slavia Praha', 'Slovan Bratislava', 'Viking']);
// news.js indexes only clubs of TAGGED_SLUGS leagues: a cup is not one, so its cup-only clubs never enter.
const indexed = [...teams, ...cupOnly].filter((t) => TAGGED_SLUGS.has(t.league));
const A = buildIndex(teams, [...TEAM_ALIASES, ...TRACKED_ALIASES]);
const B = buildIndex(indexed, [...TEAM_ALIASES, ...TRACKED_ALIASES]);
check('the tag index is exactly what it was: 0 tags lost, 0 gained (no cup-only club enters)', A.entries.length === B.entries.length && JSON.stringify(A.entries.map((e) => e.key)) === JSON.stringify(B.entries.map((e) => e.key)));
const nameOf = new Map(teams.map((t) => [t.api_team_id, t.name]));
const who = (text) => tagText(B, text, '', 'en', 'GB').map((h) => nameOf.get(h.api_team_id)).sort();
eq('competition names tag nobody', [who('Champions League draw: who could face whom'), who('Europa League and Conference League results'), who('UEFA Champions League final in Madrid')], [[], [], []]);
eq('"Real Madrid in the Champions League" is Real Madrid only', who('Real Madrid in the Champions League'), ['Real Madrid']);

// ── 7. C-2: the Europa League and the Conference League ──
const UEL = JSON.parse(read('tests/fixtures/api-football/uel-2026.json'));
const UECL = JSON.parse(read('tests/fixtures/api-football/uecl-2026.json'));
eq('three cups, in the config, each by its own label', CUPS.map((c) => c.slug + ':' + c.apiId), ['champions_league:2', 'europa_league:3', 'conference_league:848']);
for (const [slug, data, phase, finalDay] of [['europa_league', UEL, 144, '2027-05-26'], ['conference_league', UECL, 108, '2027-06-02']]) {
  const c = BY_SLUG[slug];
  const ls = data.fixtures.filter((f) => /^League Stage/.test(f.round)).map((f) => f.date.slice(0, 10)).sort();
  check(`${slug}: a cup, tracked, not playable, not tagged, from the league stage, code UEFA`, c.type === 'cup' && c.active && !c.playable && !c.tagNews && c.fromRound === 'League Stage' && c.code === 'UEFA');
  eq(`${slug}: seasonStart = its first league-stage match day; seasonEnd = its final (UEFA)`, [c.seasonStart, c.seasonEnd], [ls[0], finalDay]);
  check(`${slug}: season_end never earlier than its last fixture we hold`, c.seasonEnd >= data.fixtures.map((f) => f.date.slice(0, 10)).sort().pop());
  eq(`${slug}: its league phase only is kept (${phase} fixtures), every round classified`, [data.fixtures.filter((f) => keepRound({ slug }, f.round)).length,
    data.fixtures.every((f) => CT.stage(f.round) === 'league' || CT.stage(f.round) === null)], [phase, true]);
  const notHeld = data.standings.filter((r) => !held.has(r.team.id)).length;
  eq(`${slug}: its cup-only clubs (league-phase clubs we hold in no league)`, notHeld, slug === 'europa_league' ? 17 : 24);
  eq(`${slug}: zone text from its real descriptions`, [...new Set(data.standings.map((r) => r.description))].map((d) => tctx.mxZone(d)), ['Round of 16', 'Knockout play-off', 'Not in a qualifying place']);
}
check('no club is cup-only in two cups (a club plays one European competition)', (() => { const a = U26.standings.league.standings[0].map((r) => r.team.id), b = UEL.standings.map((r) => r.team.id), c = UECL.standings.map((r) => r.team.id);
  return new Set([...a, ...b, ...c]).size === a.length + b.length + c.length; })());
const sql40 = read('supabase/migrations/040_cups_europa_conference.sql');
const body40 = sql40.replace(/^\s*--[^\n]*$/gm, '');
const rows40 = [...body40.matchAll(/\((\d+),\s*'(\w+)',\s*'([^']+)',\s*'Europe',\s*'UEFA',\s*2026,\s*date '([\d-]+)',\s*date '([\d-]+)',\s*(true|false),\s*(true|false),\s*(true|false),\s*null,\s*1,\s*'cup'\)/g)]
  .map((m) => [Number(m[1]), m[2], m[3], m[4], m[5], m[6], m[7]]);
eq('040 inserts the config\'s two cups (API id, slug, name, dates, active, not playable)', rows40,
  ['europa_league', 'conference_league'].map((s) => { const c = BY_SLUG[s]; return [c.apiId, c.slug, c.name, c.seasonStart, c.seasonEnd, 'true', 'false']; }));
check('040: data only, re-runnable, switches them on and keeps them cups, never playable', !/\bdelete\b|\bdrop\b|\balter\b|\bcreate\b/i.test(body40)
  && /on conflict \(api_league_id\) do update[\s\S]*?set active\s*= true,\s*playable\s*= false,\s*type\s*= 'cup'/.test(body40) && /having max\(f\.kickoff_utc\)::date > l\.season_end/.test(sql40));
check('no cup in 035\'s seed (each cup is its own migration\'s)', !/europa_league|conference_league/.test(read('supabase/migrations/035_leagues_config.sql')));
const lnb = {}; vm.createContext(lnb); lnb.window = lnb; vm.runInContext(read('public/league-names.js'), lnb);
eq('the cups\' labels', ['champions_league', 'europa_league', 'conference_league'].map((s) => lnb.LeagueNames.label(s)), ['Champions League · UEFA', 'Europa League · UEFA', 'Conference League · UEFA']);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
