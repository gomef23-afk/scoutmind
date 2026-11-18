// Cron endpoint scaffolding: auth, run logging, uniform JSON response.
//
// These endpoints are public URLs on scoutmind.app, so the CRON_SECRET is the
// only thing standing between the internet and our write path. Treat it as a
// credential: rotate it if it ever appears in a log or a screenshot.

import { insertReturning, update, select } from './supabase.js';
import { QuotaExhausted } from './apifootball.js';

import { timingSafeEqual } from 'node:crypto';

// Fluid Compute is on (Hobby, 300 s function limit), so the real cap is
// cron-job.org, which stops waiting at RUN_LIMIT_MS. A run it gives up on
// leaves no reliable result, and a resumable job whose cursor is not written
// redoes the same slice. Every job therefore stops STARTING work at
// RUN_BUDGET_MS, which leaves room for one request already in flight
// (API-Football calls time out at REQUEST_TIMEOUT_MS in apifootball.js) and
// the closing writes. tests/cron-budget.test.js pins both numbers.
export const RUN_LIMIT_MS = 30_000;
export const RUN_BUDGET_MS = 20_000;

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verifies the caller knows CRON_SECRET.
 * Preferred:  Authorization: Bearer <secret>   (cron-job.org custom header)
 * Fallback:   ?secret=<secret>                 (easier to configure, but query
 *             strings land in access logs — use the header if you can.)
 */
export function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: 'CRON_SECRET is not set' };

  const auth = req.headers?.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  const url = new URL(req.url, 'http://localhost');
  const qp = url.searchParams.get('secret');

  const supplied = bearer || qp;
  if (!supplied) return { ok: false, reason: 'missing secret' };
  if (!safeEqual(supplied, expected)) return { ok: false, reason: 'bad secret' };
  return { ok: true };
}

/**
 * Wraps a job body with auth, an ingest_runs row and consistent error handling.
 *
 *   export default withCron('fixtures', async ({ log }) => {
 *     ...
 *     return { rows_written: n, requests_used: m };
 *   });
 */
export function withCron(jobName, body) {
  return async function handler(req, res) {
    const auth = authorize(req);
    if (!auth.ok) {
      // Deliberately terse: do not tell an unauthenticated caller which part failed.
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    let run = null;
    try {
      run = await insertReturning('ingest_runs', { job: jobName });
    } catch (e) {
      // Telemetry must never be the reason a job cannot run.
      console.error('ingest_runs insert failed:', e.message);
    }

    const started = Date.now();
    try {
      const result = (await body({ req, run })) || {};
      const payload = {
        ok: true,
        job: jobName,
        ms: Date.now() - started,
        rows_written: result.rows_written ?? 0,
        requests_used: result.requests_used ?? 0,
        ...result,
      };
      if (run) {
        await update('ingest_runs', `id=eq.${run.id}`, {
          finished_at: new Date().toISOString(),
          ok: true,
          rows_written: payload.rows_written,
          requests_used: payload.requests_used,
          cursor: result.cursor ?? null,
        }).catch(() => {});
      }
      res.status(200).json(payload);
    } catch (err) {
      const quota = err instanceof QuotaExhausted;
      console.error(`[${jobName}]`, err.message);
      if (run) {
        await update('ingest_runs', `id=eq.${run.id}`, {
          finished_at: new Date().toISOString(),
          ok: false,
          error: err.message.slice(0, 500),
        }).catch(() => {});
      }
      // Quota exhaustion is expected on the free tier, not a failure worth
      // paging about — 200 so cron-job.org does not spam failure emails.
      res.status(quota ? 200 : 500).json({
        ok: false,
        job: jobName,
        quota_exhausted: quota,
        error: err.message,
      });
    }
  };
}

/** YYYY-MM-DD, `days` from today, in UTC. */
export function isoDate(days = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Leagues per run (commit 1 of the 18-league work) ──────────────────────

/**
 * ?league=championship (or a comma list): only those active leagues, for a
 * one-league run or a backfill. Returns null when the parameter is absent
 * (the run covers every league). An unknown slug is simply not there.
 */
export function leaguesFromQuery(req, leagues) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('league');
  if (!q) return null;
  const want = new Set(q.split(',').map((s) => s.trim()).filter(Boolean));
  return leagues.filter((l) => want.has(l.slug));
}

/** True 8 days after a league's season ended: its tables and results are final. */
export const SEASON_GRACE_DAYS = 8;
export function seasonOver(league, now = Date.now()) {
  if (!league || !league.season_end) return false;
  return now > new Date(league.season_end + 'T23:59:59Z').getTime() + SEASON_GRACE_DAYS * 86_400_000;
}

/**
 * A once-a-day pass over the leagues, resumable (rule 16): the cursor a
 * successful run of `job` saved says how far today's pass got
 * ({ day, after_id } or { day, complete: true }). A call after a complete
 * pass does nothing, so cron-job.org can call every 30 minutes and only the
 * first calls of the day spend requests.
 */
export async function dailyPass(job) {
  const today = isoDate();
  let last = null;
  try {
    const rows = await select('ingest_runs',
      `select=cursor&job=eq.${encodeURIComponent(job)}&ok=is.true&cursor=not.is.null&order=started_at.desc&limit=1`);
    last = rows[0]?.cursor || null;
  } catch (e) { console.warn(`[${job}] cursor read failed:`, e.message); }
  if (!last || last.day !== today) return { today, complete: false, afterId: 0 };
  return { today, complete: !!last.complete, afterId: Number(last.after_id) || 0 };
}
