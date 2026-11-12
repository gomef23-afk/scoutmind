// Round reminder emails: the signed unsubscribe token, the email itself (en and
// pt-BR), and Resend's HTTP API. Zero dependencies, like the rest of api/.
//
// Env (Vercel, Production only, so a preview deploy can never send):
//   RESEND_API_KEY      a Resend key with Sending access for scoutmind.app
//   EMAIL_TOKEN_SECRET  32+ random bytes, base64; signs unsubscribe links.
//                       Changing it invalidates every link already sent.
//
// Copy rules: no odds, bets, stakes or money of any kind (tests/reminders
// checks both languages), and no clock times: the server does not know the
// reader's time zone, so a deadline is said as "in about N hours".

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SITE = 'https://scoutmind.app';
export const FROM = 'ScoutMind <hello@scoutmind.app>';
export const REPLY_TO = 'hello@scoutmind.app';

// ── The unsubscribe token ────────────────────────────────────────────────
// HMAC-SHA256 over a purpose-tagged user id, base64url. No expiry: an
// unsubscribe link must keep working for as long as the email exists.
function secret() {
  const s = process.env.EMAIL_TOKEN_SECRET;
  if (!s || s.length < 32) throw new Error('EMAIL_TOKEN_SECRET is not set (or shorter than 32 characters)');
  return s;
}
export function unsubscribeToken(userId) {
  return createHmac('sha256', secret()).update('unsub:v1:' + String(userId)).digest('base64url');
}
export function verifyUnsubscribeToken(userId, token) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || '')) || !token) return false;
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(String(token));
  return want.length === got.length && timingSafeEqual(want, got);
}
export function unsubscribeUrl(userId, lang) {
  return `${SITE}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`
    + (lang === 'pt-BR' ? '&l=pt' : '');
}

// ── The words ────────────────────────────────────────────────────────────
export const COPY = {
  en: {
    subjectOne: '{round} closes {when} — pick your five',
    subjectMany: '{n} Scout Game rounds close {when}',
    title: 'Your Scout Game round closes soon',
    titleMany: 'Your Scout Game rounds close soon',
    hi: 'Hi {name},',
    hiNoName: 'Hi,',
    intro: 'You have not picked your five yet for:',
    closes: 'closes {when}',
    rule: 'Picks lock at the first kickoff of the round.',
    button: 'Pick your five',
    why: 'You get this because you play the Scout Game in this competition or follow a club in it.',
    stop: 'Stop round reminders',
    stopTail: ' — or turn them off in Profile → Preferences.',
    round: 'Round {n}',
    in1h: 'in about an hour',
    inUnder1h: 'in under an hour',
    inHours: 'in about {n} hours',
    within: 'within {n} hours',
  },
  'pt-BR': {
    subjectOne: '{round} fecha {when} — escale seus cinco',
    subjectMany: '{n} rodadas do Scout Game fecham {when}',
    title: 'Sua rodada do Scout Game fecha em breve',
    titleMany: 'Suas rodadas do Scout Game fecham em breve',
    hi: 'Olá, {name},',
    hiNoName: 'Olá,',
    intro: 'Você ainda não escalou seus cinco para:',
    closes: 'fecha {when}',
    rule: 'A escalação trava no início do primeiro jogo da rodada.',
    button: 'Escalar meus cinco',
    why: 'Você recebe este e-mail porque joga o Scout Game nesta competição ou segue um clube dela.',
    stop: 'Parar os lembretes de rodada',
    stopTail: ' — ou desligue em Perfil → Preferências.',
    round: 'Rodada {n}',
    in1h: 'em cerca de uma hora',
    inUnder1h: 'em menos de uma hora',
    inHours: 'em cerca de {n} horas',
    within: 'em até {n} horas',
  },
};

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? m : String(v[k])));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * "in under an hour" / "in about an hour" / "in about 23 hours", from the
 * deadline and now. Never "1 hours": below 1.5 h it is "about an hour".
 */
export function whenText(deadline, lang, now = Date.now()) {
  const c = COPY[lang] || COPY.en;
  const h = (new Date(deadline).getTime() - now) / 3600000;
  if (h < 1) return c.inUnder1h;
  if (h < 1.5) return c.in1h;
  return fill(c.inHours, { n: Math.round(h) });
}

/** "🇧🇷 Série A · Round 14" */
export function roundName(r, lang) {
  const c = COPY[lang] || COPY.en;
  const label = r.round_no ? fill(c.round, { n: r.round_no }) : (r.round_label || '');
  return `${r.flag ? r.flag + ' ' : ''}${r.competition} · ${label}`;
}

/**
 * One fan's email for one window: { to, subject, html, text, headers }.
 * fan = { user_id, email, name, lang, rounds: [{ competition, flag, round_no,
 * round_label, deadline_utc }] }, rounds soonest first.
 */
export function reminderEmail(fan, kind, now = Date.now()) {
  const lang = fan.lang === 'pt-BR' ? 'pt-BR' : 'en';
  const c = COPY[lang];
  const rounds = fan.rounds;
  const first = rounds[0];
  const soonest = whenText(first.deadline_utc, lang, now);
  const subject = rounds.length === 1
    ? fill(c.subjectOne, { round: roundName(first, lang), when: soonest })
    : fill(c.subjectMany, { n: rounds.length, when: kind === 'round_2h' ? fill(c.within, { n: 2 }) : fill(c.within, { n: 24 }) });
  const unsub = unsubscribeUrl(fan.user_id, lang);
  const pickUrl = `${SITE}/?page=scout`;
  const hi = fan.name ? fill(c.hi, { name: fan.name }) : c.hiNoName;
  const lines = rounds.map((r) => ({ name: roundName(r, lang), when: fill(c.closes, { when: whenText(r.deadline_utc, lang, now) }) }));

  const text = [
    hi, '', c.intro, '',
    ...lines.map((l) => `• ${l.name} — ${l.when}`), '',
    c.rule, '',
    `${c.button}: ${pickUrl}`, '',
    '—', c.why,
    `${c.stop}: ${unsub}`,
  ].join('\n');

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:0;background:#07090f;">
<div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:Arial,Helvetica,sans-serif;color:#edf2f7;background:#07090f;">
<div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#00e5a0;margin-bottom:18px;">SCOUT<span style="color:#edf2f7;">MIND</span></div>
<div style="font-size:18px;font-weight:bold;margin-bottom:14px;">${esc(rounds.length === 1 ? c.title : c.titleMany)}</div>
<p style="font-size:14px;line-height:1.6;color:#c7d3e4;margin:0 0 6px;">${esc(hi)}</p>
<p style="font-size:14px;line-height:1.6;color:#c7d3e4;margin:0 0 12px;">${esc(c.intro)}</p>
${lines.map((l) => `<div style="background:#0d1117;border:1px solid #1a2540;border-radius:10px;padding:12px 14px;margin:0 0 8px;"><div style="font-size:14px;font-weight:bold;">${esc(l.name)}</div><div style="font-size:12px;color:#8fa3bf;margin-top:2px;">${esc(l.when)}</div></div>`).join('\n')}
<p style="font-size:12px;line-height:1.6;color:#8fa3bf;margin:10px 0 18px;">${esc(c.rule)}</p>
<a href="${pickUrl}" style="display:inline-block;background:#00e5a0;color:#000000;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 22px;border-radius:8px;">${esc(c.button)}</a>
<p style="font-size:11px;line-height:1.6;color:#5a6a85;margin:28px 0 0;">${esc(c.why)}<br><a href="${esc(unsub)}" style="color:#8fa3bf;">${esc(c.stop)}</a>${esc(c.stopTail)}</p>
</div></body></html>`;

  return {
    to: [fan.email],
    subject,
    html,
    text,
    headers: {
      // One-click unsubscribe (RFC 8058): Gmail and Apple Mail show their own
      // button and POST to this URL with "List-Unsubscribe=One-Click".
      'List-Unsubscribe': `<${unsub}>, <mailto:${REPLY_TO}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

// ── Resend ───────────────────────────────────────────────────────────────
/**
 * Send up to 100 emails in one call (Resend's batch endpoint). The
 * Idempotency-Key makes a retried call with the same batch a no-op on
 * Resend's side for 24 h. Returns the Resend ids in the same order, or throws
 * with Resend's own message (never just a status, rule 20).
 */
export async function sendBatch(emails, idempotencyKey) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  if (!emails.length) return [];
  if (emails.length > 100) throw new Error('Resend batch takes at most 100 emails');
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(emails.map((e) => ({ from: FROM, reply_to: REPLY_TO, ...e }))),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  let parsed = null;
  try { parsed = JSON.parse(body); } catch (e) {}
  const data = (parsed && (parsed.data || parsed)) || [];
  return Array.isArray(data) ? data.map((d) => d && d.id) : [];
}
