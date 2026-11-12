// Round reminder emails (migration 027, api/cron/reminders.js,
// api/email/unsubscribe.js, api/_lib/email.js).
//
//   node tests/reminders.test.js
//
// Runs the real job and the real unsubscribe route against a fake Supabase and
// a fake Resend (global fetch replaced), so the behaviour is tested, not only
// the source: batching per fan, the daily cap, claim-before-send, failure
// handling, the signed token, GET-never-changes-anything, both languages,
// no money words. Plus static checks on the SQL. No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.RESEND_API_KEY = 're_test';
process.env.EMAIL_TOKEN_SECRET = 'x'.repeat(44);

const email = await import('../api/_lib/email.js');
const job = (await import('../api/cron/reminders.js'));
const unsub = (await import('../api/email/unsubscribe.js')).default;

// ── A fake Supabase + Resend ────────────────────────────────────────────
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', U3 = '33333333-3333-3333-3333-333333333333';
const soon = (h) => new Date(Date.now() + h * 3600e3).toISOString();
function world() {
  return {
    candidates: { round_2h: [], round_24h: [] },
    log: new Map(),            // key user|round|kind -> {status, attempts}
    sentRowsLastDay: [],
    resendCalls: [], resendFail: false, markFail: false,
    profiles: new Map(), patches: [],
  };
}
let W = world();
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  const body = opt.body ? JSON.parse(opt.body) : null;
  if (u.host === 'api.resend.com') {
    W.resendCalls.push({ body, headers: opt.headers });
    if (W.resendFail) return new Response('{"message":"rate limited"}', { status: 429 });
    return json({ data: body.map((_, i) => ({ id: 'rs_' + W.resendCalls.length + '_' + i })) });
  }
  const p = u.pathname;
  if (p === '/rest/v1/ingest_runs') return opt.method === 'POST' ? json([{ id: 1 }]) : new Response(null, { status: 204 });
  if (p === '/rest/v1/email_log') return json(W.sentRowsLastDay);
  if (p === '/rest/v1/rpc/reminder_candidates') return json(W.candidates[body.p_kind] || []);
  if (p === '/rest/v1/rpc/claim_reminders') {
    const out = [];
    for (const it of body.p_items) for (const rid of it.round_ids) {
      const k = `${it.user_id}|${rid}|${body.p_kind}`;
      const row = W.log.get(k);
      if (!row) { W.log.set(k, { status: 'sending', attempts: 1 }); out.push({ user_id: it.user_id, round_id: rid }); }
      else if (row.status === 'failed' && row.attempts < 3) { row.status = 'sending'; row.attempts++; out.push({ user_id: it.user_id, round_id: rid }); }
    }
    return json(out);
  }
  if (p === '/rest/v1/rpc/mark_reminders') {
    if (W.markFail && body.p_status === 'sent') return new Response('{"message":"db down"}', { status: 500 });
    let n = 0;
    for (const it of body.p_items) for (const rid of it.round_ids) {
      const row = W.log.get(`${it.user_id}|${rid}|${body.p_kind}`);
      if (row) { row.status = body.p_status; n++; }
    }
    return json(n);
  }
  if (p === '/rest/v1/profiles') {
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    if (opt.method === 'PATCH') { W.patches.push({ id, body }); W.profiles.set(id, body.notify_round_emails); return new Response(null, { status: 204 }); }
    return json(W.profiles.has(id) ? [{ notify_round_emails: W.profiles.get(id) }] : []);
  }
  return new Response('{"message":"not faked: ' + p + '"}', { status: 404 });
};

async function runJob() {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
  await job.default({ headers: { authorization: 'Bearer cron-test-secret' }, url: '/api/cron/reminders' }, res);
  return res;
}
const cand = (user, round, lang, h, extra = {}) => ({
  user_id: user, email: user.slice(0, 4) + '@example.test', name: 'Fan ' + user.slice(0, 1), lang,
  round_id: round, league_id: 1, competition: 'Série A', flag: '🇧🇷', round_no: round, round_label: 'Regular Season - ' + round,
  deadline_utc: soon(h), ...extra,
});

// ── 1. Batching: one email per fan per window, all their rounds in it ──
W = world();
W.candidates.round_24h = [cand(U1, 14, 'pt-BR', 20), cand(U1, 9, 'pt-BR', 22, { competition: 'Premier League', flag: '🏴' }), cand(U2, 14, 'en', 20)];
let r = await runJob();
check('the job answers 200', r.code === 200, JSON.stringify(r.body));
check('one Resend call for the window', W.resendCalls.length === 1, String(W.resendCalls.length));
const sentEmails = W.resendCalls[0]?.body || [];
check('one email per fan (2 fans, 3 rounds)', sentEmails.length === 2, String(sentEmails.length));
const pt = sentEmails.find((e) => e.to[0].startsWith('1111'));
check('the Portuguese fan gets Portuguese, both rounds listed',
  !!pt && /rodadas do Scout Game fecham/.test(pt.subject) && /Rodada 14/.test(pt.html) && /Rodada 9/.test(pt.html), pt && pt.subject);
const en = sentEmails.find((e) => e.to[0].startsWith('2222'));
check('the English fan gets English, one round in the subject', !!en && /^🇧🇷 Série A · Round 14 closes in about 20 hours — pick your five$/.test(en.subject), en && en.subject);
check('every email carries the one-click unsubscribe headers',
  sentEmails.every((e) => /^<https:\/\/scoutmind\.app\/api\/email\/unsubscribe\?u=/.test(e.headers['List-Unsubscribe']) && e.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click'));
check('the sender is hello@scoutmind.app', sentEmails.every((e) => e.from === 'ScoutMind <hello@scoutmind.app>'));
check('the call has an Idempotency-Key', /^reminders\/round_24h\/[0-9a-f]{32}$/.test(W.resendCalls[0]?.headers['Idempotency-Key'] || ''));
check('every claimed row is marked sent', [...W.log.values()].every((x) => x.status === 'sent') && W.log.size === 3);
check('the response counts emails, not rows', r.body.sent === 2 && r.body.by_kind.round_24h.sent === 2, JSON.stringify(r.body));

// ── 2. A re-run never sends twice ──
r = await runJob();
check('a re-run with the same candidates sends nothing (claims refused)', W.resendCalls.length === 1 && r.body.sent === 0, JSON.stringify(r.body));

// ── 3. The 2-hour window runs first ──
W = world();
W.candidates.round_2h = [cand(U1, 15, 'en', 1.8)];
W.candidates.round_24h = [cand(U2, 16, 'en', 20)];
await runJob();
check('2-hour window first', W.resendCalls.length === 2 && /round_2h/.test(W.resendCalls[0].headers['Idempotency-Key']));
check('the 2-hour subject says about 2 hours', /closes in about 2 hours/.test(W.resendCalls[0].body[0].subject), W.resendCalls[0].body[0].subject);

// "in about N hours" never says "1 hours" (a deadline 1.5 h away once did).
{
  const at = (h) => Date.now() + h * 3600e3;
  const w = (h, l = 'en') => email.whenText(new Date(at(h)).toISOString(), l);
  check('under an hour / about an hour / about N hours',
    w(0.4) === 'in under an hour' && w(1.2) === 'in about an hour' && w(1.49) === 'in about an hour'
    && w(1.6) === 'in about 2 hours' && w(23.2) === 'in about 23 hours', [w(0.4), w(1.2), w(1.49), w(1.6), w(23.2)].join(' | '));
  check('...and in Portuguese', w(1.2, 'pt-BR') === 'em cerca de uma hora' && w(5, 'pt-BR') === 'em cerca de 5 horas');
  check('never "1 hours" / "1 horas"', ![0.2, 0.99, 1, 1.3, 1.5, 1.51].some((h) => /\b1 hora?s\b|\b1 hours\b/.test(w(h) + w(h, 'pt-BR'))));
}

// ── 4. The daily cap ──
W = world();
process.env.REMINDER_DAILY_CAP = '2';
W.sentRowsLastDay = [{ resend_id: 'a' }, { resend_id: 'a' }];          // one email (two rows) already today
W.candidates.round_24h = [cand(U1, 14, 'en', 20), cand(U2, 14, 'en', 20), cand(U3, 14, 'en', 20)];
const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
r = await runJob();
console.warn = ow;
check('the cap counts emails already sent today (rows grouped by Resend id)', W.resendCalls[0]?.body.length === 1, String(W.resendCalls[0]?.body.length));
check('the cap is reported', r.body.cap_hit === true && r.body.held_back === 2 && r.body.cursor === 'cap 2 hit, 2 held back', JSON.stringify(r.body));
check('the cap is logged', warns.some((w) => /\[reminders\] daily cap of 2 reached: 2 fan email\(s\) held back/.test(w)), warns.join(' | '));
check('held-back fans are not claimed (a later run can still email them)', W.log.size === 1);
delete process.env.REMINDER_DAILY_CAP;

// ── 5. Resend refuses: rows marked failed, retried later ──
W = world();
W.resendFail = true;
W.candidates.round_24h = [cand(U1, 14, 'en', 20)];
const oe = console.error; console.error = () => {};
r = await runJob();
check('a refused batch is marked failed', [...W.log.values()][0]?.status === 'failed' && r.body.failed === 1, JSON.stringify(r.body));
W.resendFail = false;
r = await runJob();
check('a failed row is retried on the next run', r.body.sent === 1 && [...W.log.values()][0].attempts === 2, JSON.stringify(r.body));

// ── 6. Sent but could not record it: never marked failed (no second email) ──
W = world();
W.markFail = true;
W.candidates.round_24h = [cand(U1, 14, 'en', 20)];
r = await runJob();
check('a send whose "sent" mark fails stays "sending", not "failed"', [...W.log.values()][0]?.status === 'sending' && r.body.sent === 1, JSON.stringify(r.body));
W.markFail = false;
r = await runJob();
check('...so the next run does not email that fan again', r.body.sent === 0 && W.resendCalls.length === 1, JSON.stringify(r.body));
console.error = oe;

// ── 7. The job refuses callers without the cron secret ──
{
  const res = { code: 0, status(c) { this.code = c; return this; }, json() {} };
  await job.default({ headers: {}, url: '/api/cron/reminders' }, res);
  check('no cron secret, 401', res.code === 401);
}

// ── 8. The token and the unsubscribe route ──
const tok = email.unsubscribeToken(U1);
check('a token verifies for its own user', email.verifyUnsubscribeToken(U1, tok));
check('...and not for another user', !email.verifyUnsubscribeToken(U2, tok));
check('...and a tampered token fails', !email.verifyUnsubscribeToken(U1, tok.slice(0, -2) + 'AA'));
async function call(method, query, body) {
  const res = { statusCode: 0, headers: {}, out: '', setHeader(k, v) { this.headers[k] = v; }, end(s) { this.out = s || ''; } };
  await unsub({ method, url: '/api/email/unsubscribe?' + query, body }, res);
  return res;
}
W = world(); W.profiles.set(U1, true);
let pg = await call('GET', `u=${U1}&t=${tok}`);
check('GET shows the choice', pg.statusCode === 200 && /Stop round reminders/.test(pg.out));
check('GET changes nothing (a mail scanner opening the link)', W.patches.length === 0);
check('the page is not indexed and leaks no referrer', pg.headers['X-Robots-Tag'] === 'noindex' && pg.headers['Referrer-Policy'] === 'no-referrer');
pg = await call('POST', `u=${U1}&t=${tok}`, { 'List-Unsubscribe': 'One-Click' });
check('one-click POST from the mail client turns reminders off', W.profiles.get(U1) === false && /Round reminders are off/.test(pg.out));
pg = await call('POST', `u=${U1}&t=${tok}&l=pt`, { action: 'on' });
check('the page can turn them back on, in Portuguese', W.profiles.get(U1) === true && /ligados de novo/.test(pg.out));
const before = W.patches.length;
pg = await call('POST', `u=${U1}&t=bad`, { action: 'off' });
check('a bad token changes nothing', pg.statusCode === 400 && W.patches.length === before);
pg = await call('POST', `u=${U2}&t=${tok}`, { action: 'off' });
check('another user\'s token changes nothing', pg.statusCode === 400 && W.patches.length === before);

// ── 9. The words ──
const MONEY = /\b(odds|bets?|betting|wager|stake|win money|cash|prize|apostas?|apostar|cota[cç][aã]o|dinheiro|pr[eê]mio)\b/i;
const allCopy = JSON.stringify(email.COPY) + read('api/email/unsubscribe.js');
check('no money words in the email or the unsubscribe page', !MONEY.test(allCopy), (allCopy.match(MONEY) || [])[0]);
check('both languages have the same email strings', JSON.stringify(Object.keys(email.COPY.en).sort()) === JSON.stringify(Object.keys(email.COPY['pt-BR']).sort()));
check('no clock times in the email (the server does not know the time zone)', !/toLocale|getHours|getUTCHours|getMinutes|toISOString/.test(read('api/_lib/email.js').split('// ── The words')[1].split('// ── Resend')[0]));

// ── 10. The SQL ──
const sql = read('supabase/migrations/027_round_reminders.sql').replace(/--[^\n]*/g, '');
check('notify_round_emails defaults to on, with its own UPDATE grant (rule 23)',
  /add column if not exists notify_round_emails boolean not null default true/.test(sql)
  && /grant update \(notify_round_emails\) on public\.profiles to authenticated;/.test(sql));
check('email_log: one row per user, round and kind', /primary key \(user_id, round_id, kind\)/.test(sql));
check('email_log: RLS on, the browser has no access', /alter table public\.email_log enable row level security;/.test(sql) && /revoke all on public\.email_log from anon, authenticated;/.test(sql));
check('email_log goes with the account', /user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/.test(sql));
check('windows: 24 h = (2 h, 24 h], 2 h = (now, 2 h]',
  /'round_24h' then g\.deadline_utc >  now\(\) \+ interval '2 hours' and g\.deadline_utc <= now\(\) \+ interval '24 hours'/.test(sql)
  && /'round_2h'  then g\.deadline_utc >  now\(\)\s+and g\.deadline_utc <= now\(\) \+ interval '2 hours'/.test(sql));
check('eligibility: entries this season, follows, or the main club', /join public\.follows f/.test(sql) && /p\.main_club_id = t\.id/.test(sql) && /g2\.season = r\.season/.test(sql));
check('no reminder once the fan has picked', /not exists \(select 1 from public\.game_entries x where x\.user_id = fans\.user_id and x\.round_id = r\.id\)/.test(sql));
check('opt-out and confirmed address respected', /where p\.notify_round_emails/.test(sql) && /u\.email_confirmed_at is not null/.test(sql));
check('only FAILED rows retry, at most 3 attempts', /not \(el\.status = 'failed' and el\.attempts < 3\)/.test(sql) && /where el\.status = 'failed' and el\.attempts < 3/.test(sql));
check('no 2 h mail within 6 h of the 24 h one', /el\.kind = 'round_24h'\s+and el\.status = 'sent' and el\.sent_at > now\(\) - interval '6 hours'/.test(sql));
check('language: user_metadata.lang, else pt-BR for a Brazilian main club, else en',
  /raw_user_meta_data->>'lang' ilike 'pt%' then 'pt-BR'/.test(sql) && /ml\.country = 'Brazil' then 'pt-BR'/.test(sql));
for (const f of ['reminder_candidates(text)', 'claim_reminders(text, jsonb)', 'mark_reminders(text, text, jsonb, text)']) {
  const esc = f.replace(/[()]/g, '\\$&');
  check(`${f}: service role only`, new RegExp(`revoke all on function public\\.${esc} from public, anon, authenticated;`).test(sql)
    && new RegExp(`grant execute on function public\\.${esc} to service_role;`).test(sql));
}
check('the data export includes the email log', /'emails', coalesce\(\(select jsonb_agg/.test(sql));
check('027 deletes nothing', !/\bdelete from\b/i.test(sql));
check('the new api files send no DELETE (rule 13)', !/method:\s*'DELETE'/.test(read('api/cron/reminders.js') + read('api/email/unsubscribe.js') + read('api/_lib/email.js')));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
