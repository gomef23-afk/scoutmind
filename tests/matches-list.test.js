// Sequence 2 commit 4b-2: the Matches tab as ONE continuous list.
//
//   node tests/matches-list.test.js
//
// The list's functions run in a sandbox (fixtures, days, chips, queries);
// the DOM-bound parts (anchoring, scroll keeping, the Today button, the
// sticky bar) are pinned statically. Covered:
// - one list grouped by day; today always has a heading (empty today says so);
//   with All, one group per competition, my clubs' first; rows marked mine;
// - the first load is three days back to ten ahead; each further load a
//   week, stopping at the first / last fixture we hold; later days load on
//   scroll, earlier ones only on a tap of "Show earlier results" (4b-5b);
// - a load redraws keeping the reader's place (the first day under the bar
//   stays put, the browser's own anchoring off); edges have a fixed height;
// - each day its own block, a larger "Today · Wed 18 Nov" heading, a divider
//   at each new week; a date strip (-3..+10) that scrolls to a day and
//   follows the scroll (4b-5b);
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
    'fx.noneDay': 'No matches', 'fx.weekOf': 'Week of {date}',
    'mo.live': 'Live', 'mo.ht': 'Half time', 'fx.ft': 'FT' }[k] || '').replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)),
  Intl,
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
  fn('mxMidnight'), fn('mxAddDays'), fn('mxDate'), fn('mxDayTitle'), fn('mxWeekKey'), fn('mxStripKeys'), fn('mxLeagueFilter'), fn('mxBounds'), fn('mxFetch'), fn('mxAdd'),
  fn('mxIsMine'), fn('mxRow'), fn('mxDayHtml'), fn('mxAllDaysHtml'), fn('mxAtEdge'),
  'this.MX=MX;this.fixtureFromRow=fixtureFromRow;this.mxDayHtml=mxDayHtml;this.mxAllDaysHtml=mxAllDaysHtml;this.mxAdd=mxAdd;this.mxFetch=mxFetch;',
  'this.mxStripKeys=mxStripKeys;this.mxWeekKey=mxWeekKey;this.mxDate=mxDate;',
  'this.mxBounds=mxBounds;this.mxAtEdge=mxAtEdge;this.mxDayTitle=mxDayTitle;this.localDayKey=localDayKey;this.mxAddDays=mxAddDays;this.mxMidnight=mxMidnight;'].join('\n');
vm.runInContext(src, ctx);

const today = ctx.mxMidnight(new Date());
const at = (days, h) => { const d = ctx.mxAddDays(today, days); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const row = (id, kick, league, home, away, extra = {}) => Object.assign({ id, kickoff_utc: kick, status_short: 'NS', home_team_id: home, away_team_id: away,
  home_team: { name: ctx.clubLabel(home) }, away_team: { name: ctx.clubLabel(away) }, league }, extra);
const BRA = { name: 'Série A', slug: 'serie_a', country: 'Brazil' }, ITA = { name: 'Serie A', slug: 'serie_a_it', country: 'Italy' }, ENG = { name: 'Premier League', slug: 'premier_league', country: 'England' };

// ── Days ──
const MX = ctx.MX;
MX.todayKey = ctx.localDayKey(new Date());
MX.from = ctx.mxAddDays(today, -3); MX.to = ctx.mxAddDays(today, 11);
ctx.mxAdd([
  row(1, at(1, 18), ENG, 40, 41), row(2, at(1, 20), BRA, 7, 9), row(3, at(1, 15), ITA, 30, 31),
  row(4, at(-2, 20), BRA, 9, 7, { status_short: 'FT', home_goals: 1, away_goals: 2 }), row(4, at(-2, 20), BRA, 9, 7),
].map(ctx.fixtureFromRow));
const html = ctx.mxAllDaysHtml();
const keys = [...html.matchAll(/data-day="([\d-]+)"/g)].map((m) => m[1]);
eq('every day of the date strip (3 back, 10 ahead) has its block, in order', keys, ctx.mxStripKeys());
eq('the strip is 14 days: 3 back, today, 10 ahead', [ctx.mxStripKeys().length, ctx.mxStripKeys()[3]], [14, MX.todayKey]);
check('an empty today says so, marked as today (word, dot, date; a bar, not colour alone)',
  /<section class="mx-day today" data-day="[\d-]+" id="mx-today-day"><h2 class="mx-day-h"><span class="mx-word">Today<\/span><span class="mx-dot" aria-hidden="true">·<\/span><span class="mx-date">[^<]+<\/span><\/h2><div class="mx-day-body"><div class="mx-empty">No matches today\./.test(html));
check('an empty day in the strip says "No matches"', /<div class="mx-empty">No matches<\/div>/.test(html));
const weeks = [...html.matchAll(/<div class="mx-week" role="separator">Week of ([^<]+)<\/div>/g)].map((m) => m[1]);
const mondays = [...new Set(ctx.mxStripKeys().map(ctx.mxWeekKey))];
check('a divider at every new week, named after its Monday', weeks.length === mondays.length && weeks.length >= 2
  && mondays.every((k) => new Date(k + 'T12:00:00').getDay() === 1), weeks.join(' / '));
check('a week divider comes right before the first day of its week', (() => { const order = [...html.matchAll(/mx-week|data-day="([\d-]+)"/g)]; for (let i = 1; i < order.length; i++) { if (order[i][1] && order[i - 1][0] !== 'mx-week' && order[i - 1][1] && ctx.mxWeekKey(order[i][1]) !== ctx.mxWeekKey(order[i - 1][1])) return false; } return true; })());
eq('dates: weekday, day, month; no comma, no "de"', ctx.mxDate(new Date(2026, 10, 18, 12), true), 'Wed 18 Nov');
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
eq('the first load is three days back to ten ahead (the strip); a further load a week', [ctx.MX && /const MX_BACK = 3;/.test(idx), /const MX_AHEAD = 10;/.test(idx), /const MX_WEEK = 7;/.test(idx)], [true, true, true]);

// ── "My leagues": several leagues filter IN the query (19 Nov 2026) ──
MX.league = null; MX.mineIds = [1, 7];
calls.length = 0; ctx.__answer = () => [];
await ctx.mxFetch(today, ctx.mxAddDays(today, 7));
check('My leagues (several) filters IN the query with league_id=in.(…)', /&league_id=in\.%281%2C7%29$/.test(calls[0]) || /&league_id=in\.\(1,7\)$/.test(calls[0]), calls[0]);
MX.mineIds = [];

// ── Chips (the LEAGUE PICKER; tests/league-picker.test.js runs it) ──
check('chips come from the leagues table, not from the loaded fixtures', /apiGet\('leagues\?select=id,slug,name,country,current_season&active=is\.true&order=id\.asc'\)/.test(fn('mxStart')));
check('the list resolves the picker\'s choice on every start, then draws the row', /mxApplySel\(\);\s*lpRender\('mx'\);/.test(fn('mxStart')));
check('a new choice reloads the list from today', /mxRenderView\(\);\s*mxStart\(\);/.test(fn('mxOnPick')));

// ── Scrolling, anchoring, Today ──
const more = fn('mxMore');
const repaint = fn('mxRepaint');
check('a load widens the range, then redraws keeping the reader\'s place', /if\(dir==='past'\) MX\.from=from; else MX\.to=to;\s*MX\.busy\[dir\]=false;\s*mxRepaint\(\);/.test(more));
check('the redraw keeps the first day under the bar where it was (browser anchoring off for it)',
  /const key=first&&first\.dataset\.day, off=first\?first\.getBoundingClientRect\(\)\.top:0;/.test(repaint)
  && /root\.style\.overflowAnchor='none';\s*days\.innerHTML=mxAllDaysHtml\(\);/.test(repaint)
  && /window\.scrollBy\(0,again\.getBoundingClientRect\(\)\.top-off\)/.test(repaint) && /root\.style\.overflowAnchor=prev;/.test(repaint));
// 4b-5b: earlier days load on a tap only; later days still load on scroll.
check('earlier results: a button at the top, loading the previous week on tap',
  /:dir==='past'\?'<button type="button" class="mx-earlier" onclick="mxMore\(\\'past\\'\)">'\+Icons\.svg\('arrowUp',16\)\+'<span>'\+sanitize\(t\('fx\.earlier'\)\)/.test(fn('mxEdge')));
check('…and scrolling up never loads them: only the bottom edge is watched',
  /getElementById\('mx-bottom'\)/.test(fn('mxCheckEdges')) && !/mx-top|'past'/.test(fn('mxCheckEdges')) && /mxMore\('future'\)/.test(fn('mxCheckEdges')));
check('a load for a list that was replaced meanwhile is dropped', (more.match(/if\(gen!==MX\.gen\) return;/g) || []).length >= 2);
check('a failed load offers a retry, not a blank', /MX\.failed\[dir\]=true/.test(more) && /mxMore\(\\''\+dir\+'\\'\)/.test(fn('mxEdge')));
check('an empty week keeps loading (the edge is checked again after each load)', /setTimeout\(mxCheckEdges,0\)/.test(more) && /r\.bottom>-600&&r\.top<vh\+600\) mxMore\('future'\)/.test(fn('mxCheckEdges')));
// ── The date strip (4b-5b) ──
const strip = fn('mxRenderStrip');
check('date strip: under the league chips, inside the sticky bar, labelled',
  /<div id="mx-strip" class="mx-strip" role="group" aria-label="Days" data-i18n-aria="fx\.days"><\/div>/.test(idx)
  && idx.indexOf('id="mx-strip"') > idx.indexOf('id="mx-bar"') && idx.indexOf('id="mx-strip"') > idx.indexOf('id="mx-view"'));
check('a chip per strip day: today marked (word + ring), a tap goes to that day, an aria-label with the count',
  /el\.innerHTML=mxStripKeys\(\)\.map/.test(strip) && /class="mx-dc'\+\(today\?' today':''\)/.test(strip)
  && /onclick="mxGoDay\(\\''\+k\+'\\'\)"/.test(strip) && /tn\('fx\.nMatches',n\)/.test(strip) && /today\?t\('fx\.today'\)/.test(strip));
check('the strip follows the scroll: the day under the bar is pressed, scrolled into view sideways only',
  /mxSyncStrip\(\);/.test(fn('mxCheckEdges')) && /setAttribute\('aria-current',yes\?'true':'false'\)/.test(fn('mxSyncStrip'))
  && /strip\.scrollLeft=/.test(fn('mxSyncStrip')) && /mxSyncStrip\(key\)/.test(fn('mxGoDay')));
check('the strip is hidden in the table view', /el\.hidden=MX\.view==='table'/.test(strip));
check('stronger day breaks: space between days, a larger heading, a boxed body',
  /\.mx-day\{margin-top:22px/.test(idx) && /\.mx-day-body\{/.test(idx) && /\.mx-week\{/.test(idx) && /\.mx-dc\{[^}]*min-width:48px/.test(idx));
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
for (const k of ['fx.sub', 'fx.leagueFilter', 'fx.today', 'fx.tomorrow', 'fx.yesterday', 'fx.noneToday', 'fx.todayBtn', 'fx.loadingEarlier', 'fx.loadingLater', 'fx.start', 'fx.end', 'fx.retry', 'fx.earlier', 'fx.noneDay', 'fx.weekOf', 'fx.days', 'fx.nMatches.one', 'fx.nMatches.other']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}
check('the subtitle no longer says "Pick a day"', !/Pick a day|Escolha um dia/.test(i18n));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
