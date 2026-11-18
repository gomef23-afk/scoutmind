// The one league list (api/_lib/leagues.js) and what follows from it
// (commit 1 of the 18-league work, 17 Nov 2026).
//
//   node tests/leagues-config.test.js
//
// - the config: 18 leagues, unique slugs and API ids, FIFA-style codes, the
//   seven playable and only they, the verified ids and seasons, tracked ≠
//   playable, Série C without stats, Championship the only new active one;
// - the generated blocks (league-names.js, 035's seed) match the config
//   (scripts/sync-leagues.mjs --check);
// - migration 035: re-runnable; never toggles `active` or renames; the Scout
//   Game builds rounds only for playable leagues; a room and the bilingual
//   welcome for every new club; the trigger function closed to the browser;
// - the crons: activeLeagues() works before 035 (rule 21), ?league=, the
//   daily resumable pass, finished seasons skipped, squads for playable
//   leagues only, news tags only the clubs of tagNews leagues;
// - Home: a club in a tracked-only league gets the next round of a playable
//   competition, named; the chips and pickers come from the config.
// No dependencies.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.API_FOOTBALL_KEY = 'af_test';
const { LEAGUES, BY_SLUG, LEAGUE_LANG, TAGGED_SLUGS, requestsPerDay } = await import('../api/_lib/leagues.js');

// ── The config ──
check('18 leagues', LEAGUES.length === 18);
check('slugs and API ids are unique', new Set(LEAGUES.map((l) => l.slug)).size === 18 && new Set(LEAGUES.map((l) => l.apiId)).size === 18);
check('every code is three capital letters', LEAGUES.every((l) => /^[A-Z]{3}$/.test(l.code)), LEAGUES.filter((l) => !/^[A-Z]{3}$/.test(l.code)).map((l) => l.slug).join(','));
eq('the seven playable, and only they', LEAGUES.filter((l) => l.playable).map((l) => l.slug), ['serie_a', 'premier_league', 'la_liga', 'bundesliga', 'serie_a_it', 'ligue_1', 'argentina']);
check('playable implies active', LEAGUES.every((l) => !l.playable || l.active));
eq('commit 3: all eleven tracked leagues switched on, none playable', LEAGUES.filter((l) => l.active && !l.playable).map((l) => l.slug),
  ['championship', 'eredivisie', 'primeira_liga', 'belgian_pro_league', 'scottish_premiership', 'super_lig', 'saudi_pro_league', 'mls', 'liga_mx', 'serie_b', 'serie_c']);
// 036 switches on exactly the ten that 035 inserted dormant (Championship was active from 035).
const sql036 = readFileSync(new URL('../supabase/migrations/036_switch_on_ten_leagues.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
const slugs036 = [...((/set active = true[\s\S]*?where slug in \(([^)]*)\)/.exec(sql036) || [])[1] || '').matchAll(/'(\w+)'/g)].map((m) => m[1]);
eq('036 switches on exactly the config\'s tracked leagues except Championship', slugs036.sort(),
  LEAGUES.filter((l) => l.active && !l.playable && l.slug !== 'championship').map((l) => l.slug).sort());
check('036: data only, re-runnable, never playable, nothing deleted', /and not active;/.test(sql036) && /set playable = false/.test(sql036)
  && !/set playable = true|alter table|create |delete from|drop /i.test(sql036));
const VERIFIED = { championship: 40, eredivisie: 88, primeira_liga: 94, belgian_pro_league: 144, scottish_premiership: 179, super_lig: 203, saudi_pro_league: 307,
  mls: 253, liga_mx: 262, serie_b: 72, serie_c: 75, serie_a: 71, premier_league: 39, la_liga: 140, bundesliga: 78, serie_a_it: 135, ligue_1: 61, argentina: 128 };
check('API-Football ids as verified on 17 Nov 2026', Object.entries(VERIFIED).every(([s, id]) => BY_SLUG[s] && BY_SLUG[s].apiId === id));
check('every season is 2026 (API-Football names a season by the year it starts) with real dates', LEAGUES.every((l) => l.season === 2026
  && /^\d{4}-\d{2}-\d{2}$/.test(l.seasonStart) && /^\d{4}-\d{2}-\d{2}$/.test(l.seasonEnd) && l.seasonStart < l.seasonEnd));
check('Série C: no stats coverage, season over (25 Oct 2026)', BY_SLUG.serie_c.statsCoverage === false && BY_SLUG.serie_c.seasonEnd === '2026-10-25');
eq('display names (decision 2)', ['belgian_pro_league', 'saudi_pro_league', 'mls', 'scottish_premiership'].map((s) => BY_SLUG[s].name + ' · ' + BY_SLUG[s].code),
  ['Jupiler Pro League · BEL', 'Saudi Pro League · KSA', 'MLS · USA', 'Premiership · SCO']);
check('the existing seven keep their database names and slugs', [['serie_a', 'Série A'], ['serie_a_it', 'Serie A'], ['argentina', 'Liga Profesional']].every(([s, n]) => BY_SLUG[s].name === n));
check('news: since commit 3 every league tags its clubs (after the measured check, tests/tagger-new-leagues.test.js)', TAGGED_SLUGS.size === 18);
eq('the tagger\'s LEAGUE_LANG is the config\'s: unchanged for the seven, our sources\' languages for the eleven', LEAGUE_LANG, {
  serie_a: ['pt-BR'], premier_league: ['en'], la_liga: ['es'], bundesliga: ['de'], serie_a_it: ['it'], ligue_1: ['fr'], argentina: ['es'],
  championship: ['en'], eredivisie: [], primeira_liga: [], belgian_pro_league: ['fr'], scottish_premiership: ['en'], super_lig: [], saudi_pro_league: [],
  mls: ['en'], liga_mx: ['es'], serie_b: ['pt-BR'], serie_c: ['pt-BR'] });
const { LEAGUE_LANG: TAGGER_LANG } = await import('../api/_lib/tagger.js');
check('tagger.js reads it from the config', TAGGER_LANG === LEAGUE_LANG);

// ── about.html says what the database holds (rule 22, commit 3) ──
const about = readFileSync(new URL('../public/about.html', import.meta.url), 'utf8');
const stats = [...about.matchAll(/<div class="hero-stat-num">(\d+)<\/div>\s*<div class="hero-stat-lbl" data-i18n="([\w.]+)"/g)].map((m) => [m[2], Number(m[1])]);
const clubs = JSON.parse(readFileSync(new URL('./fixtures/teams.json', import.meta.url), 'utf8')).length
  + JSON.parse(readFileSync(new URL('./fixtures/teams-new-leagues.json', import.meta.url), 'utf8')).length;
eq('about.html: leagues covered, in the game, clubs = the config and the frozen club lists',
  stats.filter(([k]) => k !== 'about.stat.outlets'), [['about.stat.leagues', LEAGUES.filter((l) => l.active).length], ['about.stat.playable', LEAGUES.filter((l) => l.playable).length], ['about.stat.clubs', clubs]]);
const chips = [...about.matchAll(/<div class="proof-league">([^<]+)<\/div>/g)].map((m) => m[1]);
eq('about.html: one chip per league, the seven playable first', [chips.length, chips.slice(0, 7).every((c) => LEAGUES.filter((l) => l.playable).some((l) => `${l.name} · ${l.code}` === c))], [18, true]);
check('about.html: every chip is a config league, "Name · CODE"', chips.every((c) => LEAGUES.some((l) => `${l.name} · ${l.code}` === c)));

// ── Generated blocks ──
const sync = spawnSync(process.execPath, [new URL('../scripts/sync-leagues.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--check'], { encoding: 'utf8' });
check('league-names.js and 035\'s seed are generated from the config (sync-leagues --check)', sync.status === 0, (sync.stdout || '') + (sync.stderr || ''));
const ln = read('public/league-names.js');
check('league-names.js carries every league with code, region and playable', LEAGUES.every((l) => ln.includes(`slug: '${l.slug}', name: '${l.name}', country: '${l.country}', code: '${l.code}'`)));

// ── Migration 035 ──
const sql = read('supabase/migrations/035_leagues_config.sql');
const body = sql.replace(/--[^\n]*/g, '');
check('035: one transaction, re-runnable', /^\s*begin;/m.test(body) && /^\s*commit;/m.test(body) && (body.match(/add column if not exists/g) || []).length === 5
  && /on conflict \(api_league_id\) do nothing/.test(body) && /drop trigger if exists teams_ensure_club_room/.test(body));
const upd = (/update public\.leagues l[\s\S]*?;/.exec(body) || [''])[0];
check('035: the update never touches active, name, slug or current_season (a re-run cannot switch or rename a league)', upd && !/\b(active|name|slug|current_season)\s*=/.test(upd.replace(/country_code|stats_coverage|updated_at/g, '')));
check('035: new leagues take `active` from the config on insert only', /insert into public\.leagues \([^)]*\bactive\b[^)]*\)/.test(body));
check('035: Scout Game rounds only for active AND playable leagues', /join public\.leagues l on l\.id = f\.league_id and l\.active and l\.playable and l\.current_season = f\.season/.test(body));
const fn017 = (/create or replace function public\.sync_game_rounds\(\)[\s\S]*?\$\$;/.exec(read('supabase/migrations/017_scout_game.sql')) || [''])[0];
const fn035 = (/create or replace function public\.sync_game_rounds\(\)[\s\S]*?\$\$;/.exec(sql) || [''])[0];
const nl = (s) => s.replace(/\r\n/g, '\n');
check('035: sync_game_rounds is 017\'s, with only the playable condition added', fn017 && nl(fn035).replace(' and l.playable', '') === nl(fn017));
check('035: execution stays with the service role', /revoke all on function public\.sync_game_rounds\(\) from public, anon, authenticated;/.test(body) && /grant execute on function public\.sync_game_rounds\(\) to service_role;/.test(body));
check('035: a new club gets its official room and the pinned bilingual welcome (033\'s words)', /after insert on public\.teams/.test(body)
  && /'Bem-vindos à sala oficial da torcida: ' \|\| new\.name/.test(body) && /' · Welcome to the official ' \|\| new\.name/.test(body) && /is_official/.test(body));
check('035: the trigger function is closed to the browser', /revoke all on function public\.ensure_club_room\(\) from public, anon, authenticated;/.test(body) && /security definer\s+set search_path = ''/.test(body));
check('035: existing clubs of active leagues without a room get one now', /join public\.leagues l on l\.id = t\.league_id and l\.active\s+where not exists \(select 1 from public\.groups g where g\.club_id = t\.id and g\.is_official\)/.test(body));
check('035: no delete, no new table', !/delete from|drop table|truncate|create table (?!.*temporary)/i.test(body.replace(/create temporary table _league_seed/, '')));
check('035: verification queries', /-- VERIFY/.test(sql) && /clubs_without_room/.test(sql) && /where not l\.playable/.test(sql));

// ── The crons ──
const calls = [];
let answer = () => [];
globalThis.fetch = async (url, init) => {
  calls.push(url);
  const r = answer(url, init);
  if (r && r.__status) return { ok: false, status: r.__status, text: async () => r.body || '', json: async () => ({}) };
  return { ok: true, status: 200, json: async () => r, text: async () => JSON.stringify(r), headers: { get: () => null } };
};
const sb = await import('../api/_lib/supabase.js');
answer = (u) => (/playable/.test(u) ? { __status: 400, body: '{"code":"42703","message":"column leagues.playable does not exist"}' } : [{ id: 1, slug: 'serie_a', api_league_id: 71 }]);
const before = await sb.activeLeagues();
check('before 035: activeLeagues() falls back, every active league playable (rule 21)', before.length === 1 && before[0].playable === true && before[0].season_end === null);
answer = () => [{ id: 1, slug: 'serie_a', playable: true }, { id: 8, slug: 'championship', playable: false }];
eq('playableLeagues(): the Scout Game\'s only', (await sb.playableLeagues()).map((l) => l.slug), ['serie_a']);

const cron = await import('../api/_lib/cron.js');
const L = [{ id: 1, slug: 'serie_a' }, { id: 8, slug: 'championship' }];
eq('?league=championship → that league', cron.leaguesFromQuery({ url: '/api/cron/fixtures?league=championship' }, L).map((l) => l.slug), ['championship']);
eq('no ?league= → null (every league)', cron.leaguesFromQuery({ url: '/api/cron/fixtures' }, L), null);
const day = 86_400_000;
check('a season is over 8 days after its last day, not before', cron.seasonOver({ season_end: '2026-10-25' }, Date.parse('2026-11-17')) === true
  && cron.seasonOver({ season_end: '2026-11-28' }, Date.parse('2026-12-03')) === false && cron.seasonOver({ season_end: null }) === false);
const today = cron.isoDate();
answer = () => [{ cursor: { day: today, complete: true } }];
check('daily pass: complete today → nothing to do', (await cron.dailyPass('fixtures')).complete === true);
answer = () => [{ cursor: { day: today, after_id: 5 } }];
const p = await cron.dailyPass('fixtures');
check('daily pass: stopped today → resume after the last league done', p.complete === false && p.afterId === 5);
answer = () => [{ cursor: { day: '2000-01-01', complete: true } }];
check('daily pass: yesterday\'s cursor → a new pass from the start', (await cron.dailyPass('standings')).afterId === 0);

for (const f of ['fixtures', 'standings']) {
  const src = read(`api/cron/${f}.js`);
  check(`${f}.js: stops starting a league at the budget and saves where it got to`, /if \(Date\.now\(\) - started > TIME_BUDGET_MS\) \{ stopped = true; break; \}/.test(src)
    && /cursor: pass \? \(stopped \? \{ day: pass\.today, after_id: lastDone \} : \{ day: pass\.today, complete: true \}\) : null/.test(src));
  check(`${f}.js: ?league= runs alone; the daily pass skips finished seasons`, /leaguesFromQuery\(req, all\)/.test(src) && /!seasonOver\(l\)/.test(src) && /if \(pass && pass\.complete\)/.test(src));
}
check('fixtures.js: ?full=1 asks for the whole season (a backfill)', /full\s*\?\s*\{ league: lg\.api_league_id, season: lg\.current_season \}/.test(read('api/cron/fixtures.js')));
check('teams.js: ?league= for the plain refresh; the refresh is time-boxed', /leaguesFromQuery\(req, leagues\) \|\| leagues/.test(read('api/cron/teams.js')) && /if \(Date\.now\(\) - started > TIME_BUDGET_MS\) break;/.test(read('api/cron/teams.js')));
check('players.js: squads for playable leagues only', /await playableLeagues\(\)/.test(read('api/cron/players.js')) && !/activeLeagues/.test(read('api/cron/players.js')));
check('player-stats.js: every active league (line-ups and ratings for the match panel)', /await activeLeagues\(\)/.test(read('api/cron/player-stats.js')));
check('fixture-stats.js: skips a league without stats coverage (Série C)', /stats_coverage !== false/.test(read('api/cron/fixture-stats.js')));
check('news.js: the tagger indexes only the clubs of tagNews leagues', /const tagged = teams\.filter\(\(t\) => TAGGED_SLUGS\.has\(leagueSlug\.get\(t\.league_id\)\)\);/.test(read('api/cron/news.js'))
  && /buildIndex\(\s*tagged\.map/.test(read('api/cron/news.js')));

// ── Cost ──
const perDay = LEAGUES.reduce((s, l) => s + requestsPerDay(l), 0);
check('the request model for every active league stays far inside 7,500 a day', perDay < 7500 * 0.25, perDay.toFixed(0));

// ── Home and the pages ──
const ctx = {}; vm.createContext(ctx); vm.runInContext(read('public/home-band.js'), ctx);
const HB = ctx.HomeBand, NOW = Date.parse('2026-11-18T12:00:00Z');
const rounds = [{ id: 1, league_slug: 'serie_a', status: 'open', deadline_utc: new Date(NOW + 3 * day).toISOString(), round_no: 36 }];
const own = HB.bandRound(rounds, 'serie_a', new Set(), null, NOW);
const tracked = HB.bandRound(rounds, 'championship', new Set(), null, NOW);
check('band: a playable club gets its own league\'s round', own.round && own.round.id === 1 && own.foreign === false);
check('band: a tracked-only club gets the next round of a playable competition, marked foreign', tracked.round && tracked.round.id === 1 && tracked.foreign === true);
eq('band: that slot names the competition ("No picks yet · Série A · BRA")', HB.roundSlot(tracked.round, {}, 'Série A · BRA', { foreign: true }).line, { key: 'hb.noPicksIn', vars: { league: 'Série A · BRA' } });
eq('band: no rounds anywhere → the honest "no round" slot', HB.bandRound([], 'championship', new Set(), null, NOW).round, null);
const idx = read('public/index.html');
check('Home uses bandRound and passes foreign to the slot and the picks text', /HomeBand\.bandRound\(rounds,club\?club\.league:null/.test(idx) && /\{foreign:!!HBD\.foreign\}/.test(idx) && /club&&!HBD\.foreign\?''/.test(idx));
check('the landing mock does the same, over every competition\'s rounds', /HomeBand\.bandRound\(rounds,lg\?lg\.slug:null/.test(read('public/welcome.html')) && !/game_rounds[^\n]*league_id=eq\./.test(read('public/welcome.html')));
check('chips, the club picker, the Clubs tab and the club page order leagues through LeagueNames.sort (no hard-coded seven)',
  /return LeagueNames\.sort\(MX\.leagues\|\|\[\],mine\)/.test(idx) && /const PICKER_LEAGUE_ORDER=LeagueNames\.sort\(/.test(idx) && /return LeagueNames\.sort\(slugs,mine\)/.test(idx)
  && !/'serie_a','premier_league','la_liga'/.test(idx) && !/LEAGUE_ORDER=\[/.test(read('public/community.html')));
check('news regions come from the config', /const LEAGUE_REGION=Object\.fromEntries\(LeagueNames\.LEAGUES/.test(idx));
check('Home loads enough clubs for 18 leagues', /teams\?select=id,api_team_id,name,logo_url,leagues!teams_league_id_fkey\(slug\)&limit=1000/.test(idx));
check('a tracked-league club can be a main club: the picker lists every league in the config', /LeagueNames\.LEAGUES\.map\(l=>l\.slug\)/.test(idx));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
