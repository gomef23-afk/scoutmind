// Sequence 2 commit 4b-3b: the Matches / Table toggle and the league table.
//
//   node tests/league-table.test.js
//
// The table's functions run in a sandbox with Brazil-like and Argentina-like
// data; the toggle's wiring is pinned statically. Covered:
// - the toggle appears only with one league chosen; "All" has none and
//   falls back to Matches;
// - columns: Pos · Club · P · GD · Pts · form on a phone, every column
//   (P W D L GF GA GD Pts) from 700px; numbers in the number face;
// - form: the API sends the last five newest first (checked against real
//   results on 17 Nov 2026), the table shows them oldest first, translated;
// - my clubs' rows marked (bar + bold); a row opens the club page;
// - Argentina: both groups of the current phase stacked (the phase the API
//   lists last), chips for the other phase and the annual table;
// - before 032 (or before the job fills it): a one-table league reads
//   `standings`; a league in groups says its tables are coming and never
//   shows the collapsed one-row-per-club table (rule 21, nothing wrong);
// - strings in both languages.
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

const EN = { 'tb.groupN': 'Group {n}', 'tb.annual': 'Annual table', 'tb.club': 'Club', 'tb.updated': 'Updated {when}', 'tb.none': 'No table for this league yet.',
  'tb.groupsSoon': 'This league plays in groups. Its group tables appear after the next standings update.', 'tb.which': 'Which table',
  'mo.res.W': 'W', 'mo.res.D': 'D', 'mo.res.L': 'L', 'tb.hl.form': 'Last five league matches, oldest first' };
const calls = [];
const ctx = {
  console, Date, Map, Set,
  t: (k, v) => (EN[k] || k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)),
  smLocale: () => 'en-GB',
  sanitize: (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')),
  myClubIds: () => [7],
  clubLabel: (id) => 'Club ' + id,
  clubCrestById: (id) => '<i data-crest="' + id + '"></i>',
  apiGet: async (p) => { calls.push(p); return ctx.__answer(p); },
  __answer: () => [],
  MX: { league: null, tablePick: new Map(), tableChips: [] },
};
vm.createContext(ctx);
vm.runInContext([fn('mxFetchTable'), fn('mxPhaseOf'), fn('mxTableChips'), fn('mxTableChipLabel'), fn('mxTableHtml'), fn('mxGroupHtml'),
  "const TB_COLS='group_label,team_id,rank,points,played,win,draw,lose,goals_for,goals_against,goal_diff,form,updated_at';",
  'this.mxFetchTable=mxFetchTable;this.mxTableHtml=mxTableHtml;this.mxGroupHtml=mxGroupHtml;this.mxPhaseOf=mxPhaseOf;'].join('\n'), ctx);
check('the column list in the test matches the page', idx.includes("const TB_COLS='group_label,team_id,rank,points,played,win,draw,lose,goals_for,goals_against,goal_diff,form,updated_at';"));

const r = (team, rank, extra = {}) => Object.assign({ team_id: team, rank, played: 34, win: 22, draw: 10, lose: 2, goals_for: 70, goals_against: 28, goal_diff: 42, points: 76, form: 'WWLDW', updated_at: '2026-11-17T11:00:00Z' }, extra);

// ── One table (Brazil) ──
ctx.MX.league = { id: 1, name: 'Série A', current_season: 2026 };
ctx.__answer = (p) => (/^standings_groups/.test(p) ? [r(7, 1, { group_label: 'Serie A', group_order: 0 }), r(9, 2, { group_label: 'Serie A', group_order: 0, goal_diff: -3, form: null })] : []);
let data = await ctx.mxFetchTable(ctx.MX.league);
check('reads standings_groups for the league and its current season, ordered', /^standings_groups\?select=group_order,group_label,team_id,rank/.test(calls[0]) && /&league_id=eq\.1&season=eq\.2026&order=group_order\.asc,rank\.asc/.test(calls[0]));
let html = ctx.mxTableHtml(data);
check('one table: no chips, no group title', !/tb-chips/.test(html) && !/tb-group/.test(html) && (html.match(/<table class="tb">/g) || []).length === 1);
const head = (/<thead>[\s\S]*?<\/thead>/.exec(html) || [''])[0];
eq('header: every column; W D L GF GA wide-only, form last', [...head.matchAll(/<th scope="col"(?: class="([^"]*)")?>/g)].map((m) => m[1] || ''),
  ['tb-pos', 'tb-club', '', 'tb-wide', 'tb-wide', 'tb-wide', 'tb-wide', 'tb-wide', '', '', 'tb-form']);
check('phone shows Pos · Club · P · GD · Pts · form; 700px+ every column', /\.tb \.tb-wide\{display:none;\}/.test(idx) && /@media \(min-width:700px\)\{ \.tb \.tb-wide\{display:table-cell;\} \}/.test(idx));
check('headers abbreviated, with the full word as a title (translated)', /<abbr title="tb\.hl\.p">tb\.h\.p<\/abbr>/.test(head));
const row1 = (/<tr class="mine"[\s\S]*?<\/tr>/.exec(html) || [''])[0];
check('my club\'s row is marked', !!row1 && /Club 7/.test(row1) && /\.tb tr\.mine td:first-child\{box-shadow:inset 3px 0 0 var\(--navy-ink\);\}/.test(idx) && /\.tb tr\.mine td\{font-weight:700;\}/.test(idx));
check('a row opens the club page (row tap + a real link)', /onclick="location\.href='\/community\.html\?club=7'"/.test(row1) && /<a href="\/community\.html\?club=7" onclick="event\.stopPropagation\(\)">/.test(row1));
check('numbers in the number face; GD signed', /<td class="tb-pos num">1<\/td>/.test(row1) && /<td class="num">\+42<\/td>/.test(row1) && /<td class="num tb-pts">76<\/td>/.test(row1) && /<td class="num">-3<\/td>/.test(html));
eq('form oldest first (the API sends newest first), translated', [...row1.matchAll(/<span class="tb-wdl (\w)">/g)].map((m) => m[1]).join(''), 'WDLWW');
check('no form → no chips, nothing invented', !/<span class="tb-wdl/.test((/<tr onclick="location\.href='\/community\.html\?club=9'"[\s\S]*?<\/tr>/.exec(html) || [''])[0]));
check('the time the table was updated', /<div class="tb-note">Updated /.test(html));

// ── Groups (Argentina) ──
ctx.MX.league = { id: 7, name: 'Liga Profesional', current_season: 2026 };
const grp = (label, order, ids) => ({ label, order, rows: ids.map((id, i) => r(id, i + 1, { group_label: label })) });
data = { fallback: false, updated: '', groups: [grp('Apertura - Group A', 0, [1, 2]), grp('Apertura - Group B', 1, [3, 4]), grp('Clausura - Group A', 2, [2, 1]),
  grp('Clausura - Group B', 3, [4, 3]), grp('Liga Profesional Argentina', 4, [1, 2, 3, 4])] };
html = ctx.mxTableHtml(data);
eq('chips: each phase, then the annual table; the current phase (listed last) chosen',
  [...html.matchAll(/<button class="filter-btn( active)?"[^>]*>([^<]+)</g)].map((m) => m[2] + (m[1] ? '*' : '')), ['Apertura', 'Clausura*', 'Annual table']);
eq('both groups of the phase, stacked', [...html.matchAll(/<div class="tb-group">([^<]+)</g)].map((m) => m[1]), ['Group A', 'Group B']);
check('the groups shown are Clausura\'s (Club 2 first in Group A)', /Group A<\/div><table class="tb">[\s\S]*?<tbody><tr[^>]*>[\s\S]*?Club 2/.test(html));
ctx.MX.tablePick.set(7, 'p:Apertura');
check('a chip choice is kept per league', /Group A<\/div><table class="tb">[\s\S]*?<tbody><tr[^>]*>[\s\S]*?Club 1/.test(ctx.mxTableHtml(data)));
ctx.MX.tablePick.set(7, 't:Liga Profesional Argentina');
html = ctx.mxTableHtml(data);
check('the annual table: one table, no group title', !/tb-group/.test(html) && (html.match(/<table class="tb">/g) || []).length === 1 && (html.match(/<tr[ >]/g) || []).length === 5);
check('chips by index, never a label in onclick', /onclick="mxPickTable\(\d\)"/.test(html) && !/onclick="mxPickTable\('/.test(html));
eq('group labels', [ctx.mxPhaseOf('Apertura - Group A'), ctx.mxPhaseOf('Serie A')].map((x) => x && x.letter), ['A', null]);

// ── Before 032 / before the job fills it ──
calls.length = 0;
ctx.__answer = (p) => { if (/^standings_groups/.test(p)) throw new Error('standings_groups HTTP 404'); return [r(7, 1, { group_label: 'Serie A' }), r(9, 2, { group_label: 'Serie A' })]; };
ctx.MX.league = { id: 1, name: 'Série A', current_season: 2026 };
data = await ctx.mxFetchTable(ctx.MX.league);
check('before 032: a one-table league reads `standings` and shows its table', data.fallback && /^standings\?select=group_label,team_id/.test(calls[1]) && (ctx.mxTableHtml(data).match(/<tr[ >]/g) || []).length === 3);
ctx.__answer = (p) => (/^standings_groups/.test(p) ? [] : [r(1, 1, { group_label: 'Apertura - Group A' }), r(2, 1, { group_label: 'Clausura - Group B' }), r(3, 1, { group_label: 'Liga Profesional Argentina' })]);
ctx.MX.league = { id: 7, name: 'Liga Profesional', current_season: 2026 };
data = await ctx.mxFetchTable(ctx.MX.league);
html = ctx.mxTableHtml(data);
check('a league in groups never shows the collapsed table: it says the tables are coming', data.fallback && !/<table/.test(html) && /group tables appear after the next standings update/.test(html));
check('nothing at all → says so', /No table for this league yet\./.test(ctx.mxTableHtml({ groups: [], fallback: true })));

// ── The toggle ──
const view = fn('mxRenderView');
check('the toggle shows only with one league chosen; "All" returns to Matches', /if\(!MX\.league\)\{\s*el\.hidden=true; el\.innerHTML='';\s*if\(MX\.view!=='matches'\)\{ MX\.view='matches'; mxShowView\(\); \}/.test(view)
  && /b\('matches','tb\.matches'\)\+b\('table','tb\.table'\)/.test(view) && /aria-pressed="'\+\(MX\.view===v\)\+'"/.test(view));
check('the toggle sits in the sticky bar, under the chips', /<div id="matches-league-chips"[^>]*><\/div>\s*<!--[^>]*-->\s*<div id="mx-view" class="mx-view" role="group" hidden><\/div>/.test(idx));
const show = fn('mxShowView');
check('Table hides the list and the Today button; Matches anchors on today again', /list\.hidden=table/.test(show) && /tb\.hidden=!table/.test(show) && /btn\.hidden=true/.test(show) && /mxAnchorToday\(false\)/.test(show));
check('in Table view nothing loads more days and nothing scrolls to today', /if\(MX\.view==='table'\) return;/.test(fn('mxCheckEdges')) && /if\(!el\|\|MX\.view==='table'\) return;/.test(fn('mxAnchorToday')));
check('a new league while on Table shows that league\'s table', /if\(MX\.view==='table'\) mxShowView\(\);/.test(fn('mxSetLeague')));
check('the season comes with the leagues', /leagues\?select=id,slug,name,country,current_season&active=is\.true/.test(fn('mxStart')));
check('a failed load offers a retry', /onclick="mxLoadTable\(\)"/.test(fn('mxLoadTable')));

// ── Strings ──
const i18n = read('public/i18n.js');
const keys = ['tb.matches', 'tb.table', 'tb.loading', 'tb.fail', 'tb.none', 'tb.groupsSoon', 'tb.which', 'tb.annual', 'tb.groupN', 'tb.club', 'tb.updated',
  ...['p', 'w', 'd', 'l', 'gf', 'ga', 'gd', 'pts', 'form'].flatMap((k) => ['tb.h.' + k, 'tb.hl.' + k])];
for (const k of keys) check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
