// Round Recap (R-1, 21 Nov 2026): the facts of one final Scout Game round,
// from data we hold. Pure: no network, no database. api/_lib/recap-job.js
// fetches the inputs and stores what buildRecap() returns in round_recaps
// (migration 042); the screens (R-2) turn it into templated sentences.
//
// The rules (decided 21 Nov 2026):
//   * Numbers and names only. Every line is optional: a value we cannot
//     compute is left OUT of the result, never filled with a guess (rule 18).
//   * A player's points are base points as the game scores them (the same
//     columns as the job's scoring, SCORED_COLUMNS in scout-game.js).
//   * Best pick = the picked player with the most points at his tier
//     multiplier, captain bonus excluded, so everyone who picked him shares
//     one number. Who picked him: up to two fans by id, and how many.
//   * Captain delivered = the captain was that fan's best-scoring pick of the
//     five (base points; a tie counts as delivered).
//   * Most picked needs a player picked at least twice; ownership is never
//     stored as a share or a count (029: bands only). The quiet star needs
//     OWNERSHIP_MIN_PARTICIPANTS entries.
//   * Upset = the winner sat at least UPSET_PLACES below the loser in the same
//     table of the last standings snapshot before the deadline.
//   * Fans are stored by user id only; names are read when the recap is
//     read (rpc round_recap), so a deleted account leaves no name behind.

import { basePoints, pickTotal } from './scout-game.js';

export const RECAP_VERSION = 1;
export const PLAYED = ['FT', 'AET', 'PEN'];
export const NOT_PLAYED = ['PST', 'CANC', 'ABD', 'AWD', 'WO'];
export const UPSET_PLACES = 8;
export const SNAPSHOT_MAX_AGE_DAYS = 10;   // an older table says nothing about this round
export const TOP_RATING_MIN_MINUTES = 45;  // a ten-minute cameo can carry a 9.0
export const TIER_MIN_PLAYERS = 10;        // a tier needs this many players to be compared
export const QUIET_MAX_SHARE = 0.05;       // "few fans picked him": 5% of entries or fewer
export const QUIET_TOP_N = 10;             // …and his points among the round's top 10

const round1 = (x) => Math.round(x * 10) / 10;
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Can this round be recapped? Every counting fixture is either played with its
 * player rows in, or not played at all; and at least one was played.
 */
export function recapComplete(fixtures) {
  if (!fixtures.length) return false;
  let played = 0;
  for (const f of fixtures) {
    if (NOT_PLAYED.includes(f.status_short)) continue;
    if (!PLAYED.includes(f.status_short) || !f.players_fetched_at) return false;
    played++;
  }
  return played > 0;
}

/**
 * input = {
 *   fixtures:  the round's counting fixtures { id, home_team_id, away_team_id, home_goals, away_goals, status_short, kickoff_utc },
 *   rows:      player_fixture_stats rows of those fixtures (SCORED_COLUMNS + fixture_id, player_id, team_id, minutes, goals, rating),
 *   ownGoals:  Map `${fixture_id}:${player_id}` -> own goals,
 *   snapshot:  { date, rows: [{ team_id, rank, group_label }] } | null  (already checked for age),
 *   tiers:     player_tiers_at(league, season, deadline) rows | null,
 *   ladder:    { tiers: {5: 1, …}, unranked },
 *   entries:   [{ id, user_id, submitted_at }],
 *   picks:     [{ entry_id, slot, player_id, is_captain, locked_multiplier }],
 *   scores:    [{ entry_id, slot, base_points }],
 *   results:   [{ user_id, total, captain_points, submitted_at }],
 *   minParticipants,
 * }
 * Returns the recap's data (version 1); `people` lists every player it names
 * with his club, for the job to add the names.
 */
export function buildRecap(input) {
  const { fixtures, rows = [], ownGoals = new Map(), snapshot = null, tiers = null, ladder = null,
    entries = [], picks = [], scores = [], results = [], minParticipants = 20 } = input;
  const data = { v: RECAP_VERSION };
  const people = new Map();   // player_id -> team_id
  const name = (pid) => { if (!people.has(pid)) people.set(pid, teamOf.get(pid) ?? null); return pid; };

  // ── matches ──
  const played = fixtures.filter((f) => PLAYED.includes(f.status_short)
    && Number.isFinite(f.home_goals) && Number.isFinite(f.away_goals))
    .sort((a, b) => String(a.kickoff_utc).localeCompare(String(b.kickoff_utc)) || a.id - b.id);
  const res = (f) => ({ f: f.id, h: f.home_team_id, a: f.away_team_id, hg: f.home_goals, ag: f.away_goals });
  if (played.length) {
    const m = { played: played.length, goals: played.reduce((s, f) => s + f.home_goals + f.away_goals, 0), results: played.map(res) };
    const margin = (f) => Math.abs(f.home_goals - f.away_goals);
    const top = Math.max(...played.map(margin));
    if (top > 0) {
      m.big_wins = played.filter((f) => margin(f) === top)
        .sort((a, b) => (b.home_goals + b.away_goals) - (a.home_goals + a.away_goals))
        .slice(0, 3).map(res);
    }
    if (snapshot && snapshot.rows && snapshot.rows.length) {
      const at = new Map(snapshot.rows.filter((r) => Number.isFinite(r.rank)).map((r) => [r.team_id, r]));
      const ups = [];
      for (const f of played) {
        if (f.home_goals === f.away_goals) continue;
        const [w, l] = f.home_goals > f.away_goals ? [f.home_team_id, f.away_team_id] : [f.away_team_id, f.home_team_id];
        const W = at.get(w), Lr = at.get(l);
        if (!W || !Lr || (W.group_label ?? null) !== (Lr.group_label ?? null)) continue;
        if (W.rank - Lr.rank >= UPSET_PLACES) ups.push({ f: f.id, w, l, wr: W.rank, lr: Lr.rank });
      }
      if (ups.length) { m.upsets = ups.sort((a, b) => (b.wr - b.lr) - (a.wr - a.lr)); m.snapshot_date = snapshot.date; }
    }
    data.matches = m;
  }

  // ── base points per player, the round's counting fixtures summed ──
  const playedIds = new Set(played.map((f) => f.id));
  const base = new Map();      // player_id -> base
  const goals = new Map();
  const teamOf = new Map();
  const bestRating = new Map(); // player_id -> { rating, minutes }
  for (const r of rows) {
    if (!playedIds.has(r.fixture_id)) continue;
    const b = basePoints(r, ownGoals.get(`${r.fixture_id}:${r.player_id}`) || 0).base;
    base.set(r.player_id, round2((base.get(r.player_id) || 0) + b));
    goals.set(r.player_id, (goals.get(r.player_id) || 0) + (Number(r.goals) || 0));
    teamOf.set(r.player_id, r.team_id);
    const rating = r.rating === null || r.rating === undefined ? NaN : Number(r.rating);
    if (Number.isFinite(rating) && (Number(r.minutes) || 0) >= TOP_RATING_MIN_MINUTES) {
      const cur = bestRating.get(r.player_id);
      if (!cur || rating > cur.rating) bestRating.set(r.player_id, { rating, minutes: Number(r.minutes) });
    }
  }
  const byBase = (a, b) => (base.get(b) || 0) - (base.get(a) || 0) || a - b;

  const pl = {};
  const maxGoals = Math.max(0, ...goals.values());
  if (maxGoals > 0) {
    const ids = [...goals.keys()].filter((id) => goals.get(id) === maxGoals).sort(byBase);
    pl.top_scorers = { goals: maxGoals, ids: ids.slice(0, 3).map(name) };
    if (ids.length > 3) pl.top_scorers.more = ids.length - 3;
  }
  if (bestRating.size) {
    const [id, r] = [...bestRating.entries()].sort((a, b) => b[1].rating - a[1].rating || byBase(a[0], b[0]))[0];
    pl.top_rating = { id: name(id), rating: round1(r.rating), minutes: r.minutes };
  }

  // ── the tier that paid best: every player of the round's clubs, by his tier at the deadline ──
  if (tiers && tiers.length && ladder && played.length) {
    const clubs = new Set(played.flatMap((f) => [f.home_team_id, f.away_team_id]));
    const groups = new Map();   // 'u' | 1..5 -> [points]
    for (const t of tiers) {
      if (!clubs.has(t.team_id)) continue;
      const k = t.tier ?? 'u';
      const mult = t.tier ? ladder.tiers[t.tier] : ladder.unranked;
      if (!Number.isFinite(mult)) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(pickTotal(base.get(t.player_id) || 0, mult));
    }
    const ok = [...groups.entries()].filter(([, v]) => v.length >= TIER_MIN_PLAYERS)
      .map(([k, v]) => ({ tier: k === 'u' ? null : Number(k), mean: v.reduce((s, x) => s + x, 0) / v.length, n: v.length }));
    if (ok.length >= 2) {
      const best = ok.sort((a, b) => b.mean - a.mean || (b.tier ?? 0) - (a.tier ?? 0))[0];
      data.tiers = { best: { tier: best.tier, mean: round1(best.mean), n: best.n } };
    }
  }

  // ── Scout Game ──
  if (entries.length) {
    const g = { entries: entries.length };
    const entryOf = new Map(entries.map((e) => [e.id, e]));
    const slotBase = new Map();   // `${entry}:${slot}` -> base as scored
    for (const s of scores) {
      const k = `${s.entry_id}:${s.slot}`;
      slotBase.set(k, round2((slotBase.get(k) || 0) + Number(s.base_points || 0)));
    }
    const picksOf = new Map();    // player_id -> [pick]
    for (const p of picks) {
      if (!entryOf.has(p.entry_id) || p.player_id == null) continue;
      if (!picksOf.has(p.player_id)) picksOf.set(p.player_id, []);
      picksOf.get(p.player_id).push(p);
    }
    // A picked player's base as the game scored it (0 if he did not play).
    const pickedBase = (pid) => {
      const p = picksOf.get(pid)[0];
      return slotBase.get(`${p.entry_id}:${p.slot}`) || 0;
    };

    const counted = [...picksOf.entries()].map(([pid, ps]) => ({ pid, n: ps.length, b: pickedBase(pid) }));
    const most = counted.sort((a, b) => b.n - a.n || b.b - a.b || a.pid - b.pid)[0];
    if (most && most.n >= 2) g.most_picked = { id: name(most.pid), base: most.b };

    const best = counted.map((c) => {
      const mult = Math.max(...picksOf.get(c.pid).map((p) => Number(p.locked_multiplier) || 1));
      return { ...c, mult, pts: pickTotal(c.b, mult) };
    }).sort((a, b) => b.pts - a.pts || b.b - a.b || a.pid - b.pid)[0];
    if (best && best.pts > 0) {
      const by = picksOf.get(best.pid).map((p) => entryOf.get(p.entry_id))
        .sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)) || String(a.user_id).localeCompare(String(b.user_id)))
        .map((e) => e.user_id);
      g.best_pick = { id: name(best.pid), base: best.b, multiplier: best.mult, points: best.pts, by: by.slice(0, 2), fans: by.length };
    }

    let delivered = 0, of = 0;
    for (const e of entries) {
      const mine = picks.filter((p) => p.entry_id === e.id);
      const cap = mine.find((p) => p.is_captain);
      if (!cap) continue;
      of++;
      const cb = slotBase.get(`${e.id}:${cap.slot}`) || 0;
      if (mine.every((p) => p === cap || (slotBase.get(`${e.id}:${p.slot}`) || 0) <= cb)) delivered++;
    }
    if (of) g.captains = { delivered, of };

    if (results.length) {
      g.top3 = [...results].sort((a, b) => Number(b.total) - Number(a.total) || Number(b.captain_points) - Number(a.captain_points)
        || String(a.submitted_at).localeCompare(String(b.submitted_at)) || String(a.user_id).localeCompare(String(b.user_id)))
        .slice(0, 3).map((r, i) => ({ u: r.user_id, total: round2(Number(r.total)), rank: i + 1 }));
    }

    if (entries.length >= minParticipants && base.size) {
      const top = [...base.keys()].sort(byBase).slice(0, QUIET_TOP_N);
      const quiet = top.find((pid) => (picksOf.get(pid) || []).length / entries.length <= QUIET_MAX_SHARE && (base.get(pid) || 0) > 0);
      if (quiet !== undefined) pl.quiet_star = { id: name(quiet), base: base.get(quiet) };
    }
    data.game = g;
  }

  if (Object.keys(pl).length) data.players = pl;
  for (const pid of people.keys()) people.set(pid, teamOf.get(pid) ?? null);
  return { data, people };
}
