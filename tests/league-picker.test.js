// The league picker on Matches and Clubs (19 Nov 2026).
//
//   node tests/league-picker.test.js
//
// Nineteen league chips no longer fit one row. index.html's LEAGUE PICKER
// runs here (node:vm) with the 19 tracked leagues. Covered:
// - the row: All · My leagues · a chip per league of mine, then the Leagues
//   button; All is always the first chip (a fan with clubs in one league still
//   sees it); a guest gets All and the button only;
// - the default: My leagues when I have clubs, All when I have none; a saved
//   choice (sessionStorage, per picker) wins while it still applies;
// - a league picked from the sheet that is not one of mine shows as its own
//   chip, chosen; Matches and Clubs keep separate choices;
// - "My leagues" filters the Matches query to those leagues (league_id=in.(…));
//   a single league of mine behaves like that league chosen (table, far window);
// - the sheet: every league, grouped by country with its code, my countries
//   first, then by name in the reader's language; search ignores accents and
//   matches the league, the code and the country in either language; the
//   chosen league is marked; nothing found says so;
// - rule 6, Escape, the focus trap, the 900px dropdown, sessionStorage (the
//   old localStorage key is removed), feed filters no longer clear the chips,
//   every new string in both languages.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const idx = read('public/index.html');
const fn = (name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx); if (!m) throw new Error('no ' + name); return m[0]; };

// ── The sandbox ──
const i18nBox = {}; vm.createContext(i18nBox);
vm.runInContext(read('public/i18n.js'), Object.assign(i18nBox, { window: i18nBox, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, document: { documentElement: {}, querySelectorAll: () => [] } }));
const I = i18nBox.I18N;
let lang = 'en';
const store = new Map();
const els = new Map();
const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: '', value: '', hidden: false }); return els.get(id); };
const ctx = {
  console, Map, Set, String, Number, Math, Intl,
  t: (k, v) => String((I[lang] || {})[k] || '').replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)),
  smLocale: () => (lang === 'pt-BR' ? 'pt-BR' : undefined),
  sanitize: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  Icons: { svg: (n) => `<svg data-icon="${n}"></svg>` },
  sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  document: { getElementById: el },
  myClubIds: () => [],
  CLUB_DATA: new Map(),
  MX: { leagues: null },
  picks: [],
};
ctx.window = ctx;
ctx.window.I18N = I;
vm.createContext(ctx);
vm.runInContext(read('public/league-names.js'), ctx);
const LEAGUES = ctx.LeagueNames.LEAGUES.map((l, i) => ({ id: i + 1, slug: l.slug, name: l.name, country: l.country, country_code: l.code }));
ctx.MX.leagues = LEAGUES;
vm.runInContext(['const LP={};', fn('lpDefine'),
  "lpDefine({key:'mx', el:'matches-league-chips', store:'sm_league_matches', leagues:()=>MX.leagues||[], onPick:(v)=>picks.push(['mx',v])});",
  "lpDefine({key:'cl', el:'clubs-chips', store:'sm_league_clubs', leagues:()=>clubsLeagues(), onPick:(v)=>picks.push(['cl',v])});",
  ...['lpSaved', 'lpSave', 'myLeagueSlugs', 'lpMine', 'lpResolve', 'lpRender', 'lpPick', 'lpNorm', 'lpCountry', 'lpFilter', 'lpPickSheet', 'clubsLeagues', 'mxApplySel', 'mxLeagueFilter'].map(fn),
  'this.LP=LP; this.setOpen=(k)=>{ LP_OPEN=k; }; let LP_OPEN=null; function lpClose(){ LP_OPEN=null; }'].join('\n'), ctx);

const idOf = (slug) => LEAGUES.find((l) => l.slug === slug).id;
// The row as text: every button in order, "*" for the chosen one (the Leagues button shows a chosen league's name).
const chips = (key) => { ctx.lpRender(key); const h = el(ctx.LP[key].el).innerHTML;
  return [...h.matchAll(/<button type="button" class="filter-btn( lp-more)?( active)?"[^>]*>(?:<span class="lp-more-t">)?([^<]+)/g)].map((m) => (m[2] ? '*' : '') + m[3]); };
const pickFromSheet = (key, slug) => { ctx.setOpen(key); el('lp-q').value = ''; ctx.lpFilter(); ctx.lpPickSheet(ctx.LP[key].sheet.findIndex((l) => l.slug === slug)); };
const fan = (slugs) => {
  ctx.CLUB_DATA = new Map(slugs.map((s, i) => [100 + i, { id: 100 + i, league: s, label: 'Club ' + i }]));
  ctx.myClubIds = () => slugs.map((s, i) => 100 + i);
};
// The Clubs tab carries every league we hold clubs for: give it one club per league beyond mine.
const withAllClubs = () => { for (const l of LEAGUES) if (![...ctx.CLUB_DATA.values()].some((c) => c.league === l.slug)) ctx.CLUB_DATA.set(1000 + l.id, { id: 1000 + l.id, league: l.slug }); };

// ── A guest: All and the Leagues button ──
fan([]); store.clear();
eq('a guest: [All] [Leagues ⌄], All chosen (no "My leagues" without clubs)', chips('mx'), ['*All', 'Leagues']);
check('the Leagues button opens the sheet', /<button type="button" class="filter-btn lp-more" aria-haspopup="dialog" aria-pressed="false" onclick="lpOpen\('mx',this\)"><span class="lp-more-t">Leagues<\/span><svg data-icon="chevronDown"><\/svg><\/button>/.test(el('matches-league-chips').innerHTML),
  el('matches-league-chips').innerHTML);
check('one labelled group, nothing that scrolls (no chip row)', /^<div class="lp-group" role="group" aria-label="League">/.test(el('matches-league-chips').innerHTML)
  && !/chip-scroll/.test(fn('lpRender')));

// ── A fan with clubs in two leagues ──
fan(['serie_a', 'premier_league']); store.clear();
eq('a fan: [All] [My leagues] [Leagues ⌄], My leagues chosen by default; no per-league chips', chips('mx'), ['All', '*My leagues', 'Leagues']);
ctx.mxApplySel();
eq('My leagues filters the query to those leagues', [ctx.MX.league, ctx.mxLeagueFilter()], [null, `in.(${[idOf('premier_league'), idOf('serie_a')].join(',')})`]);
check('chips go by index, never a name in an onclick', /onclick="lpPick\('mx',1\)"/.test(el('matches-league-chips').innerHTML) && !/onclick="[^"]*serie_a/.test(el('matches-league-chips').innerHTML));
ctx.lpPick('mx', 0);
eq('All tapped: saved for the session, chosen', [store.get('sm_league_matches'), chips('mx')], ['all', ['*All', 'My leagues', 'Leagues']]);
ctx.mxApplySel();
eq('All: no league filter', ctx.mxLeagueFilter(), null);
pickFromSheet('mx', 'serie_a');
eq('a league from the sheet is shown ON the button, chosen', chips('mx'), ['All', 'My leagues', '*Série A · BRA']);
check('…with its full name as the title (the button ends in an ellipsis when long)', /class="filter-btn lp-more active" aria-haspopup="dialog" aria-pressed="true" title="Série A · BRA"/.test(el('matches-league-chips').innerHTML));
ctx.mxApplySel();
eq('…the query asks for that league only', ctx.mxLeagueFilter(), `eq.${idOf('serie_a')}`);
ctx.lpPick('mx', 1);
eq('My leagues clears it: the button reads "Leagues" again', chips('mx'), ['All', '*My leagues', 'Leagues']);
eq('every tap reaches the list', ctx.picks.map((p) => p.join(':')), ['mx:all', 'mx:serie_a', 'mx:mine']);

// ── A fan with clubs in one league never loses sight of All ──
fan(['serie_c']); store.clear();
eq('one league of mine: All is still there', chips('mx'), ['All', '*My leagues', 'Leagues']);
ctx.mxApplySel();
check('…and "My leagues" behaves as that league chosen (its table, its far window)', ctx.MX.league && ctx.MX.league.slug === 'serie_c' && ctx.mxLeagueFilter() === `eq.${idOf('serie_c')}`);

// ── The sheet ──
fan(['serie_a', 'premier_league']); store.clear(); store.set('sm_league_matches', 'mine');
ctx.setOpen('mx'); el('lp-q').value = '';
ctx.lpFilter();
let list = el('lp-list').innerHTML;
const countries = [...list.matchAll(/<div class="lp-country">([^<]+)<\/div>/g)].map((m) => m[1]);
const items = [...list.matchAll(/<button type="button" class="lp-item( on)?"[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[2]);
// C-1: then "Cups" (the Champions League…), then the countries.
check('a "My leagues" section at the top: my two leagues, then Cups (the three UEFA cups, by name), then the first country', /^<div class="lp-country lp-mine-h">My leagues<\/div><button[^>]*><span>Premier League · ENG<\/span><\/button><button[^>]*><span>Série A · BRA<\/span><\/button><div class="lp-country lp-cups-h">Cups<\/div><button[^>]*><span>Champions League · UEFA<\/span><\/button><button[^>]*><span>Conference League · UEFA<\/span><\/button><button[^>]*><span>Europa League · UEFA<\/span><\/button><div class="lp-country">Brazil · BRA/.test(list),
  list.slice(0, 400));
eq('then every tracked league by country, once each (cups in their own section)', [items.length - 2, new Set(items).size], [LEAGUES.length, LEAGUES.length]);
eq('grouped by country with its code: my countries first, then by name', countries.slice(0, 3), ['Brazil · BRA', 'England · ENG', 'Argentina · ARG']);
const LEAGUES_ONLY = LEAGUES.filter((l) => !ctx.LeagueNames.isCup(l));
eq('one heading per country (Brazil has three leagues, England two); a cup is under Cups, not a country', countries.length, new Set(LEAGUES_ONLY.map((l) => l.country_code)).size);
check('a country\'s leagues sit under it: my league first', /Brazil · BRA<\/div><button[^>]*><span>Série A · BRA<\/span>[\s\S]*?Série B · BRA[\s\S]*?Série C · BRA[\s\S]*?England · ENG<\/div><button[^>]*><span>Premier League · ENG<\/span>[\s\S]*?Championship · ENG/.test(list));
check('while searching, no "My leagues" section (the search lists by country)', (() => { el('lp-q').value = 'serie'; ctx.lpFilter(); const h = el('lp-list').innerHTML; el('lp-q').value = ''; return !/lp-mine-h/.test(h); })());
check('nothing is chosen in the sheet while My leagues is', !/lp-item on/.test(list));
const search = (q) => { el('lp-q').value = q; ctx.lpFilter(); return [...el('lp-list').innerHTML.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]); };
eq('search "uru" → Uruguay', search('uru'), ['Primera División · URU']);
eq('search ignores accents: "mexico" and "méx" → Liga MX', [search('mexico'), search('méx')], [['Liga MX · MEX'], ['Liga MX · MEX']]);
eq('search by code: "BRA" → the three Brazilian leagues', search('BRA'), ['Série A · BRA', 'Série B · BRA', 'Série C · BRA']);
eq('search by the country in Portuguese, from the English page: "inglaterra"', search('inglaterra'), ['Premier League · ENG', 'Championship · ENG']);
eq('search by league name: "pro league"', search('pro league'), ['Jupiler Pro League · BEL', 'Saudi Pro League · KSA']);
search('zzz');
check('nothing found says so, with what was typed', /<div class="lp-empty">No league matches “zzz”<\/div>/.test(el('lp-list').innerHTML));
lang = 'pt-BR'; el('lp-q').value = ''; ctx.lpFilter();
check('in Portuguese the countries read in Portuguese', /<div class="lp-country">Brasil · BRA<\/div>/.test(el('lp-list').innerHTML) && /Inglaterra · ENG/.test(el('lp-list').innerHTML) && /Uruguai · URU/.test(el('lp-list').innerHTML));
lang = 'en';

// Picking a league that is not one of mine
el('lp-q').value = ''; ctx.lpFilter();
const uruIdx = ctx.LP.mx.sheet.findIndex((l) => l.slug === 'uruguay');
ctx.picks.length = 0;
ctx.lpPickSheet(uruIdx);
eq('a league from the sheet: saved, and the list told', [store.get('sm_league_matches'), ctx.picks.map((p) => p.join(':'))], ['uruguay', ['mx:uruguay']]);
eq('…it shows on the button, chosen: [All] [My leagues] [Primera División · URU ⌄]', chips('mx'), ['All', 'My leagues', '*Primera División · URU']);
ctx.setOpen('mx'); el('lp-q').value = ''; ctx.lpFilter();
check('…and is marked in the sheet (bar + check)', /<button type="button" class="lp-item on" aria-pressed="true"[^>]*><span>Primera División · URU<\/span><svg data-icon="check"><\/svg><\/button>/.test(el('lp-list').innerHTML));
ctx.mxApplySel();
eq('…the query asks for it', ctx.mxLeagueFilter(), `eq.${idOf('uruguay')}`);

// ── Saved choices ──
store.clear(); store.set('sm_league_matches', 'no_such_league');
eq('a saved league we no longer track falls back to the default', chips('mx'), ['All', '*My leagues', 'Leagues']);
fan([]); store.set('sm_league_matches', 'mine');
eq('a saved "My leagues" with no clubs (signed out) reads as All', chips('mx'), ['*All', 'Leagues']);

// ── Clubs keeps its own choice ──
fan(['serie_a', 'premier_league']); withAllClubs(); store.clear();
store.set('sm_league_matches', 'uruguay');
eq('Clubs: the same row, its own choice (My leagues while Matches is on Uruguay)', chips('cl'), ['All', '*My leagues', 'Leagues']);
ctx.lpPick('cl', 0);
eq('…and saving it does not touch Matches', [store.get('sm_league_clubs'), store.get('sm_league_matches')], ['all', 'uruguay']);
eq('the Clubs sheet carries every league we hold clubs for', ctx.clubsLeagues().length, LEAGUES.length);

// ── The wiring in index.html ──
check('the sheet starts hidden; JS shows it (rule 6)', /<div id="lp-sheet" class="lp-overlay" style="display:none;"/.test(idx) && /ov\.style\.display='flex';/.test(fn('lpOpen')) && /ov\.style\.display='none';/.test(fn('lpClose')));
check('a dialog: labelled, modal, closes on the backdrop', /<div class="lp-panel" role="dialog" aria-modal="true" aria-labelledby="lp-title">/.test(idx) && /onclick="if\(event\.target===this\)lpClose\(\)"/.test(idx));
check('Escape closes it; Tab stays inside it', /if\(e\.key==='Escape'\)\{ e\.preventDefault\(\); lpClose\(\); return; \}/.test(fn('lpKey')) && /last\.focus\(\)/.test(fn('lpKey')) && /first\.focus\(\)/.test(fn('lpKey')));
check('from 900px it is a dropdown under the button; on a phone a bottom sheet', /matchMedia\('\(min-width: 900px\)'\)/.test(fn('lpOpen')) && /ov\.classList\.toggle\('drop',wide\);/.test(fn('lpOpen'))
  && /\.lp-overlay\{[^}]*justify-content:flex-end;/.test(idx) && /\.lp-overlay\.drop \.lp-panel\{position:fixed;width:360px;/.test(idx));
check('the sheet clears the home indicator', /\.lp-panel\{[^}]*env\(safe-area-inset-bottom\)/.test(idx));
check('focus returns to the Leagues button when it closes', /document\.querySelector\('#'\+LP\[key\]\.el\+' \.lp-more'\)/.test(fn('lpClose')));
check('tap targets: the row\'s buttons are .filter-btn (44px hit area), the sheet\'s rows 44px', /\.filter-btn::after,[\s\S]*?width:max\(100%,44px\);height:max\(100%,44px\)/.test(idx)
  && /class="filter-btn lp-more/.test(fn('lpRender')) && /\.lp-item\{[^}]*min-height:44px;/.test(idx) && /\.lp-x\{[^}]*width:44px;height:44px;/.test(idx));
check('nothing in the row scrolls; a long name on the button ends in an ellipsis', /\.lp-group\{[^}]*flex-wrap:nowrap;/.test(idx) && !/\.lp-group\{[^}]*overflow-x/.test(idx)
  && /\.lp-group>\.lp-more\{[^}]*min-width:0;/.test(idx) && /\.lp-more-t\{[^}]*text-overflow:ellipsis;white-space:nowrap;/.test(idx));
// .lp-panel .lp-q outranks the desktop rule that sets every search field to min-height:0.
check('the search field is 16px (no iOS zoom) and 44px tall at every width', /\.lp-panel \.lp-q\{[^}]*min-height:44px;font-size:16px;/.test(idx));
check('the choice is kept for the session, not on the device; the old key is removed', /sessionStorage\.getItem\(LP\[key\]\.store\)/.test(fn('lpSaved'))
  && !/localStorage\.(get|set)Item\('sm_matches_league'/.test(idx) && /localStorage\.removeItem\('sm_matches_league'\)/.test(fn('mxStart')));
check('both pickers are defined, each with its own key', /lpDefine\(\{key:'mx', el:'matches-league-chips', store:'sm_league_matches'/.test(idx) && /lpDefine\(\{key:'cl', el:'clubs-chips', store:'sm_league_clubs'/.test(idx));
check('the rows are empty in the HTML and filled by lpRender', /<div id="matches-league-chips" class="lp-row"><\/div>/.test(idx) && /<div id="clubs-chips" class="lp-row"><\/div>/.test(idx));
check('Clubs: My leagues shows a section per league', /lpRender\('cl'\);/.test(fn('renderClubsGrid')) && /if\(sel==='mine'\)\{/.test(fn('renderClubsGrid')) && /<h3 class="cl-league-h">/.test(fn('renderClubsGrid')));
check('my clubs changing re-resolves the filter (and reloads when it changed)', /mxApplySel\(\);\s*lpRender\('mx'\);\s*if\(MX\.started&&!MX\.err&&MX\.selKey!==key\)\{/.test(fn('mxRefresh')));
check('a feed filter clears only its own row (the pickers are .filter-btn too)', /\(\(btn&&btn\.parentElement\)\|\|document\)\.querySelectorAll\('\.filter-btn'\)/.test(fn('filterFeed')));
check('Matches keeps the strip, Today and "Show earlier results"', /<div id="mx-strip" class="mx-strip"/.test(idx) && /id="mx-today" class="mx-today"/.test(idx) && /fx\.earlier/.test(idx));

// ── Strings ──
const KEYS = ['lp.mine', 'lp.button', 'lp.title', 'lp.search', 'lp.close', 'lp.none'];
check('the picker\'s strings in both languages, translated', KEYS.every((k) => I.en[k] && I['pt-BR'][k] && I.en[k] !== I['pt-BR'][k]), KEYS.filter((k) => !(I.en[k] && I['pt-BR'][k])).join(', '));
const codes = [...new Set(LEAGUES.filter((l) => !ctx.LeagueNames.isCup(l)).map((l) => l.country_code))];
check('every league\'s country has a name in both languages; the Cups section heading too', I.en['lp.cups'] && I['pt-BR']['lp.cups'] && codes.every((c) => I.en['country.' + c] && I['pt-BR']['country.' + c]), codes.filter((c) => !I.en['country.' + c]).join(', '));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
