// Sequence 2 commit 4a: the Scout Game, the match panel and the Matches tab
// in the identity of design spec v1.2 §7.
//
//   node tests/scout-matches.test.js
//
// Static checks on public/index.html, plus fxRow() — the one compact fixture
// row the Matches tab and Scout's round list share — run in a sandbox for each
// state (upcoming, live, half time, full time, postponed, my club).
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const idx = read('public/index.html');
const fn = (name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx) || [''])[0];
const css = (sel) => (new RegExp('\\n' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}').exec(idx) || [''])[0];

// ── The Matches tab ──
const md = fn('renderMatchDay');
check('Matches: compact rows from fxRow, one list per competition', /fxRow\(\{/.test(md) && /<div class="md-league">/.test(md) && /'<div class="fx-list">'/.test(md));
check('Matches: competitions with my clubs first, my rows marked in place', /some\(isMine\)/.test(md) && /mine: isMine\(m\)/.test(md) && !/Your clubs/.test(md));
check('Matches: the competition by name, no flag emoji', /sanitize\(ms\[0\]\.compName \|\| comp\)/.test(md) && !/\.flag/.test(md));
check('Matches: the one-card-per-fixture layout is gone', !/function matchCard\(/.test(idx) && !/matchCard\(/.test(idx));
check('Matches: no fake "sample fixtures" fallback', !/ALL_MATCHES\s*=/.test(idx) && !/Sample fixtures/.test(idx) && /fx\.loadFail/.test(md));
check("Scout's round list uses the same row", /fxRow\(\{id:f\.id/.test(fn('sgRenderFixtures')) && !/sg-fx-row/.test(idx));
check('rows: no box, a hairline; my clubs a navy-ink bar + bold (not colour alone)', /\.fx-row\{[^}]*border-bottom:1px solid var\(--border\)/.test(idx) && !/\.fx-row\{[^}]*border-radius/.test(idx)
  && /\.fx-row\.mine\{box-shadow:inset 3px 0 0 var\(--navy-ink\);font-weight:700;\}/.test(idx));
check('rows: time and score in the number face', /\.fx-mid b\{[^}]*font-family:var\(--font-num\)/.test(idx));

// fxRow, run.
const ctx = {
  I18N: { en: { 'mo.st.PST': 'Postponed' } },
  t: (k, v) => ({ 'mo.live': 'Live', 'mo.ht': 'Half time', 'fx.ft': 'FT', 'mo.aet': 'AET', 'mo.pens': 'Pens', 'mo.st.PST': 'Postponed' }[k] || k),
  // The page's own sanitize(), copied.
  sanitize: (s) => { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); },
  smLocale: () => 'en-GB',
  clubLabel: (id) => ({ 7: 'Flamengo', 9: 'Palmeiras' }[id] || ''),
  clubCrestById: (id) => '<i data-crest="' + id + '"></i>',
};
vm.createContext(ctx);
vm.runInContext(fn('fxRow'), ctx);
const row = (o) => ctx.fxRow(Object.assign({ id: 5, homeId: 7, awayId: 9 }, o));
const up = row({ status: 'upcoming', kickoff: new Date(2026, 10, 19, 21, 30) });
check('fxRow: upcoming → the kick-off time', /<b>21:30<\/b>/.test(up) && /Flamengo/.test(up) && /Palmeiras/.test(up) && /data-crest="7"/.test(up), up);
const live = row({ status: 'live', statusShort: '2H', minute: '64', homeGoals: 2, awayGoals: 1 });
check("fxRow: live → the score and \"Live 64'\" (a word, not only a colour)", /<b>2–1<\/b><small class="live">Live 64&#x27;<\/small>/.test(live), live);
check('fxRow: half time', /<small class="live">Half time<\/small>/.test(row({ status: 'live', statusShort: 'HT', homeGoals: 0, awayGoals: 0 })));
check('fxRow: full time → score + FT', /<b>1–0<\/b><small>FT<\/small>/.test(row({ status: 'finished', statusShort: 'FT', homeGoals: 1, awayGoals: 0 })));
check('fxRow: postponed → a dash and the word', /<b>—<\/b><small>Postponed<\/small>/.test(row({ status: 'upcoming', statusShort: 'PST', kickoff: Date.now() })));
check('fxRow: live with no score yet → no invented 0–0', /<b>–<\/b>/.test(row({ status: 'live', statusShort: '1H', minute: '2' })));
check('fxRow: my club → the mine class', /class="fx-row mine"/.test(row({ status: 'upcoming', kickoff: Date.now(), mine: true })));
check('fxRow: opens the match panel', /onclick="openMatch\(5\)"/.test(up));

// ── The Scout Game ──
check('Scout band: round, the countdown in gold, my season rank', /sgBand\(\[[\s\S]*?sg\.band\.round[\s\S]*?sg\.band\.closes[\s\S]*?gold:true[\s\S]*?sgSeasonSlot\(r\)/.test(fn('sgRenderPick')));
check('Scout band: the season rank is mine, read from game_competition_standings', /game_competition_standings\?select=rank,total&league_id=eq\.'\+r\.league_id\+'&season=eq\.'\+r\.season\+'&user_id=eq\.'\+me/.test(fn('sgLoadSeasonRank')));
check('Scout band: a played round shows my points and my rank, dashes until scored', /sg\.band\.points[\s\S]*?total==null\?'—'[\s\S]*?sg\.band\.rank/.test(fn('sgPlayedBand')));
check('the countdown ticks in the band\'s compact form', /el\.classList\.contains\('hb-big'\)\?HomeBand\.countdownText/.test(idx));
check('tier chip: "T3 ×1.10" from the ladder; unranked shows its multiplier', /'T'\+Number\(tier\)\+' '/.test(fn('sgTierChip')) && /c\.unranked_multiplier/.test(fn('sgTierFor')) && /lad\[String\(p\.tier\)\]/.test(fn('sgTierFor')));
check('my five: position, photo, name, opponent line, tier chip', /sg-slot-pos[\s\S]*?sgPhoto\(p,30\)[\s\S]*?sgFixtureLine\(p\)[\s\S]*?sgTierFor\(p\)/.test(fn('sgRenderSlots')));
check('played picks: the locked tier chip and points in the number face', /sgTierChip\(p\.locked_tier,p\.locked_multiplier\)/.test(fn('sgRenderMine')) && /\.sg-pick-pts\{font-family:var\(--font-num\)/.test(idx));
check('no "average" anywhere in the Scout Game', !/average/i.test(fn('sgRenderSlots') + fn('sgRenderList') + fn('sgRenderMine')));
check('captain: a navy disc with a gold C', /\.sg-cap-disc\{[^}]*background:var\(--navy\);color:var\(--gold\)/.test(idx) && /sgCapDisc\(\)/.test(fn('sgRenderSlots')) && /sgCapDisc\(\)/.test(fn('sgRenderMine')));
check('league names without flag emoji', /function sgLeagueName\(r\)\{ const l=r&&r\.leagues; return l\?l\.name:''; \}/.test(idx) && /function glComp\(x\)\{ return x\.competition\|\|''; \}/.test(idx));

// ── The match panel ──
const mo = fn('renderMatchDetail');
check('match band: navy, crests on white discs, the status line', /<div class="mo-band">/.test(mo) && /moDisc\(home\)/.test(mo) && /moDisc\(away\)/.test(mo) && /\.mo-disc\{[^}]*background:var\(--crest-disc\)/.test(idx));
check('match band: the score in the 44px number face', /\.mo-goals-n\{font-family:var\(--font-num\);[^}]*font-size:44px/.test(idx));
check('match band: LIVE in --live-on-band (measured on navy)', /\.mo-band \.mo-status\.live\{color:var\(--live-on-band\);\}/.test(idx));
check('match panel: events by icon and letter, no emoji', !/⚽|👟|🟥|🟨|🔴/.test(mo) && /MO_BALL/.test(mo) && /mo\.ev\.a/.test(mo) && /class="mo-card"/.test(mo));
check('match panel: the league by name, no flag', !/league_flag/.test(mo));
check("match panel: no ScoutMind rating; API-Football's rating credited", !/ScoutMind rating/i.test(mo) && /mo\.ratingBy/.test(mo));

// ── The number face, and no retired faces left in these screens ──
const retired = [...idx.matchAll(/\n\.(sg|mo|fx)-[\w-]+[^{]*\{[^}]*(Bebas|DM Mono)[^}]*\}/g)].map((m) => m[0].trim().slice(0, 40));
check('Scout, match panel and rows: no Bebas Neue or DM Mono left', retired.length === 0, retired.join(' | '));
const i18n = read('public/i18n.js');
for (const k of ['sg.band.round', 'sg.band.closes', 'sg.band.season', 'sg.band.points', 'sg.band.rank', 'mo.ev.goal', 'mo.ev.assist', 'mo.ev.yellow', 'mo.ev.red', 'fx.ft', 'fx.loadFail']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
