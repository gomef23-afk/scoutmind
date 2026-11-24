// The Scout tab's layout (26 Nov 2026).
//
//   node tests/scout-layout.test.js
//
// Two stacked underline-tab rows read as duplicates, Rankings added a third
// pill row, and on a phone the band came after six rows of chrome. Now:
// - title; the description on the first visit only;
// - the league row: the ONLY underline-tab row;
// - one grid. Phone: round chips · band · views · teaser · your leagues ·
//   content. Laptop: chips | views on one row, then band · teaser · your
//   leagues · content. An empty slot takes no room;
// - the views are a segmented control; filters inside a view (Rankings,
//   Recaps) are lighter, outlined pills;
// - "Your leagues" sits below the band, and not in Rankings (its own Leagues
//   filter lists them).
// Placement only: the views, rounds and picks behave as before.
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

// ── markup ──
check('order: title, league row, then the layout grid; nothing between the title and the league row', /<div class="sg-head">[\s\S]*?<\/div>\s*<\/div>\s*<!-- SCOUT LAYOUT[\s\S]*?-->\s*<div class="sg-tabs-wrap">/.test(page));
check('the grid holds the slots: the bar (chips, views), band, teaser, your leagues, content', /<div class="sg-layout">\s*<!--[\s\S]*?-->\s*<div class="sg-bar">\s*<div id="sg-chips" class="sg-chips sg-l-chips"><\/div>\s*<div id="sg-views" class="sg-seg sg-l-views"><\/div>\s*<\/div>\s*<div id="sg-band" class="sg-l-band"><\/div>\s*<div id="sg-recap-teaser" class="sg-l-teaser"><\/div>[\s\S]*?<div id="sg-leagues" class="sg-leagues sg-l-leagues" style="display:none;"><\/div>\s*<div id="sg-body" class="sg-l-body"><\/div>\s*<\/div>/.test(page));
check('one underline-tab row: the league row (no other .sg-tabs in the page)', (page.match(/class="sg-tabs"/g) || []).length === 1 && !/class="sg-views"/.test(page));
check('the description starts hidden and is shown on the first visit only (a UI flag)', /<div class="sg-sub" id="sg-sub" hidden data-i18n="sg\.sub">/.test(page)
  && /seen=localStorage\.getItem\('sm_sg_intro_seen'\)==='1'; localStorage\.setItem\('sm_sg_intro_seen','1'\);/.test(fn('sgIntro')) && /SG\.introShow=!seen;/.test(fn('sgIntro'))
  && /sgIntro\(\);/.test(fn('renderScout')));

// ── the grid, both widths ──
check('phone: chips · band · views · teaser · leagues · content', /grid-template-areas:"chips" "band" "views" "teaser" "leagues" "body"/.test(css('.sg-layout')));
check('phone: the bar steps aside, so chips and views take their own places in the grid', /\.sg-bar\{display:contents;\}/.test(idx));
check('laptop (900px+): the bar (chips + views), then band · teaser · leagues · content', /@media \(min-width: 900px\)\{[\s\S]*?\.sg-layout\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"bar" "band" "teaser" "leagues" "body";\}/.test(idx));
// 27 Nov 2026 (1400 px, PT): the chips' column was squeezed beside the views and
// "Rodada 37/38" read as hidden behind them. The bar is a wrapping flex row:
// chips at their own width (scrolling inside the row when it is not enough),
// the views right-aligned after them, or on their own line under the chips.
// Measured in the harness at 1100, 1280, 1440 in EN and PT: no visible chip
// intersects the views; with two chips both share one line.
const lap = (/@media \(min-width: 900px\)\{[\s\S]*?\.sg-bar\{display:flex;[^}]*\}[\s\S]*?\.sg-bar>\.sg-seg\{[^}]*\}/.exec(idx) || [''])[0];
check('no chip hidden behind the segment: the bar wraps (flex-wrap), it never overlays', /\.sg-bar\{display:flex;flex-wrap:wrap;/.test(lap)
  && /\.sg-bar>\.sg-l-chips\{flex:0 1 auto;min-width:0;max-width:100%;\}/.test(lap) && /\.sg-bar>\.sg-seg\{flex:0 0 auto;margin-left:auto;\}/.test(lap)
  && !/position:\s*(absolute|fixed|sticky)/.test(css('.sg-seg') + css('.sg-bar>.sg-seg')) && !/margin[^;]*-\d/.test(css('.sg-bar>.sg-seg') + css('.sg-seg'))
  && !/grid-template-areas:"chips views"/.test(idx));
check('…and the chips row keeps its own sideways scroll', /overflow-x:auto/.test(css('.sg-chips')));
check('an empty slot takes no room', /\.sg-l-chips:empty,\.sg-l-band:empty,\.sg-l-teaser:empty\{display:none;\}/.test(idx));

// ── the views: a segmented control ──
check('the views are segment buttons (class sg-seg-btn, "on"), not underline tabs', /const v=\(key,label,fn\)=>'<button class="sg-seg-btn'\+\(SG\.view===key\?' on':''\)\+'" aria-pressed=/.test(fn('sgTabs')));
check('segment: a bordered box, the chosen one filled navy (as the Matches / Table toggle)', /border:1px solid var\(--border\)/.test(css('.sg-seg')) && /background:var\(--navy\);color:var\(--on-navy\)/.test(css('.sg-seg-btn.on')));
check('laptop: the segment shrinks to its buttons, right of the chips', /\.sg-seg\{display:inline-flex;width:auto;/.test(idx));

// ── slots: the round view fills them, the other views empty them ──
check('every view but Round empties the chips, band and teaser', /if\(SG\.view!=='league'\) sgSlots\(''\);/.test(fn('sgRender')) && /set\('sg-chips',chips\|\|''\); set\('sg-band',''\); set\('sg-recap-teaser',''\);/.test(fn('sgSlots')));
check('the open round\'s band goes to the band slot; the saved note stays in the content', /const band=document\.getElementById\('sg-band'\);\s*if\(band\) band\.innerHTML='<div id="sg-open-band">'\+sgOpenBand\(r\)\+'<\/div>';/.test(fn('sgRenderPick'))
  && /const head=SG\.entries\.get\(r\.id\)\?'<div class="sg-saved">'/.test(fn('sgRenderPick')));
check('a played round\'s band goes to the band slot; its recap lines stay in the content', /if\(band\) band\.innerHTML='<div id="sg-played-band">'/.test(fn('sgRenderPlayed')) && /el\.innerHTML='<div id="sg-recap-lines"><\/div>'/.test(fn('sgRenderPlayed')));

check('the selected round chip is scrolled into view when the chips are drawn (the row sideways, never the page)',
  /sgSlots\(chips\);\s*sgChipIntoView\(\);/.test(fn('sgRender')) && /row\.querySelector\('\.sg-chip\.active'\)/.test(fn('sgChipIntoView'))
  && /row\.scrollLeft-=/.test(fn('sgChipIntoView')) && /row\.scrollLeft\+=/.test(fn('sgChipIntoView')) && !/scrollIntoView|window\.scroll/.test(fn('sgChipIntoView')));

// ── filters, your leagues ──
check('Rankings\' and Recaps\' filters: lighter outlined pills', /<div class="sg-chips sg-filters">'\+views\.map/.test(fn('sgRenderRankings')) && /<div class="sg-chips sg-filters">'\+filter\+'/.test(fn('sgRenderRecaps'))
  && /background:transparent/.test(css('.sg-filters .sg-chip')) && /font-size:11px/.test(css('.sg-filters .sg-chip')));
check('"Your leagues": labelled, below the band, hidden in Rankings', /'<span class="sg-leagues-lab">'\+t\('sg\.yourLeagues'\)\+'<\/span>'/.test(fn('glRenderStrip'))
  && /if\(isGuestNow\(\)\|\|!GL\.list\|\|SG\.view==='rankings'\)\{ el\.style\.display='none';/.test(fn('glRenderStrip')));
const i18n = read('public/i18n.js');
check('EN / PT: Your leagues · Suas ligas', /'sg\.yourLeagues': 'Your leagues'/.test(i18n) && /'sg\.yourLeagues': 'Suas ligas'/.test(i18n));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
