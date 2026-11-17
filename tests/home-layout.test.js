// Home on laptop and the phone edges (Sequence 2, commit 3), and the club page
// order on a phone.
//
//   node tests/home-layout.test.js
//
// Static checks on public/index.html and public/community.html: the band's
// laptop row, the 1440px cap, the three/two/one column layout, the right
// column (room, table slice), the left column (leagues, picks), the safe-area
// rules (viewport-fit=cover, the status bar on Home, the tab bar), and the
// club page putting the club before the finder on a phone. No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const idx = read('public/index.html');
const fn = (name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}').exec(idx) || [''])[0];

// ── 1. The band on a laptop ──
check('band: one row of club + form | slots (fixed width) | picks, from 1100px',
  /@media\(min-width:1100px\)\{[\s\S]*?\.hb-row\{display:grid;grid-template-columns:minmax\(0,1fr\) 520px minmax\(0,1fr\);/.test(idx));
check('band: the markup has the three parts in that order',
  /<div class="hb-row">\s*<div class="hb-left">[\s\S]*?id="hb-club"[\s\S]*?id="club-nudge"[\s\S]*?<div id="hb-slots" class="hb-slots"><\/div>\s*<div id="hb-side" class="hb-side"><\/div>/.test(idx));
check('band: my five + Edit picks on the right, from the same picks rule', /HomeBand\.picksRow\(HBD\.round,HBD\.entry\)/.test(fn('renderBandSide')) && /hb\.editPicks/.test(fn('renderBandSide')));
check('band: numbers 38px on a laptop (spec §5)', /\.hb-big\{font-size:38px;\}/.test(idx));
check('content at most 1440px, centred', /\.hb-inner\{max-width:1440px;margin:0 auto;\}/.test(idx) && /\.home-wrap\{max-width:1440px;margin:0 auto;\}/.test(idx));
check('on Home the nav is navy on a laptop, with on-navy text only', /body\.on-home \.sm-nav\{background:var\(--navy\);/.test(idx));

// ── Columns ──
check('≥1100: left 300 / centre / right 320', /\.feed-page\{grid-template-columns:300px minmax\(0,1fr\) 320px;column-gap:24px;/.test(idx));
check('700–1099: centre + right, my leagues as a row above', /@media \(min-width: 700px\)\{\s*\.feed-page\{display:grid;grid-template-columns:minmax\(0,1fr\) 300px;[\s\S]*?\.feed-left\{display:flex;grid-column:1 \/ -1;/.test(idx));
check('below 1100 the sheet carries the picks and the room (no duplicates)', /@media \(max-width: 1099px\)\{\s*\.hl-picks,\.hr-room\{display:none !important;\}/.test(idx) && /\.hb-sheet\{display:none;\}/.test(idx));
check('left column: my private leagues, linking to each in Scout', /glRankText\(x\)/.test(fn('renderHomeLeft')) && /glOpen\(/.test(fn('renderHomeLeft')));
check('right column: the room with its last three messages and follower count', /limit=3/.test(fn('loadHomeRoom')) && /hb\.followers/.test(fn('renderHomeRoom')));
check('right column: posting goes through group_messages as me (028b decides who may)', /apiSend\('POST','group_messages',\[\{group_id:room\.groupId,user_id:myUserId\(\),content:text\}\]\)/.test(fn('sendHomeRoom'))
  && /tServer\(friendlyDbError\(e\.message\)\)/.test(fn('sendHomeRoom')));
check('right column: five table rows around my club, within its group in a split league',
  /group_label/.test(fn('renderHomeTable')) && /slice\(from,from\+5\)/.test(fn('renderHomeTable')) && /ht-row'\+\(r\.team_id===clubId\?' me':''\)/.test(fn('renderHomeTable')));
check('the old "Your club" card is gone', !/id="sidebar-club-card"/.test(idx) && /renderHomeRoom\(\)/.test(fn('renderSidebarYourClub')));

// ── 4. Phone edges ──
check('viewport-fit=cover', /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/.test(idx));
check('installed on an iPhone the page draws under the status bar', /apple-mobile-web-app-status-bar-style" content="black-translucent"/.test(idx));
check('the band pads for the status bar', /\.hb\{background:var\(--navy\);color:var\(--on-navy\);padding:calc\(6px \+ env\(safe-area-inset-top\)\)/.test(idx));
check('the nav and the full-screen overlays pad for it too', /\.sm-nav\{padding-top:calc\(10px \+ env\(safe-area-inset-top\)\);\}/.test(idx) && /#chat-overlay,#match-overlay\{padding-top:env\(safe-area-inset-top\);\}/.test(idx));
check('the tab bar sits above the home indicator, and the page clears it', /\.sm-tabs-bottom\{[^}]*padding-bottom:env\(safe-area-inset-bottom\);/.test(idx) && /body\{padding-bottom:calc\(64px \+ env\(safe-area-inset-bottom\)\);\}/.test(idx));
check('browser bar: navy on Home, read from the token (no literal), ground elsewhere',
  /var home=document\.body&&document\.body\.classList\.contains\('on-home'\);/.test(idx) && /getPropertyValue\('--navy'\)/.test(idx) && /smTheme\.paintBar\(\)/.test(fn('showPage')));
for (const p of ['community', 'about', 'terms', 'privacy']) {
  const h = read(`public/${p}.html`);
  check(`${p}.html: viewport-fit=cover and the tab bar clearance`, /viewport-fit=cover/.test(h) && /padding-bottom:calc\(64px \+ env\(safe-area-inset-bottom\)\)/.test(h));
}

// ── 5. The club page on a phone ──
const comm = read('public/community.html');
check('club page, phone: the selected club first, the finder below it', /@media\(max-width:768px\)\{\s*#comm-main\{order:1;\}\s*\.finder-col\{order:2;/.test(comm));
check('club page, phone: the finder is headed "Explore other communities" (both languages)', /data-i18n="comm\.explore"/.test(comm)
  && (read('public/i18n.js').match(/'comm\.explore':/g) || []).length === 2);
check('club page: picking a club opens it at the top, with ?club= in the address', /window\.scrollTo\(0,0\)/.test((/function pickTeam\(i\)\{[\s\S]*?\n\}/.exec(comm) || [''])[0])
  && /searchParams\.set\('club'/.test(comm));
check('club page, laptop: still two columns', /\.two-col\{display:grid;grid-template-columns:300px 1fr;/.test(comm));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
