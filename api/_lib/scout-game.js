// The Scout Game's rules: base points, the tier ladder, captain, contrarian.
//
// Pure: no network, no database. The job (api/cron/player-stats.js), the
// backtest (scripts/backtest-scout-game.mjs) and tests/scout-game.test.js all
// score with these functions, so the game and its backtest cannot drift.
//
// Free, points only, nothing of value to win. The tier formula itself lives in
// SQL (player_tiers_at, migration 017); this file maps a tier to a multiplier.

/**
 * Base points per event, by position (G / D / M / F as played in the fixture).
 * Agreed Day 3. The rows marked "gap" were not in the original spec and were
 * filled then: saves, penalty saved, shots on target, key passes, penalty
 * missed, own goal, and goals conceded.
 */
export const POINTS = {
  minutes_1_59:  { G: 1, D: 1, M: 1, F: 1 },
  minutes_60:    { G: 2, D: 2, M: 2, F: 2 },
  goal:          { G: 6, D: 6, M: 5, F: 4 },
  assist:        { G: 3, D: 3, M: 3, F: 3 },
  clean_sheet:   { G: 4, D: 4, M: 1, F: 0 },   // 60+ minutes, nothing conceded while on
  per_2_conceded:{ G: -1, D: -1, M: 0, F: 0 }, // gap: while on the pitch
  per_3_saves:   { G: 1, D: 0, M: 0, F: 0 },   // gap
  pen_saved:     { G: 5, D: 0, M: 0, F: 0 },   // gap
  shot_on:       { G: 0, D: 0.5, M: 0.5, F: 0.5 }, // gap
  key_pass:      { G: 0, D: 0.5, M: 0.5, F: 0.5 }, // gap
  pen_missed:    { G: -2, D: -2, M: -2, F: -2 },   // gap
  own_goal:      { G: -2, D: -2, M: -2, F: -2 },   // gap: from fixture_events
  yellow:        { G: -1, D: -1, M: -1, F: -1 },
  red:           { G: -3, D: -3, M: -3, F: -3 },   // replaces the yellow
};

/**
 * Tier 5 is the obvious pick and pays least; tier 1 the least rated and pays
 * most. "Half compensation": each tier is paid back half its earning gap to
 * tier 5, 1 + (1/r - 1) / 2 with r = its realised base over tier 5's.
 *
 * Adopted after docs/backtest-2026-11.md. The first ladder (1x .. 5x) made
 * picking the best players the worst strategy: a tier-1 pick earns 0.58 of a
 * tier-5 pick, so any tier-1 multiplier above ~1.73x inverts the order. Under
 * this ladder the top tiers beat random picks by ~17% and the bottom tiers
 * stay within reach.
 */
export const TIER_MULTIPLIER = { 5: 1, 4: 1.05, 3: 1.1, 2: 1.2, 1: 1.35 };
/** Below the minutes threshold: paid like tier 1. They play only ~40% of the time. */
export const UNRANKED_MULTIPLIER = 1.35;

/**
 * Captain. 'additive' (the default): the captain adds +100% of base, i.e. +1
 * to the pick's multiplier. 'multiplicative' doubles the whole multiplier and
 * exists for the backtest comparison only.
 */
export const CAPTAIN_MODE = 'additive';

/** Contrarian: under this share of a round's entries, with enough of them. */
export const CONTRARIAN = { maxOwnershipPct: 5, minParticipants: 50, bonus: 0.5 };

/**
 * No single pick's effective multiplier ever exceeds this. A rule, kept even
 * though the current ladder cannot reach it (1.35 + 1 + 0.5 = 2.85x): it binds
 * any future ladder too.
 */
export const MAX_MULTIPLIER = 6;

const POS = new Set(['G', 'D', 'M', 'F']);

/** The multiplier a tier earns. null/undefined tier = unranked. */
export function tierMultiplier(tier, unranked = UNRANKED_MULTIPLIER) {
  return TIER_MULTIPLIER[tier] ?? unranked;
}

/**
 * The effective multiplier for one pick, capped at MAX_MULTIPLIER.
 *   additive:        tier + 1 (captain) + 0.5 (contrarian)
 *   multiplicative:  tier x 2 (captain) x 1.5 (contrarian)
 */
export function effectiveMultiplier({ tierMult, captain = false, contrarian = false, mode = CAPTAIN_MODE }) {
  let m;
  if (mode === 'multiplicative') {
    m = tierMult * (captain ? 2 : 1) * (contrarian ? 1 + CONTRARIAN.bonus : 1);
  } else {
    m = tierMult + (captain ? 1 : 0) + (contrarian ? CONTRARIAN.bonus : 0);
  }
  return Math.min(MAX_MULTIPLIER, m);
}

/**
 * A pick's total for one fixture. The multiplier applies only to a POSITIVE
 * base: a negative base counts once, unscaled, so an unknown's red card costs
 * what anyone's does.
 */
export function pickTotal(base, multiplier) {
  if (!(base > 0)) return round2(base);
  return round2(base * multiplier);
}

/**
 * Base points for one player_fixture_stats row (a parser row has the same
 * fields). `ownGoals` comes from fixture_events, since no player row carries
 * it. Returns { base, breakdown }; breakdown[k] = { count, points }.
 *
 * Data limits, deliberately not guessed:
 *   goals_conceded null (goal events did not add up) -> no clean sheet, no
 *     conceded penalty; pen_saved / pen_missed null (reduced feed) -> 0.
 */
export function basePoints(row, ownGoals = 0) {
  const pos = POS.has(row.position) ? row.position : 'M';
  const n = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : 0);
  const breakdown = {};
  const add = (key, count, points) => {
    if (count || points) breakdown[key] = { count, points: round2(points) };
  };

  const minutes = n(row.minutes);
  if (minutes >= 60) add('minutes', minutes, POINTS.minutes_60[pos]);
  else if (minutes > 0) add('minutes', minutes, POINTS.minutes_1_59[pos]);

  const goals = n(row.goals);
  add('goals', goals, goals * POINTS.goal[pos]);
  const assists = n(row.assists);
  add('assists', assists, assists * POINTS.assist[pos]);

  if (row.clean_sheet === true) add('clean_sheet', 1, POINTS.clean_sheet[pos]);
  if (row.goals_conceded !== null && row.goals_conceded !== undefined) {
    const c = n(row.goals_conceded);
    add('conceded', c, Math.floor(c / 2) * POINTS.per_2_conceded[pos]);
  }

  const saves = n(row.saves);
  add('saves', saves, Math.floor(saves / 3) * POINTS.per_3_saves[pos]);
  const penSaved = n(row.pen_saved);
  add('pen_saved', penSaved, penSaved * POINTS.pen_saved[pos]);

  const shots = n(row.shots_on);
  add('shots_on', shots, shots * POINTS.shot_on[pos]);
  const keyPasses = n(row.passes_key);
  add('key_passes', keyPasses, keyPasses * POINTS.key_pass[pos]);

  const penMissed = n(row.pen_missed);
  add('pen_missed', penMissed, penMissed * POINTS.pen_missed[pos]);
  const og = n(ownGoals);
  add('own_goals', og, og * POINTS.own_goal[pos]);

  // A red replaces the yellow (a second yellow arrives as yellow 1 + red 1).
  if (n(row.red) > 0) add('red', 1, POINTS.red[pos]);
  else if (n(row.yellow) > 0) add('yellow', 1, POINTS.yellow[pos]);

  const base = round2(Object.values(breakdown).reduce((s, b) => s + b.points, 0));
  return { base, breakdown, position: pos };
}

/**
 * Score one pick in one fixture: base points, then its locked multiplier.
 * `pick` = { locked_multiplier, locked_tier, is_captain, locked_contrarian }.
 */
export function scorePick(row, pick, { ownGoals = 0, mode = CAPTAIN_MODE } = {}) {
  const { base, breakdown } = basePoints(row, ownGoals);
  const tierMult = pick.locked_multiplier != null
    ? Number(pick.locked_multiplier)
    : tierMultiplier(pick.locked_tier);
  const multiplier = effectiveMultiplier({
    tierMult,
    captain: Boolean(pick.is_captain),
    contrarian: Boolean(pick.locked_contrarian),
    mode,
  });
  return { base, breakdown, multiplier, total: pickTotal(base, multiplier) };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}
