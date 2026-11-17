// Home band slot rules (public/home-band.js), design spec v1.2 §4.
//
//   node tests/home-band.test.js
//
// One case per state row in the spec's slot table, plus the no-club and
// no-fixture cases, the round picked for the band, the picks row, the form
// chips, and a sweep checking that no slot ever shows a number it was not
// given. No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);

const src = readFileSync(new URL('../public/home-band.js', import.meta.url), 'utf8');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const HB = ctx.HomeBand;
const plain = (x) => JSON.parse(JSON.stringify(x));

const NOW = new Date(2026, 10, 17, 15, 0).getTime();   // Tue 17 Nov 2026, 15:00 local
const H = 3600000, D = 24 * H;
const CLUB = 3;

// ── Slot 1: TABLE ──
eq('table: 11th · 42 pts', plain(HB.tableSlot({ rank: 11, points: 42 })),
  { label: { key: 'hb.table' }, big: { kind: 'ord', n: 11 }, line: { key: 'hb.pts', vars: { n: 42 } }, tone: 'normal' });
eq('table: a group league gives the rank match_form() returns (within the group)', plain(HB.tableSlot({ rank: 4, points: 20 })).big, { kind: 'ord', n: 4 });
check('table: no standings row → hidden', HB.tableSlot({ rank: null, points: null }) === null && HB.tableSlot(null) === null);
eq('table: rank without points → no points line, nothing invented', plain(HB.tableSlot({ rank: 2 })).line, null);

// ── Slot 2: MATCH ──
const fx = (o) => Object.assign({ id: 1, home_id: CLUB, away_id: 9, opponent: 'Palmeiras', status_short: 'NS', elapsed: null, home_goals: null, away_goals: null }, o);
const next = HB.matchSlot(CLUB, [fx({ id: 7, kickoff: NOW + 4 * D + 1.5 * H })], NOW);
eq('match: NEXT · 16:30 · Sat · vs Palmeiras', plain([next.label, next.big, next.line]),
  [{ key: 'hb.next' }, { kind: 'time', at: NOW + 4 * D + 1.5 * H }, { key: 'hb.dayVs', vars: { at: NOW + 4 * D + 1.5 * H, opp: 'Palmeiras' } }]);
const live = HB.matchSlot(CLUB, [fx({ id: 8, kickoff: NOW - H, status_short: '2H', elapsed: 64, home_goals: 2, away_goals: 1 }), fx({ id: 9, kickoff: NOW + 3 * D })], NOW);
eq("match: live → LIVE 64' · 2–1 · opponent", plain([live.label, live.big, live.line, live.tone]),
  [{ key: 'hb.live', vars: { m: 64 } }, { kind: 'score', home: 2, away: 1 }, { key: 'hb.vs', vars: { opp: 'Palmeiras' } }, 'live']);
const ht = HB.matchSlot(CLUB, [fx({ kickoff: NOW - H, status_short: 'HT', elapsed: 45, home_goals: 0, away_goals: 0 })], NOW);
check('match: half time is live too', ht.label.key === 'hb.live' && ht.big.kind === 'score' && ht.big.home === 0);
const ft = HB.matchSlot(CLUB, [fx({ kickoff: NOW - 3 * H, status_short: 'FT', home_goals: 1, away_goals: 0 }), fx({ id: 2, kickoff: NOW + 5 * D })], NOW);
eq('match: finished today → FULL TIME · 1–0 · opponent', plain([ft.label, ft.big, ft.line]),
  [{ key: 'hb.ft' }, { kind: 'score', home: 1, away: 0 }, { key: 'hb.vs', vars: { opp: 'Palmeiras' } }]);
const yday = HB.matchSlot(CLUB, [fx({ kickoff: NOW - D, status_short: 'FT', home_goals: 3, away_goals: 3 }), fx({ id: 2, kickoff: NOW + 5 * D })], NOW);
check('match: finished yesterday → the next match, not the old score', yday.label.key === 'hb.next' && yday.big.at === NOW + 5 * D);
const none = HB.matchSlot(CLUB, [], NOW);
eq('match: no fixture scheduled → NEXT · — · No match scheduled', plain([none.label, none.big, none.line]), [{ key: 'hb.next' }, { kind: 'dash' }, { key: 'hb.noMatch' }]);
const pst = HB.matchSlot(CLUB, [fx({ kickoff: NOW + D, status_short: 'PST' })], NOW);
check('match: a postponed fixture is not "next"', pst.big.kind === 'dash');
const other = HB.matchSlot(CLUB, [fx({ home_id: 50, away_id: 51, kickoff: NOW + D })], NOW);
check("match: another club's fixture is ignored", other.big.kind === 'dash');
const liveNoScore = HB.matchSlot(CLUB, [fx({ kickoff: NOW - 10 * 60000, status_short: '1H', elapsed: 3 })], NOW);
check('match: live with no score yet → a dash, not 0–0', liveNoScore.big.kind === 'dash');

// ── Which round ──
const R = (o) => Object.assign({ id: 1, league_slug: 'serie_a', status: 'open', round_no: 35, deadline_utc: new Date(NOW + 2 * D).toISOString() }, o);
const soon = R({ id: 2, deadline_utc: new Date(NOW + 5 * H).toISOString() });
const playing = R({ id: 3, status: 'locked', round_no: 34, deadline_utc: new Date(NOW - D).toISOString() });
const later = R({ id: 4, deadline_utc: new Date(NOW + 3 * D).toISOString() });
check('round: an open round closing within 24 h comes first', HB.pickRound([playing, later, soon], 'serie_a', new Set([3]), new Set([3]), NOW).id === 2);
check('round: else a round in play that I entered', HB.pickRound([playing, later], 'serie_a', new Set([3]), new Set([3]), NOW).id === 3);
check('round: else the soonest open round', HB.pickRound([playing, later], 'serie_a', new Set(), new Set([3]), NOW).id === 4);
check('round: only my club\'s league', HB.pickRound([R({ id: 9, league_slug: 'la_liga' })], 'serie_a', new Set(), new Set(), NOW) === null);
check('round: no club → any league', HB.pickRound([R({ id: 9, league_slug: 'la_liga' })], null, new Set(), new Set(), NOW).id === 9);
const fin = R({ id: 5, status: 'final', deadline_utc: new Date(NOW - 3 * D).toISOString(), closes_utc: new Date(NOW - D).toISOString() });
check('round: a final round from the last two days when nothing else', HB.pickRound([fin], 'serie_a', new Set(), new Set(), NOW).id === 5);
check('round: an old final round is not shown', HB.pickRound([R({ id: 6, status: 'final', deadline_utc: new Date(NOW - 9 * D).toISOString(), closes_utc: new Date(NOW - 6 * D).toISOString() })], 'serie_a', new Set(), new Set(), NOW) === null);
check('round: a locked round whose matches are over is not "in play"', HB.pickRound([playing], 'serie_a', new Set([3]), new Set(), NOW) === null);
check('round: in-play unknown (null) → locked counts as in play', HB.pickRound([playing], 'serie_a', new Set([3]), null, NOW).id === 3);

// ── Slot 3: ROUND ──
eq('round slot: open, entered → ROUND 35 CLOSES · countdown (gold) · 3rd in Série A', plain(HB.roundSlot(later, { entered: true, compRank: 3 }, 'Série A')),
  { label: { key: 'hb.roundCloses', vars: { n: 35 } }, big: { kind: 'countdown', at: NOW + 3 * D }, line: { key: 'hb.rankIn', vars: { n: 3, league: 'Série A' } }, tone: 'gold', roundId: 4 });
eq('round slot: open, no picks → same countdown, "No picks yet"', plain(HB.roundSlot(later, { entered: false }, 'Série A')).line, { key: 'hb.noPicks' });
eq('round slot: open, entered, no competition rank yet → the league name only', plain(HB.roundSlot(later, { entered: true, compRank: null }, 'Série A')).line, { key: 'hb.inLeagueName', vars: { league: 'Série A' } });
const lk = plain(HB.roundSlot(playing, { entered: true, roundTotal: 18.5, roundRank: 40 }, 'Série A'));
eq('round slot: locked → ROUND 34 LIVE · points from fixtures already scored', [lk.label, lk.big], [{ key: 'hb.roundLive', vars: { n: 34 } }, { kind: 'points', n: 18.5 }]);
const lk0 = plain(HB.roundSlot(playing, { entered: true, roundTotal: null }, 'Série A'));
eq('round slot: locked, nothing scored yet → — · points after full time', [lk0.big, lk0.line], [{ kind: 'dash' }, { key: 'hb.ptsAfterFT' }]);
const fn = plain(HB.roundSlot(fin, { entered: true, roundTotal: 41.25, roundRank: 4 }, 'Série A'));
eq('round slot: final → ROUND 35 · points · rank', [fn.label, fn.big, fn.line], [{ key: 'hb.round', vars: { n: 35 } }, { kind: 'points', n: 41.25 }, { key: 'hb.rankIn', vars: { n: 4, league: 'Série A' } }]);
eq('round slot: no round → NEXT ROUND · — · No round scheduled', plain(HB.roundSlot(null, {}, 'Série A')),
  { label: { key: 'hb.nextRound' }, big: { kind: 'dash' }, line: { key: 'hb.noRound' }, tone: 'normal' });
eq('round slot: a round without a number uses its label', plain(HB.roundSlot(R({ round_no: null, round_label: 'Quarter-finals' }), {}, 'X')).label.vars, { n: 'Quarter-finals' });

// ── Picks row ──
const five = [1, 2, 3, 4, 5].map((s) => ({ slot: s, is_captain: s === 4, name: 'P' + s, photo_url: null }));
eq('picks: open round with 5 → "Your 5 are in", captain named', plain(HB.picksRow(later, { picks: five.slice().reverse() })).captain, 'P4');
check('picks: open round with 5 → state in, slots in order', HB.picksRow(later, { picks: five.slice().reverse() }).picks.map((p) => p.slot).join() === '1,2,3,4,5');
check('picks: open round, no entry → Pick your 5', HB.picksRow(later, null).state === 'none');
check('picks: locked round I entered → my picks, not editable', HB.picksRow(playing, { picks: five }).state === 'locked');
check('picks: locked round I did not enter → no row', HB.picksRow(playing, null) === null);
check('picks: no round → no row', HB.picksRow(null, null) === null);

// ── Countdown and form ──
eq('countdown: 1d 04h', HB.countdownText(NOW + D + 4 * H + 59 * 60000, NOW), '1d 04h');
eq('countdown: 3h 07m', HB.countdownText(NOW + 3 * H + 7 * 60000, NOW), '3h 07m');
eq('countdown: 12m', HB.countdownText(NOW + 12 * 60000 + 30000, NOW), '12m');
eq('countdown: past → 0m, never negative', HB.countdownText(NOW - 5000, NOW), '0m');
const form = { last5: [{ result: 'W', score: '2-0' }, { result: 'L', score: '0-1' }, { result: 'D', score: '1-1' }, { result: 'X' }, { result: 'W' }, { result: 'W' }] };
eq('form: oldest first, only W/D/L, at most five', plain(HB.formChips(form)).map((c) => c.r).join(''), 'WWDLW');
eq('form: nothing → no chips', plain(HB.formChips(null)), []);

// ── Nothing invented: every number a slot shows came from its input ──
let rnd = 7; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
let bad = [];
for (let i = 0; i < 400; i++) {
  const given = new Set();
  const n = (v) => { if (v != null) given.add(v); return v; };
  const maybe = (v) => (rand() < 0.3 ? null : v);
  const t1 = HB.tableSlot({ rank: n(maybe(1 + Math.floor(rand() * 20))), points: n(maybe(Math.floor(rand() * 80))) });
  const fxs = [0, 1, 2].map((k) => fx({ id: k, kickoff: NOW + (rand() - 0.5) * 6 * D, status_short: ['NS', '1H', 'FT', 'PST', 'HT'][Math.floor(rand() * 5)],
    elapsed: n(maybe(Math.floor(rand() * 90))), home_goals: n(maybe(Math.floor(rand() * 4))), away_goals: n(maybe(Math.floor(rand() * 4))) }));
  const t2 = HB.matchSlot(CLUB, fxs, NOW);
  const rr = R({ status: ['open', 'locked', 'final'][Math.floor(rand() * 3)], round_no: n(1 + Math.floor(rand() * 38)) });
  const t3 = HB.roundSlot(rr, { entered: rand() < 0.5, compRank: n(maybe(1 + Math.floor(rand() * 500))), roundTotal: n(maybe(Math.round(rand() * 6000) / 100)), roundRank: n(maybe(1 + Math.floor(rand() * 500))) }, 'L');
  for (const s of [t1, t2, t3]) {
    if (!s) continue;
    const shown = [s.big.n, s.big.home, s.big.away, s.label.vars && s.label.vars.m, s.label.vars && s.label.vars.n, s.line && s.line.vars && s.line.vars.n].filter((v) => v != null);
    for (const v of shown) if (!given.has(v)) bad.push(`${s.label.key} shows ${v}`);
  }
}
check('nothing invented: 400 random states, every number shown was given', bad.length === 0, bad.slice(0, 5).join('; '));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
