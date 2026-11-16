// The club page (public/community.html) shows only what the database holds.
//
//   node tests/community.test.js
//
// Pins the 16 Nov 2026 fixes: header, crest, coach, position and the club list
// come from `teams` / `standings` by team_id; nothing visible reads the
// hard-coded leagues_data.js (coach, founded, stadium, Instagram, full name,
// position); only the leagues we carry are listed; the main club is read from
// the per-account cache or ?club=; the four tabs are hidden but their code is
// kept; and index.html's links pass the club and open rooms by ?room=.
// No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const html = read('public/community.html');
const js = html.slice(html.indexOf('<script>\nvar _SB_URL') > -1 ? html.indexOf('<script>\nvar _SB_URL') : html.indexOf('var _SB_URL'));
const fn = (name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}').exec(js); return m ? m[0] : ''; };

// ── 1. Header from teams ──
const load = fn('loadClubs');
check('loadClubs reads the header fields from teams', /teams\?select=id,api_team_id,name,founded,venue_name,venue_city,logo_url,coach_name,leagues!teams_league_id_fkey\(slug,name\)/.test(load));
check('the leagues embed is disambiguated (rule 20)', /leagues!teams_league_id_fkey/.test(load) && !/[^!]leagues\(/.test(load.replace(/leagues!teams_league_id_fkey\(/g, '')));
const page = fn('renderTeamPage');
check('the header uses the club row: name, city, stadium, founded', /escH\(c\.label\)/.test(page) && /\[c\.city,c\.venue,c\.founded\?'Est\. '\+c\.founded:null\]/.test(page));
check('the crest is teams.logo_url, initials only when the image fails', /c\.logo/.test(page) && /onerror="this\.parentNode\.style\.display=\\'none\\';this\.parentNode\.nextElementSibling\.style\.display=\\'flex\\';"/.test(page));
check('the coach shows only when teams.coach_name has a value, no "since"', /\(c\.coach\?/.test(page) && !/[Ss]ince/.test(page));
check('no Instagram, typed full name, TEAM_INFO or COACHES on the page',
  !/instagram|fullName|TEAM_INFO|COACHES/.test(page + load + fn('filterTeams')));

// ── 2. One position source ──
check('the chip uses the standings rank, or nothing', /\(c\.rank!=null\?'<div style="'\+chip\+'">'\+escH\(ordN\(c\.rank\)\)\+' in league<\/div>':''\)/.test(page));
check('the club list uses the standings rank, or nothing', /\(c\.rank!=null\?escH\(ordN\(c\.rank\)\):''\)/.test(fn('filterTeams')));
check('the hard-coded .pos is never read', !/\.pos\b/.test(page + fn('filterTeams') + fn('init') + fn('startingClub')));
check('standings are matched by team_id, not by name', /CLUB_BY_ID\[s\.team_id\]/.test(load) && !/_NAME_BRIDGE|_indexKey|REAL_STATS/.test(js));

// ── 3. Only the leagues we carry ──
check('the league picker is filled from the data, not a static list', /<select class="league-select" id="comm-league" onchange="loadLeague\(\)" aria-label="League">\s*<\/select>/.test(html) && /LEAGUES\.map/.test(fn('fillLeagueSelect')));
check('the club list comes from CLUBS (teams), not TEAMS', /CLUBS\[AL\]/.test(fn('filterTeams')) && !/TEAMS\[/.test(fn('filterTeams') + fn('init')));

// ── 4. Main club and ?club= ──
const start = fn('startingClub');
check('?club=<teams.id> is honoured first', /get\('club'\)/.test(start));
check("the main club comes from SMAuth.getJSON('sm_main_club')", /SMAuth\.getJSON\('sm_main_club',null\)/.test(start));
check("the bare localStorage 'sm_main_club' is no longer read", !/localStorage\.getItem\('sm_main_club'\)/.test(html));

// ── 5. The tabs (028; tests/community-features.test.js covers them in depth) ──
check('the header leaves a slot for the tabs and fills it from Supabase', /<div id="club-feat"><\/div>/.test(page) && /loadFeatures\(c\);/.test(page));
check('Groups is gone for good (the club room replaced it)', !/function doGroups\(|'groups'/.test(js));
check('the page links to the club room by teams.id', /href="\/\?room='\+Number\(c\.id\)\+'"/.test(page));

// ── 6. The subtitle ──
check('the subtitle is the new sentence, translated', /data-i18n="comm\.sub"/.test(html) && !/Read analyst insights|Vote on transfers/.test(html));
const i18n = read('public/i18n.js');
check('comm.sub exists in en and pt-BR', (i18n.match(/'comm\.sub':/g) || []).length === 2);
check('community.html loads i18n.js and still loads leagues_data.js before init (rule 8)',
  html.indexOf('<script src="/i18n.js"></script>') > -1 && html.indexOf('<script src="/leagues_data.js"></script>') > -1
  && /if\(typeof TEAMS!=='undefined'\)\{init\(\);\}else\{window\.addEventListener\('load',init\);\}/.test(html));
check('names and places from the database are escaped before innerHTML', /function escH\(s\)/.test(js) && /escH\(c\.leagueName\)/.test(page));

// ── 7. index.html: links pass the club; ?room= opens it ──
const idx = read('public/index.html');
check("the Clubs-tab 'Open' passes the club", /window\.location\.href=\\'\/community\.html\?club='\+Number\(id\)\+'\\'/.test(idx));
check('no link to community.html without a club', !/href=\\'\/community\.html\\'|location\.href='\/community\.html';/.test(idx), (idx.match(/\/community\.html[^?][^'"]{0,20}/g) || []).join(' | '));
check('?room=<teams.id> opens that room after the overview loads', /await loadChatOverview\(\); \}catch\(e\)\{\}\s*\/\/ \/\?room=/.test(idx) && /if\(CLUB_DATA\.get\(room\)\)\{ showPage\('communities'\); openChat\(room\); \}/.test(idx));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
