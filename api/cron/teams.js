// R3 — one-off (and occasional) ingest of teams, venues and coaches.
//
// Cost: 1 request per active league, plus 1 per team if coaches=1.
// On the free tier run it WITHOUT coaches first (2 requests), then with
// ?coaches=1 on a later day (~40 requests for the two active leagues).

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, upsert, select } from '../_lib/supabase.js';
import { withCron } from '../_lib/cron.js';

export default withCron('teams', async ({ req }) => {
  const api = createClient();
  const url = new URL(req.url, 'http://localhost');
  const withCoaches = url.searchParams.get('coaches') === '1';

  const leagues = await activeLeagues();
  let rows = 0;

  for (const lg of leagues) {
    const json = await api.get('teams', {
      league: lg.api_league_id,
      season: lg.current_season,
    });

    const teamRows = (json.response || []).map((r) => ({
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

  // Coaches are a separate request per team, so they are opt-in.
  let coachRows = 0;
  if (withCoaches) {
    const teams = await select(
      'teams',
      `select=id,api_team_id&league_id=in.(${leagues.map((l) => l.id).join(',')})`
    );
    for (const t of teams) {
      if (api.lowQuota(3)) break; // stop cleanly, resume next run
      const c = await api.get('coachs', { team: t.api_team_id });
      // /coachs returns the club's coaching HISTORY, not just the incumbent —
      // the Bahia probe returned 5 entries, four of them with an open-ended
      // spell (assistants and a duplicated record). Pick the open spell at this
      // club with the latest start date; fall back to the first entry.
      const current = pickCurrentCoach(c.response || [], t.api_team_id);
      if (!current) continue;
      await upsert(
        'teams',
        [{ api_team_id: t.api_team_id, coach_name: current.name, updated_at: new Date().toISOString() }],
        'api_team_id'
      );
      coachRows++;
    }
  }

  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    leagues: leagues.length,
    coaches_updated: coachRows,
  };
});

function pickCurrentCoach(list, apiTeamId) {
  if (!list.length) return null;
  const open = [];
  for (const c of list) {
    for (const spell of c.career || []) {
      if (spell?.team?.id === apiTeamId && !spell.end) {
        open.push({ coach: c, start: spell.start || '' });
      }
    }
  }
  if (!open.length) return list[0];
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
