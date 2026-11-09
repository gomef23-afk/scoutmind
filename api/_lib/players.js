// R6 — one /fixtures?ids= element -> per-player rows and the event timeline.
//
// Pure: no network, no database. The job maps API ids to our ids afterwards,
// and tests/players.test.js runs this against the committed payloads.
//
// What the probes established (tests/fixtures/api-football/fixtures_*.json):
//
//   * The `players` block is byte-identical to /fixtures/players, so the
//     batched endpoint costs 1 request per 20 fixtures instead of 1 per fixture.
//   * Counting stats use null for zero (rule 14), and that includes a stat that
//     is zero for the WHOLE match: `goals` in a 0-0, or in a 0-1 decided by an
//     own goal (1491868), is null for every player. So every counting stat
//     coalesces null -> 0. An earlier version treated "null for everyone" as
//     "not provided" and wrote null goals for every 0-0.
//   * The one real "not provided" case is a REDUCED FEED: some fixtures, in
//     every league, omit a fixed set of fields (REDUCED_FEED_FIELDS). It is
//     detected by an anchor, not inferred from the fields themselves: in a full
//     feed every goalkeeper's `goals.conceded` is a number, even 0; in a reduced
//     feed it is null for every goalkeeper. Across 22 real fixtures the anchor
//     matched the field pattern every time.
//   * `games.substitute` is wrong in the Premier League (false for everyone),
//     so `started` comes from `lineups.startXI`.
//   * Unused substitutes: `minutes` is null in Série A and 0 in the Premier
//     League, where `rating` is "0". Neither is an appearance, and neither gets
//     a row: once a fixture is ingested, no row means did not play.
//   * `rating` and `passes.accuracy` are strings. `passes.accuracy` is the COUNT
//     of accurate passes, not a percentage.
//   * `subst` events: `player` goes OFF, `assist` comes ON.
//   * Own goals: the event's `team` is the team CREDITED with the goal and
//     `player` is the opposing defender. So "a goal against my team" is any
//     goal event whose team is not mine, own goals included.
//   * A goal event with no player id is sometimes a phantom (1575193, 87', next
//     to a cancelled penalty, not in the score) and sometimes real (1552796,
//     86', a player the API could not identify). So goals are counted with
//     them first and without them second, and whichever matches the final
//     score is used. When neither does, conceded and clean sheet are null.
//   * Players the API cannot identify arrive with `id: 0` (1552783: 656976 in
//     the lineup and events, 0 in the players block). They cannot be stored,
//     since every one would collide on api_player_id = 0, so they are skipped
//     and counted in `unidentified`.
//   * The events array is NOT strictly chronological ("45+7" before "45"), so
//     the timeline sorts on (elapsed, extra) and uses array position only to
//     break ties.

export const POSITION_NAMES = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Attacker' };

/** Clean sheet: this many minutes, and nothing conceded while on the pitch. */
export const CLEAN_SHEET_MINUTES = 60;

// Column <- path inside statistics[0]. All counting stats: null means 0, except
// REDUCED_FEED_FIELDS in a reduced-feed fixture, which are not provided.
const COUNTS = {
  goals: 'goals.total',
  assists: 'goals.assists',
  saves: 'goals.saves',
  goals_conceded_api: 'goals.conceded',
  shots_total: 'shots.total',
  shots_on: 'shots.on',
  passes_total: 'passes.total',
  passes_key: 'passes.key',
  passes_accurate: 'passes.accuracy',
  tackles: 'tackles.total',
  blocks: 'tackles.blocks',
  interceptions: 'tackles.interceptions',
  duels_total: 'duels.total',
  duels_won: 'duels.won',
  dribbles_attempts: 'dribbles.attempts',
  dribbles_success: 'dribbles.success',
  dribbles_past: 'dribbles.past',
  fouls_drawn: 'fouls.drawn',
  fouls_committed: 'fouls.committed',
  offsides: 'offsides',
  yellow: 'cards.yellow',
  red: 'cards.red',
  pen_won: 'penalty.won',
  pen_committed: 'penalty.commited', // sic: the API's spelling
  pen_scored: 'penalty.scored',
  pen_missed: 'penalty.missed',
  pen_saved: 'penalty.saved',
};

/**
 * The fields a reduced feed omits. Fixed from the payloads, never inferred:
 * in every reduced fixture all six are null for everyone; in every full one
 * goals.conceded, dribbles.past and penalty.missed / saved are present.
 * (penalty.won / commited can be null for everyone in a FULL feed too, when no
 * penalty was won or given away. There they mean 0.)
 */
export const REDUCED_FEED_FIELDS = new Set([
  'goals_conceded_api', 'dribbles_past', 'pen_won', 'pen_committed', 'pen_missed', 'pen_saved',
]);

/** True when every goalkeeper who played has goals.conceded null. */
export function isReducedFeed(appeared) {
  const gks = appeared.filter((e) => e.s.games?.position === 'G');
  return gks.length > 0 && gks.every((e) => !present(e.s.goals?.conceded));
}

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const present = (v) => v !== null && v !== undefined && v !== '';

/** "6.5" -> 6.5; "0" and anything unparseable -> null. */
export function parseRating(v) {
  if (!present(v)) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "33" or 33 -> 33; null stays null. */
function toInt(v) {
  if (!present(v)) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Sort key for an event: minute, then stoppage time. */
const timeKey = (e) => (e.time?.elapsed ?? 0) * 100 + (e.time?.extra ?? 0);

/** Goal events that can count towards the score. */
const isGoal = (e) => e.type === 'Goal' && e.detail !== 'Missed Penalty';
const hasPlayer = (e) => Boolean(e.player?.id);

/**
 * Parse one fixture from /fixtures?ids=.
 *
 * Returns API ids throughout; the caller maps teams and players to our ids.
 *   players  [{ api_player_id, name, photo_url }]   everyone who appeared
 *   rows     per-player rows, keyed by api_player_id and api_team_id
 *   events   the timeline, for fixture_events
 *   goalCheck whether the counted goal events add up to the final score. When
 *            they do not, goals_conceded and clean_sheet are null for every row
 *            in the fixture rather than a guess.
 *   unidentified  players who played but arrived with id 0 and were skipped
 */
export function parseFixture(fx) {
  const apiFixtureId = fx.fixture?.id;
  const homeId = fx.teams?.home?.id;
  const awayId = fx.teams?.away?.id;
  const events = fx.events || [];

  // ── who appeared ────────────────────────────────────────────────────────
  const entries = [];
  for (const side of fx.players || []) {
    for (const p of side.players || []) {
      const s = p.statistics?.[0];
      if (!s) continue;
      entries.push({ apiTeamId: side.team?.id, player: p.player, s });
    }
  }
  const played = entries.filter((e) => (toInt(e.s.games?.minutes) ?? 0) > 0);
  const appeared = played.filter((e) => Boolean(e.player?.id));
  const unidentified = played.length - appeared.length;

  // ── reduced feed: decided by the goalkeepers, not by the fields ─────────
  const reduced = isReducedFeed(appeared);

  // ── starters from the lineups, not the substitute flag ──────────────────
  const xi = new Set();
  for (const l of fx.lineups || []) for (const s of l.startXI || []) xi.add(s.player?.id);
  const haveLineups = xi.size > 0;

  // ── the timeline ────────────────────────────────────────────────────────
  const timeline = events
    .map((e, seq) => ({ e, seq }))
    .sort((a, b) => timeKey(a.e) - timeKey(b.e) || a.seq - b.seq)
    .map((x, order) => ({ ...x, order }));

  const onAt = new Map();   // api_player_id -> timeline order they came on
  const offAt = new Map();  // api_player_id -> timeline order they left
  for (const t of timeline) {
    const e = t.e;
    if (e.type === 'subst') {
      if (e.player?.id && !offAt.has(e.player.id)) offAt.set(e.player.id, t);
      if (e.assist?.id && !onAt.has(e.assist.id)) onAt.set(e.assist.id, t);
    } else if (e.type === 'Card' && /red card|second yellow/i.test(e.detail || '')) {
      if (e.player?.id && !offAt.has(e.player.id)) offAt.set(e.player.id, t);
    }
  }

  // ── goals against the score ─────────────────────────────────────────────
  const tallyOf = (list) => {
    const t = { [homeId]: 0, [awayId]: 0 };
    for (const g of list) t[g.e.team?.id] = (t[g.e.team?.id] || 0) + 1;
    return t;
  };
  const matches = (t) => t[homeId] === fx.goals?.home && t[awayId] === fx.goals?.away;
  const allGoals = timeline.filter((t) => isGoal(t.e));
  const namedGoals = allGoals.filter((t) => hasPlayer(t.e));
  let goals = allGoals;
  let rule = 'all';
  if (!matches(tallyOf(allGoals)) && matches(tallyOf(namedGoals))) {
    goals = namedGoals;
    rule = 'with_player';
  }
  const tally = tallyOf(goals);
  const goalCheck = {
    ok: matches(tally),
    rule,
    events: { home: tally[homeId], away: tally[awayId] },
    score: { home: fx.goals?.home, away: fx.goals?.away },
  };

  // ── rows ────────────────────────────────────────────────────────────────
  const rows = [];
  const players = [];
  for (const { apiTeamId, player, s } of appeared) {
    const g = s.games || {};
    const minutes = toInt(g.minutes);
    const started = haveLineups ? xi.has(player.id) : g.substitute === false;

    const on = onAt.get(player.id);
    const off = offAt.get(player.id);
    const from = started ? -1 : on ? on.order : -1;
    const to = off ? off.order : Infinity;

    // A substitute who played but has no `subst` event: we do not know when
    // they came on, so we do not guess what they conceded.
    const windowKnown = started || Boolean(on);

    let goalsConceded = null;
    let cleanSheet = null;
    if (goalCheck.ok && windowKnown) {
      goalsConceded = goals.filter((x) => x.e.team?.id !== apiTeamId && x.order > from && x.order < to).length;
      cleanSheet = minutes >= CLEAN_SHEET_MINUTES && goalsConceded === 0;
    }

    const row = {
      api_player_id: player.id,
      api_team_id: apiTeamId,
      position: g.position || null,
      started,
      captain: g.captain === true,
      shirt_number: toInt(g.number),
      minutes,
      minute_on: started ? 0 : on ? on.e.time?.elapsed ?? null : null,
      minute_off: off ? off.e.time?.elapsed ?? null : null,
      rating: parseRating(g.rating),
      goals_conceded: goalsConceded,
      clean_sheet: cleanSheet,
    };
    for (const [col, path] of Object.entries(COUNTS)) {
      row[col] = reduced && REDUCED_FEED_FIELDS.has(col) ? null : toInt(get(s, path)) ?? 0;
    }
    rows.push(row);
    players.push({
      api_player_id: player.id,
      name: player.name || `Player ${player.id}`,   // players.name is not null
      photo_url: player.photo || null,
    });
  }

  return {
    apiFixtureId,
    rows,
    players,
    goalCheck,
    reduced,
    unidentified,
    events: events.map((e, seq) => ({
      seq,
      minute: e.time?.elapsed ?? null,
      extra: e.time?.extra ?? null,
      api_team_id: e.team?.id ?? null,
      player_api_id: e.player?.id ?? null,
      player_name: e.player?.name ?? null,
      assist_api_id: e.assist?.id ?? null,
      assist_name: e.assist?.name ?? null,
      type: e.type,
      detail: e.detail ?? null,
      comments: e.comments ?? null,
    })),
  };
}

/** /players page entry -> a players row. Height and weight come as "184 cm" or "190". */
export function bioRow(entry, cmToNumber) {
  const p = entry.player || {};
  return {
    api_player_id: p.id,
    name: p.name,
    firstname: p.firstname || null,
    lastname: p.lastname || null,
    age: toInt(p.age),
    birth_date: p.birth?.date || null,
    nationality: p.nationality || null,
    height_cm: cmToNumber(p.height),
    weight_kg: cmToNumber(p.weight),
    injured: typeof p.injured === 'boolean' ? p.injured : null,
    photo_url: p.photo || null,
    updated_at: new Date().toISOString(),
  };
}
