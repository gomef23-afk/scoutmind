// Cron endpoint scaffolding: auth, run logging, uniform JSON response.
//
// These endpoints are public URLs on scoutmind.app, so the CRON_SECRET is the
// only thing standing between the internet and our write path. Treat it as a
// credential: rotate it if it ever appears in a log or a screenshot.

import { insertReturning, update } from './supabase.js';
import { QuotaExhausted } from './apifootball.js';

import { timingSafeEqual } from 'node:crypto';

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
