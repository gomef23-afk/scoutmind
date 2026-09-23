// R4 — league tables.
// Cost: 1 request per active league.
//
// `standings` also supplies the league position that Scout Mode shows next to
// each team, replacing the hardcoded `pos:"3rd"` in leagues_data.js.

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert } from '../_lib/supabase.js';
import { withCron } from '../_lib/cron.js';

export default withCron('standings', async () => {
  const api = createClient();
  const leagues = await activeLeagues();
  const teams = await teamIdMap(leagues.map((l) => l.id));

  let rows = 0;
  const skipped = [];

  for (const lg of leagues) {
    const json = await api.get('standings', {
      league: lg.api_league_id,
      season: lg.current_season,
    });

    // response[0].league.standings is an ARRAY OF GROUPS — one group for a
    // straight league table, several for group stages (Argentina uses these).
    const groups = json.response?.[0]?.league?.standings || [];
    const flat = groups.flat();

    const standingRows = [];
    for (const s of flat) {
      const teamId = teams.get(s.team?.id);
      if (!teamId) {
        skipped.push(s.team?.id);
        continue;
      }
      standingRows.push({
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
        updated_at: new Date().toISOString(),
      });
    }

    rows += await upsert('standings', standingRows, 'league_id,season,team_id');
  }

  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    skipped_unknown_teams: skipped.length,
  };
});
