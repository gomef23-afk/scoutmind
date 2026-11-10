// Scout Game backtest: naive strategies over every finished regular-season
// round, scored with the live scoring code.
//
//   node scripts/backtest-scout-game.mjs > docs/backtest-2026-11.md
//
// Reads Supabase only, with the public anon key (the same one the site ships),
// and makes NO API-Football requests. Tiers come from player_tiers_at(league,
// season, deadline), so every round is tiered on what was known at its
// deadline, never with hindsight. Scoring imports api/_lib/scout-game.js, so the
// numbers here are what the game itself would award.
//
// Two passes. Pass 1 measures what one pick of each tier really earns under
// the current points table and derives the half-compensation ladder from it
// (1 + (1/r - 1) / 2, r = a tier's realised base over tier 5's, rounded to
// 0.05). Pass 2 plays the strategies under that ladder and its neighbours.
//
// Random strategies use a fixed seed: the report reproduces exactly.

import { readFileSync } from 'node:fs';
import {
  basePoints, effectiveMultiplier, pickTotal, MAX_MULTIPLIER, TIER_MULTIPLIER, UNRANKED_MULTIPLIER, POINTS,
} from '../api/_lib/scout-game.js';

const repo = new URL('../', import.meta.url);
const page = readFileSync(new URL('public/index.html', repo), 'utf8');
const SUPA_URL = process.env.SUPABASE_URL || page.match(/https:\/\/[a-z0-9]+\.supabase\.co/)[0];
const ANON = process.env.SUPABASE_ANON_KEY
  || (page.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/) || page.match(/sb_publishable_[A-Za-z0-9_-]+/))[0];
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

const DRAWS = 200;          // random entries per round for (b) and (d)
const SEED = 20261109;

/**
 * The formation (migration 023): exactly 1 GK, 2 DEF, and 2 from MID or FWD.
 * Slot groups and how many each takes; a player fits the group listing his
 * position. A player with no known position fits nowhere, as in the game.
 */
const FORMATION = [{ pos: ['G'], n: 1 }, { pos: ['D'], n: 2 }, { pos: ['M', 'F'], n: 2 }];

// ── data ─────────────────────────────────────────────────────────────────────
async function get(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function getAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
async function rpc(fn, args) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ── seeded random ────────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

// ── stats helpers ────────────────────────────────────────────────────────────
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const pct = (a, p) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const round05 = (x) => Math.round(x * 20) / 20;

// ── load ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const leagues = await get('leagues?select=id,slug,name,current_season&active=is.true&order=id');
const slugOf = new Map(leagues.map((l) => [l.id, l.slug]));
const rounds = await getAll('game_rounds?select=id,league_id,season,round_label,round_no,deadline_utc,status&order=deadline_utc');
const links = await getAll('game_round_fixtures?select=round_id,fixture_id&counts=is.true');
const fixtures = await getAll('fixtures?select=id,league_id,season,kickoff_utc,status_short,home_team_id,away_team_id,players_fetched_at');
const fxById = new Map(fixtures.map((f) => [f.id, f]));
const stats = await getAll('player_fixture_stats?select=fixture_id,player_id,team_id,position,minutes,goals,assists,clean_sheet,'
  + 'goals_conceded,saves,pen_saved,shots_total,shots_on,passes_key,tackles,interceptions,fouls_drawn,fouls_committed,'
  + 'offsides,pen_missed,pen_committed,yellow,red');
const ogEvents = await getAll('fixture_events?select=fixture_id,player_api_id&type=eq.Goal&detail=eq.Own%20Goal');
const players = await getAll('players?select=id,api_player_id,name');
const teams = await getAll('teams?select=id,name');
const teamName = new Map(teams.map((t) => [t.id, t.name]));
const apiToId = new Map(players.map((p) => [p.api_player_id, p.id]));

const ownGoals = new Map();
for (const e of ogEvents) {
  const pid = apiToId.get(e.player_api_id);
  if (!pid) continue;
  const k = `${e.fixture_id}:${pid}`;
  ownGoals.set(k, (ownGoals.get(k) || 0) + 1);
}

// Base points per player per fixture, computed once; and where the points come
// from, by event and by position, so a dominant row shows up.
const baseOf = new Map();               // `${fixture}:${player}` -> base
const rowsByPlayerLeague = new Map();   // `${league}:${player}` -> [{kickoff, base}]
const byEvent = {};                     // event -> { G, D, M, F } summed points
const appsByPos = { G: 0, D: 0, M: 0, F: 0 };
for (const r of stats) {
  const fx = fxById.get(r.fixture_id);
  if (!fx) continue;
  const { base, breakdown, position } = basePoints(r, ownGoals.get(`${r.fixture_id}:${r.player_id}`) || 0);
  baseOf.set(`${r.fixture_id}:${r.player_id}`, base);
  const k = `${fx.league_id}:${r.player_id}`;
  if (!rowsByPlayerLeague.has(k)) rowsByPlayerLeague.set(k, []);
  rowsByPlayerLeague.get(k).push({ kickoff: fx.kickoff_utc, base });
  appsByPos[position]++;
  for (const [ev, b] of Object.entries(breakdown)) {
    byEvent[ev] ??= { G: 0, D: 0, M: 0, F: 0 };
    byEvent[ev][position] += b.points;
  }
}

const fixturesOf = new Map();
for (const l of links) {
  if (!fixturesOf.has(l.round_id)) fixturesOf.set(l.round_id, []);
  fixturesOf.get(l.round_id).push(l.fixture_id);
}

// Rounds the backtest can score honestly: past, every counting fixture
// finished AND carrying player rows.
const usable = [];
const excluded = [];
for (const r of rounds) {
  const fxs = (fixturesOf.get(r.id) || []).map((id) => fxById.get(id)).filter(Boolean);
  if (!fxs.length || new Date(r.deadline_utc) > new Date()) continue;
  const allDone = fxs.every((f) => ['FT', 'AET', 'PEN'].includes(f.status_short));
  const allRows = fxs.every((f) => f.players_fetched_at);
  if (allDone && allRows) usable.push({ ...r, fxs });
  else if (allDone) excluded.push(`${slugOf.get(r.league_id)} ${r.round_label}`);
}

/** Expected base per appearance before the deadline: the captain's chooser. */
function expectedBase(league, playerId, deadline) {
  const rows = (rowsByPlayerLeague.get(`${league}:${playerId}`) || []).filter((x) => x.kickoff < deadline);
  return rows.length ? mean(rows.map((x) => x.base)) : 0;
}

/** Realised base for a pick in a round: summed over its fixtures, 0 if he did not play. */
function realised(p, round) {
  let b = 0, played = false;
  for (const f of round.fxs) {
    const x = baseOf.get(`${f.id}:${p.player_id}`);
    if (x !== undefined) { b += x; played = true; }
  }
  return { b, played };
}

// ── pass 1: what each tier earns, per position ───────────────────────────────
const pools = [];             // per usable round: { round, slug, pool, ranked, unranked, early }
const tierBase = {};          // 'tier n' | 'unranked' -> { base: [], played }
const tierPos = {};           // 'tier n' -> pos -> { pick: [], app: [] }
let n = 0;
for (const round of usable) {
  const slug = slugOf.get(round.league_id);
  const tiers = await rpc('player_tiers_at', {
    p_league_id: round.league_id, p_season: round.season, p_as_of: round.deadline_utc,
  });
  const inRound = new Set(round.fxs.flatMap((f) => [f.home_team_id, f.away_team_id]));
  const pool = tiers
    .filter((t) => inRound.has(t.team_id))
    .map((t) => ({ ...t, exp: expectedBase(round.league_id, t.player_id, round.deadline_utc) }));
  const ranked = pool.filter((p) => p.tier);
  const unranked = pool.filter((p) => !p.tier);
  const early = ranked.length < 50;
  pools.push({ round, slug, pool, ranked, unranked, early });
  if (!early) {
    for (const p of pool) {
      const { b, played } = realised(p, round);
      const k = p.tier ? `tier ${p.tier}` : 'unranked';
      (tierBase[k] ??= { base: [], played: 0 }).base.push(b);
      if (played) tierBase[k].played++;
      if (p.tier && p.position) {
        const tp = ((tierPos[k] ??= {})[p.position] ??= { pick: [], app: [] });
        tp.pick.push(b);
        if (played) tp.app.push(b);
      }
    }
  }
  if (++n % 20 === 0) process.stderr.write(`  pass 1: ${n}/${usable.length} rounds\n`);
}

const t5 = mean(tierBase['tier 5']?.base || []);
const ratio = (k) => mean(tierBase[k]?.base || []) / t5;
const DERIVED = { 5: 1 };
for (const t of [4, 3, 2, 1]) DERIVED[t] = round05(1 + (1 / ratio(`tier ${t}`) - 1) / 2);
const DERIVED_UNRANKED = DERIVED[1];   // unranked is paid like tier 1, as before
const ladderLabel = (l) => [5, 4, 3, 2, 1].map((t) => l[t]).join(' · ');

// ── pass 2: strategies ───────────────────────────────────────────────────────
const LADDERS = {
  derived: DERIVED,
  live: TIER_MULTIPLIER,                    // whatever scout-game.js holds now
  v1: { 5: 1, 4: 1.05, 3: 1.1, 2: 1.2, 1: 1.35 },
  flat: { 5: 1, 4: 1, 3: 1, 2: 1, 1: 1 },
};
const VARIANTS = [
  { key: `derived half compensation (${ladderLabel(DERIVED)}, unranked ${DERIVED_UNRANKED}×)`, ladder: 'derived', unranked: DERIVED_UNRANKED, mode: 'additive', main: true },
  { key: 'derived, multiplicative captain', ladder: 'derived', unranked: DERIVED_UNRANKED, mode: 'multiplicative' },
  { key: 'v1 ladder kept (1 · 1.05 · 1.1 · 1.2 · 1.35)', ladder: 'v1', unranked: 1.35, mode: 'additive' },
  { key: 'flat (all 1×)', ladder: 'flat', unranked: 1, mode: 'additive' },
];
const MAIN = VARIANTS[0].key;
const liveMatches = [5, 4, 3, 2, 1].every((t) => LADDERS.live[t] === DERIVED[t]) && UNRANKED_MULTIPLIER === DERIVED_UNRANKED;

const results = {};
const push = (variant, strat, slug, v) => {
  results[variant] ??= {};
  results[variant][strat] ??= {};
  (results[variant][strat][slug] ??= []).push(v);
};
const fan = new Map();          // Série A club -> [round totals], main variant
const fanPos = { G: 0, D: 0, M: 0, F: 0 };

/** Five picks from an ordered list, filling the formation in list order. */
function takeFive(list) {
  const out = [];
  const used = FORMATION.map(() => 0);
  for (const p of list) {
    const g = FORMATION.findIndex((s) => s.pos.includes(p.position));
    if (g < 0 || used[g] >= FORMATION[g].n) continue;
    used[g]++;
    out.push(p);
    if (out.length === 5) break;
  }
  return out.length === 5 ? out : null;
}
function randomFive(pool) {
  for (let tries = 0; tries < 20; tries++) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const five = takeFive(shuffled);
    if (five) return five;
  }
  return null;
}

/** Points for an entry of five under a rule variant. */
function entryPoints(five, round, v) {
  const ladder = LADDERS[v.ladder];
  const mult = (p) => (p.tier ? ladder[p.tier] : v.unranked);
  let cap = five[0], best = -Infinity;
  for (const p of five) {
    const e = p.exp * mult(p);
    if (e > best) { best = e; cap = p; }
  }
  let total = 0;
  for (const p of five) {
    const m = effectiveMultiplier({ tierMult: mult(p), captain: p === cap, contrarian: false, mode: v.mode });
    for (const f of round.fxs) {
      const b = baseOf.get(`${f.id}:${p.player_id}`);
      if (b === undefined) continue;   // no row: did not play, scores nothing
      total += pickTotal(b, m);
    }
  }
  return total;
}

for (const { round, slug, pool, ranked, unranked, early } of pools) {
  const tag = early ? 'early' : 'main';
  const a = takeFive([...ranked].sort((x, y) => y.tier - x.tier || y.composite - x.composite));
  const c = takeFive([...ranked].sort((x, y) => x.tier - y.tier || x.composite - y.composite));
  const bDraws = []; const dDraws = [];
  for (let i = 0; i < DRAWS; i++) {
    const b = ranked.length >= 5 ? randomFive(ranked) : null;
    if (b) bDraws.push(b);
    const d = unranked.length >= 5 ? randomFive(unranked) : null;
    if (d) dDraws.push(d);
  }
  for (const v of VARIANTS) {
    if (a) push(v.key, `a:${tag}`, slug, entryPoints(a, round, v));
    if (c) push(v.key, `c:${tag}`, slug, entryPoints(c, round, v));
    for (const b of bDraws) push(v.key, `b:${tag}`, slug, entryPoints(b, round, v));
    for (const d of dDraws) push(v.key, `d:${tag}`, slug, entryPoints(d, round, v));
  }

  // Fan rounds: Série A, five of a club's regulars (most minutes before the
  // deadline, within the lineup rule), main variant.
  if (slug === 'serie_a') {
    const byClub = new Map();
    for (const p of pool) {
      if (!byClub.has(p.team_id)) byClub.set(p.team_id, []);
      byClub.get(p.team_id).push(p);
    }
    for (const [club, list] of byClub) {
      const five = takeFive([...list].sort((x, y) => y.minutes - x.minutes));
      if (!five) continue;
      for (const p of five) fanPos[p.position || 'M']++;
      const name = teamName.get(club) || String(club);
      if (!fan.has(name)) fan.set(name, []);
      fan.get(name).push(entryPoints(five, round, VARIANTS[0]));
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const SLUGS = leagues.map((l) => l.slug).filter((s) => results[MAIN]?.['a:main']?.[s]);
const LABEL = Object.fromEntries(leagues.map((l) => [l.slug, l.name]));
const STRATS = [
  ['a', '(a) top 5 tiers'], ['b', '(b) random 5 tiered'], ['c', '(c) bottom 5 tiers'], ['d', '(d) unranked only'],
];
const all = (variant, strat) => Object.values(results[variant]?.[strat] || {}).flat();
const POS_NAME = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' };
const L = [];
const out = (s = '') => L.push(s);

// Position share, tier-matched: within each tier, a position's mean base per
// pick over the forwards' in the same tier; then the mean of those ratios.
function posShare(kind) {
  const r = { G: [], D: [], M: [], F: [] };
  for (const t of [1, 2, 3, 4, 5]) {
    const tp = tierPos[`tier ${t}`];
    if (!tp?.F) continue;
    const fwd = mean(tp.F[kind]);
    for (const p of ['G', 'D', 'M', 'F']) if (tp[p]?.[kind].length) r[p].push(mean(tp[p][kind]) / fwd);
  }
  return Object.fromEntries(Object.entries(r).map(([p, v]) => [p, mean(v)]));
}
const sharePick = posShare('pick');
const shareApp = posShare('app');
const fanAll = [...fan.values()].flat();

out('# Scout Game backtest — November 2026 (scoring v2)');
out('');
out(`Generated by \`node scripts/backtest-scout-game.mjs\` on ${new Date().toISOString().slice(0, 10)}. `
  + `${usable.length} finished regular-season rounds across ${SLUGS.length} leagues, `
  + `${stats.length.toLocaleString('en')} player-fixture rows. Supabase reads only; no API-Football requests.`);
out('');
out('This replaces the first report, which tested the Day 3 points table. Its conclusions are kept in "History" at the end.');
out('');
{
  const m = (k) => mean(all(MAIN, `${k}:main`));
  const argA = mean(results[MAIN]['a:main']?.argentina || []);
  const argB = mean(results[MAIN]['b:main']?.argentina || []);
  out('## Findings');
  out('');
  out(`1. **Ladder from the v2 points: ${ladderLabel(DERIVED)}, unranked ${DERIVED_UNRANKED}×** (half compensation, same method as v1, rounded to 0.05). ${liveMatches ? 'This is the ladder in `api/_lib/scout-game.js`.' : '**Not yet the ladder in `api/_lib/scout-game.js`** (' + ladderLabel(LADDERS.live) + ').'}`);
  out(`2. **Strategies under it:** top ${f1(m('a'))} > random ${f1(m('b'))} (+${Math.round(100 * (m('a') / m('b') - 1))}%) > bottom ${f1(m('c'))} (${(m('c') / m('b')).toFixed(2)} of random); unknowns alone ${f1(m('d'))}.`);
  out(`3. **A typical fan round** (five Série A regulars from one club) scores a median of **${f1(pct(fanAll, 0.5))}** (p10 ${f1(pct(fanAll, 0.1))}, p90 ${f1(pct(fanAll, 0.9))}). Target was 30–50.`);
  out(`4. **Positions, tier-matched, per pick (0 when he did not play), as a share of a forward:** GK ${f2(sharePick.G)} · DEF ${f2(sharePick.D)} · MID ${f2(sharePick.M)} · FWD 1.00. Target: GK and DEF at least ~0.70.`);
  out(`5. **Argentina:** top ${f1(argA)} vs random ${f1(argB)}.`);
  out(`6. **Captain:** additive; the ${MAX_MULTIPLIER}× cap stays in the rules and cannot bind under this ladder.`);
  out('');
}

out('## Rules under test');
out('');
{
  // Written from POINTS itself, so the report always states the table it ran.
  const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const LBL = [['goal', 'goal'], ['assist', 'assist'], ['clean_sheet', 'clean sheet (GK/DEF, 60+ min)', 'G'],
    ['conceded', 'conceded each (GK)', 'G'], ['save', 'save'], ['pen_saved', 'pen saved'], ['tackle', 'tackle'],
    ['interception', 'interception'], ['shot_on', 'shot on target'], ['shot_off', 'shot off target'],
    ['key_pass', 'key pass'], ['foul_drawn', 'foul drawn'], ['foul_committed', 'foul committed'],
    ['own_goal', 'own goal'], ['pen_missed', 'pen missed'], ['pen_committed', 'pen committed'], ['yellow', 'yellow'],
    ['red', 'red (replaces the yellow)'], ['offside', 'offside']];
  const table = LBL.map(([k, label, pos]) => `${label} ${sg(POINTS[k][pos || 'F'])}`).join(' · ');
  out(`- **Base points (v2)**: the table in \`api/_lib/scout-game.js\`, imported, not copied. ${table}. No appearance points. Reduced-feed fixtures: penalty fields score 0.`);
}
out('- **Tier**: from `player_tiers_at(league, season, deadline)`: each round is tiered only on fixtures that kicked off before its deadline.');
out('- **Formation**: exactly one goalkeeper, two defenders, and two from midfield or attack in any mix (migration 023).');
out('- **Captain (additive)**: +1 on the pick\'s multiplier. **Negative base**: counted once, unscaled. **Contrarian**: not simulated (no real ownership yet).');
out('');
out('## Method');
out('');
out('- **Pool** for a round: players with at least one appearance in that competition before the deadline whose latest club plays in the round. "Tiered" means at or above the minutes threshold (max(270, 30% of club minutes)).');
out('- **A pick who does not play scores 0.**');
out('- **Captain** = the pick with the highest expected value: mean base per appearance before the deadline × tier multiplier.');
out(`- **(a)** the five highest tiers (composite breaks ties); **(b)** five random tiered players, ${DRAWS} draws per round; **(c)** the five lowest tiers; **(d)** five random *unranked* players, ${DRAWS} draws per round. All in the formation.`);
out(`- Random draws use a fixed seed (${SEED}). Early rounds (fewer than 50 tiered players: ${pools.filter((p) => p.early).length} of ${pools.length}) are left out of every table below.`);
out('');

out('## 1. What one pick of each tier earns, and the ladder it gives');
out('');
out('Realised base points per pick per round (0 when the player did not play). Multiplier = 1 + (1/r − 1)/2, rounded to 0.05.');
out('');
out('| Tier | picks | mean base | played | r = base ÷ tier 5 | multiplier |');
out('|---|---|---|---|---|---|');
for (const k of ['tier 5', 'tier 4', 'tier 3', 'tier 2', 'tier 1', 'unranked']) {
  const t = tierBase[k];
  if (!t) continue;
  const mult = k === 'unranked' ? `${DERIVED_UNRANKED} (as tier 1)` : DERIVED[Number(k.slice(5))];
  out(`| ${k} | ${t.base.length.toLocaleString('en')} | ${mean(t.base).toFixed(2)} | ${Math.round(100 * t.played / t.base.length)}% | ${ratio(k).toFixed(2)} | ${mult} |`);
}
out('');

function perLeague(variant) {
  out('| League | rounds | (a) top 5 tiers | (b) random 5 tiered | (c) bottom 5 tiers | (d) unranked only |');
  out('|---|---|---|---|---|---|');
  for (const s of SLUGS) {
    const cells = STRATS.map(([k]) => {
      const v = results[variant][`${k}:main`]?.[s] || [];
      return v.length ? `${f1(mean(v))} ± ${f1(sd(v))}` : '—';
    });
    out(`| ${LABEL[s]} | ${(results[variant]['a:main'][s] || []).length} | ${cells.join(' | ')} |`);
  }
  const cells = STRATS.map(([k]) => { const v = all(variant, `${k}:main`); return `${f1(mean(v))} ± ${f1(sd(v))}`; });
  out(`| **All leagues** | ${all(variant, 'a:main').length} | ${cells.join(' | ')} |`);
  out('');
}

out('## 2. Strategies per league, derived ladder');
out('');
out('Mean round points ± SD; each (a)/(c) cell is one entry per round, (b)/(d) pool all draws.');
out('');
perLeague(MAIN);

out('## 3. Variants, all leagues');
out('');
out('| Variant | (a) top | (b) random | (c) bottom | (d) unranked | a − b | c ÷ b | (d) beats (a)? |');
out('|---|---|---|---|---|---|---|---|');
for (const v of VARIANTS) {
  const m = Object.fromEntries(STRATS.map(([k]) => [k, all(v.key, `${k}:main`)]));
  const ma = mean(m.a), mb = mean(m.b), mc = mean(m.c), md = mean(m.d);
  out(`| ${v.main ? `**${v.key}**` : v.key} | ${f1(ma)} ± ${f1(sd(m.a))} | ${f1(mb)} ± ${f1(sd(m.b))} | `
    + `${f1(mc)} ± ${f1(sd(m.c))} | ${f1(md)} ± ${f1(sd(m.d))} | ${f1(ma - mb)} | ${(mc / mb).toFixed(2)} | ${md > ma ? '**yes**' : 'no'} |`);
}
out('');

out('## 4. Positions, tier-matched');
out('');
out('Within each tier, a position\'s mean base over the forwards\' in the same tier, averaged over the five tiers. "Per pick" counts 0 when the player did not play (what a lineup choice actually gets); "per appearance" only the matches he played.');
out('');
out('| | GK | DEF | MID | FWD |');
out('|---|---|---|---|---|');
out(`| per pick, ÷ FWD | ${f2(sharePick.G)} | ${f2(sharePick.D)} | ${f2(sharePick.M)} | 1.00 |`);
out(`| per appearance, ÷ FWD | ${f2(shareApp.G)} | ${f2(shareApp.D)} | ${f2(shareApp.M)} | 1.00 |`);
out('');
out('Mean base per pick by tier and position:');
out('');
out('| Tier | GK | DEF | MID | FWD |');
out('|---|---|---|---|---|');
for (const t of [5, 4, 3, 2, 1]) {
  const tp = tierPos[`tier ${t}`] || {};
  out(`| tier ${t} | ${['G', 'D', 'M', 'F'].map((p) => (tp[p] ? `${f2(mean(tp[p].pick))} (n ${tp[p].pick.length})` : '—')).join(' | ')} |`);
}
out('');

out('## 5. Where the points come from');
out('');
out('Every player-fixture row we hold, all rounds. Points per appearance by event and position, and each event\'s share of all positive points. A row that dominates would show here.');
out('');
out('| Event | GK | DEF | MID | FWD | share of + points |');
out('|---|---|---|---|---|---|');
{
  const pos = Object.values(byEvent).reduce((s, e) => s + Object.values(e).filter((x) => x > 0).reduce((a, b) => a + b, 0), 0);
  const rowsE = Object.entries(byEvent).sort((x, y) => Object.values(y[1]).reduce((a, b) => a + b, 0) - Object.values(x[1]).reduce((a, b) => a + b, 0));
  for (const [ev, v] of rowsE) {
    const tot = Object.values(v).reduce((a, b) => a + b, 0);
    out(`| ${ev} | ${['G', 'D', 'M', 'F'].map((p) => f2(v[p] / (appsByPos[p] || 1))).join(' | ')} | ${tot > 0 ? Math.round(100 * tot / pos) + '%' : '—'} |`);
  }
  const sums = ['G', 'D', 'M', 'F'].map((p) => f2(Object.values(byEvent).reduce((s, e) => s + e[p], 0) / (appsByPos[p] || 1)));
  out(`| **base per appearance** | ${sums.join(' | ')} | |`);
  out(`| appearances | ${['G', 'D', 'M', 'F'].map((p) => appsByPos[p].toLocaleString('en')).join(' | ')} | |`);
}
out('');

out('## 6. A typical fan round: five regulars from one Série A club');
out('');
out('Five of the club\'s players with the most minutes before the deadline, in the formation, captain by expected value, derived ladder.');
out('');
out('| club-rounds | p10 | median | p90 | mean ± SD |');
out('|---|---|---|---|---|');
out(`| ${fanAll.length} | ${f1(pct(fanAll, 0.1))} | ${f1(pct(fanAll, 0.5))} | ${f1(pct(fanAll, 0.9))} | ${f1(mean(fanAll))} ± ${f1(sd(fanAll))} |`);
out('');
out(`Positions picked across those entries: ${['G', 'D', 'M', 'F'].map((p) => `${POS_NAME[p]} ${fanPos[p]}`).join(' · ')}.`);
out('');
out('Per club:');
out('');
out('| Club | rounds | p10 | median | p90 | mean |');
out('|---|---|---|---|---|---|');
for (const [club, v] of [...fan.entries()].sort((x, y) => pct(y[1], 0.5) - pct(x[1], 0.5))) {
  out(`| ${club} | ${v.length} | ${f1(pct(v, 0.1))} | ${f1(pct(v, 0.5))} | ${f1(pct(v, 0.9))} | ${f1(mean(v))} |`);
}
out('');

out('## History: the v1 report (Day 3 points table)');
out('');
out('- The first ladder, 1× (tier 5) to 5× (tier 1), made picking the best players the worst strategy: top five 19.7 a round against random 37.0 and bottom five 37.8. A tier-1 pick earned 0.58 of a tier-5 pick, so any tier-1 multiplier above ~1.73× inverted the order.');
out('- Half compensation (1 · 1.05 · 1.1 · 1.2 · 1.35, unranked 1.35×) fixed it: top 19.7 > random 16.9 > bottom 11.7, unknowns 8.2. A fan round scored a median of 16.3 (p10 6.3, p90 33.8): too low to feel like anything happened, which is one reason for v2.');
out('- Argentina: top tiers trailed random under every ladder.');
out('');
out('## History: the proposed v2 table (10 Nov)');
out('');
out('The v2 table as first proposed had every positive event at two-thirds of today\'s values (goal +8, assist +5, clean sheet +5, save +1, tackle +1.2, interception +0.8, shot on +1.2, shot off +0.8, key pass +0.8, foul drawn +0.5) and goals conceded at −1. Run through this same script (lineup rule included):');
out('');
out('- Ladder 1 · 1.05 · 1.1 · 1.2 · 1.4, unranked 1.4×: the same as today\'s.');
out('- Strategies: top 32.9 > random 27.0 > bottom 19.0; unknowns alone 12.5.');
out('- **Fan round median 25.5** (p10 8.1, p90 51.2), under the 30–50 target. Without appearance points a player earns ~4.5 per appearance and ~22% of picks do not play, so five picks land near 25 whatever the row weights: only the overall scale moves the median.');
out('- **Tackles were 26% of all positive points**, twice goals (13%): a defender earned more from tackles (1.69 a match) than a forward from goals (1.28).');
out('- A tier-matched goalkeeper earned 0.68 of a forward, just under the ~0.70 target.');
out('');
out('Adopted instead: every positive event ×1.5 except the tackle (kept at 1.2), and goals conceded −0.5. Intermediate steps tested on the way: tackle 0.8 and conceded −0.5 alone (median 24.3, GK 0.85, tackles 19%); then positives ×1.25 (median 31.0).');
out('');
out('## History: the cap rule (020) before the fixed formation (023)');
out('');
out('Under "at most 1 GK and 2 of each outfield position" with today\'s table and ladder: top 47.6 > random 38.7 > bottom 26.8, unknowns 17.6; fan round median 37.3 (p10 13.5, p90 75.4). The fan entries then picked GK 502 · DEF 1,139 · MID 1,030 · FWD 389 times. The ladder is derived from what every pooled player earns, not from entries, so a lineup rule cannot move it.');
out('');
out('## Data notes');
out('');
out(`- Rounds excluded because a counting fixture has no player rows from the API: ${excluded.length ? excluded.join(', ') : 'none'}.`);
out('- Argentina\'s Apertura knockouts are not rounds (follow-up), so they are not here.');
out(`- Run time ${Math.round((Date.now() - t0) / 1000)}s.`);

process.stdout.write(L.join('\n') + '\n');
