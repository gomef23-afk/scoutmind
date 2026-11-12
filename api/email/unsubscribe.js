// /api/email/unsubscribe?u=<user id>&t=<signed token>[&l=pt]
//
// The link at the bottom of every round reminder, and the List-Unsubscribe
// target Gmail / Apple Mail use for their own button. Works without signing
// in: the token (HMAC of the user id, api/_lib/email.js) is the proof.
//
//   GET   shows the choice and changes NOTHING. Mail scanners open every link
//         in a message (a corporate scanner confirmed a sign-up on Day 6); a
//         GET that unsubscribed would turn reminders off for whoever's inbox
//         is scanned.
//   POST  action=off | on from the page's buttons, or the one-click body
//         "List-Unsubscribe=One-Click" from a mail client (RFC 8058) -> off.
//
// Writes one column, profiles.notify_round_emails, with the service role
// (a PATCH: rule 13 stays intact). The same switch is in Profile ->
// Preferences.

import { select, update } from '../_lib/supabase.js';
import { verifyUnsubscribeToken } from '../_lib/email.js';

const T = {
  en: {
    title: 'Round reminder emails',
    on: 'Round reminder emails are on for this account.',
    off: 'Round reminder emails are off for this account. You will not get them any more.',
    stop: 'Stop round reminders',
    restart: 'Turn them back on',
    doneOff: 'Done. Round reminders are off.',
    doneOn: 'Done. Round reminders are back on.',
    bad: 'This link is not valid. Turn reminders off in ScoutMind: Profile → Preferences.',
    unavailable: 'This is not available yet. Try again later, or turn reminders off in Profile → Preferences.',
    back: 'Go to ScoutMind',
  },
  pt: {
    title: 'E-mails de lembrete de rodada',
    on: 'Os lembretes de rodada estão ligados para esta conta.',
    off: 'Os lembretes de rodada estão desligados para esta conta. Você não vai mais recebê-los.',
    stop: 'Parar os lembretes de rodada',
    restart: 'Ligar de novo',
    doneOff: 'Pronto. Os lembretes de rodada foram desligados.',
    doneOn: 'Pronto. Os lembretes de rodada foram ligados de novo.',
    bad: 'Este link não é válido. Desligue os lembretes no ScoutMind: Perfil → Preferências.',
    unavailable: 'Isto ainda não está disponível. Tente mais tarde ou desligue os lembretes em Perfil → Preferências.',
    back: 'Ir para o ScoutMind',
  },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(res, status, lang, message, form) {
  const c = T[lang];
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Referrer-Policy', 'no-referrer');          // the token is in the URL
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
  res.end(`<!doctype html><html lang="${lang === 'pt' ? 'pt-BR' : 'en'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ScoutMind — ${esc(c.title)}</title></head>
<body style="margin:0;background:#07090f;color:#edf2f7;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:420px;margin:0 auto;padding:40px 20px;">
<div style="font-size:22px;font-weight:bold;letter-spacing:3px;color:#00e5a0;margin-bottom:22px;">SCOUT<span style="color:#edf2f7;">MIND</span></div>
<h1 style="font-size:20px;margin:0 0 12px;">${esc(c.title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#c7d3e4;">${esc(message)}</p>
${form || ''}
<p style="margin-top:28px;"><a href="/" style="color:#8fa3bf;font-size:14px;">${esc(c.back)}</a></p>
</div></body></html>`);
}

function button(action, label, primary) {
  return `<form method="post" style="margin:18px 0 0;"><input type="hidden" name="action" value="${action}">`
    + `<button type="submit" style="min-height:44px;padding:0 20px;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer;`
    + (primary ? 'background:#00e5a0;color:#000;border:none;' : 'background:transparent;color:#edf2f7;border:1px solid #2a3a52;')
    + `">${esc(label)}</button></form>`;
}

/** The POST body, whether Vercel parsed it or not. */
async function formBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://scoutmind.app');
  const lang = url.searchParams.get('l') === 'pt' ? 'pt' : 'en';
  const c = T[lang];
  const u = url.searchParams.get('u') || '';
  const t = url.searchParams.get('t') || '';

  let valid = false;
  try { valid = verifyUnsubscribeToken(u, t); }
  catch (e) { console.error('unsubscribe:', e.message); return page(res, 500, lang, c.unavailable); }
  if (!valid) return page(res, 400, lang, c.bad);

  if (req.method === 'POST') {
    const body = await formBody(req).catch(() => ({}));
    // One-click from the mail client, or a button on this page.
    const turnOn = body.action === 'on';
    try {
      await update('profiles', `id=eq.${encodeURIComponent(u)}`, { notify_round_emails: turnOn });
    } catch (e) {
      console.error('unsubscribe update:', e.message);
      return page(res, 503, lang, c.unavailable);
    }
    return page(res, 200, lang, turnOn ? c.doneOn : c.doneOff,
      turnOn ? button('off', c.stop, false) : button('on', c.restart, false));
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.setHeader('Allow', 'GET, POST'); return res.end();
  }

  // GET: show where things stand, and the button. Nothing changes here.
  let rows;
  try { rows = await select('profiles', `select=notify_round_emails&id=eq.${encodeURIComponent(u)}`); }
  catch (e) { console.error('unsubscribe read:', e.message); return page(res, 503, lang, c.unavailable); }
  const on = !rows.length || rows[0].notify_round_emails !== false;
  return page(res, 200, lang, on ? c.on : c.off, on ? button('off', c.stop, true) : button('on', c.restart, false));
}
