// R6 parser tests — per-player rows from /fixtures?ids=, against real payloads.
//
//   node tests/players.test.js
//
// No dependencies and no test runner, like tagger.test.js. Exit code is 0 on
// success, 1 on any failure.
//
// Every case below is something the committed payloads actually contain. The
// fixtures are 26 real matches: two from the R6 probe, twenty from the 20-id
// batch (picked for high scores, so they carry own goals, red cards, VAR and
// the API's odd cases), two full-feed 0-0s, and the two fixtures that exposed
// the null-goals bug on production: a reduced-feed 0-0 and a 0-1 own goal.

import {
  parseFixture, parseRating, bioRow, POSITION_NAMES, CLEAN_SHEET_MINUTES, REDUCED_FEED_FIELDS,
} from '../api/_lib/players.js';
import { cmToNumber } from '../api/_lib/apifootball.js';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) passed++;
  else failures.push(detail ? `${name}\n      ${detail}` : name);
}

function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, `got  ${g}\n      want ${w}`);
}

export async function run(read) {
  const load = async (n) => JSON.parse(await read(`tests/fixtures/api-football/${n}.json`));
  const pair = (await load('fixtures_ids_detail')).response;
  const batch = (await load('fixtures_ids_20')).response;
  const goalless = (await load('fixtures_ids_goalless')).response;
  const reducedBug = (await load('fixtures_ids_reduced')).response;
  const all = [...pair, ...batch, ...goalless, ...reducedBug];
  const fx = (id) => all.find((f) => f.fixture.id === id);
  const parsed = new Map(all.map((f) => [f.fixture.id, parseFixture(f)]));

  /** The parsed row for a named player in a fixture. */
  const row = (id, name) => {
    const p = parsed.get(id);
    const who = p.players.find((x) => x.name.includes(name));
    return who && p.rows.find((r) => r.api_player_id === who.api_player_id);
  };
  /** The raw API statistics for a named player. */
  const raw = (id, name) => {
    for (const side of fx(id).players) for (const p of side.players) if (p.player.name.includes(name)) return p.statistics[0];
    return null;
  };

  // ── the batched endpoint ───────────────────────────────────────────────
  eq('ids: 20 fixtures returned for 20 ids', batch.length, 20);
  check('ids: every fixture carries players, events and lineups',
    all.every((f) => f.players?.length === 2 && Array.isArray(f.events) && f.lineups?.length === 2));

  // ── Série A 1492449 (0-3): nulls are zeros ─────────────────────────────
  const sa = parsed.get(1492449);
  eq('SA: 32 players appeared (14 unused subs have no row)', sa.rows.length, 32);
  eq('SA: 22 starters', sa.rows.filter((r) => r.started).length, 22);
  {
    // A player whose shots.total is null but whose shots.on is a number.
    const side = fx(1492449).players.flatMap((s) => s.players);
    const p = side.find((x) => x.statistics[0].games.minutes > 0 && x.statistics[0].shots.total === null);
    const r = sa.rows.find((x) => x.api_player_id === p.player.id);
    eq('SA: shots.total null -> 0', r.shots_total, 0);
  }
  eq('SA: GK conceded, derived = API', [row(1492449, 'Lucas Arcanjo').goals_conceded, raw(1492449, 'Lucas Arcanjo').goals.conceded], [3, 3]);
  eq('SA: away GK keeps a clean sheet', row(1492449, 'Fábio').clean_sheet, true);
  eq('SA: string rating "6" -> 6', row(1492449, 'Lucas Arcanjo').rating, 6);
  eq('SA: passes.accuracy is a count', row(1492449, 'Lucas Arcanjo').passes_accurate, 15);
  {
    const off = row(1492449, 'Caique');
    const on = row(1492449, 'Lucas Silva');
    eq('SA: subst `player` goes off at 46', [off.started, off.minute_off, off.minutes], [true, 46, 45]);
    eq('SA: subst `assist` comes on at 46', [on.started, on.minute_on, on.minutes], [false, 46, 45]);
    eq('SA: conceded while on the pitch splits at the substitution', [off.goals_conceded, on.goals_conceded], [2, 1]);
  }

  // ── Premier League 1557466 (1-0): the league that reports differently ──
  const pl = parsed.get(1557466);
  eq('PL: 31 appeared; 9 rows with minutes 0 dropped', pl.rows.length, 31);
  eq('PL: 22 starters from the lineups', pl.rows.filter((r) => r.started).length, 22);
  check('PL: the API substitute flag is false for everyone (why lineups decide)',
    fx(1557466).players.every((s) => s.players.every((p) => p.statistics[0].games.substitute === false)));
  check('PL: dribbles.past not provided -> null, not 0', pl.rows.every((r) => r.dribbles_past === null));
  check('PL: goals.conceded not provided -> goals_conceded_api null', pl.rows.every((r) => r.goals_conceded_api === null));
  eq('PL: home GK clean sheet, derived without the API figure', row(1557466, 'Roefs').clean_sheet, true);
  eq('PL: away GK conceded 1', [row(1557466, 'Penders').goals_conceded, row(1557466, 'Penders').clean_sheet], [1, false]);
  eq('PL: off at 4 minutes -> no clean sheet', [row(1557466, 'Xhaka').minutes, row(1557466, 'Xhaka').clean_sheet], [4, false]);
  eq('PL: on at 4 for 86 minutes -> clean sheet', [row(1557466, 'Ahoka').minute_on, row(1557466, 'Ahoka').minutes, row(1557466, 'Ahoka').clean_sheet], [4, 86, true]);
  check('PL: rating "0" belongs only to players who did not play',
    fx(1557466).players.every((s) => s.players.every((p) => p.statistics[0].games.rating !== '0' || p.statistics[0].games.minutes === 0)));

  // ── the null-goals bug: zero for the whole match is still zero ─────────
  {
    // 1491834: a FULL-feed 0-0 (the goalkeepers' goals.conceded is [0,0]) in
    // which the API still sends goals.total AND goals.assists null for every
    // player: Argentina's null-for-zero. The first R6 parser read that as "not
    // provided" and wrote null goals. This is the production regression.
    const raw0 = fx(1491834).players.flatMap((s) => s.players).filter((p) => p.statistics[0].games.minutes > 0);
    check('0-0: the API sends goals.total and assists null for everyone',
      raw0.every((p) => p.statistics[0].goals.total === null && p.statistics[0].goals.assists === null));
    const p = parsed.get(1491834);
    eq('0-0: score and goal events agree', [fx(1491834).goals.home, fx(1491834).goals.away, p.goalCheck.ok], [0, 0, true]);
    eq('0-0: a full feed by the goalkeeper anchor', p.reduced, false);
    check('0-0: goals = 0 for every row', p.rows.length > 20 && p.rows.every((r) => r.goals === 0),
      `${p.rows.filter((r) => r.goals !== 0).length} of ${p.rows.length} not 0`);
    check('0-0: assists = 0 for every row', p.rows.every((r) => r.assists === 0));
    check('0-0: cards, shots, key passes, saves = 0 or more, never null',
      p.rows.every((r) => ['yellow', 'red', 'shots_on', 'passes_key', 'saves'].every((c) => Number.isInteger(r[c]))));
    check('0-0: every 60+ minute player keeps a clean sheet',
      p.rows.filter((r) => r.minutes >= CLEAN_SHEET_MINUTES).every((r) => r.clean_sheet === true));
    check('0-0: penalty.won null for everyone in a full feed -> 0', p.rows.every((r) => r.pen_won === 0));
  }
  {
    // 1491868: 0-1 by an own goal, so no player's goals.total is 1 and the
    // whole column is null. The 31 production rows in 1-goal fixtures.
    const p = parsed.get(1491868);
    const og = fx(1491868).events.filter((e) => e.type === 'Goal');
    eq('0-1 own goal: the only goal is an own goal', og.map((e) => e.detail), ['Own Goal']);
    eq('0-1 own goal: score and goal events agree', p.goalCheck.ok, true);
    check('0-1 own goal: goals = 0 for every row', p.rows.length > 20 && p.rows.every((r) => r.goals === 0));
    const home = fx(1491868).teams.home.id;
    check('0-1 own goal: the side that scored it conceded 1, the other none',
      p.rows.filter((r) => r.started && r.minute_off === null).every((r) => r.goals_conceded === (r.api_team_id === home ? 1 : 0)));
  }
  {
    // Full-feed 0-0s: the API sends goals: 0 itself, and pen_won is all-null
    // there only because nobody won a penalty. Full feed means 0, not null.
    for (const id of [1557446, 1492448]) {
      const p = parsed.get(id);
      eq(`0-0 full ${id}: not a reduced feed, goal check passes`, [p.reduced, p.goalCheck.ok], [false, true]);
      check(`0-0 full ${id}: goals = 0 for every row`, p.rows.every((r) => r.goals === 0));
    }
    const fullNoPen = parsed.get(1492447);
    check('full feed: penalty.won null for everyone -> 0, not null',
      fx(1492447).players.flatMap((s) => s.players).every((x) => x.statistics[0].penalty.won === null)
        && fullNoPen.rows.every((r) => r.pen_won === 0 && r.pen_committed === 0));
  }
  {
    // The anchor decides, never the fields. Pinned to the fixtures it marks.
    const reducedIds = [...parsed.values()].filter((p) => p.reduced).map((p) => p.apiFixtureId).sort();
    eq('reduced feeds detected by the goalkeeper anchor', reducedIds,
      [1493217, 1550174, 1550186, 1552783, 1552796, 1557419, 1557464, 1557466, 1575213]);
    check('reduced feeds: all six fields are null for everyone in the RAW payload, every time',
      all.filter((f) => reducedIds.includes(f.fixture.id)).every((f) => f.players.flatMap((s) => s.players)
        .filter((p) => p.statistics[0].games.minutes > 0)
        .every((p) => ['goals.conceded', 'dribbles.past', 'penalty.won', 'penalty.commited', 'penalty.missed', 'penalty.saved']
          .every((path) => path.split('.').reduce((a, k) => a?.[k], p.statistics[0]) == null))));
    const leaks = [];
    for (const p of parsed.values()) {
      for (const r of p.rows) {
        for (const c of ['goals', 'assists', 'saves', 'shots_total', 'shots_on', 'passes_total', 'passes_key',
          'passes_accurate', 'tackles', 'blocks', 'interceptions', 'duels_total', 'duels_won',
          'dribbles_attempts', 'dribbles_success', 'dribbles_past', 'fouls_drawn', 'fouls_committed',
          'offsides', 'yellow', 'red', 'pen_won', 'pen_committed', 'pen_scored', 'pen_missed', 'pen_saved',
          'goals_conceded_api']) {
          const allowedNull = p.reduced && REDUCED_FEED_FIELDS.has(c);
          if (r[c] === null && !allowedNull) leaks.push(`${p.apiFixtureId}:${c}`);
          if (r[c] !== null && allowedNull) leaks.push(`${p.apiFixtureId}:${c} should be null`);
        }
      }
    }
    eq('no counting stat is null except the reduced-feed fields of a reduced feed', [...new Set(leaks)], []);
  }

  // ── own goals (1492402): the event's team is the team CREDITED ─────────
  {
    const og = fx(1492402).events.find((e) => e.type === 'Goal' && e.detail === 'Own Goal');
    const kaio = row(1492402, 'Kaio Jorge');
    eq('OG: credited to the home side, scored by an away player', [og.team.id, kaio.api_team_id], [794, 135]);
    eq('OG: counts against the scorer\'s own team (4 conceded)', kaio.goals_conceded, 4);
    check('OG: all four own goals in the batch still add up to the score',
      [1492402, 1492447, 1550174, 1570405].every((id) => parsed.get(id).goalCheck.ok));
  }

  // ── goals that do not add up ───────────────────────────────────────────
  eq('phantom goal: 1575193 matches only without the no-player goal',
    [parsed.get(1575193).goalCheck.ok, parsed.get(1575193).goalCheck.rule], [true, 'with_player']);
  eq('real goal with no player id: 1552796 matches with it counted',
    [parsed.get(1552796).goalCheck.ok, parsed.get(1552796).goalCheck.rule], [true, 'all']);
  check('every one of the 26 fixtures adds up to its score', [...parsed.values()].every((p) => p.goalCheck.ok),
    [...parsed.values()].filter((p) => !p.goalCheck.ok).map((p) => p.apiFixtureId).join(', '));
  {
    // A copy whose score is wrong must null conceded and clean sheet, not guess.
    const broken = JSON.parse(JSON.stringify(fx(1557466)));
    broken.goals.home = 3;
    const p = parseFixture(broken);
    eq('mismatch: goalCheck fails', p.goalCheck.ok, false);
    check('mismatch: conceded and clean sheet are null for every row',
      p.rows.every((r) => r.goals_conceded === null && r.clean_sheet === null));
  }

  // ── players the API cannot identify ────────────────────────────────────
  eq('id 0: skipped and counted', [parsed.get(1552783).unidentified, parsed.get(1552796).unidentified], [1, 2]);
  check('id 0: never stored as a player', [...parsed.values()].every((p) => p.rows.every((r) => r.api_player_id > 0)));

  // ── red card ends the window ───────────────────────────────────────────
  eq('red card: Kannemann off at 73', [row(1492416, 'Kannemann').minute_off, row(1492416, 'Kannemann').red], [73, 1]);

  // ── invariants over all 26 fixtures ────────────────────────────────────
  {
    const rows = [...parsed.values()].flatMap((p) => p.rows);
    const keys = [...parsed.values()].flatMap((p) => p.rows.map((r) => `${p.apiFixtureId}:${r.api_player_id}`));
    eq('no player twice in one fixture', keys.length - new Set(keys).size, 0);
    check('positions are G / D / M / F', rows.every((r) => r.position in POSITION_NAMES),
      [...new Set(rows.map((r) => r.position))].join(','));
    check('every row played', rows.every((r) => r.minutes > 0));
    check(`a clean sheet always means ${CLEAN_SHEET_MINUTES}+ minutes and nothing conceded`,
      rows.every((r) => !r.clean_sheet || (r.minutes >= CLEAN_SHEET_MINUTES && r.goals_conceded === 0)));
    check('passes_accurate never exceeds passes_total',
      rows.every((r) => r.passes_accurate === null || r.passes_accurate <= r.passes_total));
    const gk = rows.filter((r) => r.position === 'G' && r.goals_conceded_api !== null);
    check('every GK figure the API sends matches the derived one', gk.length >= 10 && gk.every((r) => r.goals_conceded === r.goals_conceded_api),
      `${gk.length} GK rows; mismatches: ${gk.filter((r) => r.goals_conceded !== r.goals_conceded_api).length}`);
    eq('22 starters in every fixture with full lineups',
      [...parsed.values()].filter((p) => p.unidentified === 0).every((p) => p.rows.filter((r) => r.started).length === 22), true);
  }

  // ── small helpers ──────────────────────────────────────────────────────
  eq('rating: strings and the "0" of an unused sub', [parseRating('6.68'), parseRating('0'), parseRating(null), parseRating('')], [6.68, null, null, null]);
  {
    const page = await load('players_page1');
    const heights = page.response.map((e) => [e.player.height, bioRow(e, cmToNumber).height_cm]);
    check('bio: "184 cm" and "190" both become a number',
      heights.every(([h, n]) => h === null || n === parseInt(h, 10)),
      JSON.stringify(heights.slice(0, 5)));
    const b = bioRow(page.response[0], cmToNumber);
    check('bio: carries the fields the table needs', ['api_player_id', 'name', 'nationality', 'height_cm', 'birth_date', 'photo_url'].every((k) => k in b));
  }

  return { passed, failures };
}

// ── node entry point ──────────────────────────────────────────────────────
async function isMain() {
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) return false;
  if (!process.argv[1]) return false;
  const { pathToFileURL } = await import('node:url');
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (await isMain()) {
  const { readFileSync } = await import('node:fs');
  const read = async (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const { passed: p, failures: f } = await run(read);
  for (const msg of f) console.log(`  FAIL  ${msg}`);
  console.log(`\n${p} passed, ${f.length} failed`);
  process.exit(f.length ? 1 : 0);
}
