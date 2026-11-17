// Sequence 2 commit 4b-4: the nav (rule 5) and the Rooms tab.
//
//   node tests/nav.test.js
//
// - every page with a nav (index, community, about, terms, privacy; news.html
//   has none and goes in 4b-7) carries the same five tabs, top and bottom:
//   Home · Clubs · Scout · Matches · Rooms, in that order, as Tabler line
//   icons (the same paths as public/icons.js), labelled through i18n keys;
//   no emoji, no Profile tab;
// - Profile stays reachable: the avatar (signed in), a profile icon for
//   guests on index / community / the Home band, a profile link on the
//   static pages;
// - the active tab: a 3px bar above the icon in the bottom bar;
// - the Rooms screen: my clubs' rooms from club_chat_overview only, main club
//   first, followers and the last message (no online counts), a row opens the
//   room, "Find more rooms" opens the Clubs tab; guests and no-club states;
// - ?page=rooms opens it; strings in both languages.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read('public/icons.js'), ctx);
const ICON = (name) => (/>(<path[\s\S]*?)<\/svg>$/.exec(ctx.Icons.svg(name)) || [])[1];
const TABS = [['nav.home', 'home'], ['nav.clubs', 'shield'], ['nav.scout', 'target'], ['nav.matches', 'calendar'], ['nav.rooms', 'message']];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const PAGES = ['index', 'community', 'about', 'terms', 'privacy'];
for (const p of PAGES) {
  const html = read(`public/${p}.html`);
  for (const where of ['sm-tabs-top', 'sm-tabs-bottom']) {
    const block = (new RegExp(`<div class="sm-tabs ${where}">([\\s\\S]*?)\\n\\s*</div>`).exec(html) || [])[1] || '';
    const tabs = [...block.matchAll(/class="sm-tab[^"]*"[^>]*><span class="sm-tab-icon"><svg[^>]*>([\s\S]*?)<\/svg><\/span><span data-i18n="([\w.]+)">/g)].map((m) => [m[2], m[1]]);
    eq(`${p} ${where}: Home · Clubs · Scout · Matches · Rooms`, tabs.map((x) => x[0]), TABS.map((x) => x[0]));
    check(`${p} ${where}: each icon is the icons.js line icon`, tabs.length === 5 && tabs.every(([k, svg], i) => svg === ICON(TABS[i][1])), tabs.map((x) => x[0]).join(','));
    check(`${p} ${where}: no emoji, no Profile tab`, !EMOJI.test(block) && !/Profile|page=profile|showPage\('profile'\)/.test(block));
    check(`${p} ${where}: icons hidden from screen readers (the word is the label)`, (block.match(/aria-hidden="true" focusable="false"/g) || []).length === 5);
  }
  check(`${p}: the bottom bar's active tab has the 3px bar above it`, /\.sm-tabs-bottom \.sm-tab\.active\{box-shadow:inset 0 3px 0 var\(--(navy-ink|accent)\);\}/.test(html));
  check(`${p}: icon sizes set for both bars`, /\.sm-tab-icon svg\{width:22px;height:22px;\}/.test(html) && /\.sm-tabs-top \.sm-tab-icon svg\{width:18px;height:18px;\}/.test(html));
  if (p !== 'index') {
    check(`${p}: tabs are links into the app (Clubs → the Clubs tab, Rooms → ?page=rooms)`, /href="\/\?page=communities"/.test(html) && /href="\/\?page=rooms"/.test(html) && !/class="sm-tab[^"]*" href="\/community\.html"/.test(html));
  }
  check(`${p}: Profile is reachable from the nav`, /class="nav-prefs"[^>]*(href="\/\?page=profile"|onclick="showPage\('profile'\)")/.test(html));
}
const idx = read('public/index.html');
const comm = read('public/community.html');
check('index: tabs are keyed by data-tab, Rooms included', ['feed', 'communities', 'scout', 'matches', 'rooms'].every((k) => (idx.match(new RegExp(`data-tab="${k}" onclick="showPage\\('${k}'\\)"`, 'g')) || []).length === 2));
check('community: the Clubs tab is the current one', (comm.match(/class="sm-tab active" href="\/\?page=communities" aria-current="page"/g) || []).length === 2);
check('index + community: the guest profile icon shows only for guests', /if\(prefsBtn\)prefsBtn\.style\.display=guest\?'flex':'none';/.test(idx) && /if\(prefs\)prefs\.style\.display=isGuest\?'flex':'none';/.test(comm));
check('Home band: a guest gets the EN / PT switch and the profile icon next to Sign in',
  /isGuestNow\(\)\s*\?'<span data-lang-switch>'\+langSwitchHtml\(\)\+'<\/span>'\s*\+'<button class="hb-icon" type="button" onclick="showPage\(\\'profile\\'\)" aria-label="'\+sanitize\(t\('nav\.profile'\)\)\+'">'\+Icons\.svg\('user',22\)/.test(idx));
check('?page=rooms opens the Rooms tab', /const VALID = \['feed','communities','scout','matches','rooms','profile'\];/.test(idx));

// ── The Rooms screen ──
const fn = (name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx) || [''])[0];
const rooms = fn('renderRooms');
check('Rooms reads club_chat_overview only (CHAT_OVERVIEW), nothing else', /CHAT_OVERVIEW\.size/.test(rooms) && /chatOverview\(id\)/.test(rooms) && !/apiGet\(/.test(rooms) && /loadChatOverview\(\)/.test(rooms));
check('my clubs, main club first, tagged', /myClubIds\(\)\.slice\(\)\.sort\(\(a,b\)=>\(b===main\)-\(a===main\)\)/.test(rooms) && /t\('rooms\.main'\)/.test(rooms));
check('a row: crest, room name, last message (or "no messages"), followers · when', /clubCrestById\(id,36\)/.test(rooms) && /t\('hb\.roomName',\{club:clubLabel\(id\)\}\)/.test(rooms)
  && /t\('hb\.roomEmpty'\)/.test(rooms) && /tn\('hb\.followers',o\.member_count\|\|0\)/.test(rooms) && /relTime\(o\.last_message_at\)/.test(rooms));
check('no online / presence counts', !/online|presence/i.test(rooms));
check('a row opens the room; "Find more rooms" opens the Clubs tab', /onclick="openChat\('\+Number\(id\)\+'\)"/.test(rooms) && /onclick="showPage\(\\'communities\\'\)">'\+sanitize\(t\('rooms\.findMore'\)\)/.test(rooms));
check('guest → sign in; no club → choose one; offline / failed load → said, no loop', /isGuestNow\(\)/.test(rooms) && /t\('rooms\.guest'\)/.test(rooms) && /t\('rooms\.noClubs'\)/.test(rooms)
  && /openTeamModal\(\)/.test(rooms) && /offlineHtml\(\)/.test(rooms) && /if\(!ROOMS_LOADING\)/.test(rooms) && /t\('rooms\.unavailable'\)/.test(rooms));
check('drawn only while the tab is open', /if\(!el\|\|!page\|\|!page\.classList\.contains\('active'\)\) return;/.test(rooms) && /if\(id==='rooms'\) try\{renderRooms\(\);\}/.test(idx));
check('relative time in the reader\'s language', /new Intl\.RelativeTimeFormat\(smLocale\(\)\|\|undefined,\{numeric:'auto'\}\)/.test(fn('relTime')));
check('rule 6-style: the Rooms page is a normal .page, no inline display', /<div class="page" id="page-rooms">/.test(idx));

// ── Strings ──
const i18n = read('public/i18n.js');
for (const k of ['nav.home', 'nav.clubs', 'nav.scout', 'nav.matches', 'nav.rooms', 'nav.profile', 'nav.signin', 'nav.signout', 'nav.about',
  'rooms.title', 'rooms.sub', 'rooms.findMore', 'rooms.guest', 'rooms.noClubs', 'rooms.choose', 'rooms.unavailable', 'rooms.main']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
