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
 * Scoring v2 (Nov 2026), Cartola-style, from our own player_fixture_stats.
 * No appearance points: a player earns only what he does.
 *
 * The proposed table had every positive event at two-thirds of these values.
 * The backtest (docs/backtest-2026-11.md) found two problems with it: a fan
 * round's median was 25.5 (target 30-50), because without appearance points
 * five picks land near 25 whatever the weights; and tackles were 26% of all
 * positive points, twice goals. So every positive event is x1.5 except the
 * tackle, which stays at 1.2, and goals conceded is -0.5, not -1, which also
 * lifts a goalkeeper from 0.68 to 0.86 of a tier-matched forward.
 *
 * Values are in quarters (foul drawn 0.75), so base_points is stored to two
 * decimals (migration 022).
 */
const ALL = (v) => ({ G: v, D: v, M: v, F: v });
export const POINTS = {
  goal:           ALL(12),
  assist:         ALL(7.5),
  clean_sheet:    { G: 7.5, D: 7.5, M: 0, F: 0 }, // 60+ minutes, nothing conceded while on
  conceded:       { G: -0.5, D: 0, M: 0, F: 0 },  // each, while on the pitch
  save:           ALL(1.5),
  pen_saved:      ALL(10.5),
  tackle:         ALL(1.2),                       // not scaled: it dominated at x1.5
  interception:   ALL(1.2),
  shot_on:        ALL(1.8),
  shot_off:       ALL(1.2),                       // shots_total - shots_on
  key_pass:       ALL(1.2),
  foul_drawn:     ALL(0.75),
  foul_committed: ALL(-0.3),
  own_goal:       ALL(-3),                      // from fixture_events
  pen_missed:     ALL(-4),
  pen_committed:  ALL(-1),
  yellow:         ALL(-1),
  red:            ALL(-3),                      // replaces the yellow
  offside:        ALL(-0.1),
};

/**
 * Tier 5 is the obvious pick and pays least; tier 1 the least rated and pays
 * most. "Half compensation": each tier is paid back half its earning gap to
 * tier 5, 1 + (1/r - 1) / 2 with r = its realised base over tier 5's.
 *
 * Derived from the v2 points in docs/backtest-2026-11.md (rounded to 0.05):
 * tier 1 earns 0.57 of tier 5, which gives 1.4. The very first ladder (1x ..
 * 5x) was rejected by the v1 backtest: it made picking the best players the
 * worst strategy.
 */
export const TIER_MULTIPLIER = { 5: 1, 4: 1.05, 3: 1.1, 2: 1.2, 1: 1.4 };
/** Below the minutes threshold: paid like tier 1. They play only ~40% of the time. */
export const UNRANKED_MULTIPLIER = 1.4;

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
 * though the current ladder cannot reach it (1.4 + 1 + 0.5 = 2.9x): it binds
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
 *     conceded penalty; pen_saved / pen_missed / pen_committed null (reduced
 *     feed) -> 0. No appearance points: a row with no events scores 0.
 */
export function basePoints(row, ownGoals = 0) {
  const pos = POS.has(row.position) ? row.position : 'M';
  const n = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : 0);
  const breakdown = {};
  const add = (key, count, points) => {
    if (count || points) breakdown[key] = { count, points: round2(points) };
  };

  // One counted stat: `count` events at `per` points each, under `key`.
  const each = (key, count, per) => add(key, count, count * per);

  each('goals', n(row.goals), POINTS.goal[pos]);
  each('assists', n(row.assists), POINTS.assist[pos]);

  if (row.clean_sheet === true && POINTS.clean_sheet[pos]) add('clean_sheet', 1, POINTS.clean_sheet[pos]);
  if (row.goals_conceded !== null && row.goals_conceded !== undefined && POINTS.conceded[pos]) {
    each('conceded', n(row.goals_conceded), POINTS.conceded[pos]);
  }

  each('saves', n(row.saves), POINTS.save[pos]);
  each('pen_saved', n(row.pen_saved), POINTS.pen_saved[pos]);
  each('tackles', n(row.tackles), POINTS.tackle[pos]);
  each('interceptions', n(row.interceptions), POINTS.interception[pos]);

  const shotsOn = n(row.shots_on);
  each('shots_on', shotsOn, POINTS.shot_on[pos]);
  each('shots_off', Math.max(0, n(row.shots_total) - shotsOn), POINTS.shot_off[pos]);
  each('key_passes', n(row.passes_key), POINTS.key_pass[pos]);
  each('fouls_drawn', n(row.fouls_drawn), POINTS.foul_drawn[pos]);
  each('fouls_committed', n(row.fouls_committed), POINTS.foul_committed[pos]);
  each('offsides', n(row.offsides), POINTS.offside[pos]);

  each('pen_missed', n(row.pen_missed), POINTS.pen_missed[pos]);
  each('pen_committed', n(row.pen_committed), POINTS.pen_committed[pos]);
  each('own_goals', n(ownGoals), POINTS.own_goal[pos]);

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
