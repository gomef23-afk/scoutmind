// Sequence 2 commit 4b-6: Fixtures & results on the club page.
//
//   node tests/club-fixtures.test.js
//
// community.html's loader and renderer run in a sandbox against a stubbed
// PostgREST, with the real fx-row.js, league-names.js and i18n.js. Covered:
// - two reads by teams.id: the last 5 finished (newest first) and the next 5
//   not finished (from 3 h ago, so a live match is "next"); embeds named;
// - every row is FxRow.render (the Matches tab's row), date + "League · CODE"
//   above it, a tap opens /?match=<fixtures.id> in the app;
// - the note that only league matches are shown; empty and failed states;
// - a club picked meanwhile drops the late reply; a language switch redraws
//   from what is held, without a second read;
// - index.html opens the match panel for ?match=<id> and drops the parameter;
// - every string in both languages.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const comm = read('public/community.html');
const idx = read('public/index.html');
const fn = (src, name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(src) || [''])[0];
const decl = (src, name) => (new RegExp('var ' + name + '=[\\s\\S]*?;(?:[ \\t]*//[^\\n]*)?\\r?\\n').exec(src) || [''])[0];

// ── Sandbox ──
let lang = 'en';
const box = { innerHTML: '' };
const calls = [];
let reply = null;   // (path) -> rows | throws
const ctx = {
  navigator: { languages: ['en-US'], language: 'en-US' },
  localStorage: { getItem: (k) => (k === 'sm_lang' ? lang : null), setItem() {} },
  document: { documentElement: {}, querySelectorAll: () => [], getElementById: (id) => (id === 'club-fx' ? box : null) },
  console: { warn() {}, info() {}, error() {} },
  CustomEvent: function () {}, dispatchEvent: () => true, Intl, Date, Promise, encodeURIComponent,
  AT: null,
  CLUB_BY_ID: {
    7: { id: 7, label: 'Flamengo', logo: 'https://media.api-sports.io/football/teams/127.png' },
    9: { id: 9, label: 'Palmeiras', logo: null },
  },
  getJ: async (p) => { calls.push(p); return reply(p); },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('public/i18n.js'), ctx);
vm.runInContext(read('public/league-names.js'), ctx);
vm.runInContext(read('public/fx-row.js'), ctx);
vm.runInContext([
  fn(comm, 'escH'),
  decl(comm, 'CFX'), decl(comm, 'CFX_SELECT'), decl(comm, 'CFX_DONE'), decl(comm, 'CFX_LIVE'), decl(comm, 'CFX_TEAMS'),
  fn(comm, 'loadClubFixtures'), fn(comm, 'cfHead'), fn(comm, 'cfCrest'), fn(comm, 'cfName'), fn(comm, 'cfDate'), fn(comm, 'cfItem'), fn(comm, 'renderClubFixtures'),
  'this.loadClubFixtures=loadClubFixtures;this.renderClubFixtures=renderClubFixtures;this.getCFX=()=>CFX;this.setAT=(c)=>{AT=c;};',
].join('\n'), ctx);

const BRA = { name: 'Serie A', slug: 'serie_a', country: 'Brazil' };
const fx = (id, iso, h, a, st, hg, ag, extra) => Object.assign({
  id, kickoff_utc: iso, status_short: st, elapsed: null, home_goals: hg, away_goals: ag,
  home_team_id: h, away_team_id: a,
  home_team: { name: h === 7 ? 'Flamengo' : h === 9 ? 'Palmeiras' : 'Bahia', api_team_id: h, logo_url: null },
  away_team: { name: a === 7 ? 'Flamengo' : a === 9 ? 'Palmeiras' : 'Bahia', api_team_id: a, logo_url: null },
  league: BRA,
}, extra || {});
const PAST = [fx(101, '2026-11-15T22:00:00Z', 7, 9, 'FT', 2, 1), fx(102, '2026-11-08T19:00:00Z', 33, 7, 'PEN', 1, 1)];
const NEXT = [fx(201, '2026-11-17T23:00:00Z', 7, 33, '2H', 1, 0, { elapsed: 67 }), fx(202, '2026-11-22T19:00:00Z', 9, 7, 'NS', null, null)];

const club = ctx.CLUB_BY_ID[7];
reply = (p) => (/status_short=in\./.test(p) ? PAST : NEXT);
ctx.setAT(club);
await ctx.loadClubFixtures(club);

// ── The reads ──
const [pastQ, nextQ] = [calls.find((p) => /status_short=in\./.test(p)), calls.find((p) => /status_short=not\.in\./.test(p))];
check('two reads, both by the club\'s teams.id on either side', calls.length === 2 && [pastQ, nextQ].every((p) => p && p.includes('or=(home_team_id.eq.7,away_team_id.eq.7)')), calls.join('\n      '));
check('results: finished only (FT, AET, PEN), newest first, 5', /status_short=in\.\(FT,AET,PEN\)&order=kickoff_utc\.desc&limit=5$/.test(pastQ), pastQ);
check('fixtures: not finished, from 3 hours ago (a live match is still "next"), soonest first, 5',
  /status_short=not\.in\.\(FT,AET,PEN\)&kickoff_utc=gte\.[^&]+&order=kickoff_utc\.asc&limit=5$/.test(nextQ)
  && /Date\.now\(\)-3\*3600\*1000/.test(fn(comm, 'loadClubFixtures')), nextQ);
check('embeds are disambiguated (rule 20)', /teams!fixtures_home_team_id_fkey\(/.test(pastQ) && /teams!fixtures_away_team_id_fkey\(/.test(pastQ) && /leagues!fixtures_league_id_fkey\(/.test(pastQ));

// ── What is drawn ──
const html = box.innerHTML;
const rows = html.match(/<div class="fx-row/g) || [];
check('four rows, all the shared FxRow row (no fixture markup of its own)', rows.length === 4 && !/class="fx-row/.test(fn(comm, 'cfItem').replace(/FxRow\.render/, '')), String(rows.length));
check('next first, then last: live match, upcoming, then the results newest first',
  ['201', '202', '101', '102'].join() === [...html.matchAll(/\/\?match=(\d+)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).join(), html.slice(0, 300));
check('a tap opens the match panel in the app: /?match=<fixtures.id>, by click and by key',
  html.includes('onclick="location.href=\'/?match=201\'"') && html.includes('event.preventDefault();location.href=\'/?match=201\''));
check('the score and the status come from the row: 2–1 FT, 1–1 on pens, live minute',
  /<b>2–1<\/b><small>FT<\/small>/.test(html) && /<b>1–1<\/b><small>After penalties<\/small>/.test(html) && /<b>1–0<\/b><small class="live">Live 67&#39;<\/small>/.test(html), html.replace(/<span[^>]*crest[\s\S]*?<\/span>/g, ''));
check('each row carries its date and "League · CODE" (the country code, 4b)', (html.match(/<div class="cf-meta">[^<]+ · S[ée]rie A · BRA<\/div>/g) || []).length === 4);
check('the date as the Matches tab writes it: weekday day month, no comma', /<div class="cf-meta">\w{3} \d{1,2} \w{3} · /.test(html) && !/<div class="cf-meta">[^<]*,/.test(html), (/<div class="cf-meta">[^<]+/.exec(html) || [''])[0]);
check('a club we list uses its crest; one we do not shows initials, never a hole',
  html.includes('src="https://media.api-sports.io/football/teams/127.png"') && /<span class="cf-crest"[^>]*>BAH<\/span>|<span class="cf-crest"[^>]*>B<\/span>/.test(html));
check('the note: league matches only', html.includes('<p class="cf-note">League matches only. Cup games are not in our data.</p>'));
check('headed "Fixtures & results" (escaped), "Next 5" and "Last 5"', html.includes('<h2 class="cf-h" id="cf-h">Fixtures &amp; results</h2>') && html.includes('>Next 5<') && html.includes('>Last 5<'));

// ── Language: redrawn from what is held ──
lang = 'pt-BR';
ctx.renderClubFixtures();
check('in Portuguese, with no second read', calls.length === 2 && box.innerHTML.includes('Jogos e resultados') && box.innerHTML.includes('Só jogos de liga.') && box.innerHTML.includes('Próximos 5'));
check('the same club picked again is not read again', (await ctx.loadClubFixtures(club), calls.length === 2));
lang = 'en';

// ── Empty, failed, late ──
const other = ctx.CLUB_BY_ID[9];
reply = () => [];
ctx.setAT(other);
await ctx.loadClubFixtures(other);
check('no matches: says so for each list, no blank', box.innerHTML.includes('No fixtures scheduled yet.') && box.innerHTML.includes('No results yet this season.'));
reply = () => { throw new Error('fixtures 500'); };
ctx.getCFX().id = null;
await ctx.loadClubFixtures(other);
check('a failed read says so, with the note still there', box.innerHTML.includes('Couldn’t load the matches.') && box.innerHTML.includes('cf-note'));
const waiting = [];
const release = () => waiting.forEach((r) => r(PAST));
reply = () => new Promise((r) => { waiting.push(r); });
ctx.getCFX().id = null;
const late = ctx.loadClubFixtures(other);
ctx.setAT(club);
box.innerHTML = 'kept';
release(); await late;
check('a reply for a club no longer on screen is dropped', box.innerHTML === 'kept');

// ── Wiring on the page ──
check('community.html loads fx-row.js (stamped) and the section sits under the header, before the club features',
  /<script src="\/fx-row\.js\?v=[0-9a-f]+"><\/script>/.test(comm)
  && /\+'<section id="club-fx" class="cf" aria-labelledby="cf-h"><\/section>'[\s\S]*?\+'<div id="club-feat"><\/div>'/.test(fn(comm, 'renderTeamPage'))
  && /loadClubFixtures\(c\);\s*loadFeatures\(c\);/.test(fn(comm, 'renderTeamPage')));
check('the styles use tokens only', (() => { const css = (/\/\* Fixtures & results \(4b-6\)[\s\S]*?\.ctabs\{scrollbar/.exec(comm) || [''])[0]; return css.length > 0 && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(css); })());
const link = (/\/\/ \/\?match=<fixtures\.id>[\s\S]*?catch\(e\)\{ console\.error\('match link:',e\); \}/.exec(idx) || [''])[0];
check('index.html: ?match=<id> shows Matches and opens the panel, after the clubs are in',
  /showPage\('matches'\);\s*openMatch\(match\);/.test(link) && idx.indexOf(link) > idx.indexOf('await loadClubData()'));
check('…and drops the parameter so a reload does not reopen it', /u\.searchParams\.delete\('match'\); history\.replaceState/.test(link));

// ── Strings ──
const I = ctx.I18N;
const KEYS = ['comm.fx.title', 'comm.fx.note', 'comm.fx.next', 'comm.fx.last', 'comm.fx.noNext', 'comm.fx.noLast', 'comm.fx.loading', 'comm.fx.fail'];
check('every new string in both languages, translated', KEYS.every((k) => I.en[k] && I['pt-BR'][k] && I.en[k] !== I['pt-BR'][k]), KEYS.filter((k) => !I.en[k] || !I['pt-BR'][k]).join(', '));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
