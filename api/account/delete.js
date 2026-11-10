// POST /api/account/delete — a signed-in user deletes their own account
// (LGPD art. 18, VI). Immediate; there is no grace period.
//
//   Authorization: Bearer <the user's access token>
//   body: { "confirm": "DELETE" | "EXCLUIR", "password": "<their password>" }
//
// Order (retry-safe):
//   1. who is asking: GET /auth/v1/user with their token
//   2. it is really them: their password, checked against Supabase Auth
//   3. delete_account_data(user) (migration 024): anonymises what stays,
//      erases what goes, deletes the profile. Idempotent.
//   4. DELETE /auth/v1/admin/users/<id>: the login itself; foreign keys
//      remove follows, reactions, likes and badges, and detach the rest.
// If step 4 fails after step 3, the content is already anonymised and the
// person retries; step 3 finds nothing left and step 4 runs again.
//
// RULE 13 EXCEPTION. Nothing in api/ may DELETE, because a scheduled ingest
// job that deleted outside its window would wipe backfilled data. This route
// is not a job: it runs only when a person erases their own account, which
// the LGPD entitles them to do. It is the only file in api/ allowed to send a
// DELETE, and tests/account-delete.test.js checks that.
//
// Zero dependencies, like every function here. The service key never leaves
// the server, and nothing about the password is logged.

import { rpc, serviceHeaders, supabaseUrl } from '../_lib/supabase.js';

const CONFIRM_WORDS = /^(delete|excluir)$/i;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // Not parsed by the platform: read the stream.
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

/** The user the access token belongs to, or null. */
async function userForToken(token) {
  const r = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: serviceHeaders().apikey, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

/** True when the password is right for this email. Creates a session we never use. */
async function passwordMatches(email, password) {
  const r = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: serviceHeaders().apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Use POST.' });

  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return send(res, 401, { ok: false, error: 'Sign in again to delete your account.' });

  const body = await readBody(req);
  const confirm = String(body.confirm || '').trim();
  const password = String(body.password || '');
  if (!CONFIRM_WORDS.test(confirm)) {
    return send(res, 400, { ok: false, error: 'Type DELETE to confirm.' });
  }
  if (!password) return send(res, 400, { ok: false, error: 'Enter your password.' });

  let user;
  try {
    user = await userForToken(token);
  } catch (e) {
    console.error('[account/delete] user lookup failed:', e.message);
    return send(res, 502, { ok: false, error: 'Could not reach the sign-in service. Try again in a minute.' });
  }
  if (!user) return send(res, 401, { ok: false, error: 'Your session has expired. Sign in again, then delete your account.' });
  if (!user.email) return send(res, 400, { ok: false, error: 'This account has no email to check the password against. Write to hello@scoutmind.app.' });

  let pwOk = false;
  try {
    pwOk = await passwordMatches(user.email, password);
  } catch (e) {
    console.error('[account/delete] password check failed:', e.message);
    return send(res, 502, { ok: false, error: 'Could not check your password. Try again in a minute.' });
  }
  if (!pwOk) return send(res, 403, { ok: false, error: 'That password is not right.' });

  // 3. Anonymise and erase in the database.
  let summary;
  try {
    summary = await rpc('delete_account_data', { p_user: user.id });
  } catch (e) {
    // The body of a PostgREST error is logged in full (rule 20), never the password.
    console.error('[account/delete] delete_account_data failed:', e.message);
    return send(res, 500, { ok: false, error: 'Nothing was deleted. Try again in a minute, or write to hello@scoutmind.app.' });
  }

  // 4. The login itself. The only DELETE in api/ (see the header).
  const del = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
  });
  if (!del.ok && del.status !== 404) {
    console.error('[account/delete] auth admin delete', del.status, (await del.text()).slice(0, 300));
    return send(res, 502, {
      ok: false,
      anonymised: true,
      error: 'Your posts are already anonymised, but the account itself could not be removed. Try again in a minute.',
    });
  }

  console.log('[account/delete] done', JSON.stringify(summary || {}));
  return send(res, 200, { ok: true });
}
