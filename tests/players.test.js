// R6 parser tests — per-player rows from /fixtures?ids=, against real payloads.
//
//   node tests/players.test.js
//
// No dependencies and no test runner, like tagger.test.js. Exit code is 0 on
// success, 1 on any failure.
//
// Every case below is something the committed payloads actually contain. The
// fixtures are 22 real matches: two from the R6 probe and twenty from the
// 20-id batch, picked for high scores so they carry own goals, red cards, VAR
// and the API's odd cases (a phantom goal, players with id 0).

import { parseFixture, parseRating, bioRow, POSITION_NAMES, CLEAN_SHEET_MINUTES } from '../api/_lib/players.js';
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
  const all = [...pair, ...batch];
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
    eq('SA: shots.total null -> 0 when the field exists in the fixture', r.shots_total, 0);
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
  check('every one of the 22 fixtures adds up to its score', [...parsed.values()].every((p) => p.goalCheck.ok),
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

  // ── invariants over all 22 fixtures ────────────────────────────────────
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
