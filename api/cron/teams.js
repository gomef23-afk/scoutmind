// R3 — teams, venues and coaches.
//
//   /api/cron/teams              teams + venues (founded, stadium, city, crest):
//                                1 request per active league (7 today).
//   /api/cron/teams?coaches=1    the current head coach of every team, 1 request
//                                per team (146 today) plus the 7 above at the
//                                start of each cycle. Weekly on cron-job.org.
//
// The coaches pass is paced like players.js (rule 16): it stops STARTING work
// at TIME_BUDGET_MS (RUN_BUDGET_MS, api/_lib/cron.js) and saves where it got to in ingest_runs.cursor
// ({ after_team_id, cycle_started_at }); the next call resumes from there. When
// every team is done the cursor says { complete_at } and calls within
// REFRESH_DAYS do nothing (0 requests), so the job can fire several times on
// the same morning and only the first few spend anything.
//
// No deletes (rule 13). The coach is written with a PATCH on the existing row
// (id=eq.<teams.id>), never an upsert: an upsert is INSERT ... ON CONFLICT, and
// Postgres checks NOT NULL on the row it would insert before it looks for the
// conflict, so a row carrying only api_team_id + coach_name fails with 23502
// (teams.name is NOT NULL) even though the team exists. A PATCH cannot create
// a row. Teams themselves are created only by refreshTeams, with every
// required column.

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, upsert, update, select } from '../_lib/supabase.js';
import { withCron, RUN_BUDGET_MS, leaguesFromQuery } from '../_lib/cron.js';

export const TIME_BUDGET_MS = RUN_BUDGET_MS;   // 20 s: cron-job.org gives up at 30 s
export const REFRESH_DAYS = 6;          // a finished cycle waits this long before the next
const nowIso = () => new Date(Date.now()).toISOString();   // one clock for every stamp and age

/**
 * Teams + venues for the given leagues. Returns rows written. Stops starting a
 * league once `started` is TIME_BUDGET_MS old (18 leagues no longer fit every
 * morning: rule 16); the leagues it did not reach are picked up by the next
 * coaches cycle or a ?league= call. A club inserted here gets its room from
 * the database (035's teams_ensure_club_room trigger).
 */
async function refreshTeams(api, leagues, started = Date.now()) {
  let rows = 0;
  for (const lg of leagues) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const json = await api.get('teams', { league: lg.api_league_id, season: lg.current_season });
    // teams.name is NOT NULL: an entry without one would fail the whole batch.
    const teamRows = (json.response || []).filter((r) => r.team?.id && r.team?.name).map((r) => ({
      api_team_id: r.team.id,
      league_id: lg.id,
      slug: slugify(r.team.name),
      name: r.team.name,
      short_name: r.team.code || null,
      country: r.team.country || null,
      founded: r.team.founded || null,
      venue_name: r.venue?.name || null,
      venue_city: r.venue?.city || null,
      venue_capacity: r.venue?.capacity || null,
      logo_url: r.team.logo || null,
      updated_at: new Date().toISOString(),
    }));
    rows += await upsert('teams', teamRows, 'api_team_id');
  }
  return rows;
}

export default withCron('teams', async ({ req }) => {
  const started = Date.now();
  const api = createClient();
  const url = new URL(req.url, 'http://localhost');
  const withCoaches = url.searchParams.get('coaches') === '1';
  const leagues = await activeLeagues();

  if (!withCoaches) {
    // ?league=championship: that league only (its clubs, crests, venues).
    const chosen = leaguesFromQuery(req, leagues) || leagues;
    const rows = await refreshTeams(api, chosen, started);
    const s = api.stats();
    return { rows_written: rows, requests_used: s.used, quota_remaining: s.remaining, leagues: chosen.map((l) => l.slug) };
  }

  // ── Coaches, resumable ──
  // The last cursor a SUCCESSFUL coaches run saved (a teams-only run saves none).
  const last = await select(
    'ingest_runs',
    'select=cursor&job=eq.teams&ok=is.true&cursor=not.is.null&order=started_at.desc&limit=1'
  );
  let cursor = last[0]?.cursor || null;
  if (cursor?.complete_at) {
    const ageDays = (Date.now() - new Date(cursor.complete_at).getTime()) / 86_400_000;
    if (ageDays < REFRESH_DAYS) {
      return { rows_written: 0, requests_used: 0, note: 'coaches cycle complete, waiting', cursor };
    }
    cursor = null;
  }

  let rows = 0;
  if (!cursor) {
    // A new cycle starts with fresh teams and venues.
    rows += await refreshTeams(api, leagues, started);
    cursor = { after_team_id: 0, cycle_started_at: nowIso() };
  }

  const teams = await select(
    'teams',
    `select=id,api_team_id&league_id=in.(${leagues.map((l) => l.id).join(',')})`
      + `&id=gt.${Number(cursor.after_team_id) || 0}&order=id.asc`
  );

  let coachRows = 0;
  let stopped = null;
  for (const t of teams) {
    if (Date.now() - started > TIME_BUDGET_MS) { stopped = 'clock'; break; }
    if (api.lowQuota(3)) { stopped = 'quota'; break; }
    const c = await api.get('coachs', { team: t.api_team_id });
    // /coachs returns the club's coaching HISTORY, not just the incumbent —
    // the Bahia probe returned 5 entries, four of them with an open-ended
    // spell (assistants and a duplicated record). Pick the open spell at this
    // club with the latest start date.
    // No open spell at this club = no current coach we can name: store null, so
    // the club page shows no coach rather than a former one.
    const current = pickCurrentCoach(c.response || [], t.api_team_id);
    await update('teams', `id=eq.${Number(t.id)}`, { coach_name: (current && current.name) || null, updated_at: nowIso() });
    if (current && current.name) coachRows++;
    cursor = { ...cursor, after_team_id: t.id };
  }
  if (!stopped) {
    cursor = { complete_at: nowIso(), cycle_started_at: cursor.cycle_started_at };
  }

  const s = api.stats();
  return {
    rows_written: rows + coachRows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    coaches_updated: coachRows,
    teams_left: stopped ? teams.length - teams.findIndex((t) => t.id === cursor.after_team_id) - 1 : 0,
    stopped,
    cursor,
  };
});

/**
 * The coach with an open spell (no end date) at this club, latest start first.
 * Null when there is none: the first entry of the history used to be the
 * fallback, which is how a former coach ends up named as the current one.
 */
export function pickCurrentCoach(list, apiTeamId) {
  if (!list.length) return null;
  const open = [];
  for (const c of list) {
    for (const spell of c.career || []) {
      if (spell?.team?.id === apiTeamId && !spell.end) {
        open.push({ coach: c, start: spell.start || '' });
      }
    }
  }
  if (!open.length) return null;
  open.sort((a, b) => String(b.start).localeCompare(String(a.start)));
  return open[0].coach;
}

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
