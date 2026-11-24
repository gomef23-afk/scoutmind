// Every cron job behind ONE serverless function (24 Nov 2026).
//
// Vercel Hobby allows 12 serverless functions per deployment, and every .js
// file under api/ is one, except files and folders whose name starts with an
// underscore. With /api/cron/rescore and /api/cron/recaps we had 14, and the
// deploy was refused. The handlers now live in api/_cron/ (not functions) and
// this file, a dynamic route, answers every /api/cron/<job> URL: Vercel passes
// the segment as req.query.job. The URLs cron-job.org calls are unchanged
// (/api/cron/fixtures, /api/cron/teams?coaches=1, ?league=, &full=1 ...): the
// request goes to the job's own handler as it came, query string and Bearer
// header included, and each handler still checks CRON_SECRET itself
// (withCron, or authorize() in health). An unknown name is a 404.
//
// Functions in api/ today: this one, api/account/delete.js and
// api/email/unsubscribe.js = 3 (tests/cron-dispatch.test.js keeps it <= 8).
// A new job is one line in JOBS and a file in api/_cron/, never a new file
// in api/cron/.
//
// Each job is imported only when it is called (literal paths, so Vercel's
// file tracing bundles every one of them).

const JOBS = {
  'fixtures':      () => import('../_cron/fixtures.js'),
  'standings':     () => import('../_cron/standings.js'),
  'live':          () => import('../_cron/live.js'),
  'teams':         () => import('../_cron/teams.js'),
  'fixture-stats': () => import('../_cron/fixture-stats.js'),
  'player-stats':  () => import('../_cron/player-stats.js'),
  'players':       () => import('../_cron/players.js'),
  'news':          () => import('../_cron/news.js'),
  'reminders':     () => import('../_cron/reminders.js'),
  'health':        () => import('../_cron/health.js'),
  'rescore':       () => import('../_cron/rescore.js'),
  'recaps':        () => import('../_cron/recaps.js'),
};

export const JOB_NAMES = Object.keys(JOBS);

/** The job a request names: Vercel's req.query.job, else the last path segment. */
export function jobName(req) {
  const q = req && req.query && req.query.job;
  if (typeof q === 'string' && q) return q;
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    return decodeURIComponent(path.replace(/\/+$/, '').split('/').pop() || '');
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  const name = jobName(req);
  if (!Object.prototype.hasOwnProperty.call(JOBS, name)) {
    res.status(404).json({ ok: false, error: 'unknown job' });
    return;
  }
  const mod = await JOBS[name]();
  return mod.default(req, res);
}
