// Minimal Supabase REST (PostgREST) helper.
//
// Deliberately dependency-free: the project has no build step, so rather than
// pull in @supabase/supabase-js for what amounts to POST and GET, we talk to
// PostgREST directly.
//
// Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. This module must only
// ever be imported by files under /api — never shipped to the browser.

const URL_ = () => {
  const u = process.env.SUPABASE_URL;
  if (!u) throw new Error('SUPABASE_URL is not set');
  return u.replace(/\/$/, '');
};

// Accepts BOTH Supabase key formats:
//   * new secret key   sb_secret_...        (opaque, replaces service_role)
//   * legacy JWT       eyJ...               (service_role claim inside the JWT)
// Either way it must be a SERVER-side key. A publishable/anon key would still
// authenticate but would be gated by RLS, so writes would fail in confusing
// ways much later — better to refuse it here, loudly, at boot.
const KEY = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  if (k.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY holds a PUBLISHABLE key (sb_publishable_...). ' +
      'The cron jobs need the secret key (sb_secret_...).'
    );
  }
  if (k.startsWith('eyJ')) {
    // Legacy JWT: check the role claim rather than trusting the variable name.
    try {
      const claims = JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString());
      if (claims.role && claims.role !== 'service_role') {
        throw new Error(
          `SUPABASE_SERVICE_ROLE_KEY holds a '${claims.role}' key, not service_role.`
        );
      }
    } catch (e) {
      if (e.message.startsWith('SUPABASE_SERVICE_ROLE_KEY')) throw e;
      // Unparseable JWT payload: let the request fail with a real HTTP error.
    }
  }
  return k;
};

function headers(extra = {}) {
  const k = KEY();
  // PostgREST wants the key in `apikey`. Supabase's own clients also mirror it
  // into Authorization, and that is what selects the role for both formats.
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** SELECT. `query` is a PostgREST query string, e.g. 'select=*&active=eq.true' */
export async function select(table, query = 'select=*') {
  const res = await fetch(`${URL_()}/rest/v1/${table}?${query}`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`Supabase select ${table} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * UPSERT a batch of rows.
 * `onConflict` must name the unique/primary key columns so Postgres merges
 * instead of erroring on re-ingest — every cron job is expected to re-run over
 * data it has already written.
 */
export async function upsert(table, rows, onConflict) {
  if (!rows || rows.length === 0) return 0;

  // PostgREST has a practical payload ceiling; chunk so a big players page or a
  // full fixture list never fails as one oversized request.
  const CHUNK = 500;
  let written = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const res = await fetch(`${URL_()}/rest/v1/${table}${qs}`, {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`Supabase upsert ${table} ${res.status}: ${await res.text()}`);
    }
    written += batch.length;
  }
  return written;
}

/** PATCH rows matching a PostgREST filter. */
export async function update(table, filter, patch) {
  const res = await fetch(`${URL_()}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Supabase update ${table} ${res.status}: ${await res.text()}`);
  }
}

/** Insert one row and return it (used for ingest_runs). */
export async function insertReturning(table, row) {
  const res = await fetch(`${URL_()}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    throw new Error(`Supabase insert ${table} ${res.status}: ${await res.text()}`);
  }
  const [created] = await res.json();
  return created;
}

/** Active leagues, oldest-updated first. */
export function activeLeagues() {
  return select(
    'leagues',
    'select=id,api_league_id,slug,name,current_season&active=is.true&order=id'
  );
}

/** Map of API-Football team id -> our teams.id, for the given leagues. */
export async function teamIdMap(leagueIds) {
  const filter = leagueIds?.length
    ? `&league_id=in.(${leagueIds.join(',')})`
    : '';
  const rows = await select('teams', `select=id,api_team_id${filter}`);
  const map = new Map();
  for (const r of rows) map.set(r.api_team_id, r.id);
  return map;
}
