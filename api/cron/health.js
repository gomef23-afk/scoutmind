// Setup check. Costs ZERO API-Football requests.
//
// Reports only whether each env var is PRESENT — never its value, never a
// prefix, never a length that could narrow a brute force.

import { authorize } from '../_lib/cron.js';
import { select } from '../_lib/supabase.js';

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
  try {
    const rows = await select('leagues', 'select=slug,current_season,active&order=slug');
    supabase = 'ok';
    leagues = rows.map((r) => `${r.slug}:${r.current_season}${r.active ? ' (active)' : ''}`);
  } catch (e) {
    supabase = `error: ${e.message}`;
  }

  const allSet = Object.values(env).every(Boolean);
  res.status(allSet && supabase === 'ok' ? 200 : 500).json({
    ok: allSet && supabase === 'ok',
    env,
    supabase,
    leagues,
  });
}
