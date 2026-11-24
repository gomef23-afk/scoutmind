// R4 — league tables.
// Cost: 1 request per active league a day. A league whose season ended more
// than 8 days ago is skipped: its final table is already held.
//
// Paced like fixtures.js (rule 16): stops STARTING a league at RUN_BUDGET_MS,
// saves { day, after_id } in ingest_runs.cursor, and a call after the day's
// pass is complete does nothing. ?league=championship runs that league only
// (no cursor touched; a finished season is fetched too, for its final table).

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert, select } from '../_lib/supabase.js';
import { withCron, isoDate, RUN_BUDGET_MS, leaguesFromQuery, seasonOver, dailyPass } from '../_lib/cron.js';
import { isCupRow } from '../_lib/cups.js';

export const TIME_BUDGET_MS = RUN_BUDGET_MS;   // 20 s: cron-job.org gives up at 30 s

/**
 * A club name reduced to what identifies it: accents, case, punctuation and
 * the club-form words dropped ("Club Leon" → "leon", "Club América" →
 * "america", "CF Monterrey" → "monterrey").
 */
const FORM_WORDS = new Set(['club', 'cf', 'fc', 'sc', 'ac', 'cd', 'afc', 'the', 'de', 'deportivo']);
export function clubKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !FORM_WORDS.has(w)).join(' ');
}

/**
 * A standings row that carries no team id (19 Nov 2026: Liga MX lists León as
 * { id: null, name: "Club Leon" }; /teams has it as 2289 "Leon"): the one club
 * of THAT league whose name reduces to the same key, else null. Never a guess
 * between two clubs, never a club of another league.
 */
export function matchByName(name, leagueClubs) {
  const k = clubKey(name);
  if (!k) return null;
  const hits = leagueClubs.filter((c) => clubKey(c.name) === k);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Which of a league's tables is its MAIN one: the table a club's position
 * means (the club header, the Clubs grid, the Home band). Returns its index in
 * `groups`, or null when there is none (MLS: two conferences, each club in one).
 *   1. a table named as the annual one ("Primera: Tabla Anual", "Annual"), or
 *      named after the league itself (Argentina: "Liga Profesional Argentina");
 *   2. never a relegation-averages table ("Promedios");
 *   3. else the one table strictly larger than every other (Série C's first
 *      stage, 20 clubs, against its groups of 4).
 * Until 22 Nov 2026 a club took its BEST rank across all tables: 1st in
 * Uruguay's Clausura read as "1st" while 6th in the annual table.
 */
export function mainTable(groups, leagueName) {
  const label = (g) => String((g && g[0] && g[0].group) || '');
  const lname = String(leagueName || '').trim().toLowerCase();
  const usable = (groups || []).map((g, i) => ({ i, g, l: label(g) })).filter((x) => x.g && x.g.length && !/promedio/i.test(x.l));
  if (usable.length <= 1) return usable.length ? usable[0].i : null;
  const named = usable.filter((x) => /\banual\b|\bannual\b/i.test(x.l) || (lname && x.l.trim().toLowerCase() === lname));
  if (named.length === 1) return named[0].i;
  const sizes = usable.map((x) => x.g.length);
  const max = Math.max(...sizes);
  const biggest = usable.filter((x) => x.g.length === max);
  return biggest.length === 1 ? biggest[0].i : null;
}

export default withCron('standings', async ({ req }) => {
  const started = Date.now();
  const api = createClient();
  const all = await activeLeagues();
  const chosen = leaguesFromQuery(req, all);
  const pass = chosen ? null : await dailyPass('standings');
  if (pass && pass.complete) {
    return { rows_written: 0, requests_used: 0, note: 'today\'s pass is complete', cursor: { day: pass.today, complete: true } };
  }
  const leagues = chosen || all.filter((l) => l.id > pass.afterId && !seasonOver(l));
  // Every tracked club: a cup's table holds clubs of other leagues (C-1).
  const teams = await teamIdMap(all.map((l) => l.id));
  let lastDone = pass ? pass.afterId : 0;
  let stopped = false;

  // Fixed once per run, so a run that crosses midnight UTC stays on one date.
  const snapshotDate = isoDate();

  let rows = 0;
  let snapshotRows = 0;
  const snapshotFailures = [];
  const skipped = [];
  const byLeague = [];

  for (const lg of leagues) {
    if (Date.now() - started > TIME_BUDGET_MS) { stopped = true; break; }
    const json = await api.get('standings', {
      league: lg.api_league_id,
      season: lg.current_season,
    });

    // response[0].league.standings is an ARRAY OF GROUPS. Brazil returns one
    // group ("Serie A", 20 rows, no repeats). Argentina returns several — zone
    // tables PLUS aggregate tables (tabla anual, promedios) — and the SAME team
    // appears in more than one of them.
    //
    // Flattening those blindly puts a team in the batch twice, and Postgres
    // rejects the whole upsert with 21000 "ON CONFLICT DO UPDATE command cannot
    // affect row a second time". The primary key is (league_id, season,
    // team_id), so we must collapse to one row per team BEFORE writing:
    // the club's row in the league's MAIN table (mainTable, 22 Nov 2026), else
    // (no main table) the best (lowest) rank, remembering which table it came from.
    const groups = json.response?.[0]?.league?.standings || [];
    const main = mainTable(groups, json.response?.[0]?.league?.name || lg.name);
    const cup = isCupRow(lg);

    const bestByTeam = new Map();   // api_team_id -> row
    let seen = 0;
    let collapsed = 0;
    // Every table whole, for standings_groups (032): one row per (group, club).
    const groupRows = new Map();    // `${label}|${team_id}` -> row

    // This league's clubs by name, read only if a row arrives without an id.
    let leagueClubs = null;
    const byName = async (name) => {
      if (!leagueClubs) {
        try { leagueClubs = await select('teams', `select=id,api_team_id,name&league_id=eq.${Number(lg.id)}`); }
        catch (e) { console.warn('[standings] clubs by name', lg.slug, e.message); leagueClubs = []; }
      }
      return matchByName(name, leagueClubs);
    };
    let matchedByName = 0;

    for (const [order, group] of groups.entries()) {
      for (const s of group || []) {
        seen++;
        let apiTeamId = s.team?.id;
        let teamId = teams.get(apiTeamId);
        if (!teamId && apiTeamId == null && s.team?.name) {
          // No id in the API's table: the same club by name, in this league only.
          const club = await byName(s.team.name);
          if (club) { apiTeamId = club.api_team_id; teamId = club.id; matchedByName++; }
        }
        if (!teamId) {
          skipped.push(apiTeamId ?? `null:${s.team?.name || '?'}`);
          continue;
        }

        const candidate = {
          league_id: lg.id,
          season: lg.current_season,
          team_id: teamId,
          rank: s.rank ?? null,
          points: s.points ?? null,
          played: s.all?.played ?? null,
          win: s.all?.win ?? null,
          draw: s.all?.draw ?? null,
          lose: s.all?.lose ?? null,
          goals_for: s.all?.goals?.for ?? null,
          goals_against: s.all?.goals?.against ?? null,
          goal_diff: s.goalsDiff ?? null,
          form: s.form || null,
          group_label: s.group || null,
          updated_at: new Date().toISOString(),
        };

        // A table with no name of its own is named after the league; the same
        // club twice in one table (never seen) keeps its first row.
        const label = s.group || lg.name || lg.slug;
        const gk = `${label}|${teamId}`;
        // A cup's qualification zone as the API words it ("Promotion -
        // Champions League (Play Offs: 1/8-finals)"); the table shows it as text.
        // Only for a cup: standings_groups.description arrives with 039, which
        // is also what makes a cup active (rule 21).
        if (!groupRows.has(gk)) groupRows.set(gk, { ...candidate, group_label: label, group_order: order, ...(cup ? { description: s.description || null } : {}) });

        const inMain = main !== null && order === main;
        candidate._main = inMain;
        const prev = bestByTeam.get(apiTeamId);
        if (!prev) {
          bestByTeam.set(apiTeamId, candidate);
          continue;
        }
        collapsed++;
        // The main table's row always wins; between two others (or with no
        // main table) the lower rank wins, and a null rank never beats a real one.
        if (prev._main) continue;
        if (inMain) { bestByTeam.set(apiTeamId, candidate); continue; }
        const prevRank = prev.rank ?? Number.MAX_SAFE_INTEGER;
        const thisRank = candidate.rank ?? Number.MAX_SAFE_INTEGER;
        if (thisRank < prevRank) bestByTeam.set(apiTeamId, candidate);
      }
    }

    const standingRows = [...bestByTeam.values()].map(({ _main, ...r }) => r);
    const written = await upsert('standings', standingRows, 'league_id,season,team_id');
    rows += written;

    // Every group whole (032). Its own write: before 032 runs the table does
    // not exist, and that must not cost the league its table or its snapshot
    // (rule 21). Whole rows, so the upsert's INSERT passes NOT NULL (rule 25).
    let groupsWritten = 0, groupsError = null;
    try {
      groupsWritten = await upsert('standings_groups', [...groupRows.values()], 'league_id,season,group_label,team_id');
    } catch (e) {
      groupsError = e.message.slice(0, 200);
      console.warn('[standings] groups (before 032?)', lg.slug, groupsError);
    }

    // History cannot be back-filled, so write it league by league: a failure
    // here must not cost the remaining leagues their table or their snapshot.
    let snapshotted = 0;
    try {
      snapshotted = await upsert(
        'standings_snapshots',
        standingRows.map((r) => ({
          league_id: r.league_id,
          season: r.season,
          team_id: r.team_id,
          snapshot_date: snapshotDate,
          rank: r.rank,
          points: r.points,
          played: r.played,
          won: r.win,
          drawn: r.draw,
          lost: r.lose,
          gf: r.goals_for,
          ga: r.goals_against,
          form: r.form,
          group_label: r.group_label,
        })),
        'league_id,season,team_id,snapshot_date'
      );
      snapshotRows += snapshotted;
    } catch (e) {
      console.error('[standings] snapshot', lg.slug, e.message);
      snapshotFailures.push(`${lg.slug}: ${e.message}`);
    }

    const diag = {
      league: lg.slug,
      groups: groups.length,
      main_table: main === null ? null : (groups[main]?.[0]?.group || lg.name),
      rows_seen: seen,
      unique_teams: standingRows.length,
      duplicates_collapsed: collapsed,
      matched_by_name: matchedByName,
      written,
      group_rows: groupsWritten,
      ...(groupsError ? { groups_error: groupsError } : {}),
      snapshotted,
    };
    byLeague.push(diag);
    console.log('[standings]', JSON.stringify(diag));
    lastDone = lg.id;
  }

  // Every league's table this run reached is written by now. Fail the run so cron-job.org goes
  // red: a missed snapshot is a day of history that cannot be recovered.
  if (snapshotFailures.length) {
    throw new Error(`standings_snapshots failed — ${snapshotFailures.join(' | ')}`);
  }

  const s = api.stats();
  return {
    rows_written: rows,
    snapshot_date: snapshotDate,
    snapshot_rows: snapshotRows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    skipped_unknown_teams: skipped.length,
    by_league: byLeague,
    stopped_on: stopped ? 'time_budget' : null,
    // A one-league run (?league=) leaves the daily pass alone.
    cursor: pass ? (stopped ? { day: pass.today, after_id: lastDone } : { day: pass.today, complete: true }) : null,
  };
});
