// Round Recap, the job's half (R-1, 21 Nov 2026): fetch one final round's
// inputs, build it with api/_lib/round-recap.js, store it in round_recaps
// (migration 042). Called by player-stats after refresh_game_results (which is
// what turns a round final) and by /api/cron/recaps for the backfill. Reads
// Supabase only: 0 API-Football requests. Inserts only (rule 13): a recap is
// written once and never changed (on conflict do nothing).
//
// posted_at: a recap is born "already posted" (no room post) when its round
// turned final before 042 ran (game_config.recaps_from) or has no finalized_at
// (created final by sync_game_rounds: history). Only rounds that turn final
// from now on can be posted, and only once game_config.recap_posts is on (R-3).

import { select, upsert, rpc } from './supabase.js';
import { TIER_MULTIPLIER, UNRANKED_MULTIPLIER, OWNERSHIP_MIN_PARTICIPANTS, SCORED_COLUMNS } from './scout-game.js';
import { buildRecap, recapComplete, RECAP_VERSION, SNAPSHOT_MAX_AGE_DAYS } from './round-recap.js';

const ids = (xs) => [...new Set(xs)].join(',');
async function selectIn(table, column, values, rest) {
  const out = [];
  const uniq = [...new Set(values)];
  for (let i = 0; i < uniq.length; i += 150) {
    out.push(...(await select(table, `${rest}&${column}=in.(${uniq.slice(i, i + 150).join(',')})`)));
  }
  return out;
}

/**
 * Build the recaps of final rounds that have none, newest first, until `max`
 * are built or the clock passes `until` (checked before each round). Returns
 * { built, incomplete, pending, error? }; never throws.
 */
export async function buildDueRecaps({ max = 1, until = Infinity } = {}) {
  const out = { built: 0, incomplete: 0, pending: 0 };
  try {
    // game_config.recaps_paused (042, on by default): nothing is built until it
    // is switched off, so no recap is frozen on numbers about to be re-scored
    // (23 Nov 2026: Série A 35 was scored without seven of the table's events).
    const cfg = (await select('game_config', 'select=*&limit=1'))[0] || {};
    if (cfg.recaps_paused !== false) { out.paused = true; return out; }
    const finals = await select('game_rounds',
      'select=id,league_id,season,round_no,round_label,deadline_utc,finalized_at&status=eq.final&order=deadline_utc.desc&limit=2000');
    const done = new Set((await select('round_recaps', 'select=round_id&limit=5000')).map((r) => r.round_id));
    const due = finals.filter((r) => !done.has(r.id));
    const from = cfg.recaps_from ? Date.parse(cfg.recaps_from) : Infinity;
    for (const r of due) {
      if (out.built >= max || Date.now() > until) break;
      const made = await buildOne(r, from);
      if (made) out.built++; else out.incomplete++;
    }
    out.pending = due.length - out.built - out.incomplete;
  } catch (e) {
    // Before 042 the table does not exist: say so, never stop the game steps.
    console.warn('[recaps]', e.message.slice(0, 300));
    out.error = e.message.slice(0, 300);
  }
  return out;
}

/** One round: false when its data is not complete (it is tried again later). */
async function buildOne(round, recapsFrom) {
  const links = await select('game_round_fixtures', `select=fixture_id&round_id=eq.${Number(round.id)}&counts=is.true`);
  if (!links.length) return false;
  const fixtures = await select('fixtures',
    `select=id,home_team_id,away_team_id,home_goals,away_goals,status_short,kickoff_utc,players_fetched_at&id=in.(${ids(links.map((l) => l.fixture_id))})`);
  if (!recapComplete(fixtures)) return false;
  const fxIds = fixtures.map((f) => f.id);

  const rows = await selectIn('player_fixture_stats', 'fixture_id', fxIds,
    `select=fixture_id,player_id,team_id,rating,${SCORED_COLUMNS.join(',')}`);
  const og = await selectIn('fixture_events', 'fixture_id', fxIds,
    'select=fixture_id,player_api_id&type=eq.Goal&detail=eq.Own%20Goal');
  const ownGoals = new Map();
  if (og.length) {
    const map = await selectIn('players', 'api_player_id', og.map((e) => e.player_api_id), 'select=id,api_player_id');
    const idOf = new Map(map.map((p) => [p.api_player_id, p.id]));
    for (const e of og) {
      const pid = idOf.get(e.player_api_id);
      if (pid) ownGoals.set(`${e.fixture_id}:${pid}`, (ownGoals.get(`${e.fixture_id}:${pid}`) || 0) + 1);
    }
  }

  // Standings as they stood: the last snapshot taken on a day BEFORE the
  // deadline's (the daily snapshot of the deadline's own day may already hold
  // this round's results), and no older than SNAPSHOT_MAX_AGE_DAYS.
  let snapshot = null;
  const day = String(round.deadline_utc).slice(0, 10);
  const last = await select('standings_snapshots',
    `select=snapshot_date&league_id=eq.${Number(round.league_id)}&season=eq.${Number(round.season)}&snapshot_date=lt.${day}&order=snapshot_date.desc&limit=1`);
  if (last[0] && (Date.parse(day) - Date.parse(last[0].snapshot_date)) / 864e5 <= SNAPSHOT_MAX_AGE_DAYS) {
    snapshot = {
      date: last[0].snapshot_date,
      rows: await select('standings_snapshots',
        `select=team_id,rank,group_label&league_id=eq.${Number(round.league_id)}&season=eq.${Number(round.season)}&snapshot_date=eq.${last[0].snapshot_date}`),
    };
  }

  let tiers = null;
  try {
    tiers = await rpc('player_tiers_at', { p_league_id: round.league_id, p_season: round.season, p_as_of: round.deadline_utc });
  } catch (e) { console.warn('[recaps] tiers:', e.message.slice(0, 200)); }

  const entries = await select('game_entries', `select=id,user_id,submitted_at&round_id=eq.${Number(round.id)}`);
  let picks = [], scores = [], results = [];
  if (entries.length) {
    picks = await select('game_picks', `select=entry_id,slot,player_id,is_captain,locked_multiplier&round_id=eq.${Number(round.id)}`);
    scores = await select('game_pick_scores', `select=entry_id,slot,base_points&round_id=eq.${Number(round.id)}`);
    results = await select('game_round_results', `select=user_id,total,captain_points,submitted_at&round_id=eq.${Number(round.id)}`);
  }

  const { data, people } = buildRecap({
    fixtures, rows, ownGoals, snapshot, tiers,
    ladder: { tiers: TIER_MULTIPLIER, unranked: UNRANKED_MULTIPLIER },
    entries, picks, scores, results, minParticipants: OWNERSHIP_MIN_PARTICIPANTS,
  });
  if (people.size) {
    const named = await selectIn('players', 'id', [...people.keys()], 'select=id,name');
    const nameOf = new Map(named.map((p) => [p.id, p.name]));
    data.people = Object.fromEntries([...people.entries()]
      .filter(([pid]) => nameOf.get(pid))
      .map(([pid, team]) => [pid, { name: nameOf.get(pid), team }]));
  }

  const finalised = round.finalized_at ? Date.parse(round.finalized_at) : null;
  const history = finalised === null || !(finalised >= recapsFrom);
  await upsert('round_recaps', [{
    round_id: round.id, league_id: round.league_id, season: round.season, round_no: round.round_no,
    version: RECAP_VERSION, data, generated_at: new Date().toISOString(),
    posted_at: history ? new Date().toISOString() : null,
  }], 'round_id', { ignoreDuplicates: true });
  return true;
}
