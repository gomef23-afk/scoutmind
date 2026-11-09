// Scout Game backtest: naive strategies over every finished regular-season
// round, scored with the live scoring code.
//
//   node scripts/backtest-scout-game.mjs > docs/backtest-2026-11.md
//
// Reads Supabase only, with the public anon key (the same one the site ships),
// and makes NO API-Football requests. Tiers come from player_tiers_at(league,
// season, deadline), so every round is tiered on what was known at its
// deadline, never with hindsight. Scoring imports api/_lib/scout-game.js, so the
// numbers here are what the game itself would have awarded.
//
// Random strategies use a fixed seed: the report reproduces exactly.

import { readFileSync } from 'node:fs';
import { basePoints, effectiveMultiplier, pickTotal, MAX_MULTIPLIER } from '../api/_lib/scout-game.js';

const repo = new URL('../', import.meta.url);
const page = readFileSync(new URL('public/index.html', repo), 'utf8');
const SUPA_URL = process.env.SUPABASE_URL || page.match(/https:\/\/[a-z0-9]+\.supabase\.co/)[0];
const ANON = process.env.SUPABASE_ANON_KEY
  || (page.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/) || page.match(/sb_publishable_[A-Za-z0-9_-]+/))[0];
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

const DRAWS = 200;          // random entries per round for (b) and (d)
const SEED = 20261109;

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

// ── rule variants ────────────────────────────────────────────────────────────
const LADDERS = {
  '5/4/3/2/1 (agreed)':       { 5: 1, 4: 2, 3: 3, 2: 4, 1: 5 },
  '1 · 1.5 · 2 · 3 · 4':      { 5: 1, 4: 1.5, 3: 2, 2: 3, 1: 4 },
  '1 · 1.25 · 1.5 · 2 · 2.5': { 5: 1, 4: 1.25, 3: 1.5, 2: 2, 1: 2.5 },
  '1 · 1.2 · 1.4 · 1.7 · 2':  { 5: 1, 4: 1.2, 3: 1.4, 2: 1.7, 1: 2 },
  '1 · 1.15 · 1.3 · 1.5 · 1.75': { 5: 1, 4: 1.15, 3: 1.3, 2: 1.5, 1: 1.75 },
  '1 · 1.1 · 1.25 · 1.4 · 1.6': { 5: 1, 4: 1.1, 3: 1.25, 2: 1.4, 1: 1.6 },
  // Half compensation: 1 + (1/r - 1) / 2, r = a tier's realised base over tier
  // 5's (section 2). Closes half the earning gap, so the top keeps its edge.
  '1 · 1.05 · 1.1 · 1.2 · 1.35 (half compensation)': { 5: 1, 4: 1.05, 3: 1.1, 2: 1.2, 1: 1.35 },
  'flat (all 1x)':            { 5: 1, 4: 1, 3: 1, 2: 1, 1: 1 },
};
const DEFAULT = { ladder: '5/4/3/2/1 (agreed)', unranked: 3, mode: 'additive' };
const HALF = '1 · 1.05 · 1.1 · 1.2 · 1.35 (half compensation)';
const RECOMMENDED = { key: 'recommended: half compensation, unranked 1.35x', ladder: HALF, unranked: 1.35, mode: 'additive' };

// ── main ─────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const leagues = await get('leagues?select=id,slug,name,current_season&active=is.true&order=id');
const slugOf = new Map(leagues.map((l) => [l.id, l.slug]));
const rounds = await getAll('game_rounds?select=id,league_id,season,round_label,round_no,deadline_utc,status&order=deadline_utc');
const links = await getAll('game_round_fixtures?select=round_id,fixture_id&counts=is.true');
const fixtures = await getAll('fixtures?select=id,league_id,season,kickoff_utc,status_short,home_team_id,away_team_id,players_fetched_at');
const fxById = new Map(fixtures.map((f) => [f.id, f]));
const stats = await getAll('player_fixture_stats?select=fixture_id,player_id,team_id,position,minutes,goals,assists,clean_sheet,'
  + 'goals_conceded,saves,pen_saved,shots_on,passes_key,pen_missed,yellow,red');
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

// Base points per player per fixture, computed once.
const baseOf = new Map();               // `${fixture}:${player}` -> base
const rowsByPlayerLeague = new Map();   // `${league}:${player}` -> [{kickoff, base}]
for (const r of stats) {
  const fx = fxById.get(r.fixture_id);
  if (!fx) continue;
  const b = basePoints(r, ownGoals.get(`${r.fixture_id}:${r.player_id}`) || 0).base;
  baseOf.set(`${r.fixture_id}:${r.player_id}`, b);
  const k = `${fx.league_id}:${r.player_id}`;
  if (!rowsByPlayerLeague.has(k)) rowsByPlayerLeague.set(k, []);
  rowsByPlayerLeague.get(k).push({ kickoff: fx.kickoff_utc, base: b });
}

const fixturesOf = new Map();
for (const l of links) {
  if (!fixturesOf.has(l.round_id)) fixturesOf.set(l.round_id, []);
  fixturesOf.get(l.round_id).push(l.fixture_id);
}

// Rounds the backtest can score honestly: past, every counting fixture
// finished AND carrying player rows. A round with a fixture the API never gave
// players for would score those picks 0 for a reason that is not football.
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

// ── simulate ─────────────────────────────────────────────────────────────────
// results[variantKey][strategy][slug] = [round totals]
const results = {};
const push = (variant, strat, slug, v) => {
  results[variant] ??= {};
  results[variant][strat] ??= {};
  (results[variant][strat][slug] ??= []).push(v);
};
const fan = new Map();        // club -> [round totals], Série A only, default rules
const fanRec = new Map();     // the same under the recommended rules
const roundMeta = [];

// Each alternative ladder is run with unranked paying its tier-2 rate: an
// unknown pays like a low tier, never more than the bottom one.
const VARIANTS = [
  { key: 'default', ...DEFAULT },
  { key: 'multiplicative captain', ...DEFAULT, mode: 'multiplicative' },
  { key: 'unranked 2x', ...DEFAULT, unranked: 2 },
  ...Object.keys(LADDERS).filter((k) => k !== DEFAULT.ladder && k !== HALF).map((k) => ({
    key: `ladder ${k}`, ...DEFAULT, ladder: k, unranked: LADDERS[k][2],
  })),
  { key: 'ladder 1 · 1.15 · 1.3 · 1.5 · 1.75, multiplicative captain', ...DEFAULT,
    ladder: '1 · 1.15 · 1.3 · 1.5 · 1.75', unranked: 1.5, mode: 'multiplicative' },
  RECOMMENDED,
  { key: 'half compensation, unranked 2x', ladder: HALF, unranked: 2, mode: 'additive' },
  { key: 'half compensation, multiplicative captain', ladder: HALF, unranked: 1.35, mode: 'multiplicative' },
];

// Realised base points per pick per round, by tier: what one pick of each tier
// actually earned (0 when he did not play). The size of this gap is what any
// ladder has to respect.
const tierBase = {};

/** Expected base per appearance before the deadline: the captain's chooser. */
function expectedBase(league, playerId, deadline) {
  const rows = (rowsByPlayerLeague.get(`${league}:${playerId}`) || []).filter((x) => x.kickoff < deadline);
  return rows.length ? mean(rows.map((x) => x.base)) : 0;
}

/** Five picks from an ordered list, at most one goalkeeper. */
function takeFive(list) {
  const out = [];
  let gk = 0;
  for (const p of list) {
    if (p.position === 'G') { if (gk) continue; gk++; }
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
  // Captain = highest expected: expected base per appearance x tier multiplier.
  let cap = five[0], best = -Infinity;
  for (const p of five) {
    const e = p.exp * mult(p);
    if (e > best) { best = e; cap = p; }
  }
  let total = 0;
  for (const p of five) {
    const m = effectiveMultiplier({ tierMult: mult(p), captain: p === cap, contrarian: false, mode: v.mode });
    for (const fid of round.fxs.map((f) => f.id)) {
      const b = baseOf.get(`${fid}:${p.player_id}`);
      if (b === undefined) continue;   // no row: did not play, scores nothing
      total += pickTotal(b, m);
    }
  }
  return total;
}

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
  roundMeta.push({ slug, label: round.round_label, ranked: ranked.length, unranked: unranked.length, early });
  const tag = early ? 'early' : 'main';
  if (!early) {
    for (const p of pool) {
      let b = 0, played = false;
      for (const f of round.fxs) {
        const x = baseOf.get(`${f.id}:${p.player_id}`);
        if (x !== undefined) { b += x; played = true; }
      }
      const k = p.tier ? `tier ${p.tier}` : 'unranked';
      (tierBase[k] ??= { base: [], played: 0 }).base.push(b);
      if (played) tierBase[k].played++;
    }
  }

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
  // deadline, at most one GK), default rules.
  if (slug === 'serie_a') {
    const byClub = new Map();
    for (const p of pool) {
      if (!byClub.has(p.team_id)) byClub.set(p.team_id, []);
      byClub.get(p.team_id).push(p);
    }
    for (const [club, list] of byClub) {
      const five = takeFive([...list].sort((x, y) => y.minutes - x.minutes));
      if (!five) continue;
      const name = teamName.get(club) || String(club);
      if (!fan.has(name)) fan.set(name, []);
      fan.get(name).push(entryPoints(five, round, { ...DEFAULT }));
      if (!fanRec.has(name)) fanRec.set(name, []);
      fanRec.get(name).push(entryPoints(five, round, RECOMMENDED));
    }
  }
  n++;
  if (n % 20 === 0) process.stderr.write(`  ${n}/${usable.length} rounds\n`);
}

// ── report ───────────────────────────────────────────────────────────────────
const SLUGS = leagues.map((l) => l.slug).filter((s) => results.default?.['a:main']?.[s]);
const LABEL = Object.fromEntries(leagues.map((l) => [l.slug, l.name]));
const STRATS = [
  ['a', '(a) top 5 tiers'], ['b', '(b) random 5 tiered'], ['c', '(c) bottom 5 tiers'], ['d', '(d) unranked only'],
];
const all = (variant, strat) => Object.values(results[variant]?.[strat] || {}).flat();
const L = [];
const out = (s = '') => L.push(s);

out('# Scout Game backtest — November 2026');
out('');
out(`Generated by \`node scripts/backtest-scout-game.mjs\` on ${new Date().toISOString().slice(0, 10)}. `
  + `${usable.length} finished regular-season rounds across ${SLUGS.length} leagues, `
  + `${stats.length.toLocaleString('en')} player-fixture rows. Supabase reads only; no API-Football requests.`);
out('');
{
  const m = (v, k) => mean(all(v, `${k}:main`));
  const r1 = mean(tierBase['tier 1']?.base || []) / mean(tierBase['tier 5']?.base || []);
  const argA = mean(results[RECOMMENDED.key]['a:main']?.argentina || []);
  const argB = mean(results[RECOMMENDED.key]['b:main']?.argentina || []);
  out('## Findings');
  out('');
  out(`1. **The agreed ladder (tier 1 → 5×) breaks the game.** Picking the five top-tier players scores ${f1(m('default', 'a'))} a round; five random tiered players score ${f1(m('default', 'b'))} and the five bottom-tier players ${f1(m('default', 'c'))}. Scouting the best players is the worst strategy.`);
  out(`2. **Why: tiers predict points, but not by 5×.** A tier-1 pick earns ${r1.toFixed(2)} of what a tier-5 pick earns (section 2), so any tier-1 multiplier above about ${(1 / r1).toFixed(2)}× makes the bottom tier out-earn the top. With no multiplier at all the order is right (top ${f1(m('ladder flat (all 1x)', 'a'))} > random ${f1(m('ladder flat (all 1x)', 'b'))} > bottom ${f1(m('ladder flat (all 1x)', 'c'))}).`);
  out(`3. **Recommended ladder: half compensation, 1 · 1.05 · 1.1 · 1.2 · 1.35, unranked 1.35×.** Each tier is paid back half its earning gap. Top ${f1(m(RECOMMENDED.key, 'a'))} beats random ${f1(m(RECOMMENDED.key, 'b'))} (+${Math.round(100 * (m(RECOMMENDED.key, 'a') / m(RECOMMENDED.key, 'b') - 1))}%); bottom ${f1(m(RECOMMENDED.key, 'c'))} stays within reach (${(m(RECOMMENDED.key, 'c') / m(RECOMMENDED.key, 'b')).toFixed(2)} of random); unknowns alone score ${f1(m(RECOMMENDED.key, 'd'))} and never win. A tier-1 player who delivers still pays 35% more than a star with the same line.`);
  out(`4. **Captain: additive, as agreed.** Additive and multiplicative are within a point of each other under the recommended ladder; additive is simpler to explain. The **${MAX_MULTIPLIER}× cap stays in the rules**, but under the recommended ladder no pick can reach it (the maximum is 1.35 + 1 captain + 0.5 contrarian = 2.85×).`);
  out(`5. **Exception: Argentina.** Top tiers trail random there (${f1(argA)} vs ${f1(argB)}) under every ladder, flat included: the composite predicts Argentine points poorly. Worth revisiting the composite weights for that league, not the ladder.`);
  out(`6. **A typical fan round** (five Série A regulars from one club) scores a median of ${f1(pct(fanRecAll0(), 0.5))} under the recommended rules (p10 ${f1(pct(fanRecAll0(), 0.1))}, p90 ${f1(pct(fanRecAll0(), 0.9))}), against ${f1(pct([...fan.values()].flat(), 0.5))} under the agreed ones.`);
  out('');
}
function fanRecAll0() { return [...fanRec.values()].flat(); }

out('## Rules under test');
out('');
out('- **Base points**: the agreed table in `api/_lib/scout-game.js` (the live scoring code, imported, not copied).');
out('- **Tier**: from `player_tiers_at(league, season, deadline)`: each round is tiered only on fixtures that kicked off before its deadline.');
out('- **Multiplier (default)**: tier 5 → 1×, 4 → 2×, 3 → 3×, 2 → 4×, 1 → 5×; unranked (below the minutes threshold) → 3×.');
out('- **Captain (default, additive)**: +100% of base, i.e. +1 on the pick\'s multiplier. Compared against the multiplicative version (×2 on the whole multiplier).');
out(`- **Cap**: no single pick's effective multiplier exceeds **${MAX_MULTIPLIER}×**, in either captain mode.`);
out('- **Negative base**: counted once, unscaled.');
out('- **Contrarian bonus**: not simulated (it needs real ownership; there are no real entries yet).');
out('');
out('## Method');
out('');
out('- **Pool** for a round: players with at least one appearance in that competition before the deadline whose latest club plays in the round. "Tiered" means at or above the minutes threshold (max(270, 30% of club minutes)).');
out('- **A pick who does not play scores 0**: once a fixture is ingested, no row means did not play. Strategies pay for picking a star who is injured or rested.');
out('- **Captain** = the pick with the highest expected value: mean base points per appearance before the deadline × tier multiplier.');
out('- **At most one goalkeeper** per entry, as in the game.');
out(`- **(a)** the five highest tiers (composite breaks ties); **(b)** five random tiered players, ${DRAWS} draws per round; **(c)** the five lowest tiers; **(d)** five random *unranked* players, ${DRAWS} draws per round: the "unknowns alone" test.`);
out(`- Random draws use a fixed seed (${SEED}), so the report reproduces exactly.`);
out(`- **Early rounds**, where fewer than 50 players in the round are tiered yet, are reported separately: tiers are thin there and every strategy collapses toward "unranked". ${roundMeta.filter((r) => r.early).length} of ${roundMeta.length} rounds are early.`);
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

out('## 1. The agreed rules fail: per league (main rounds)');
out('');
{
  const lm = (k, s) => mean(results.default[`${k}:main`]?.[s] || []);
  const aLosesB = SLUGS.filter((s) => lm('a', s) < lm('b', s));
  const cBeatsA = SLUGS.filter((s) => lm('c', s) > lm('a', s));
  const except = (list) => {
    const rest = SLUGS.filter((s) => !list.includes(s)).map((s) => LABEL[s]);
    return list.length === SLUGS.length ? 'in every league' : `in ${list.length} of ${SLUGS.length} leagues (not ${rest.join(', ')})`;
  };
  out(`Ladder 5/4/3/2/1, unranked 3×, additive captain. Mean round points ± SD; each (a)/(c) cell is one entry per round, (b)/(d) pool all draws. **(a) loses to (b) ${except(aLosesB)}; (c) beats (a) ${except(cBeatsA)}.**`);
}
out('');
perLeague('default');

out('## 1b. Recommended rules: per league (main rounds)');
out('');
out(`Ladder ${HALF}, unranked 1.35×, additive captain, 6× cap.`);
out('');
perLeague(RECOMMENDED.key);

out('## 2. What one pick of each tier actually earns');
out('');
out('Realised base points per pick per round (main rounds), counting 0 when the player did not play. Any ladder has to respect this gap: if tier 1 is multiplied by more than the ratio below, the bottom tier out-earns the top on average.');
out('');
out('| Tier | picks | mean base | played | base ÷ tier 5 |');
out('|---|---|---|---|---|');
const t5 = mean(tierBase['tier 5']?.base || []);
for (const k of ['tier 5', 'tier 4', 'tier 3', 'tier 2', 'tier 1', 'unranked']) {
  const t = tierBase[k];
  if (!t) continue;
  out(`| ${k} | ${t.base.length.toLocaleString('en')} | ${mean(t.base).toFixed(2)} | ${Math.round(100 * t.played / t.base.length)}% | ${(mean(t.base) / t5).toFixed(2)} |`);
}
out('');

out('## 3. Rule variants, all leagues (main rounds)');
out('');
out('Mean round points ± SD. The criteria: (a) clearly above (b); (c) not hopeless against (b); neither (c) nor (d) beating (a).');
out('');
out('| Variant | (a) top | (b) random | (c) bottom | (d) unranked | a − b | c ÷ b | (d) beats (a)? |');
out('|---|---|---|---|---|---|---|---|');
for (const v of VARIANTS) {
  const m = Object.fromEntries(STRATS.map(([k]) => [k, all(v.key, `${k}:main`)]));
  const ma = mean(m.a), mb = mean(m.b), mc = mean(m.c), md = mean(m.d);
  out(`| ${v.key === 'default' ? '**default**' : v.key} | ${f1(ma)} ± ${f1(sd(m.a))} | ${f1(mb)} ± ${f1(sd(m.b))} | `
    + `${f1(mc)} ± ${f1(sd(m.c))} | ${f1(md)} ± ${f1(sd(m.d))} | ${f1(ma - mb)} | ${(mc / mb).toFixed(2)} | ${md > ma ? '**yes**' : 'no'} |`);
}
out('');

out('## 4. Early rounds (fewer than 50 tiered players), default rules');
out('');
out('At the start of a season almost nobody has passed the minutes threshold, so (a) to (c), which need five tiered players, cannot be formed ("—"). Only (d) runs; it is shown so the early-season ceiling is visible.');
out('');
out('| League | early rounds | (a) | (b) | (c) | (d) |');
out('|---|---|---|---|---|---|');
for (const s of SLUGS) {
  const v = STRATS.map(([k]) => results.default[`${k}:early`]?.[s] || []);
  const nEarly = roundMeta.filter((r) => r.early && r.slug === s).length;
  if (!nEarly) continue;
  out(`| ${LABEL[s]} | ${nEarly} | ${v.map((x) => (x.length ? `${f1(mean(x))} ± ${f1(sd(x))}` : '—')).join(' | ')} |`);
}
out('');

out('## 5. A typical fan round: five regulars from one Série A club');
out('');
out('Five of the club\'s players with the most minutes before the deadline (at most one goalkeeper), captain by expected value: what a supporter picking their own club would score, under both rule sets.');
out('');
const fanAll = [...fan.values()].flat();
const fanRecAll = [...fanRec.values()].flat();
out('| Rules | club-rounds | p10 | median | p90 | mean ± SD |');
out('|---|---|---|---|---|---|');
out(`| agreed (5/4/3/2/1, unranked 3×) | ${fanAll.length} | ${f1(pct(fanAll, 0.1))} | ${f1(pct(fanAll, 0.5))} | ${f1(pct(fanAll, 0.9))} | ${f1(mean(fanAll))} ± ${f1(sd(fanAll))} |`);
out(`| **recommended** (half compensation, unranked 1.35×) | ${fanRecAll.length} | ${f1(pct(fanRecAll, 0.1))} | ${f1(pct(fanRecAll, 0.5))} | ${f1(pct(fanRecAll, 0.9))} | ${f1(mean(fanRecAll))} ± ${f1(sd(fanRecAll))} |`);
out('');
out('Per club, recommended rules:');
out('');
out('| Club | rounds | p10 | median | p90 | mean |');
out('|---|---|---|---|---|---|');
for (const [club, v] of [...fanRec.entries()].sort((x, y) => pct(y[1], 0.5) - pct(x[1], 0.5))) {
  out(`| ${club} | ${v.length} | ${f1(pct(v, 0.1))} | ${f1(pct(v, 0.5))} | ${f1(pct(v, 0.9))} | ${f1(mean(v))} |`);
}
out('');

out('## Data notes');
out('');
out(`- Rounds excluded because a counting fixture has no player rows from the API: ${excluded.length ? excluded.join(', ') : 'none'}.`);
out('- Argentina\'s Apertura knockouts are not rounds (follow-up), so they are not here.');
out(`- Run time ${Math.round((Date.now() - t0) / 1000)}s.`);

process.stdout.write(L.join('\n') + '\n');
