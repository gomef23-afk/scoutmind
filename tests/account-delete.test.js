// /api/account/delete — the order of the steps, and every refusal.
//
//   node tests/account-delete.test.js
//
// No dependencies and no network: fetch is stubbed. Exit code 0 on success.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures = [];
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) passed++; else failures.push(`${name}\n      got  ${g}\n      want ${w}`);
}
function check(name, ok, detail) {
  if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name);
}

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_stub';

const USER = { id: '11111111-2222-3333-4444-555555555555', email: 'fan@example.test' };

/** Stub Supabase. `opts` picks which step fails. Records every call. */
function stub(opts = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}${u.pathname.endsWith('/token') ? u.search : ''}`);
    const json = (b, s = 200) => new Response(b === null ? null : JSON.stringify(b),
      { status: s, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/auth/v1/user') {
      return opts.badToken ? json({ msg: 'invalid JWT' }, 401) : json(USER);
    }
    if (u.pathname === '/auth/v1/token') {
      const body = JSON.parse(init.body);
      if (body.email !== USER.email) return json({ error: 'wrong email' }, 400);
      return body.password === 'right-password' ? json({ access_token: 'x' }) : json({ error: 'invalid_grant' }, 400);
    }
    if (u.pathname === '/rest/v1/rpc/delete_account_data') {
      if (opts.rpcFails) return json({ message: 'boom' }, 500);
      return json({ comments: 2, messages: 1, profile: 1 });
    }
    if (u.pathname === `/auth/v1/admin/users/${USER.id}` && method === 'DELETE') {
      return opts.adminFails ? json({ msg: 'down' }, 500) : json({});
    }
    return json({ error: 'unexpected ' + u.pathname }, 418);
  };
  return calls;
}

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (s) => { r.statusCode = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (body, { method = 'POST', token = 'user-token' } = {}) => ({
  method, body, headers: token ? { authorization: `Bearer ${token}` } : {},
});

const realFetch = globalThis.fetch;
const realErr = console.error, realLog = console.log;
console.error = () => {}; console.log = () => {};
const { default: handler } = await import('../api/account/delete.js');

try {
  // ── the happy path, in order ──
  {
    const calls = stub();
    const res = fakeRes();
    await handler(req({ confirm: 'DELETE', password: 'right-password' }), res);
    eq('ok: 200', [res.statusCode, res.body], [200, { ok: true }]);
    eq('ok: steps in order', calls, [
      'GET /auth/v1/user',
      'POST /auth/v1/token?grant_type=password',
      'POST /rest/v1/rpc/delete_account_data',
      `DELETE /auth/v1/admin/users/${USER.id}`,
    ]);
    eq('ok: never cached', res.headers['Cache-Control'], 'no-store');
  }
  // Portuguese confirmation, any case, surrounding spaces.
  {
    stub();
    const res = fakeRes();
    await handler(req({ confirm: ' excluir ', password: 'right-password' }), res);
    eq('EXCLUIR also confirms', res.statusCode, 200);
  }

  // ── refusals: nothing is deleted ──
  const refusals = [
    ['GET is refused', req({}, { method: 'GET' }), {}, 405, []],
    ['no token', req({ confirm: 'DELETE', password: 'right-password' }, { token: '' }), {}, 401, []],
    ['wrong confirmation word', req({ confirm: 'delete me', password: 'right-password' }), {}, 400, []],
    ['no password', req({ confirm: 'DELETE' }), {}, 400, []],
    ['expired session', req({ confirm: 'DELETE', password: 'right-password' }), { badToken: true }, 401, ['GET /auth/v1/user']],
    ['wrong password', req({ confirm: 'DELETE', password: 'nope' }), {}, 403,
      ['GET /auth/v1/user', 'POST /auth/v1/token?grant_type=password']],
  ];
  for (const [name, rq, opts, status, wantCalls] of refusals) {
    const calls = stub(opts);
    const res = fakeRes();
    await handler(rq, res);
    eq(`${name}: status`, res.statusCode, status);
    eq(`${name}: calls (no rpc, no delete)`, calls, wantCalls);
    check(`${name}: says why`, res.body && res.body.ok === false && typeof res.body.error === 'string' && res.body.error.length > 5);
  }

  // ── the database step fails: the login is NOT deleted ──
  {
    const calls = stub({ rpcFails: true });
    const res = fakeRes();
    await handler(req({ confirm: 'DELETE', password: 'right-password' }), res);
    eq('rpc fails: 500', res.statusCode, 500);
    check('rpc fails: no auth delete', !calls.some((c) => c.startsWith('DELETE')), calls.join(', '));
  }
  // ── the auth step fails after anonymising: say so, so a retry finishes it ──
  {
    stub({ adminFails: true });
    const res = fakeRes();
    await handler(req({ confirm: 'DELETE', password: 'right-password' }), res);
    eq('admin delete fails: 502 and anonymised', [res.statusCode, res.body.anonymised], [502, true]);
  }
  // ── a retry after that runs the whole path again ──
  {
    const calls = stub();
    const res = fakeRes();
    await handler(req({ confirm: 'DELETE', password: 'right-password' }), res);
    eq('retry: completes', res.statusCode, 200);
    eq('retry: four steps again', calls.length, 4);
  }
} finally {
  globalThis.fetch = realFetch;
  console.error = realErr; console.log = realLog;
}

// ── rule 13: account/delete.js is the only file in api/ that sends a DELETE ──
{
  const root = new URL('../api/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
  walk(root);
  const senders = files.filter((f) => /method:\s*['"]DELETE['"]/.test(readFileSync(f, 'utf8')))
    .map((f) => f.replace(/\\/g, '/').replace(/^.*\/api\//, 'api/'));
  eq('only api/account/delete.js sends a DELETE', senders, ['api/account/delete.js']);
  check('_lib/supabase.js still exports no delete',
    !/export (async )?function (del|delete|remove)/i.test(readFileSync(join(root, '_lib', 'supabase.js'), 'utf8')));
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
