// Round Recap backfill (R-1, 21 Nov 2026).
//
//   /api/cron/recaps            builds the recaps of final rounds that have
//                               none, newest first, for as long as the 20 s
//                               window lasts; call again until `pending` is 0.
//   /api/cron/recaps?max=5      at most five this call.
//
// 0 API-Football requests: Supabase reads and one insert per recap. The
// player-stats job builds the recap of a round that has just turned final (one
// a run); this endpoint is for the rounds that were final before 042, and they
// are stored as already posted (no room posts, the Recaps list only).

import { withCron, RUN_BUDGET_MS } from '../_lib/cron.js';
import { buildDueRecaps } from '../_lib/recap-job.js';

export default withCron('recaps', async ({ req }) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const max = Math.max(1, Math.min(Number(url.searchParams.get('max') ?? 500) || 500, 500));
  const r = await buildDueRecaps({ max, until: started + RUN_BUDGET_MS });
  if (r.error) throw new Error(`recaps: ${r.error}`);
  return { rows_written: r.built, requests_used: 0, ...r, elapsed_ms: Date.now() - started };
});
