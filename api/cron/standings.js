// R4 — league tables.
// Cost: 1 request per active league.
//
// `standings` also supplies the league position that Scout Mode shows next to
// each team, replacing the hardcoded `pos:"3rd"` in leagues_data.js.

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert } from '../_lib/supabase.js';
import { withCron, isoDate } from '../_lib/cron.js';

export default withCron('standings', async () => {
  const api = createClient();
  const leagues = await activeLeagues();
  const teams = await teamIdMap(leagues.map((l) => l.id));

  // Fixed once per run, so a run that crosses midnight UTC stays on one date.
  const snapshotDate = isoDate();

  let rows = 0;
  let snapshotRows = 0;
  const snapshotFailures = [];
  const skipped = [];
  const byLeague = [];

  for (const lg of leagues) {
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
    // keep the best (lowest) rank and remember which table it came from.
    const groups = json.response?.[0]?.league?.standings || [];

    const bestByTeam = new Map();   // api_team_id -> row
    let seen = 0;
    let collapsed = 0;

    for (const group of groups) {
      for (const s of group || []) {
        seen++;
        const apiTeamId = s.team?.id;
        const teamId = teams.get(apiTeamId);
        if (!teamId) {
          skipped.push(apiTeamId);
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

        const prev = bestByTeam.get(apiTeamId);
        if (!prev) {
          bestByTeam.set(apiTeamId, candidate);
          continue;
        }
        collapsed++;
        // Lower rank wins; a null rank never beats a real one.
        const prevRank = prev.rank ?? Number.MAX_SAFE_INTEGER;
        const thisRank = candidate.rank ?? Number.MAX_SAFE_INTEGER;
        if (thisRank < prevRank) bestByTeam.set(apiTeamId, candidate);
      }
    }

    const standingRows = [...bestByTeam.values()];
    const written = await upsert('standings', standingRows, 'league_id,season,team_id');
    rows += written;

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
      rows_seen: seen,
      unique_teams: standingRows.length,
      duplicates_collapsed: collapsed,
      written,
      snapshotted,
    };
    byLeague.push(diag);
    console.log('[standings]', JSON.stringify(diag));
  }

  // Every league's table is written by now. Fail the run so cron-job.org goes
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
  };
});
