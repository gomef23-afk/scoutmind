// Leagues whose season is over or not begun (commit 2 of the 18-league work).
//
//   node tests/season-end.test.js
//
// index.html's functions RUN here (node:vm) with the dates of 17 Nov 2026.
// Covered:
// - a league with nothing near today opens on the week ending at its LAST
//   match day (Série C: 25 Oct), anchored there, with a line that says why
//   ("Season finished · last matches …" once season_end has passed); a
//   season not begun opens on its next match day; a league with matches near
//   today opens on today as before; no league held → null (nothing invented);
// - the date strip (today's neighbourhood) hides when the list opened elsewhere;
// - the table carries "2026 · final" / "2026-27 · final" once season_end has
//   passed, never before, never without a season_end (before 035);
// - the daily jobs skip a league 8 days after its season_end (api/_lib/cron.js);
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
const fn = (name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx); if (!m) throw new Error('no ' + name); return m[0]; };

const dict = { 'fx.seasonOver': 'Season finished · last matches {date}', 'fx.lastDay': 'Nothing near today · last match day {date}', 'fx.nextDay': 'Nothing near today · next match day {date}',
  'tb.final': '{season} · final', 'tb.updated': 'Updated {when}', 'tb.none': 'No table yet', 'tb.which': 'Which table', 'tb.club': 'Club', 'tb.annual': 'Annual table', 'tb.groupN': 'Group {n}' };
const ctx = {
  Date, Intl, Math, Number, String, Map, Set, console,
  smLocale: () => 'en-GB',
  t: (k, v) => String(dict[k] || '').replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)),
  sanitize: (s) => String(s == null ? '' : s),
  clubCrestById: () => '', clubLabel: (id) => 'Club ' + id, myClubIds: () => [],
  MX: { league: null, first: null, last: null, from: null, to: null, tablePick: new Map(), tableChips: [] },
};
vm.createContext(ctx);
vm.runInContext([fn('localDayKey'), fn('mxMidnight'), fn('mxAddDays'), fn('mxDate'), fn('mxSeasonOver'), fn('mxSeasonLabel'), fn('mxFarWindow'),
  fn('mxPhaseOf'), fn('mxTableChips'), fn('mxTableName'), fn('mxIsAggregate'), fn('mxTableChipLabel'), fn('mxDefaultPlainChip'), fn('mxGroupHtml'), fn('mxTableHtml')].join('\n'), ctx);
const MX = ctx.MX;
const NOW = new Date(2026, 10, 17, 12);    // 17 Nov 2026, local noon
const today = ctx.mxMidnight(NOW);
const setWindow = () => { MX.from = ctx.mxAddDays(today, -3); MX.to = ctx.mxAddDays(today, 11); };

// ── Série C: season over (25 Oct), nothing near today ──
const SERIE_C = { id: 18, slug: 'serie_c', name: 'Série C', current_season: 2026, season_end: '2026-10-25' };
MX.league = SERIE_C; setWindow();
MX.first = ctx.mxMidnight(new Date(2026, 3, 4, 19)); MX.last = ctx.mxAddDays(ctx.mxMidnight(new Date(2026, 9, 25, 16)), 1);   // as mxBounds() sets them
const far = ctx.mxFarWindow();
check('a finished league opens on the week ending at its last match day', far && ctx.localDayKey(far.to) === '2026-10-26' && ctx.localDayKey(far.from) === '2026-10-19' && far.key === '2026-10-25',
  far && JSON.stringify({ from: ctx.localDayKey(far.from), to: ctx.localDayKey(far.to), key: far.key }));
eq('…with a line saying the season is finished, and when the last matches were', ctx.t(far.note.key, { date: far.note.date }), 'Season finished · last matches Sun 25 Oct');
check('mxSeasonOver: true after season_end, false before, false without one (before 035)',
  ctx.mxSeasonOver(SERIE_C, NOW.getTime()) === true && ctx.mxSeasonOver({ season_end: '2026-11-28' }, NOW.getTime()) === false && ctx.mxSeasonOver({ season_end: null }, NOW.getTime()) === false);

// ── A league that paused (nothing near today, season not over) ──
MX.league = { id: 3, name: 'Liga MX', current_season: 2026, season_end: '2026-12-20' }; setWindow();
MX.last = ctx.mxAddDays(ctx.mxMidnight(new Date(2026, 10, 2, 20)), 1);
eq('a pause mid-season says "last match day", not "finished"', ctx.mxFarWindow().note.key, 'fx.lastDay');

// ── A season not begun: only fixtures ahead ──
MX.league = { id: 9, name: 'MLS', current_season: 2027, season_end: '2027-11-28' }; setWindow();
MX.first = ctx.mxMidnight(new Date(2027, 1, 20, 20)); MX.last = ctx.mxAddDays(ctx.mxMidnight(new Date(2027, 9, 1, 20)), 1);
const next = ctx.mxFarWindow();
check('a season not begun opens on its next match day', next && next.key === '2027-02-20' && next.note.key === 'fx.nextDay', next && JSON.stringify({ key: next.key, note: next.note }));

// ── Matches near today, or nothing held at all ──
MX.league = { id: 8, name: 'Championship', current_season: 2026, season_end: '2027-05-01' }; setWindow();
MX.first = ctx.mxMidnight(new Date(2026, 7, 14)); MX.last = ctx.mxAddDays(ctx.mxMidnight(new Date(2027, 4, 1)), 1);
eq('fixtures on both sides of the window → no far window (mxStart only asks when the window is empty)', ctx.mxFarWindow(), null);
MX.first = null; MX.last = null;
eq('no fixture held at all → null (nothing invented)', ctx.mxFarWindow(), null);

// ── The wiring in index.html ──
const start = fn('mxStart');
check('mxStart: only a chosen league with an empty window looks further', /if\(MX\.league&&!rows\.length\)\{\s*const far=mxFarWindow\(\);/.test(start)
  && /MX\.from=far\.from; MX\.to=far\.to; MX\.openKey=far\.key; MX\.note=far\.note;/.test(start) && /MX\.openKey=null; MX\.note=null;/.test(start));
check('mxStart: the note sits above the days, as words (role=status)', /'<div class="mx-note" role="status">'\+sanitize\(t\(MX\.note\.key,\{date:MX\.note\.date\}\)\)/.test(start));
check('the opening day is anchored like today (mx-open-day)', /const open=!today&&key===MX\.openKey;/.test(fn('mxDayHtml')) && /id="mx-open-day"/.test(fn('mxDayHtml'))
  && /getElementById\('mx-today-day'\)\|\|document\.getElementById\('mx-open-day'\)/.test(fn('mxAnchorToday')));
check('the date strip hides when the list opened elsewhere', /el\.hidden=MX\.view==='table'\|\|!!MX\.openKey;/.test(fn('mxRenderStrip')) && /strip\.hidden=table\|\|!!MX\.openKey;/.test(fn('mxShowView')));
check('leagues are read with season_end, falling back without it (rule 21)', /leagues\?select=id,slug,name,country,country_code,current_season,season_end&active=is\.true/.test(start)
  && /\.catch\(\(\)=>apiGet\('leagues\?select=id,slug,name,country,current_season&active=is\.true/.test(start));

// ── The table: "2026 · final" once the season is over ──
const rows = [{ group_label: 'Serie C', group_order: 0, team_id: 1, rank: 1, points: 40, played: 19 }, { group_label: 'Serie C', group_order: 0, team_id: 2, rank: 2, points: 38, played: 19 }];
const data = { groups: [{ label: 'Serie C', order: 0, rows }], fallback: false, updated: '' };
MX.league = SERIE_C;
const realNow = Date.now;
Date.now = () => NOW.getTime();
check('a finished season\'s table says "2026 · final"', /<div class="tb-final">2026 · final<\/div>/.test(ctx.mxTableHtml(data)));
MX.league = { id: 8, name: 'Championship', current_season: 2026, season_end: '2027-05-01' };
check('a season in progress has no "final" label', !/tb-final/.test(ctx.mxTableHtml(data)));
MX.league = { id: 8, name: 'Championship', current_season: 2026, season_end: null };
check('no season_end (before 035) → no label', !/tb-final/.test(ctx.mxTableHtml(data)));
Date.now = () => new Date(2027, 4, 10).getTime();
MX.league = { id: 8, name: 'Championship', current_season: 2026, season_end: '2027-05-01' };
check('a European season reads "2026-27 · final"', /<div class="tb-final">2026-27 · final<\/div>/.test(ctx.mxTableHtml(data)));
Date.now = realNow;
eq('season labels', [ctx.mxSeasonLabel(SERIE_C), ctx.mxSeasonLabel({ current_season: 2026, season_end: '2027-05-01' }), ctx.mxSeasonLabel({ current_season: 2026 })], ['2026', '2026-27', '2026']);

// ── The daily jobs (rule 16, api/_lib/cron.js) ──
process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
const { seasonOver, SEASON_GRACE_DAYS } = await import('../api/_lib/cron.js');
const day = 86_400_000, end = Date.parse('2026-10-25T23:59:59Z');
check('the daily jobs keep asking for 8 days after season_end, then stop', SEASON_GRACE_DAYS === 8
  && seasonOver({ season_end: '2026-10-25' }, end + 7 * day) === false && seasonOver({ season_end: '2026-10-25' }, end + 8 * day + 1000) === true);
for (const f of ['fixtures', 'standings']) check(`${f}.js: the daily pass leaves finished seasons out; ?league= still fetches one`, /chosen \|\| all\.filter\(\(l\) => l\.id > pass\.afterId && !seasonOver\(l\)\)/.test(read(`api/_cron/${f}.js`)));

// ── Strings ──
const box = {}; vm.createContext(box); vm.runInContext(read('public/i18n.js').replace(/^\s*if \(typeof document[\s\S]*$/m, ''), Object.assign(box, { window: box, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, document: { documentElement: {}, querySelectorAll: () => [] } }));
const I = box.I18N || {};
const KEYS = ['fx.seasonOver', 'fx.lastDay', 'fx.nextDay', 'tb.final'];
check('the new strings exist in both languages, translated, with the same placeholder', KEYS.every((k) => I.en && I.en[k] && I['pt-BR'][k] && I.en[k] !== I['pt-BR'][k]
  && (I.en[k].match(/\{\w+\}/g) || []).join() === (I['pt-BR'][k].match(/\{\w+\}/g) || []).join()), KEYS.map((k) => `${k}: ${I.en && I.en[k]} / ${I['pt-BR'] && I['pt-BR'][k]}`).join('; '));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
