// Round Recap, the screens (R-2, 25 Nov 2026).
//
//   node tests/round-recap-screens.test.js
//
// - public/round-recap.js turns rpc/round_recap's answer into the band and
//   the sentences: checked on a full recap shaped like Série A 35's (EN and
//   PT), and by a sweep that removes every value in turn: no line ever shows
//   "undefined", "NaN", "null" or a "{placeholder}", and taking a value away
//   never adds a line;
// - a guest gets no "you" lines; a fan who did not play gets "—" and says so;
// - names are escaped; who picked the best pick is "Felipe V.", "A and B" or
//   "3 fans"; a deleted account is never a blank;
// - fresh(): 7 days after the round turned final, never before;
// - every recap.* key the code uses exists in English and Portuguese;
// - index.html: the card on the round view, the Recaps view, the Home row
//   after the light sheet, round-recap.js loaded, precached and stamped, and
//   nothing breaks before 042 (rule 21).
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── load i18n.js and round-recap.js as the page does ──
const store = new Map();
const sb = { navigator: { languages: ['en'], language: 'en' }, console: { warn() {} },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read('public/i18n.js'), sb);
vm.runInContext(read('public/round-recap.js'), sb);
const RR = sb.RoundRecap;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CLUBS = { 10: 'Corinthians', 20: 'Botafogo', 11: 'Vasco da Gama', 21: 'Mirassol', 12: 'Flamengo', 22: 'Santos' };
const ctx = (o = {}) => Object.assign({ t: sb.t, tn: sb.tn, tOrd: sb.tOrd, esc,
  pts: (n) => (Math.round(n * 100) / 100).toLocaleString(sb.smLocale()),
  num: (v, d) => Number(v).toLocaleString(sb.smLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }),
  club: (id) => CLUBS[id] || null, tier: (x) => (x == null ? sb.t('sg.tier.none') : sb.t('sg.tier.' + x)), signedIn: true, deleted: sb.t('sg.deletedUser') }, o);

// A recap shaped like Série A 35's (042's round_recap answer).
const REC = () => ({
  round_id: 29, league_id: 1, season: 2026, round_no: 35, round_label: 'Regular Season - 35', finalized_at: '2026-11-21T21:31:00Z',
  data: {
    v: 1,
    matches: { played: 10, goals: 20, results: [{ f: 1, h: 10, a: 20, hg: 4, ag: 0 }, { f: 2, h: 21, a: 11, hg: 0, ag: 0 }],
      big_wins: [{ f: 1, h: 10, a: 20, hg: 4, ag: 0 }], upsets: [{ f: 3, w: 22, l: 12, wr: 17, lr: 1 }], snapshot_date: '2026-11-19' },
    players: { top_scorers: { goals: 3, ids: [101] }, top_rating: { id: 101, rating: 10, minutes: 90 }, quiet_star: { id: 103, base: 18.5 } },
    tiers: { best: { tier: 4, mean: 6.2, n: 60 } },
    game: { entries: 4, most_picked: { id: 102, base: 4.5 }, best_pick: { id: 104, base: 19.35, multiplier: 1.05, points: 20.32, by: ['u3'], fans: 1 },
      captains: { delivered: 1, of: 4 }, top3: [{ u: 'u1', total: 41.42, rank: 1 }, { u: 'u2', total: 28.18, rank: 2 }, { u: 'u3', total: 20.66, rank: 3 }] },
    people: { 101: { name: 'Kaio César', team: 10 }, 102: { name: 'Robert Renan', team: 11 }, 103: { name: 'Gabriel <b>X</b>', team: 12 }, 104: { name: 'Thiago Mendes', team: 11 } },
  },
  names: { u1: 'Brosas', u2: 'gomef23', u3: 'Will McHugh' },
  mine: { main_club_id: 21, total: 28.18, rank: 2, participants: 4, season_rank: 2, season_rank_before: 4,
    leagues: [{ id: 1, name: 'Friends & <Co>', top3: [{ u: 'u1', total: 41.42, rank: 1 }, { u: 'u2', total: 28.18, rank: 2 }] }] },
});
const flat = (b) => b.sections.flatMap((s) => s.lines.map((l) => `${s.key}: ${l}`));

// ── 1. A full recap, English ──
const full = RR.build(REC(), ctx());
eq('title', full.title, 'Round 35 recap');
eq('band: goals · best pick · your points (plain text: the band escapes it)', full.band.map((s) => [s.lab, s.big, s.line]),
  [['Goals', '20', '10 matches'], ['Best pick', '20.32', 'Thiago Mendes'], ['Your points', '28.18', '2nd of 4']]);
eq('sections in order', full.sections.map((s) => s.key), ['recap.sec.round', 'recap.sec.game', 'recap.sec.players', 'recap.sec.you']);
eq('every line', flat(full), [
  'recap.sec.round: 10 matches, 20 goals',
  'recap.sec.round: Biggest win: Corinthians 4–0 Botafogo',
  'recap.sec.round: Upset: Santos (17th before the round) beat Flamengo (1st)',
  'recap.sec.game: Most picked: Robert Renan (Vasco da Gama), 4.5 pts',
  'recap.sec.game: Best pick: Thiago Mendes (Vasco da Gama), 20.32 pts (19.35 × 1.05), picked by Will M.',
  'recap.sec.game: 1 of 4 captains was their fan’s best pick',
  'recap.sec.game: Top of the round: 1. Brosas 41.42 · 2. gomef23 28.18 · 3. Will McHugh 20.66',
  'recap.sec.game: Tier that paid best: Proven, 6.2 pts a player',
  'recap.sec.game: Friends &amp; &lt;Co&gt;: 1. Brosas 41.42 · 2. gomef23 28.18',
  'recap.sec.players: Top scorer: Kaio César (Corinthians), 3 goals',
  'recap.sec.players: Top rating: Kaio César (Corinthians), 10.0',
  'recap.sec.players: Quiet star: Gabriel &lt;b&gt;X&lt;/b&gt; (Flamengo), 18.5 pts, and few fans picked him',
  'recap.sec.you: Your club: Mirassol 0–0 Vasco da Gama',
  'recap.sec.you: Your points: 28.18, 2nd of 4',
  'recap.sec.you: Season rank: 2nd (was 4th)',
]);
check('no raw HTML from a name gets through', !flat(full).some((l) => /<b>|<Co>/.test(l)));

// ── 2. Portuguese ──
store.set('sm_lang', 'pt-BR');
const pt = RR.build(REC(), ctx());
eq('PT: title, band, and the lines that carry numbers', [pt.title, pt.band.map((s) => s.big + ' ' + s.line), flat(pt).filter((l) => /Melhor escolha|capitães|campeonato|Zebra/.test(l))],
  ['Resumo da rodada 35', ['20 10 jogos', '20,32 Thiago Mendes', '28,18 2º de 4'], [
    'recap.sec.round: Zebra: Santos (17º antes da rodada) venceu Flamengo (1º)',
    'recap.sec.game: Melhor escolha: Thiago Mendes (Vasco da Gama), 20,32 pts (19,35 × 1,05), escolhido por Will M.',
    'recap.sec.game: 1 de 4 capitães foi a melhor escolha do seu torcedor',
    'recap.sec.you: No campeonato: 2º (antes 4º)']]);
store.delete('sm_lang');

// ── 3. States ──
const guest = RR.build(REC(), ctx({ signedIn: false }));
check('a guest: no "Your points" slot and no "You" section', !guest.band.some((s) => s.lab === 'Your points') && !guest.sections.some((s) => s.key === 'recap.sec.you'));
const nope = REC(); nope.mine.total = null; nope.mine.rank = null;
const np = RR.build(nope, ctx());
eq('a fan who did not play: "—" and a line saying so', [np.band[2], flat(np).filter((l) => l.startsWith('recap.sec.you'))],
  [{ lab: 'Your points', big: '—', line: 'You did not play' }, ['recap.sec.you: Your club: Mirassol 0–0 Vasco da Gama', 'recap.sec.you: You did not play this round.']]);
const nofans = REC(); delete nofans.data.game; nofans.mine.total = null; nofans.mine.leagues = [];
const nf = RR.build(nofans, ctx());
check('a round nobody played: no best pick slot, no game lines but the tier, no "you did not play" (there was no game)',
  !nf.band.some((s) => s.lab === 'Best pick') && flat(nf).filter((l) => l.startsWith('recap.sec.game')).length === 1 && !flat(nf).some((l) => /did not play this round/.test(l)));
const two = REC(); two.data.game.best_pick.by = ['u1', 'u3']; two.data.game.best_pick.fans = 2;
check('two fans: "Brosas and Will M."', flat(RR.build(two, ctx())).some((l) => /picked by Brosas and Will M\.$/.test(l)));
const many = REC(); many.data.game.best_pick.by = ['u1', 'u3']; many.data.game.best_pick.fans = 7;
check('three or more: "7 fans"', flat(RR.build(many, ctx())).some((l) => /picked by 7 fans$/.test(l)));
const gone = REC(); delete gone.names.u3;
check('a deleted account: its word, never a blank', flat(RR.build(gone, ctx())).some((l) => /picked by Deleted account$|picked by .+$/.test(l) && !/picked by $/.test(l))
  && flat(RR.build(gone, ctx())).every((l) => !/ · 3\.  /.test(l)));
const twenty = REC(); twenty.data.game.captains = { delivered: 9, of: 30 };
check('20+ entries: captains as a share', flat(RR.build(twenty, ctx())).includes('recap.sec.game: 30% of captains were their fan’s best pick'));
const scorers = REC(); scorers.data.players.top_scorers = { goals: 1, ids: [101, 102, 104], more: 17 };
check('several top scorers, and how many more', flat(RR.build(scorers, ctx())).includes('recap.sec.players: Top scorers, 1 goal each: Kaio César (Corinthians), Robert Renan (Vasco da Gama), Thiago Mendes (Vasco da Gama) and 17 more'));
const label = REC(); label.round_no = null;
eq('a round without a number is titled by its label', RR.build(label, ctx()).title, 'Regular Season - 35 recap');
eq('nothing to show → no title, no band, no sections', RR.build({ data: {} , round_no: null }, ctx()), { title: null, band: [], sections: [] });
eq('no recap → empty', RR.build(null, ctx()), { title: null, band: [], sections: [] });

// ── 4. The sweep: remove every value in turn ──
function leaves(o, path = []) {
  if (o === null || typeof o !== 'object') return [path];
  return Object.keys(o).flatMap((k) => leaves(o[k], path.concat(k)));
}
const base = flat(full).length;
let swept = 0;
const bad = [];
for (const path of leaves(REC())) {
  if (!path.length) continue;
  for (const how of ['delete', 'null', 'nan']) {
    const r = REC();
    let o = r;
    for (const k of path.slice(0, -1)) o = o[k];
    const last = path[path.length - 1];
    if (how === 'delete') { if (Array.isArray(o)) o.splice(Number(last), 1); else delete o[last]; }
    else o[last] = how === 'null' ? null : NaN;
    const b = RR.build(r, ctx());
    const text = flat(b).join('\n') + '\n' + b.band.map((s) => s.big + ' ' + s.line).join('\n') + '\n' + (b.title || '');
    swept++;
    if (/undefined|NaN|\bnull\b|\{\w+\}/.test(text)) bad.push(`${how} ${path.join('.')}: ${text.match(/.*(undefined|NaN|\bnull\b|\{\w+\}).*/)[0]}`);
    if (flat(b).length > base) bad.push(`${how} ${path.join('.')}: a line appeared (${flat(b).length} > ${base})`);
    if (b.sections.some((s) => !s.lines.length)) bad.push(`${how} ${path.join('.')}: an empty section`);
  }
}
check(`sweep: ${swept} cases, no line shows a value it was not given, none appears, no empty section`, bad.length === 0, bad.slice(0, 8).join('\n      '));

// ── 5. fresh() and names ──
const F = Date.parse('2026-11-21T21:31:00Z');
eq('fresh: 7 days after the round turned final, not before, not without a date',
  [RR.fresh('2026-11-21T21:31:00Z', F + 6.9 * 864e5), RR.fresh('2026-11-21T21:31:00Z', F + 7.1 * 864e5), RR.fresh('2026-11-21T21:31:00Z', F - 1), RR.fresh(null, F)], [true, false, false, false]);
eq('shortName', [RR.shortName('Felipe Valois'), RR.shortName('  ana   maria souza '), RR.shortName('gomef23'), RR.shortName(''), RR.shortName(null)],
  ['Felipe V.', 'ana S.', 'gomef23', null, null]);

// ── 6. Every key, both languages ──
const src = read('public/round-recap.js') + read('public/index.html');
const used = new Set([...src.matchAll(/'(recap\.[\w.]+)'/g)].map((m) => m[1]).concat(['sg.tab.recaps']));
const plural = new Set([...src.matchAll(/tn\('(recap\.[\w.]+)'/g)].map((m) => m[1]));
const missing = [];
for (const k of used) {
  for (const lang of ['en', 'pt-BR']) {
    const d = sb.I18N[lang];
    const ok = plural.has(k) ? (d[k + '.one'] != null && d[k + '.other'] != null) : (d[k] != null || (d[k + '.one'] != null && d[k + '.other'] != null));
    if (!ok) missing.push(`${lang} ${k}`);
  }
}
eq('every recap key the code uses exists in English and Portuguese', missing, []);
check('the sentences are templated: round-recap.js has no English words outside t()', !/'[A-Z][a-z]+ [a-z]+/.test(read('public/round-recap.js').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')));

// ── 7. The page ──
const idx = read('public/index.html');
check('index.html loads round-recap.js; precached and stamped (rule 24)', /<script src="\/round-recap\.js(\?v=[0-9a-f]+)?"><\/script>/.test(idx)
  && read('public/sw.js').includes("'/round-recap.js'") && read('scripts/bump-sw.mjs').includes("'round-recap.js'"));
check('the round view starts with the recap card, filled for 7 days after a round turned final',
  /body\.innerHTML='<div id="sg-recap-card"><\/div><div class="sg-chips">'\+chips/.test(idx) && /r\.status==='final'&&RoundRecap\.fresh\(r\.finalized_at,Date\.now\(\)\)/.test(idx));
check('the rounds query carries finalized_at (017: no new column, rule 21)', /game_rounds\?select=id,league_id,season,round_label,round_no,deadline_utc,closes_utc,status,participants,finalized_at,/.test(idx));
check('the views row ends with Recaps', /v\('history','sg\.tab\.history','sgShowHistory'\)\s*\+v\('recaps','sg\.tab\.recaps','sgShowRecaps'\)/.test(idx));
check('the Recaps view: chosen competition or all, newest first, a tap opens one, a way back', /sgRpc\('recent_round_recaps',\{p_league_id:\(SG\.recapAll\|\|!chosen\)\?null:SG\.leagueId,p_limit:100\}\)/.test(idx)
  && /onclick="sgOpenRecap\('\+i\+'\)"/.test(idx) && /t\('recap\.list\.back'\)/.test(idx));
check('before 042 nothing breaks: a failed rpc is a null recap, the list says it could not load', /try\{ rec=await sgRpc\('round_recap',\{p_round_id:roundId\}\); \}catch\(e\)\{ console\.warn\('round_recap:',e\.message\); \}/.test(idx)
  && /t\(rows\?'recap\.list\.empty':'recap\.loadFail'\)/.test(idx));
check('a card is drawn only when it has something to show', /if\(!b\.title\|\|\(!b\.band\.length&&!b\.sections\.length\)\) return '';/.test(idx));
check('the card: navy band for the figures (sgBand), light sheet for the lines, behind "See the recap" on the round view',
  /\(b\.band\.length\?sgBand\(b\.band\):''\)/.test(idx) && /<details class="rc-more"><summary>'\+t\('recap\.open'\)/.test(idx));
check('Home: the row comes after the light sheet (which overlaps the band), hidden until a fresh recap',
  /<div id="hb-room"><\/div>\s*<\/div>\s*<!-- R-2:[\s\S]*?-->\s*<button id="hb-recap" class="hb-recap" type="button" hidden><\/button>/.test(idx)
  && /HBD\.recap=x&&RoundRecap\.fresh\(x\.finalized_at,Date\.now\(\)\)\?x:null;/.test(idx) && /renderHomeRecap\(\);/.test(idx));
check('the recap\'s styles use tokens only', !/\.rc-[\w-]+\{[^}]*#[0-9a-fA-F]{3,6}/.test(idx) && !/\.hb-recap\{[^}]*#[0-9a-fA-F]{3,6}/.test(idx));
check('R-3 stays off: the page posts nothing to rooms', !/recap_posts/.test(idx));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
