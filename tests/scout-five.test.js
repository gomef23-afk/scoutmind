// Anyone's five, once the round is locked (17 Nov 2026).
//
//   node tests/scout-five.test.js
//
// Tapping a name in a ranking (round, competition, overall, fans), the played
// round's top 10 or a private league opens that person's five. Visibility is
// the database's job: migration 017's select policies return someone else's
// entry, picks and scores only once the round's status is not 'open', and no
// later migration loosens them. The page asks only for locked rounds.
// sgFiveRows() — the rows my five and anyone's five share — runs in a sandbox.
// No dependencies.

import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const idx = read('public/index.html');
const fn = (name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx) || [''])[0];

// ── The database enforces "only after lock" (017) ──
const m017 = read('supabase/migrations/017_scout_game.sql');
for (const [table, name] of [['game_entries', 'own, or after lock'], ['game_picks', 'own, or after lock'], ['game_pick_scores', 'after lock']]) {
  const re = new RegExp(`create policy "${table}: ${name}" on public\\.${table}\\s+for select to anon, authenticated\\s+using \\(([\\s\\S]*?)\\);`);
  const m = re.exec(m017);
  check(`017: ${table} select policy needs status <> 'open' (or own row)`, !!m && /g\.status <> 'open'/.test(m[1])
    && (table === 'game_pick_scores' || /user_id = auth\.uid\(\)/.test(m[1])), m ? m[1] : 'policy not found');
}
check('017: game_picks cannot change after the deadline (restrictive insert/update/delete)',
  ['insert', 'update', 'delete'].every((op) => new RegExp(`"game_picks: ${op} only before the deadline"[\\s\\S]*?as restrictive for ${op}`).test(m017)));
const later = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => /^\d{3}/.test(f) && f > '017_scout_game.sql');
// 029 moved "after lock" to "from the deadline" (picks are frozen at the
// deadline already); tests/ownership.test.js pins its three policies. No
// other migration may touch them.
const loosened = later.filter((f) => f !== '029_ownership_shadow.sql'
  && /(drop|alter|create) policy[^;]*on public\.(game_entries|game_picks|game_pick_scores)\b/i.test(read('supabase/migrations/' + f)));
check('no migration after 017 touches those policies except 029', loosened.length === 0, loosened.join(', '));
const m029 = read('supabase/migrations/029_ownership_shadow.sql');
check('029 keeps "own row" and opens others only from the deadline',
  (m029.match(/using \(user_id = auth\.uid\(\)\s+or exists \(select 1 from public\.game_rounds g\s+where g\.id = round_id and \(g\.status <> 'open' or g\.deadline_utc <= now\(\)\)\)\)/g) || []).length === 2);
check('no function that reads or writes picks/entries is granted to anon', later.concat(['017_scout_game.sql']).every((f) => !/grant execute on function public\.\w*(_picks|_entries|_entry)\([^)]*\) to [^;]*anon/i.test(read('supabase/migrations/' + f))));

// ── Every ranking name is a tap target ──
const table = fn('sgTable');
check('sgTable rows carry the tap (sgFiveTap with a scope)', /function sgTable\(rows,mine,field,extra,scope\)/.test(table) && /sgFiveTap\(x,scope\)/.test(table));
const rk = fn('sgRenderRankings');
check('This round → that round', /sgTable\(rows,mine,'total',null,\{roundId:r\.id\}\)/.test(rk));
check('Competition → its rounds this season', /\{leagueId:r\.league_id,season:r\.season\}/.test(rk));
check('Overall and fans → every round', (rk.match(/\{all:true\}/g) || []).length === 2);
check('the club table (torcida) is clubs, not people: no tap', !/sgFiveTap/.test((/const clubRows=[\s\S]*?join\(''\);/.exec(rk) || [''])[0]));
check('the played round top 10 opens that round', /sgTable\(top\|\|\[\],[\s\S]*?'total',null,\{roundId:r\.id\}\)/.test(fn('sgRenderPlayed')));
const gl = fn('glRenderLeague');
check('private league rows open the league\'s competition rounds', /sgFiveTap\(x,\{leagueId:L\.league_id,season:L\.season\}\)/.test(gl));
check('the owner\'s remove button does not open the sheet', /onclick="event\.stopPropagation\(\);glRemove\(/.test(gl));
const tap = fn('sgFiveTap');
check('no tap without a user (deleted accounts) or a scope', /if\(!x\|\|!x\.user_id\|\|!scope\) return '';/.test(tap));
check('the tap is an index, never the id in an inline string (rule 4 spirit)', /onclick="sgOpenFive\('\+i\+'\)"/.test(tap) && /role="button" tabindex="0"/.test(tap));

// ── The sheet ──
const open = fn('sgOpenFive');
check('asks only for rounds locked or past their deadline (the database would withhold the rest anyway)', /game_rounds!inner\(/.test(open)
  && /&game_rounds\.or=\(status\.neq\.open,deadline_utc\.lte\.'\+encodeURIComponent\(nowIso\)\+'\)/.test(open)
  && /const past=g=>g&&\(g\.status!=='open'\|\|\(g\.deadline_utc&&new Date\(g\.deadline_utc\)<=new Date\(\)\)\);/.test(open) && /filter\(e=>past\(e\.game_rounds\)\)/.test(open));
check('newest locked round first', /sort\(\(a,b\)=>String\(b\.game_rounds\.deadline_utc\)\.localeCompare\(String\(a\.game_rounds\.deadline_utc\)\)\)/.test(open));
check('the scope becomes the filter', /round_id=eq\.'\+Number\(s\.roundId\)/.test(open) && /game_rounds\.league_id=eq\.'\+Number\(s\.leagueId\)\+'&game_rounds\.season=eq\.'\+Number\(s\.season\)/.test(open));
check('the user id is encoded in the query', /user_id=eq\.'\+encodeURIComponent\(tg\.user_id\)/.test(open));
check('a slow reply for a closed or replaced sheet is dropped', /if\(FIVE\.open!==token\) return;/.test(open) && /FIVE\.open!==token\|\|FIVE\.list\[FIVE\.i\]!==e/.test(fn('sgFiveShow')));
const show = fn('sgFiveShow');
check('per player: scores, real positions, the round rank', /game_pick_scores\?select=slot,fixture_id,base_points,breakdown,multiplier,is_captain,contrarian,total&entry_id=eq\./.test(show)
  && /sgPositions\(r,/.test(show) && /game_round_rankings\?select=rank,participants,total/.test(show));
check('the band says Points (not "Your points") for someone else', /sgPlayedBand\(r,status,total,rk,FIVE\.tg\.user_id!==myUserId\(\)\)/.test(show) && /t\(other\?'sg\.five\.points':'sg\.band\.points'\)/.test(fn('sgPlayedBand')));
check('my five and anyone\'s five share the rows', /sgFiveRows\(e,scores,pos\)/.test(fn('sgRenderMine')) && /sgFiveRows\(e,scores\|\|\[\],pos\)/.test(show));
check('the open picks select carries photo, captain and the locked multiplier',
  /game_picks\(slot,player_id,is_captain,locked_tier,locked_multiplier,locked_contrarian,players\(name,photo_url\)\)/.test(open));
check('rule 6: the overlay is display:none in HTML', /<div id="five-overlay" style="display:none;/.test(idx) && /ov\.style\.display='flex'/.test(open));
check('safe areas: the overlay pads under the status bar and follows the keyboard viewport',
  /#chat-overlay,#match-overlay,#five-overlay\{padding-top:env\(safe-area-inset-top\);\}/.test(idx) && /\['chat-overlay','match-overlay','five-overlay'\]/.test(idx));
check('Escape closes it', /if\(e\.key==='Escape'&&FIVE\.open\) closeFive\(\);/.test(idx));
check('a ranking row you can tap shows it (pointer, hover, focus ring)', /\.sg-rank-row\[role="button"\]\{cursor:pointer;\}/.test(idx) && /\.sg-rank-row\[role="button"\]:focus-visible\{/.test(idx));

// ── sgFiveRows, run ──
const ctx = {
  t: (k) => ({ 'sg.player': 'Player' }[k] || k),
  sanitize: (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')),
  sgPhoto: () => '<i class="ph"></i>', sgCapDisc: () => '<i class="cap">C</i>', sgTierChip: (tier, m) => `[${tier}×${m}]`,
  sgPosLabel: (g) => ({ G: 'GK', D: 'DEF', X: 'MID/FWD' }[g] || g), sgBreakdown: () => '', sgPts: (v) => String(Math.round(Number(v) * 100) / 100),
};
vm.createContext(ctx);
const oneLine = (name) => (new RegExp('function ' + name + '\\([^)]*\\)\\{[^\\n]*\\}').exec(idx) || [''])[0];
vm.runInContext([oneLine('sgGroup'), fn('sgFormationOrder'), "const SG_SLOT_GROUP=['G','D','D','X','X'];", fn('sgFiveRows'), 'this.sgFiveRows=sgFiveRows;'].join('\n'), ctx);
const picks = [
  { slot: 1, player_id: 10, is_captain: false, locked_tier: 3, locked_multiplier: 1.1, players: { name: 'Forward' } },
  { slot: 2, player_id: 20, is_captain: true, locked_tier: 1, locked_multiplier: 1.4, players: { name: 'Keeper' } },
  { slot: 3, player_id: 30, is_captain: false, locked_tier: 5, locked_multiplier: 1, players: { name: 'Back' } },
];
const pos = new Map([[10, 'F'], [20, 'G'], [30, 'D']]);
const scored = ctx.sgFiveRows({ game_picks: picks }, [{ slot: 2, total: 8.4 }, { slot: 1, total: 2 }, { slot: 1, total: 1.3 }], pos);
const names = [...scored.html.matchAll(/sg-slot-name">([^<]*)</g)].map((m) => m[1]);
check('rows in formation order by real position, not slot', JSON.stringify(names) === '["Keeper","Back","Forward"]', names.join(','));
check('labels from the real position', JSON.stringify([...scored.html.matchAll(/sg-slot-pos">([^<]*)</g)].map((m) => m[1])) === '["GK","DEF","MID/FWD"]');
check('captain disc on the captain only', (scored.html.match(/class="cap"/g) || []).length === 1 && /is-captain[\s\S]*?Keeper/.test(scored.html));
check('locked multiplier chip on every row', ['[1×1.4]', '[5×1]', '[3×1.1]'].every((c) => scored.html.includes(c)));
check('points per player, summed over his fixtures; "—" when unscored', /Keeper[\s\S]*?sg-pick-pts">8\.4</.test(scored.html) && /Forward[\s\S]*?sg-pick-pts">3\.3</.test(scored.html) && /Back[\s\S]*?sg-pick-pts">—</.test(scored.html));
check('sum and any', Math.abs(scored.sum - 11.7) < 1e-9 && scored.any === true);
const none = ctx.sgFiveRows({ game_picks: picks }, [], pos);
check('nothing scored → any false, every row "—" (no invented number)', none.any === false && (none.html.match(/sg-pick-pts">—</g) || []).length === 3);
check('a name with markup is escaped', ctx.sgFiveRows({ game_picks: [{ slot: 1, player_id: 1, players: { name: '<b>x</b>' } }] }, [], new Map()).html.includes('&lt;b&gt;x&lt;/b&gt;'));

// ── Strings ──
const i18n = read('public/i18n.js');
for (const k of ['sg.five.tapHint', 'sg.five.title', 'sg.five.none', 'sg.five.fail', 'sg.five.older', 'sg.five.newer', 'sg.five.close', 'sg.five.points']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
