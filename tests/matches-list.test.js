// Sequence 2 commit 4b-2: the Matches tab as ONE continuous list.
//
//   node tests/matches-list.test.js
//
// The list's functions run in a sandbox (fixtures, days, chips, queries);
// the DOM-bound parts (anchoring, scroll keeping, the Today button, the
// sticky bar) are pinned statically. Covered:
// - one list grouped by day; today always has a heading (empty today says so);
//   with All, one group per competition, my clubs' first; rows marked mine;
// - the first load is three days back to a week ahead; each further load a
//   week, above or below, stopping at the first / last fixture we hold;
// - content added above keeps the reader's place (scroll compensated, the
//   browser's own anchoring off for that insert); edges have a fixed height;
// - today anchored under the sticky bar when the tab opens (after showPage's
//   scrollTo), and a "Today" button while it is out of view;
// - league chips from the leagues table, labelled "Name · CODE", my clubs'
//   leagues first, by index (no name in onclick), filtering IN the query,
//   remembered as the slug (an old saved name still works);
// - the 7-day picker is gone; the Home sidebar has its own load;
// - every new string in both languages.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const idx = read('public/index.html');
const fn = (name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx) || [''])[0];
const decl = (name) => (new RegExp('const ' + name + '\\s*=[\\s\\S]*?;[ \\t]*(//[^\\n]*)?\\r?\\n').exec(idx) || [''])[0];

// ── The sandbox ──
const calls = [];
const ctx = {
  console, URLSearchParams, Date, Map, Set,
  t: (k, v) => ({ 'fx.today': 'Today', 'fx.tomorrow': 'Tomorrow', 'fx.yesterday': 'Yesterday', 'fx.noneToday': 'No matches today.', 'fx.all': 'All',
    'mo.live': 'Live', 'mo.ht': 'Half time', 'fx.ft': 'FT' }[k] || ''),
  smLocale: () => 'en-GB',
  sanitize: (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')),
  myClubIds: () => [7],
  CLUB_DATA: new Map([[7, { id: 7, league: 'serie_a' }]]),
  clubLabel: (id) => ({ 7: 'Flamengo', 9: 'Palmeiras', 30: 'Juventus', 31: 'Milan', 40: 'Arsenal', 41: 'Chelsea' }[id] || ''),
  clubCrestById: (id) => '<i data-crest="' + id + '"></i>',
  clubDisplayName: (x) => x.name,
  apiGet: async (path) => { calls.push(path); return ctx.__answer(path); },
  __answer: () => [],
  document: { getElementById: () => null, querySelector: () => null },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/league-names.js'), ctx);
vm.runInContext(read('public/fx-row.js'), ctx);
const src = [decl('COMP_TIER'), decl('FX_SELECT'), fn('fixtureFromRow'), fn('localDayKey'), fn('fxRow'),
  decl('MX_WEEK'), decl('MX_BACK'), decl('MX_AHEAD'), decl('MX'),
  fn('mxMidnight'), fn('mxAddDays'), fn('mxDayTitle'), fn('mxChipOrder'), fn('mxBounds'), fn('mxFetch'), fn('mxAdd'),
  fn('mxIsMine'), fn('mxRow'), fn('mxDayHtml'), fn('mxDaysHtml'), fn('mxAtEdge'),
  'this.MX=MX;this.fixtureFromRow=fixtureFromRow;this.mxDayHtml=mxDayHtml;this.mxDaysHtml=mxDaysHtml;this.mxAdd=mxAdd;this.mxFetch=mxFetch;',
  'this.mxBounds=mxBounds;this.mxAtEdge=mxAtEdge;this.mxChipOrder=mxChipOrder;this.mxDayTitle=mxDayTitle;this.localDayKey=localDayKey;this.mxAddDays=mxAddDays;this.mxMidnight=mxMidnight;'].join('\n');
vm.runInContext(src, ctx);

const today = ctx.mxMidnight(new Date());
const at = (days, h) => { const d = ctx.mxAddDays(today, days); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const row = (id, kick, league, home, away, extra = {}) => Object.assign({ id, kickoff_utc: kick, status_short: 'NS', home_team_id: home, away_team_id: away,
  home_team: { name: ctx.clubLabel(home) }, away_team: { name: ctx.clubLabel(away) }, league }, extra);
const BRA = { name: 'Série A', slug: 'serie_a', country: 'Brazil' }, ITA = { name: 'Serie A', slug: 'serie_a_it', country: 'Italy' }, ENG = { name: 'Premier League', slug: 'premier_league', country: 'England' };

// ── Days ──
const MX = ctx.MX;
MX.todayKey = ctx.localDayKey(new Date());
MX.from = ctx.mxAddDays(today, -3); MX.to = ctx.mxAddDays(today, 8);
ctx.mxAdd([
  row(1, at(1, 18), ENG, 40, 41), row(2, at(1, 20), BRA, 7, 9), row(3, at(1, 15), ITA, 30, 31),
  row(4, at(-2, 20), BRA, 9, 7, { status_short: 'FT', home_goals: 1, away_goals: 2 }), row(4, at(-2, 20), BRA, 9, 7),
].map(ctx.fixtureFromRow));
const html = ctx.mxDaysHtml(MX.from, MX.to);
const keys = [...html.matchAll(/data-day="([\d-]+)"/g)].map((m) => m[1]);
eq('days in order; today has a heading even with no matches', keys, [ctx.localDayKey(ctx.mxAddDays(today, -2)), MX.todayKey, ctx.localDayKey(ctx.mxAddDays(today, 1))]);
check('an empty today says so, marked as today (word + bar, not colour alone)', /<section class="mx-day today" data-day="[\d-]+" id="mx-today-day"><h2 class="mx-day-h"><span class="mx-word">Today<\/span>/.test(html) && /No matches today\./.test(html));
check('Yesterday / Tomorrow words; dates in the viewer\'s locale', ctx.mxDayTitle(ctx.localDayKey(ctx.mxAddDays(today, 1))).word === 'Tomorrow' && ctx.mxDayTitle(ctx.localDayKey(ctx.mxAddDays(today, -1))).word === 'Yesterday'
  && ctx.mxDayTitle(ctx.localDayKey(ctx.mxAddDays(today, 5))).word === '');
check('a fixture is never listed twice', (html.match(/onclick="openMatch\(4\)"/g) || []).length === 1);
const tomorrow = ctx.mxDayHtml(ctx.localDayKey(ctx.mxAddDays(today, 1)));
const groups = [...tomorrow.matchAll(/<div class="md-league">([^<]+)</g)].map((m) => m[1]);
eq('All: one group per competition, my clubs\' first, then the usual order, labelled with the country', groups, ['Série A · BRA', 'Premier League · ENG', 'Serie A · ITA']);
check('my club\'s row is marked', /class="fx-row mine"[^>]*onclick="openMatch\(2\)"/.test(tomorrow) && !/class="fx-row mine"[^>]*onclick="openMatch\(1\)"/.test(tomorrow));
check('a finished match shows the score', /openMatch\(4\)[\s\S]*?<b>1–2<\/b><small>FT<\/small>/.test(html));
MX.league = { id: 5, slug: 'serie_a_it', name: 'Serie A', country: 'Italy' };
check('one league chosen: no competition headings, just its rows', !/md-league/.test(ctx.mxDayHtml(ctx.localDayKey(ctx.mxAddDays(today, 1)))));
MX.league = null;

// ── Queries and edges ──
calls.length = 0;
ctx.__answer = () => [];
await ctx.mxFetch(ctx.mxAddDays(today, -10), ctx.mxAddDays(today, -3));
check('a load asks for [from, to) only, ordered, with the shared columns', /^fixtures\?select=id%2Capi_fixture_id/.test(calls[0]) && /kickoff_utc=gte\.[^&]+&kickoff_utc=lt\./.test(calls[0]) && /order=kickoff_utc\.asc/.test(calls[0]) && !/&league_id=/.test(calls[0]));
MX.league = { id: 5 };
calls.length = 0;
await ctx.mxFetch(today, ctx.mxAddDays(today, 7));
check('a chosen league filters IN the query (every loaded day is complete for it)', /&league_id=eq\.5$/.test(calls[0]), calls[0]);
calls.length = 0;
ctx.__answer = (p) => (/order=kickoff_utc\.asc/.test(p) ? [{ kickoff_utc: '2026-01-22T20:00:00Z' }] : [{ kickoff_utc: '2026-12-07T19:45:00Z' }]);
await ctx.mxBounds();
check('the bounds are the first and last kick-off we hold, for that league', calls.length === 2 && calls.every((c) => /league_id=eq\.5/.test(c)) && MX.first instanceof Date && MX.last instanceof Date && MX.last > MX.first);
MX.league = null;
MX.from = MX.first; check('at the first fixture: no more loading upward', ctx.mxAtEdge('past'));
MX.from = ctx.mxAddDays(MX.first, 1); check('after it: more to load', !ctx.mxAtEdge('past'));
MX.to = MX.last; check('at the last fixture: no more loading downward', ctx.mxAtEdge('future'));
MX.first = null; check('nothing held at all: both edges', ctx.mxAtEdge('past'));
eq('the first load is three days back to a week ahead; a further load a week', [ctx.MX && /const MX_BACK = 3;/.test(idx), /const MX_AHEAD = 7;/.test(idx), /const MX_WEEK = 7;/.test(idx)], [true, true, true]);

// ── Chips ──
MX.leagues = [ENG, BRA, ITA, { name: 'Liga Profesional', slug: 'argentina', country: 'Argentina' }].map((l, i) => Object.assign({ id: i + 1 }, l));
eq('chips: my clubs\' leagues first, then the usual order', ctx.mxChipOrder().map((l) => l.slug), ['serie_a', 'premier_league', 'serie_a_it', 'argentina']);
const chips = fn('mxRenderChips');
check('chips: by index, never a name in onclick; labelled with the country', /onclick="mxSetLeague\('\+i\+'\)"/.test(chips) && /LeagueNames\.label\(l\)/.test(chips) && /chip\(-1,t\('fx\.all'\),!MX\.league\)/.test(chips));
check('chips come from the leagues table, not from the loaded fixtures', /apiGet\('leagues\?select=id,slug,name,country&active=is\.true&order=id\.asc'\)/.test(fn('mxStart')));
check('the choice is the slug; a name saved before 4b-2 still finds its league', /mxSavePref\(l\?l\.slug:null\)/.test(fn('mxSetLeague'))
  && /const p=mxPref\(\), known=p&&LeagueNames\.find\(p\);/.test(fn('mxStart')) && /l\.slug===p\|\|\(known&&l\.slug===known\.slug\)/.test(fn('mxStart')));
check('a new league chosen reloads the list from today', /mxRenderChips\(\);\s*mxStart\(\);/.test(fn('mxSetLeague')));

// ── Scrolling, anchoring, Today ──
const more = fn('mxMore');
check('content added above keeps the reader\'s place', /before=root\.scrollHeight/.test(more) && /days\.insertAdjacentHTML\('afterbegin',mxDaysHtml\(from,to\)\);\s*window\.scrollBy\(0,root\.scrollHeight-before\);/.test(more)
  && /root\.style\.overflowAnchor='none'/.test(more));
check('content added below is appended', /days\.insertAdjacentHTML\('beforeend',mxDaysHtml\(from,to\)\)/.test(more));
check('a load for a list that was replaced meanwhile is dropped', (more.match(/if\(gen!==MX\.gen\) return;/g) || []).length >= 2);
check('a failed load offers a retry, not a blank', /MX\.failed\[dir\]=true/.test(more) && /mxMore\(\\''\+dir\+'\\'\)/.test(fn('mxEdge')));
check('an empty week keeps loading (the edge is checked again after each load)', /setTimeout\(mxCheckEdges,0\)/.test(more) && /r\.bottom>-600&&r\.top<vh\+600\) mxMore\(dir\)/.test(fn('mxCheckEdges')));
check('scroll is throttled and only the Matches tab reacts', /MX_SCROLL_T=setTimeout\(function\(\)\{ MX_SCROLL_T=null; mxCheckEdges\(\); \},120\)/.test(idx) && /if\(!page\|\|!page\.classList\.contains\('active'\)\) return;/.test(fn('mxCheckEdges')));
check('edges have a fixed height (a text change never shifts the list)', /\.mx-edge\{min-height:44px;/.test(idx));
check('today anchored under the nav and the league bar', /const top=el\.getBoundingClientRect\(\)\.top\+window\.scrollY-mxMeasure\(\);/.test(fn('mxAnchorToday')) && /mxAnchorToday\(false\);\s*mxObserve\(\);/.test(fn('mxStart')));
check('re-opening the tab anchors after showPage\'s scrollTo(0,0); a new day reloads', /setTimeout\(\(\)=>\{ mxAnchorToday\(false\); mxCheckEdges\(\); \},0\)/.test(fn('renderMatchDay'))
  && /MX\.todayKey!==localDayKey\(new Date\(\)\)/.test(fn('renderMatchDay')));
check('"Today" button: shown while today is out of view, arrow toward it, labelled', /btn\.hidden=!away/.test(fn('mxWatchToday')) && /Icons\.svg\(dir==='up'\?'arrowUp':'arrowDown',16\)/.test(fn('mxWatchToday'))
  && /<button type="button" id="mx-today" class="mx-today" onclick="mxJumpToday\(\)" hidden><\/button>/.test(idx));
check('"Today" clears the tab bar and the home indicator on a phone', /\.mx-today\{position:fixed;[^}]*bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)/.test(idx));
check('sticky league bar under the nav, day headings under the bar', /\.mx-bar\{position:sticky;top:var\(--mx-nav,0px\)/.test(idx) && /\.mx-day-h\{position:sticky;top:var\(--mx-top,0px\)/.test(idx));

// ── The old picker is gone; the sidebar has its own load ──
check('the 7-day picker is gone', !/matches-date-strip|date-chip|function stripDays|function selectMatchDay|MATCH_DAY\b|setMatchLeague|MATCH_LEAGUE_NAMES/.test(idx));
check('the Home sidebar loads its own fixtures (and the Matches tab never waits on it)', /function loadSidebarFixtures\(force\)/.test(idx) && /try\{ loadSidebarFixtures\(\); \}catch\(e\)\{\}/.test(idx)
  && !/loadFixtures\(\)/.test(fn('renderMatchDay') + fn('mxStart')));
check('my clubs changing re-draws the list in place', /try\{ mxRefresh\(\); \}catch\(e\)\{\}/.test(fn('applyClubSelection')));
check('the old near-limit query is lifted (limit 500, one week at a time)', /limit: '500'/.test(fn('loadFixtures')) && /limit:'500'/.test(fn('mxFetch')));

// ── Strings ──
const i18n = read('public/i18n.js');
for (const k of ['fx.sub', 'fx.leagueFilter', 'fx.today', 'fx.tomorrow', 'fx.yesterday', 'fx.noneToday', 'fx.todayBtn', 'fx.loadingEarlier', 'fx.loadingLater', 'fx.start', 'fx.end', 'fx.retry']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}
check('the subtitle no longer says "Pick a day"', !/Pick a day|Escolha um dia/.test(i18n));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
