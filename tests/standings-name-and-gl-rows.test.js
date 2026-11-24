// Two follow-ups of 19 Nov 2026.
//
//   node tests/standings-name-and-gl-rows.test.js
//
// 1. Liga MX's table from API-Football lists León as { id: null,
//    name: "Club Leon" } (/teams has it as 2289 "Leon"), so the standings job
//    skipped it: 17 of 18 rows. A row without an id is now matched by name,
//    to the ONE club of that league whose name reduces to the same key —
//    never a club of another league, never a guess between two.
// 2. A private league's standings: the owner sees a remove button on every
//    other member's row, not on their own, so their points sat one column to
//    the right. Every row now keeps that column (an empty slot when there is
//    no button); views with no button anywhere have no column at all.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.API_FOOTBALL_KEY = 'af_test';
const { clubKey, matchByName } = await import('../api/_cron/standings.js');

// ── 1. A standings row without an id ──
eq('club keys: accents, case and club-form words dropped', ['Club Leon', 'León', 'Club América', 'CF Monterrey', 'Atlético San Luis'].map(clubKey),
  ['leon', 'leon', 'america', 'monterrey', 'atletico san luis']);
const LIGA_MX = [{ id: 501, api_team_id: 2289, name: 'Leon' }, { id: 502, api_team_id: 2287, name: 'Club America' }, { id: 503, api_team_id: 2282, name: 'Monterrey' }];
eq('the real case: "Club Leon" (no id) is León, 2289', matchByName('Club Leon', LIGA_MX), LIGA_MX[0]);
eq('no club of that league by that name → null (skipped, as before)', matchByName('Club Tijuana', LIGA_MX), null);
eq('two clubs reduce to the same key → null (never a guess)', matchByName('Leon', LIGA_MX.concat([{ id: 509, api_team_id: 9, name: 'Club León' }])), null);
eq('an empty name → null', matchByName('', LIGA_MX), null);
const src = read('api/_cron/standings.js');
check('the job only falls back for a row with NO id, and only within the league\'s own clubs', /if \(!teamId && apiTeamId == null && s\.team\?\.name\)/.test(src)
  && /select=id,api_team_id,name&league_id=eq\.\$\{Number\(lg\.id\)\}/.test(src));
check('the clubs are read once per league, and only if needed', /if \(!leagueClubs\)/.test(src));
check('the run reports how many rows were matched by name', /matched_by_name: matchedByName/.test(src));
check('a row still unmatched is reported with its name (not a bare null)', /skipped\.push\(apiTeamId \?\? `null:\$\{s\.team\?\.name \|\| '\?'\}`\)/.test(src));

// ── 2. Private league rows keep the remove column ──
const idx = read('public/index.html');
const fn = (name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx); if (!m) throw new Error('no ' + name); return m[0]; };
const out = { innerHTML: '' };
function render(league, me) {
  const ctx = {
    GL: { id: 1, data: null }, SG: { view: 'rankings', rankView: 'leagues' }, navigator: {},
    sgRpc: async () => ({ league, rows: [
      { user_id: 'u1', name: 'Felipe', rank: 2, total: 4.43, rounds_played: 1, is_owner: true },
      { user_id: 'u2', name: 'Brosas', rank: 1, total: 16.61, rounds_played: 1 },
      { user_id: 'u3', name: 'Ana', rank: 3, total: 1.5, rounds_played: 1 }] }),
    myUserId: () => me, sgFiveTap: () => '', clubCrestById: () => '', sgFan: (n) => n, sgPts: (v) => String(v),
    t: (k, v) => k + (v && v.name ? ':' + v.name : ''), tn: (k, n) => n + ' ' + k, sanitize: (s) => String(s == null ? '' : s),
    smLocale: () => 'en', glComp: () => 'Série A · BRA', Icons: { svg: () => '<svg></svg>' },
    console, Date, Promise, String, Number,
  };
  vm.createContext(ctx);
  vm.runInContext(fn('glRenderLeague') + '\nthis.go=glRenderLeague;', ctx);
  return ctx.go(out, 1).then(() => out.innerHTML);
}
const rowsOf = (html) => html.split('<div class="sg-rank-row').slice(1).map((r) => r.slice(0, r.indexOf('</div>')));
const lastCell = (row) => (/gl-x-slot/.test(row) ? 'slot' : /class="gl-x"/.test(row) ? 'button' : 'none');

const owner = rowsOf(await render({ id: 1, name: 'Mates', is_owner: true, closed_at: null, code: 'ABC' }, 'u1'));
eq('owner of an open league: a button on the others, the same column empty on their own row', owner.map(lastCell), ['slot', 'button', 'button']);
check('…so every row has the same number of cells after the points', owner.every((r) => (r.match(/sg-rank-pts/g) || []).length === 1)
  && owner.every((r) => /sg-rank-pts">[^<]*<\/span>(<button class="gl-x"|<span class="gl-x-slot")/.test(r)), owner.join('\n      '));
const member = rowsOf(await render({ id: 1, name: 'Mates', is_owner: false, closed_at: null, code: 'ABC' }, 'u2'));
eq('a member: no button anywhere, no column at all', member.map(lastCell), ['none', 'none', 'none']);
const closed = rowsOf(await render({ id: 1, name: 'Mates', is_owner: true, closed_at: '2026-11-01T00:00:00Z', code: 'ABC' }, 'u1'));
eq('a closed league (owner): no button, no column', closed.map(lastCell), ['none', 'none', 'none']);
check('the empty slot is as wide as the button, and hidden from screen readers',
  /\.gl-x\{flex:0 0 auto;min-width:44px;min-height:44px;/.test(idx) && /\.gl-x-slot\{flex:0 0 auto;min-width:44px;min-height:44px;\}/.test(idx) && /<span class="gl-x-slot" aria-hidden="true"><\/span>/.test(idx));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
