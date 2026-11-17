// News card rules (public/news-card.js), design spec v1.2 §4 and §6.
//
//   node tests/news-card.test.js
//
// The category mapping, the crest-tile cases (lead, one club, two, three or
// more, none), the order crests appear in, and reading a club's colour from
// crest pixels. Plus the page: every list goes through renderFeedItem (rule
// 12), the lead card and the row use the tile, labels come from the mapping,
// and the card strings exist in both languages. No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const ctx = {}; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read('public/news-card.js'), ctx);
const NC = ctx.NewsCard;
const plain = (x) => JSON.parse(JSON.stringify(x));

// ── Categories (spec v1.2 §6) ──
eq('transfer → Transfer', plain(NC.category('transfer')), { key: 'news.cat.transfer', tone: 'transfer' });
eq('contract → Transfer', plain(NC.category('contract')), { key: 'news.cat.transfer', tone: 'transfer' });
eq('rumour (the tagger writes "rumor") → Rumour, transfer colour', plain(NC.category('rumor')), { key: 'news.cat.rumour', tone: 'transfer' });
eq('match → Match', plain(NC.category('match')), { key: 'news.cat.match', tone: 'match' });
check('general → no label', NC.category('general') === null);
check('anything unknown → no label (no Injury/Interview until the tagger can tell)', NC.category('injury') === null && NC.category(undefined) === null);

// ── Crest order ──
const fla = { api_team_id: 127, name: 'Flamengo', label: 'Flamengo' };
const pal = { api_team_id: 121, name: 'Palmeiras', label: 'Palmeiras' };
const sao = { api_team_id: 126, name: 'Sao Paulo', label: 'São Paulo' };
const item = (o) => Object.assign({ title: '', teams: [], headlineTeamIds: [], source: 'ge' }, o);
eq('two clubs: the one named first in the headline is on the left',
  plain(NC.orderTeams(item({ title: 'Palmeiras beat Flamengo at home', teams: [fla, pal], headlineTeamIds: [127, 121] }))).map((t) => t.name), ['Palmeiras', 'Flamengo']);
eq('accents do not matter (São Paulo vs Sao Paulo)',
  plain(NC.orderTeams(item({ title: 'São Paulo e Flamengo empatam', teams: [fla, sao], headlineTeamIds: [127, 126] }))).map((t) => t.name), ['Sao Paulo', 'Flamengo']);
eq('headline clubs before clubs only in the summary',
  plain(NC.orderTeams(item({ title: 'Flamengo sign a forward', teams: [pal, fla], headlineTeamIds: [127] }))).map((t) => t.name), ['Flamengo', 'Palmeiras']);
eq('no headline clubs → tag order', plain(NC.orderTeams(item({ teams: [pal, fla] }))).map((t) => t.name), ['Palmeiras', 'Flamengo']);

// ── The tile (spec v1.2 §6) ──
const one = item({ title: 'Flamengo news', teams: [fla], headlineTeamIds: [127] });
const two = item({ title: 'Flamengo x Palmeiras', teams: [fla, pal], headlineTeamIds: [127, 121] });
const three = item({ title: 'Flamengo, Palmeiras and São Paulo chase a striker', teams: [fla, pal, sao, { api_team_id: 1, name: 'Bahia' }], headlineTeamIds: [127, 121, 126] });
const none = item({ title: 'VAR changes next season', source: 'La Gazzetta dello Sport' });
eq('lead card → navy, whatever the case', [NC.tile(one, true).bg, NC.tile(two, true).bg, NC.tile(none, true).bg], ['navy', 'navy', 'navy']);
eq('one club → the club tint, one crest', (({ bg, crests, more, text }) => ({ bg, n: crests.length, more, text }))(plain(NC.tile(one, false))), { bg: 'club', n: 1, more: 0, text: null });
eq('two clubs → tint, two crests, no split of colours', (({ bg, crests, more }) => ({ bg, n: crests.length, more }))(plain(NC.tile(two, false))), { bg: 'tint', n: 2, more: 0 });
eq('three or more → tint, the first two crests + "+N"', (({ bg, crests, more }) => ({ bg, names: crests.map((c) => c.name), more }))(plain(NC.tile(three, false))), { bg: 'tint', names: ['Flamengo', 'Palmeiras'], more: 2 });
eq('no club → tint with the source name, never a logo', (({ bg, crests, text }) => ({ bg, n: crests.length, text }))(plain(NC.tile(none, false))), { bg: 'tint', n: 0, text: 'La Gazzetta dello Sport' });
check('no club and no source → no text (nothing invented)', NC.tile(item({ source: '' }), false).text === null);

// ── The club colour from crest pixels ──
const px = (cells) => { const a = []; for (const [rgba, n] of cells) for (let i = 0; i < n; i++) a.push(...rgba); return new Uint8ClampedArray(a); };
eq('a red crest on white → red', plain(NC.pickColour(px([[[200, 20, 30, 255], 300], [[255, 255, 255, 255], 600], [[0, 0, 0, 0], 124]]))), [200, 20, 30]);
eq('a gradient of greens stays one colour (Palmeiras)', plain(NC.pickColour(px([[[20, 100, 60, 255], 30], [[30, 130, 70, 255], 30], [[50, 160, 90, 255], 30], [[255, 255, 255, 255], 600]]))), [33, 130, 73]);
check('the most common colour wins', JSON.stringify(plain(NC.pickColour(px([[[20, 120, 40, 255], 400], [[220, 200, 20, 255], 200]])))) === '[20,120,40]');
check('black and white only → null (the tile falls back to --tint)', NC.pickColour(px([[[0, 0, 0, 255], 500], [[255, 255, 255, 255], 524]])) === null);
check('grey → null', NC.pickColour(px([[[128, 128, 128, 255], 1024]])) === null);
check('transparent → null', NC.pickColour(px([[[200, 20, 30, 0], 1024]])) === null);
check('a colour under 8% of the crest → null', NC.pickColour(px([[[200, 20, 30, 255], 40], [[255, 255, 255, 255], 984]])) === null);
check('no pixels → null', NC.pickColour(null) === null && NC.pickColour(new Uint8ClampedArray(0)) === null);

// ── The page ──
const idx = read('public/index.html');
const theme = read('public/theme.css');
check('index.html loads news-card.js', /<script src="\/news-card\.js(\?v=[0-9a-f]+)?"><\/script>/.test(idx));
check('the service worker precaches news-card.js', /'\/news-card\.js'/.test(read('public/sw.js')));
check('rule 12: Trending, News, For you and search all go through renderFeedItem',
  (idx.match(/\.map\(renderFeedItem\)|renderFeedItem\(n,1\)/g) || []).length >= 4 && /function renderFeedItem\(item,pos\)\{\s*switch\(item\.type\)/.test(idx));
const card = (/function renderNewsCard\(n,lead\)\{[\s\S]*?\n\}/.exec(idx) || [''])[0];
const tileFn = (/function newsTile\(n,lead\)\{[\s\S]*?\n\}/.exec(idx) || [''])[0];
check('the card uses the tile and the category mapping', /NewsCard\.tile\(n,lead\)/.test(tileFn) && /newsTile\(n,true\)/.test(card) && /newsTile\(n,false\)/.test(card)
  && /NewsCard\.category\(n\.category\)/.test(card));
check('lead card: the visual first, then the label line, the headline and the foot',
  /if\(lead\)\{[\s\S]*?'<div class="nc-lead-in"><a class="nc-vis"[\s\S]*?newsTile\(n,true\)[\s\S]*?'<div class="nc-body">'\+meta\+head\+foot\+'<\/div><\/div>'/.test(card));
check('following rows: the visual left, then the label line, headline and foot', /\}else\{[\s\S]*?'<div class="nc-row"><a class="nc-vis"[\s\S]*?newsTile\(n,false\)[\s\S]*?'<div class="nc-body">'\+meta\+head\+foot/.test(card));
// ── Commit 3 ──
check('laptop lead: side by side, a 220px square tile on the left',
  /@media\(min-width:900px\)\{\s*\.nc-lead-in\{display:flex;[\s\S]*?\.nc-lead \.nt-lead\{width:220px;height:220px;/.test(idx));
check('the lead tile is never empty: club name(s) and the category word under the crests',
  /if\(lead\)\{[\s\S]*?names\.join\(' × '\)[\s\S]*?'<span class="nt-cap">'[\s\S]*?'<span class="nt-word">'\+sanitize\(t\(cat\.key\)\)/.test(tileFn));
check('reactions, Comment and Read on one small line; no full-width bar under each card',
  /const foot='<div class="nc-foot">'[\s\S]*?reactionButtons\(n\.id\)[\s\S]*?commentToggleLabel\(n\.id\)[\s\S]*?news\.read/.test(card) && !/social-bar/.test(idx));
check('reactions are line icons with counts, labelled in both languages', /icon:'<path/.test(idx) && !/emoji:'/.test(idx)
  && ['news.r.fire', 'news.r.clap', 'news.r.mind_blown'].every((k) => (read('public/i18n.js').match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2));
check('the foot links are 44px to the finger', /\.nc-foot \.reaction::after,\.nc-foot \.comment-toggle::after,\.nc-foot \.read-link::after\{[^}]*height:44px/.test(idx));
const toggle = (/function commentToggleLabel\(itemId\)\{[\s\S]*?\n\}/.exec(idx) || [''])[0];
check('no emoji on the card (the comment toggle uses a line icon)', !/&#x1F4AC;|💬|&#x1F/.test(card + toggle + tileFn) && /ICON_MSG/.test(toggle));
check('the club tint is a token class in theme.css, no colour literal in index.html',
  /\.club-tint\{background:rgb\(var\(--club-rgb\) \/ var\(--club-tint-a\)\);\}/.test(theme) && /--club-tint-a:\.15/.test(theme) && /--club-tint-a:\.25/.test(theme));
check('crests sit on a white disc token, in both modes', /--crest-disc:#FFFFFF/.test(theme) && (theme.match(/--crest-disc:#FFFFFF/g) || []).length === 2);
check('a crest that cannot be read leaves the tile on --tint', /catch\(e\)\{ CREST_RGB\.set\(url,null\)/.test(idx));
const i18n = read('public/i18n.js');
for (const k of ['news.cat.transfer', 'news.cat.rumour', 'news.cat.match', 'news.comment', 'news.comments.one', 'news.comments.other', 'news.read', 'news.readOn', 'news.translate']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
