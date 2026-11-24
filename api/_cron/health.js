// Setup check. Costs ZERO API-Football requests.
//
// Reports only whether each env var is PRESENT — never its value, never a
// prefix, never a length that could narrow a brute force.

import { authorize } from '../_lib/cron.js';
import { select, count } from '../_lib/supabase.js';

export default async function handler(req, res) {
  const auth = authorize(req);
  if (!auth.ok) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const env = {
    API_FOOTBALL_KEY: Boolean(process.env.API_FOOTBALL_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  };

  let supabase = 'not tested';
  let leagues = null;
  let ingest = null;
  try {
    const rows = await select(
      'leagues',
      'select=slug,current_season,active,stats_coverage&order=slug'
    );
    supabase = 'ok';
    leagues = rows.map(
      (r) =>
        `${r.slug}:${r.current_season}` +
        `${r.active ? ' active' : ''}` +
        `${r.stats_coverage === false ? ' NO-STATS' : ''}`
    );
    ingest = await ingestStatus();
  } catch (e) {
    supabase = `error: ${e.message}`;
  }

  const allSet = Object.values(env).every(Boolean);
  res.status(allSet && supabase === 'ok' ? 200 : 500).json({
    ok: allSet && supabase === 'ok',
    env,
    supabase,
    leagues,
    ingest,
  });
}

/** Backlog + last run per job, so one call answers "is the data flowing?". */
async function ingestStatus() {
  const FINISHED = 'FT,AET,PEN';
  const cutoff = new Date(Date.now() - 3 * 3600_000).toISOString();
  const nowIso = new Date().toISOString();

  const queueFilter = [
    `status_short=in.(${FINISHED})`,
    'stats_fetched_at=is.null',
    'stats_attempts=lt.3',
    `kickoff_utc=lte.${cutoff}`,
    `or=(stats_retry_after.is.null,stats_retry_after.lte.${nowIso})`,
  ].join('&');

  const [fixturesTotal, finished, withStats, backlog, abandoned] = await Promise.all([
    count('fixtures'),
    count('fixtures', `status_short=in.(${FINISHED})`),
    count('fixtures', 'stats_fetched_at=not.is.null'),
    count('fixtures', queueFilter),
    count('fixtures', `status_short=in.(${FINISHED})&stats_fetched_at=is.null&stats_attempts=gte.3`),
  ]);

  // Most recent run of each job.
  const runs = await select(
    'ingest_runs',
    'select=job,started_at,finished_at,ok,rows_written,requests_used,error&order=started_at.desc&limit=40'
  );
  const lastRun = {};
  for (const r of runs) {
    if (lastRun[r.job]) continue;
    lastRun[r.job] = {
      at: r.started_at,
      ok: r.ok,
      rows: r.rows_written,
      requests: r.requests_used,
      ...(r.error ? { error: r.error.slice(0, 160) } : {}),
    };
  }

  return {
    fixtures_total: fixturesTotal,
    fixtures_finished: finished,
    fixture_stats_done: withStats,
    fixture_stats_backlog: backlog,
    fixture_stats_abandoned: abandoned, // 3 failed attempts, retired
    last_run: lastRun,
  };
}
