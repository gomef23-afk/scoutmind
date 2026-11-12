// /api/cron/reminders — "your Scout Game round closes soon" emails.
//
// cron-job.org calls it every 30 minutes with Authorization: Bearer CRON_SECRET.
// Zero API-Football requests: it reads Supabase and talks to Resend.
//
// Each run, the 2-hour window first (more urgent), then the 24-hour one:
//   1. reminder_candidates(kind)  who should hear about which rounds (027)
//   2. one email per fan per window, listing every round of theirs that is
//      closing (the batching agreed on Day 7)
//   3. claim_reminders()          log rows as 'sending' BEFORE sending; only the
//                                  rows this run claimed may be emailed, so two
//                                  overlapping runs can never both send
//   4. Resend batch API            up to 100 emails a call, Idempotency-Key
//   5. mark_reminders()            'sent' with Resend's id, or 'failed' (retried
//                                  on a later run, at most 3 attempts)
// A row left 'sending' by a crash is never retried: its outcome is unknown,
// and a duplicate is worse than a missed reminder.
//
// Daily cap: REMINDER_DAILY_CAP emails (default 60) in a rolling 24 h. Resend's
// free tier is 100 a day and the sign-up / password emails share it, so ~40
// stay free for those. When the cap is hit the run says so: in the log line,
// in the response cron-job.org keeps, and in ingest_runs.cursor.
//
// Rule 13: nothing here deletes. Rule 16: bounded by wall clock (~20 s).

import { withCron } from '../_lib/cron.js';
import { rpc, select } from '../_lib/supabase.js';
import { reminderEmail, sendBatch } from '../_lib/email.js';
import { createHash } from 'node:crypto';

const KINDS = ['round_2h', 'round_24h'];
const BATCH = 100;
const BUDGET_MS = 20000;

/** Candidate rows -> one fan per user, rounds soonest first. */
export function groupByFan(rows) {
  const fans = new Map();
  for (const r of rows || []) {
    if (!fans.has(r.user_id)) {
      fans.set(r.user_id, { user_id: r.user_id, email: r.email, name: r.name, lang: r.lang, rounds: [] });
    }
    const f = fans.get(r.user_id);
    if (!f.rounds.some((x) => x.round_id === r.round_id)) f.rounds.push(r);
  }
  for (const f of fans.values()) f.rounds.sort((a, b) => String(a.deadline_utc).localeCompare(String(b.deadline_utc)));
  return [...fans.values()];
}

/** Emails sent in the last 24 h: distinct Resend ids (one email = several log rows). */
async function sentLastDay() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = await select('email_log', `select=resend_id&status=eq.sent&sent_at=gte.${encodeURIComponent(since)}&limit=10000`);
  return new Set(rows.map((r, i) => r.resend_id || 'unknown-' + i)).size;
}

export default withCron('reminders', async () => {
  const started = Date.now();
  const cap = Math.max(0, Number(process.env.REMINDER_DAILY_CAP || 60));
  let budget = cap - (await sentLastDay());
  const out = { sent: 0, failed: 0, held_back: 0, cap_hit: false, cap, by_kind: {} };

  for (const kind of KINDS) {
    const fans = groupByFan(await rpc('reminder_candidates', { p_kind: kind }));
    out.by_kind[kind] = { candidates: fans.length, sent: 0 };
    if (!fans.length) continue;

    // The cap decides who is even claimed: a fan held back stays unclaimed and
    // is picked up by a later run once the rolling day has room again.
    // At most one Resend batch per window per run, so everything claimed is
    // sent in the same call (a claim that is never sent is never retried).
    const room = Math.max(0, Math.min(budget, BATCH));
    const take = fans.slice(0, room);
    if (take.length < fans.length) {
      if (budget < fans.length) out.cap_hit = true;
      out.held_back += fans.length - take.length;
    }
    if (!take.length) continue;
    if (Date.now() - started > BUDGET_MS) {
      console.warn(`[reminders] out of time before ${kind}: ${take.length} fan(s) left for the next run`);
      out.held_back += take.length;
      continue;
    }

    // Claim, then send only what this run claimed.
    const claimed = await rpc('claim_reminders', {
      p_kind: kind,
      p_items: take.map((f) => ({ user_id: f.user_id, round_ids: f.rounds.map((r) => r.round_id) })),
    });
    const mine = new Map();
    for (const c of claimed || []) {
      if (!mine.has(c.user_id)) mine.set(c.user_id, new Set());
      mine.get(c.user_id).add(Number(c.round_id));
    }
    const ready = take
      .map((f) => ({ ...f, rounds: f.rounds.filter((r) => mine.get(f.user_id)?.has(Number(r.round_id))) }))
      .filter((f) => f.rounds.length);

    if (!ready.length) continue;                             // another run claimed them

    // <= BATCH by construction: one call. The key is the batch's content, so
    // a retry of the very same batch is a no-op at Resend.
    const items = ready.map((f) => ({ user_id: f.user_id, round_ids: f.rounds.map((r) => r.round_id) }));
    const key = 'reminders/' + kind + '/' + createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 32);
    let ids;
    try {
      ids = await sendBatch(ready.map((f) => reminderEmail(f, kind)), key);
    } catch (e) {
      // Resend refused: nothing went out, so these rows may be retried.
      console.error(`[reminders] ${kind} batch failed:`, e.message);
      await rpc('mark_reminders', { p_kind: kind, p_status: 'failed', p_items: items, p_error: e.message })
        .catch((e2) => console.error('[reminders] could not mark the batch failed:', e2.message));
      out.failed += ready.length;
      continue;
    }
    out.sent += ready.length;
    out.by_kind[kind].sent += ready.length;
    budget -= ready.length;
    // Sent. If recording that fails, the rows stay 'sending' and are never
    // retried: better a missing 'sent' stamp than a second email.
    await rpc('mark_reminders', {
      p_kind: kind, p_status: 'sent',
      p_items: items.map((it, j) => ({ ...it, resend_id: ids[j] || null })),
    }).catch((e) => console.error('[reminders] sent, but could not mark them sent:', e.message));
  }

  if (out.cap_hit) {
    console.warn(`[reminders] daily cap of ${cap} reached: ${out.held_back} fan email(s) held back for a later run`);
  }
  return {
    ...out,
    rows_written: out.sent,
    cursor: out.cap_hit ? `cap ${cap} hit, ${out.held_back} held back` : null,
  };
});
