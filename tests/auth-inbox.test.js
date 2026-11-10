// auth.html's "Check your inbox" panel waits for the confirmation by itself.
//
//   node tests/auth-inbox.test.js
//
// The wait is a repeated sign-in, and Supabase allows 30 sign-ins per 5
// minutes per IP by default: this pins the schedule under that budget, with
// room left for the person's own attempts. Also: the password is never put
// in storage, the poll stops when the panel is left, and the one-minute hint
// exists in both languages. No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const html = read('public/auth.html');
const num = (name) => { const m = new RegExp(name + '\\s*=\\s*(\\d+)').exec(html); return m ? Number(m[1]) : NaN; };
const FAST_MS = num('INBOX_FAST_MS'), FAST_FOR = num('INBOX_FAST_FOR'), SLOW_MS = num('INBOX_SLOW_MS'),
      STOP_AT = num('INBOX_STOP_AT'), MAX = num('INBOX_MAX_PROBES');
check('the timing constants are all there', [FAST_MS, FAST_FOR, SLOW_MS, STOP_AT, MAX].every(Number.isFinite),
  [FAST_MS, FAST_FOR, SLOW_MS, STOP_AT, MAX].join(', '));
check('every 5 s for the first minute (as asked)', FAST_MS === 5000 && FAST_FOR === 60000);

// Replay inboxSchedule(): a probe fires after FAST_MS while under FAST_FOR,
// after SLOW_MS afterwards, and nothing is scheduled once STOP_AT or MAX is hit.
let at = 0, probes = 0;
for (;;) {
  if (at >= STOP_AT || probes >= MAX) break;
  at += at < FAST_FOR ? FAST_MS : SLOW_MS;
  probes++;
}
const inFiveMin = probes;                                  // the whole run fits in ~5 minutes
check(`at most ${MAX} sign-in probes in the whole wait (${inFiveMin})`, inFiveMin <= MAX);
check('leaves at least 5 of Supabase\'s 30 sign-ins per 5 minutes for the person', inFiveMin <= 25, String(inFiveMin));
check('the wait ends by about 5 minutes', at <= STOP_AT + SLOW_MS, String(at));

// The behaviour, from the source.
const script = html.slice(html.indexOf('// ── WAITING FOR THE CONFIRMATION'));
check('a local session for the address is checked first, without a request',
  script.indexOf('sb.auth.getSession()') > -1 && script.indexOf('sb.auth.getSession()') < script.indexOf('signInWithPassword'));
check('only "not confirmed" (or a network failure) keeps it going',
  /if \(\/not confirmed\/i\.test\(m\) \|\| \/failed to fetch\|network\/i\.test\(m\)\) return inboxSchedule\(\);\s*stopInboxPoll\(\);/.test(script));
check('it pauses while the tab is hidden', /if \(document\.hidden\) \{ INBOX\.paused = true; return; \}/.test(script));
check('no request while offline', /if \(!navigator\.onLine\) return inboxSchedule\(\);/.test(script));
check('stopping clears the password', /function stopInboxPoll\(\) \{[^}]*INBOX\.pass = '';/.test(script));
check('leaving the inbox panel stops it', /if \(name !== 'inbox'\) \{ stopInboxPoll\(\);/.test(html));
check('the password is never put in storage',
  ![...html.matchAll(/(?:localStorage|sessionStorage)\.setItem\(([^)]*)\)/g)].some((m) => /pass/i.test(m[1])));
check('sign-up and the not-confirmed sign-in both start the wait', /showInbox\(email, pass\);\s*showError/.test(html) && /showInbox\(email, pass\);\s*\}/.test(html));
check('a confirmation goes through onConfirmed (saves the user, shows "Email confirmed")', /function inboxDone\(session\) \{\s*stopInboxPoll\(\);\s*onConfirmed\(session\);/.test(script));
check('the one-minute hint has its own timer', /setTimeout\(function \(\) \{ inboxHint\(true\); \}, INBOX_FAST_FOR\)/.test(html));

// The hint text, both languages.
const ctx = { console: { warn() {} }, Intl, navigator: { language: 'en' }, localStorage: { getItem: () => null, setItem() {} } };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read('public/i18n.js'), ctx);
const en = ctx.I18N.en['auth.inbox.slow'], pt = ctx.I18N['pt-BR']['auth.inbox.slow'];
check('the hint in English', en === "Didn't get it? Check spam. If you use a work email, your account may already be confirmed — try Sign in.", en);
check('the hint in Portuguese', !!pt && /spam/.test(pt) && /trabalho/.test(pt), pt);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
