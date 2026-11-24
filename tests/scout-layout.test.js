// The Scout tab's structure (28 Nov 2026).
//
//   node tests/scout-layout.test.js
//
// The page's job is picking for the next round; everything else comes after
// the picks. Pinned here:
// - above the picks only: the title row (with a Rankings link), the league
//   tabs, ONE band whose header is a round stepper ("‹ Round 37 · open ›",
//   the label opens the list of rounds); no chips row, no views segment, no
//   "recap ready" teaser, no "Your leagues" row at the top;
// - the band opens on the next open round, else the round in play, else the
//   latest final (its recap); the open band's third slot is my last or live
//   round, which takes me there;
// - after the picks (phone) or a 320px rail (laptop, 1100px+): Your rounds
//   (left out when I have none: only the way to All rounds and recaps),
//   the mini ranking (laptop only, left out without entries), Your leagues
//   (Create league / Join with code when I have none);
// - Rankings and All rounds and recaps are views of their own with a way
//   back; All rounds merges My history and the recaps;
// - /?page=scout&round=<id> opens that round once and leaves the address bar;
// - the description shows on the first visit only.
// No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const idx = read('public/index.html');
const fn = (name) => (new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`).exec(idx) || [''])[0];
const css = (sel) => (new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(idx) || [])[1] || '';
const page = (idx.split('<div class="page" id="page-scout">')[1] || '').split('<script>')[0];

// ── markup: above the picks only the title row, the league tabs, the band ──
check('title row: "Scout Game" and a Rankings link on the right', /<div class="sg-title-row">\s*<div class="sg-title" data-i18n="sg\.title">Scout Game<\/div>\s*<button type="button" class="sg-title-link" onclick="sgShowRankings\(\)"><span data-i18n="sg\.tab\.rankings">Rankings<\/span><\/button>/.test(page)
  && /justify-content:space-between/.test(css('.sg-title-row')));
check('then the league tabs, then the columns: play (band, content) and the rail (your rounds, mini ranking, your leagues)',
  /<div class="sg-tabs-wrap">[\s\S]*?<\/div>\s*<\/div>\s*<div class="sg-cols">[\s\S]*?<div class="sg-main">\s*<div id="sg-band" class="sg-band-slot"><\/div>\s*<div id="sg-body"><\/div>\s*<\/div>[\s\S]*?<aside class="sg-rail" id="sg-rail">\s*<div id="sg-yours" class="sg-rail-part"><\/div>\s*<div id="sg-mini" class="sg-rail-part sg-mini"><\/div>\s*<div id="sg-leagues-wrap" class="sg-rail-part">\s*<div id="sg-leagues" class="sg-leagues" style="display:none;"><\/div>/.test(page));
check('nothing else at the top: no chips row, no views segment, no teaser, no layout grid', !/id="sg-chips"|id="sg-views"|sg-recap-teaser|class="sg-layout"|sg-seg/.test(page)
  && !/sgSlots|sgChipIntoView|sgFillRecapTeaser|sg-seg-btn/.test(idx));
check('one underline-tab row: the league row', (page.match(/class="sg-tabs"/g) || []).length === 1);
check('the description starts hidden and shows on the first visit only (a UI flag)', /<div class="sg-sub" id="sg-sub" hidden data-i18n="sg\.sub">/.test(page)
  && /seen=localStorage\.getItem\('sm_sg_intro_seen'\)==='1'; localStorage\.setItem\('sm_sg_intro_seen','1'\);/.test(fn('sgIntro')) && /sgIntro\(\);/.test(fn('renderScout')));

// ── widths ──
check('phone: one column, the rail after the picks', /grid-template-columns:minmax\(0,1fr\)/.test(css('.sg-cols')));
check('laptop (1100px+): the play column and a 320px rail; the page widens; the save bar stays over the play column',
  /@media \(min-width: 1100px\)\{[\s\S]*?\.sg-page\{max-width:1120px;\}[\s\S]*?\.sg-cols\{grid-template-columns:minmax\(0,1fr\) 320px;[\s\S]*?\.sg-submit\{padding:12px calc\(50vw - 536px \+ 344px\) 12px calc\(50vw - 536px\);\}/.test(idx));
check('the mini ranking only on the laptop', /\.sg-mini\{display:none;\}/.test(idx) && /@media \(min-width: 1100px\)\{[\s\S]*?\.sg-mini\{display:block;\}/.test(idx));
check('phone: Rankings and All rounds are focused views (no rail parts)', /@media \(max-width:1099px\)\{ \.sg-page:not\(\.v-league\) \.sg-rail\{display:none;\} \}/.test(idx)
  && /pg\.classList\.add\('v-'\+\(SG\.view\|\|'league'\)\)/.test(fn('sgTabs')));
check('an empty rail part takes no room', /\.sg-rail-part:empty\{display:none;\}/.test(idx));
check('laptop: Your leagues as rows in the rail', /\.sg-rail \.sg-leagues\{flex-direction:column;/.test(idx));

// ── the band and its stepper ──
check('the band opens on the next open round, else the round in play, else the latest final', /const open=rs\.find\(r=>r\.status==='open'\);\s*if\(open\) return open\.id;\s*const locked=rs\.filter\(r=>r\.status==='locked'\)\.pop\(\);\s*if\(locked\) return locked\.id;/.test(fn('sgDefaultRound'))
  && /sort\(\(a,b\)=>String\(a\.deadline_utc\)\.localeCompare\(String\(b\.deadline_utc\)\)\)/.test(fn('sgDefaultRound')));
check('the stepper: previous / next (disabled at the ends), the label opens the list of rounds with their status',
  /\(prev\?' onclick="sgPickRound\('\+prev\.id\+'\)"':' disabled'\)/.test(fn('sgStepHead')) && /\(next\?' onclick="sgPickRound\('\+next\.id\+'\)"':' disabled'\)/.test(fn('sgStepHead'))
  && /aria-haspopup="menu" aria-expanded="false" aria-controls="sg-round-menu" onclick="sgToggleRoundMenu\(event\)"/.test(fn('sgStepHead'))
  && /role="menuitemradio" aria-checked="'\+\(x\.id===r\.id\)\+'" onclick="sgPickRound\('\+x\.id\+'\)"/.test(fn('sgStepHead')) && /sgStatusWord\(x\)/.test(fn('sgStepHead')));
check('every round band carries the stepper: open, in play, final (recap or not)', /\],sgStepHead\(r\)\);/.test(fn('sgOpenBand')) && /return sgBand\(slots,sgStepHead\(r\)\);/.test(fn('sgLiveBand'))
  && /sgBand\(built\.band,sgStepHead\(r\)\)/.test(fn('sgRenderPlayed')) && /sgPlayedBand\(r,status,mineTotal,myRank,false,sgStepHead\(r\)\)/.test(fn('sgRenderPlayed')));
check('the anyone\'s-five overlay keeps its band without a stepper', /sgPlayedBand\(r,status,total,rk,FIVE\.tg\.user_id!==myUserId\(\)\)/.test(idx));
check('a band slot can take you somewhere (the last / live round)', /s\.go\?' is-go" role="button" tabindex="0" onclick="'\+s\.go\+'"/.test(fn('sgBand')));
check('the round list closes on a tap outside and on Escape', /const m=document\.getElementById\('sg-round-menu'\); if\(m&&m\.style\.display==='block'&&!m\.contains\(e\.target\)\) sgCloseRoundMenu\(\);/.test(idx));
check('Your five and Matches in this round directly under the band', /el\.innerHTML=head\+'<div id="sg-slots"><\/div><div id="sg-round-fx"><\/div>/.test(fn('sgRenderPick')));

// ── the rail ──
const rail = fn('sgRenderRail');
check('Your rounds: the in-play round and the last final round I played; left out without them (the way to All rounds alone)',
  /const mine=signed\?\[live,fin\]\.filter\(r=>r&&SG\.entries\.get\(r\.id\)\):\[\];/.test(rail)
  && /yours\.innerHTML=SG\.view==='rounds'\?'':rows\.length\s*\?'<div class="sg-section">'\+t\('sg\.yourRounds'\)\+'<\/div><div class="sg-yr-list">'\+rows\.join\(''\)\+'<\/div>'\+all\s*:all;/.test(rail));
check('a row: status, rank and points only once scored; "Recap" on a final round that has one', /scored&&x\.rank!=null&&x\.participants\?t\('sg\.h\.rank'/.test(rail)
  && /\(scored\?'<span class="sg-yr-pts">'\+sgPts\(x\.total\)\+'<\/span>':''\)/.test(rail) && /\(r===fin&&finRecap\?'<span class="sg-yr-tag">'\+t\('sg\.recapTag'\)/.test(rail));
check('the mini ranking: the in-play round, else the last final round, with entries; top 3 and my row; left out otherwise; Full rankings',
  /const rankRound=\[live,fin\]\.find\(r=>r&&Number\(r\.participants\)>0\)\|\|null;/.test(rail) && /&order=rank\.asc&limit=3/.test(rail)
  && /if\(rankRound&&top&&top\.length\)\{/.test(rail) && /\}else mini\.innerHTML='';/.test(rail) && /t\('sg\.mini\.full'\)/.test(rail));
check('Your leagues: labelled; Create league and Join with code always; hidden in Rankings and for guests', /'<span class="sg-leagues-lab">'\+t\('sg\.yourLeagues'\)\+'<\/span>'/.test(fn('glRenderStrip'))
  && /onclick="glOpenCreate\(\)"/.test(fn('glRenderStrip')) && /onclick="glOpenJoin\(\)"/.test(fn('glRenderStrip'))
  && /if\(isGuestNow\(\)\|\|!GL\.list\|\|SG\.view==='rankings'\)\{ el\.style\.display='none';/.test(fn('glRenderStrip')));
check('Rankings → Leagues also offers Create league and Join with code (on a phone the rail sits under the whole player list)',
  /'<div class="gl-actions"><button class="sg-chip gl-add" onclick="glOpenCreate\(\)">'\+t\('gl\.create'\)\+'<\/button>'\s*\+'<button class="sg-chip gl-add" onclick="glOpenJoin\(\)">'\+t\('gl\.join'\)/.test(fn('glRenderView')));
check('the rail is drawn with every view',(fn('sgRender').match(/sgRenderRail\(\);/g) || []).length >= 4);

// ── views of their own ──
check('Rankings: its own view, with a way back and a title; filters outlined', /body\.innerHTML=sgBackHtml\(\)\+'<div class="sg-view-title">'\+t\('sg\.tab\.rankings'\)\+'<\/div><div class="sg-chips sg-filters">'/.test(fn('sgRenderRankings'))
  && /background:transparent/.test(css('.sg-filters .sg-chip')));
check('All rounds and recaps: My history and the recaps merged by round, newest deadline first', /sgRpc\('my_game_history',\{\}\)/.test(fn('sgRenderRounds')) && /sgRpc\('recent_round_recaps',\{p_league_id:null,p_limit:100\}\)/.test(fn('sgRenderRounds'))
  && /sort\(\(a,b\)=>String\(b\.deadline\|\|''\)\.localeCompare\(String\(a\.deadline\|\|''\)\)\)/.test(fn('sgRenderRounds')));
check('the back control returns to the round', /onclick="sgShowRound\(\)">'\+Icons\.svg\('chevronLeft',18\)\+t\('sg\.back'\)/.test(fn('sgBackHtml')));
check('the Profile\'s "See history" opens All rounds and recaps', /function sgOpenHistory\(\)\{ SG\.view='rounds';/.test(idx));

// ── deep link ──
check('/?page=scout&round=<id>: read at load, dropped from the address bar at once, opened once by renderScout',
  /const round=Number\(new URLSearchParams\(window\.location\.search\)\.get\('round'\)\)\|\|null;\s*if\(round\)\{\s*window\.__sgDeepRound=round;\s*const u=new URL\(location\.href\); u\.searchParams\.delete\('round'\); history\.replaceState/.test(idx)
  && /if\(window\.__sgDeepRound\)\{ SG\.deepRound=window\.__sgDeepRound; window\.__sgDeepRound=null; \}/.test(fn('renderScout'))
  && /SG\.deepRound=null;/.test(fn('renderScout')));
check('…a round no longer on screen opens its recap in All rounds and recaps', /else\{ SG\.view='rounds'; SG\.recapOpen=\{round_id:SG\.deepRound,league:''\}; \}/.test(fn('renderScout')));

// ── words ──
const i18n = read('public/i18n.js');
for (const k of ['sg.back', 'sg.step.prev', 'sg.step.next', 'sg.yourRounds', 'sg.allRounds', 'sg.recapTag', 'sg.mini.title', 'sg.mini.full', 'sg.rounds.empty', 'sg.yourLeagues']) {
  check(`${k} in English and Portuguese`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}
for (const k of ['sg.tab.round', 'sg.tab.history', 'sg.tab.recaps', 'recap.ready', 'sg.band.lastRank', 'sg.band.lastRankLine', 'recap.list.all', 'recap.list.empty', 'sg.h.every']) {
  check(`removed in both languages: ${k}`, !new RegExp(`'${k.replace(/\./g, '\\.')}':`).test(i18n));
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
