// Re-score the Scout Game rounds that have fans (23 Nov 2026).
//
//   /api/cron/rescore              every round with at least one entry that is
//                                  past its deadline (locked or final)
//   /api/cron/rescore?rounds=9,12  only these rounds
//
// Why: until 23 Nov the job scored picks from a column list that left out
// tackles, interceptions, shots total, fouls drawn and committed, offsides and
// penalties conceded (SCORED_COLUMNS, scout-game.js). This recomputes every
// pick score of those rounds with the job's own scoreRounds() (the same code
// as live scoring), then refresh_game_results() for their totals, streaks,
// rankings and badges. Season tables, rankings and private-league tables are
// views over those totals, so they follow.
//
// Re-runnable: scores are recomputed, never incremented. 0 API-Football
// requests. Nothing is deleted (rule 13): a badge awarded on the old numbers
// stays (badges are insert-only); the run lists the rounds so it can be checked.

import { withCron } from '../_lib/cron.js';
import { select, rpc } from '../_lib/supabase.js';
import { scoreRounds } from './player-stats.js';

export default withCron('rescore', async ({ req }) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const asked = (url.searchParams.get('rounds') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);

  // Rounds with fans, past their deadline. An open round has nothing scored yet.
  const entries = await select('game_entries', 'select=round_id&limit=10000');
  const withFans = [...new Set(entries.map((e) => e.round_id))];
  const candidates = asked.length ? asked.filter((id) => withFans.includes(id)) : withFans;
  const rounds = candidates.length
    ? await select('game_rounds', `select=id,status,round_label,league_id&id=in.(${candidates.join(',')})&status=neq.open`)
    : [];
  rounds.sort((a, b) => a.id - b.id);
  const ids = rounds.map((r) => r.id);
  if (!ids.length) return { rows_written: 0, requests_used: 0, rounds: [], note: 'no round with fans past its deadline' };

  const scores = await scoreRounds(ids);
  const results = (await rpc('refresh_game_results', { p_round_ids: ids })) ?? 0;
  return {
    rows_written: scores,
    requests_used: 0,
    rounds: rounds.map((r) => ({ id: r.id, status: r.status, round: r.round_label, league_id: r.league_id })),
    scores_written: scores,
    results_written: results,
    elapsed_ms: Date.now() - started,
  };
});
