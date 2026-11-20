// Sequence 2 commit 4b-1: the shared pieces.
//
//   node tests/league-names.test.js
//
// - public/league-names.js: every league we carry has a label with its
//   country code; no two labels read the same, even with accents ignored
//   (Série A / Serie A); no flags; every caller shape (slug, name, row,
//   embed with or without a country) gives the same label;
// - public/icons.js: every icon is a 24px stroke line icon in currentColor,
//   hidden or labelled for screen readers, no emoji;
// - public/fx-row.js: loaded by index.html, precached and stamped; the page's
//   fxRow() is a thin wrapper; the row's styles live in theme.css;
// - every place index.html / community.html names a league goes through
//   LeagueNames, and no league flag is drawn.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(read('public/league-names.js'), ctx);
vm.runInContext(read('public/icons.js'), ctx);
const LN = ctx.LeagueNames, Icons = ctx.Icons;

// ── League labels ──
// The list is generated from api/_lib/leagues.js (tests/leagues-config.test.js
// checks the generation); here, how the labels read (decision of 17 Nov 2026).
eq('every league, with its code', LN.LEAGUES.map((l) => LN.label(l)), [
  'Série A · BRA', 'Premier League · ENG', 'La Liga · ESP', 'Bundesliga · GER', 'Serie A · ITA', 'Ligue 1 · FRA', 'Liga Profesional · ARG',
  'Championship · ENG', 'Eredivisie · NED', 'Primeira Liga · POR', 'Jupiler Pro League · BEL', 'Premiership · SCO', 'Süper Lig · TUR',
  'Saudi Pro League · KSA', 'MLS · USA', 'Liga MX · MEX', 'Série B · BRA', 'Série C · BRA', 'Primera División · URU',
  // C-1: the cups, by their own code.
  'Champions League · UEFA']);
check('a cup is a cup, a league is not (by slug, by row type)', LN.isCup('champions_league') && !LN.isCup('serie_a') && LN.isCup({ slug: 'x', type: 'cup' }) && !LN.isCup({ slug: 'champions_league', type: 'league' }));
eq('only the seven are playable', LN.LEAGUES.filter((l) => LN.playable(l)).map((l) => l.slug),
  ['serie_a', 'premier_league', 'la_liga', 'bundesliga', 'serie_a_it', 'ligue_1', 'argentina']);
eq('look-alikes are told apart by the code', [LN.label('serie_b'), LN.label('scottish_premiership'), LN.label('premier_league')],
  ['Série B · BRA', 'Premiership · SCO', 'Premier League · ENG']);
eq('an API-Football embed is named right (name + country)', [LN.label({ name: 'Premiership', country: 'Scotland' }), LN.label({ name: 'Liga MX', country: 'Mexico' }),
  LN.label({ name: 'Pro League', country: 'Saudi-Arabia' })], ['Premiership · SCO', 'Liga MX · MEX', 'Pro League · KSA']);
eq('the row\'s own country_code wins', LN.label({ name: 'Série C', country: 'Brazil', country_code: 'BRA' }), 'Série C · BRA');
eq('sort: my leagues first, then alphabetical', LN.sort(['serie_a', 'championship', 'mls', 'bundesliga'], new Set(['mls'])),
  ['mls', 'bundesliga', 'championship', 'serie_a']);
eq('regions follow the config', [LN.region('serie_b'), LN.region('championship'), LN.region('mls')], ['brazil', 'europe', null]);
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const labels = LN.LEAGUES.map((l) => fold(LN.label(l)));
check('no two labels read the same, accents ignored', new Set(labels).size === labels.length, labels.join(' | '));
check('without the code, two names collide (why the code is always there)', fold('Série A') === fold('Serie A'));
eq('by slug', [LN.label('serie_a'), LN.label('serie_a_it')], ['Série A · BRA', 'Serie A · ITA']);
eq('by exact name (accents count)', [LN.label('Série A'), LN.label('Serie A')], ['Série A · BRA', 'Serie A · ITA']);
eq('an embed {slug,name,flag} (no country)', LN.label({ slug: 'argentina', name: 'Liga Profesional', flag: '🇦🇷' }), 'Liga Profesional · ARG');
eq('a league we do not list, with its country → the first three letters', LN.label({ name: 'Allsvenskan', country: 'Sweden' }), 'Allsvenskan · SWE');
eq('a competition with no country → the name alone', LN.label('UEFA Champions League'), 'UEFA Champions League');
eq('nothing → empty', [LN.label(null), LN.label(''), LN.label({})], ['', '', '']);
check('no flag in any label', LN.LEAGUES.every((l) => !/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}]/u.test(LN.label(l))));
const db = { 1: ['Série A', 'Brazil', 'serie_a'], 2: ['Premier League', 'England', 'premier_league'], 3: ['La Liga', 'Spain', 'la_liga'],
  4: ['Bundesliga', 'Germany', 'bundesliga'], 5: ['Serie A', 'Italy', 'serie_a_it'], 6: ['Ligue 1', 'France', 'ligue_1'], 7: ['Liga Profesional', 'Argentina', 'argentina'] };
check('the list matches the leagues table (name, country, slug, Nov 2026)',
  Object.values(db).every(([n, c, s]) => LN.LEAGUES.some((l) => l.name === n && l.country === c && l.slug === s))
  && LN.LEAGUES.filter((l) => l.type !== 'cup').length === 19 && LN.LEAGUES.filter((l) => l.type === 'cup').length >= 1);

// ── Icons ──
check('icons: the tab set and the marks exist', ['home', 'shield', 'search', 'calendar', 'message', 'user', 'ball', 'users', 'thumb', 'x', 'check', 'eye'].every((n) => Icons.names.includes(n)));
for (const n of Icons.names) {
  const s = Icons.svg(n);
  check(`icon ${n}: 24px line icon, currentColor, stroke 2, hidden`, /^<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"/.test(s)
    && /aria-hidden="true"/.test(s) && /<path d="[^"]+"\/>/.test(s) && !/[\u{1F300}-\u{1FAFF}]/u.test(s));
}
check('icon with a label is announced, and the label is escaped', /role="img" aria-label="Close &quot;x&quot;"/.test(Icons.svg('x', 16, 'Close "x"')) && /width="16"/.test(Icons.svg('x', 16)));
check('unknown icon → nothing', Icons.svg('nope') === '');

// ── Loading, precache, stamps ──
const idx = read('public/index.html');
const comm = read('public/community.html');
const sw = read('public/sw.js');
const bump = read('scripts/bump-sw.mjs');
for (const f of ['league-names.js', 'fx-row.js', 'icons.js']) {
  check(`index.html loads ${f}`, new RegExp(`<script src="/${f.replace('.', '\\.')}(\\?v=[0-9a-f]+)?"></script>`).test(idx));
  check(`${f} is precached and stamped (rule 24)`, sw.includes(`'/${f}'`) && bump.includes(`'${f}'`));
}
check('community.html loads league-names.js', /<script src="\/league-names\.js(\?v=[0-9a-f]+)?"><\/script>/.test(comm));
check('fxRow() is the wrapper over FxRow.render', /function fxRow\(o\)\{\s*return FxRow\.render\(o,\{crest:clubCrestById,name:clubLabel,esc:sanitize\}\);\s*\}/.test(idx));

// ── Every league name goes through LeagueNames ──
check('Scout, private leagues, match panel, history, Home band, club list: LeagueNames.label',
  /function sgLeagueName\(r\)\{ const l=r&&r\.leagues; return l\?LeagueNames\.label\(l\):''; \}/.test(idx)
  && /function glComp\(x\)\{ return LeagueNames\.label\(x\.competition\); \}/.test(idx)
  && /'<div class="mo-meta">'\+sanitize\(LeagueNames\.label\(f\.league\)\)/.test(idx)
  && (idx.match(/const name=LeagueNames\.label\(x\.league\)\+' · '\+sgHistRoundName\(x\);/g) || []).length === 2
  && /LeagueNames\.label\(best\.league\)/.test(idx)
  && /const lgName=LeagueNames\.label\(/.test(idx) && /t\('hb\.tableOf',\{league:LeagueNames\.label\(HBD\.league\)\}\)/.test(idx)
  && /const LEAGUE_LABEL=Object\.fromEntries\(LeagueNames\.LEAGUES\.map/.test(idx));
check('no league flag drawn in the game history', !/x\.flag\?x\.flag/.test(idx));
check('community.html: the league name is LeagueNames.label', /leagueName:\(window\.LeagueNames\?LeagueNames\.label\(lg\):lg\.name\)\|\|lg\.slug/.test(comm));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
