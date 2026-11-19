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
const chips = (key) => { ctx.lpRender(key); const h = el(ctx.LP[key].el).innerHTML; return [...h.matchAll(/<button type="button" class="filter-btn( active)?"[^>]*>([^<]+)<\/button>/g)].map((m) => (m[1] ? '*' : '') + m[2]); };
const fan = (slugs) => {
  ctx.CLUB_DATA = new Map(slugs.map((s, i) => [100 + i, { id: 100 + i, league: s, label: 'Club ' + i }]));
  ctx.myClubIds = () => slugs.map((s, i) => 100 + i);
};
// The Clubs tab carries every league we hold clubs for: give it one club per league beyond mine.
const withAllClubs = () => { for (const l of LEAGUES) if (![...ctx.CLUB_DATA.values()].some((c) => c.league === l.slug)) ctx.CLUB_DATA.set(1000 + l.id, { id: 1000 + l.id, league: l.slug }); };

// ── A guest: All and the Leagues button ──
fan([]); store.clear();
eq('a guest: All only, chosen (no "My leagues" without clubs)', chips('mx'), ['*All']);
check('…and the Leagues button, which opens the sheet', /<button type="button" class="lp-more" aria-haspopup="dialog" onclick="lpOpen\('mx',this\)"><span>Leagues<\/span><svg data-icon="chevronDown"><\/svg><\/button>/.test(el('matches-league-chips').innerHTML));
check('the chips scroll in a labelled group', /<div class="chip-scroll lp-chips" role="group" aria-label="League">/.test(el('matches-league-chips').innerHTML));

// ── A fan with clubs in two leagues ──
fan(['serie_a', 'premier_league']); store.clear();
eq('a fan: All · My leagues (chosen by default) · my two leagues, alphabetical', chips('mx'), ['All', '*My leagues', 'Premier League · ENG', 'Série A · BRA']);
ctx.mxApplySel();
eq('My leagues filters the query to those leagues', [ctx.MX.league, ctx.mxLeagueFilter()], [null, `in.(${[idOf('premier_league'), idOf('serie_a')].join(',')})`]);
check('chips go by index, never a name in an onclick', /onclick="lpPick\('mx',3\)"/.test(el('matches-league-chips').innerHTML) && !/onclick="[^"]*serie_a/.test(el('matches-league-chips').innerHTML));
ctx.lpPick('mx', 0);
eq('All tapped: saved for the session, chosen, still every chip', [store.get('sm_league_matches'), chips('mx')], ['all', ['*All', 'My leagues', 'Premier League · ENG', 'Série A · BRA']]);
ctx.mxApplySel();
eq('All: no league filter', ctx.mxLeagueFilter(), null);
ctx.lpPick('mx', 3);
eq('one of my leagues tapped: that chip chosen', chips('mx'), ['All', 'My leagues', 'Premier League · ENG', '*Série A · BRA']);
ctx.mxApplySel();
eq('…the query asks for that league only', ctx.mxLeagueFilter(), `eq.${idOf('serie_a')}`);
eq('every tap reaches the list', ctx.picks.map((p) => p.join(':')), ['mx:all', 'mx:serie_a']);

// ── A fan with clubs in one league never loses sight of All ──
fan(['serie_c']); store.clear();
eq('one league of mine: All is still the first chip', chips('mx'), ['All', '*My leagues', 'Série C · BRA']);
ctx.mxApplySel();
check('…and "My leagues" behaves as that league chosen (its table, its far window)', ctx.MX.league && ctx.MX.league.slug === 'serie_c' && ctx.mxLeagueFilter() === `eq.${idOf('serie_c')}`);

// ── The sheet ──
fan(['serie_a', 'premier_league']); store.clear(); store.set('sm_league_matches', 'mine');
ctx.setOpen('mx'); el('lp-q').value = '';
ctx.lpFilter();
let list = el('lp-list').innerHTML;
const countries = [...list.matchAll(/<div class="lp-country">([^<]+)<\/div>/g)].map((m) => m[1]);
const items = [...list.matchAll(/<button type="button" class="lp-item( on)?"[^>]*><span>([^<]+)<\/span>/g)].map((m) => m[2]);
eq('every tracked league is in the sheet, once', [items.length, new Set(items).size], [LEAGUES.length, LEAGUES.length]);
eq('grouped by country with its code: my countries first, then by name', countries.slice(0, 3), ['Brazil · BRA', 'England · ENG', 'Argentina · ARG']);
eq('one heading per country (Brazil has three leagues, England two)', countries.length, new Set(LEAGUES.map((l) => l.country_code)).size);
check('a country\'s leagues sit under it: my league first', /Brazil · BRA<\/div><button[^>]*><span>Série A · BRA<\/span>[\s\S]*?Série B · BRA[\s\S]*?Série C · BRA[\s\S]*?England · ENG<\/div><button[^>]*><span>Premier League · ENG<\/span>[\s\S]*?Championship · ENG/.test(list));
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
eq('…it shows as its own chip, chosen, after my leagues', chips('mx'), ['All', 'My leagues', 'Premier League · ENG', 'Série A · BRA', '*Primera División · URU']);
ctx.setOpen('mx'); el('lp-q').value = ''; ctx.lpFilter();
check('…and is marked in the sheet (bar + check)', /<button type="button" class="lp-item on" aria-pressed="true"[^>]*><span>Primera División · URU<\/span><svg data-icon="check"><\/svg><\/button>/.test(el('lp-list').innerHTML));
ctx.mxApplySel();
eq('…the query asks for it', ctx.mxLeagueFilter(), `eq.${idOf('uruguay')}`);

// ── Saved choices ──
store.clear(); store.set('sm_league_matches', 'no_such_league');
eq('a saved league we no longer track falls back to the default', chips('mx')[1], '*My leagues');
fan([]); store.set('sm_league_matches', 'mine');
eq('a saved "My leagues" with no clubs (signed out) reads as All', chips('mx'), ['*All']);

// ── Clubs keeps its own choice ──
fan(['serie_a', 'premier_league']); withAllClubs(); store.clear();
store.set('sm_league_matches', 'uruguay');
eq('Clubs has its own choice: My leagues by default while Matches is on Uruguay', chips('cl'), ['All', '*My leagues', 'Premier League · ENG', 'Série A · BRA']);
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
check('tap targets: the button and the rows are 44px', /\.lp-more::after\{[^}]*width:max\(100%,44px\);height:max\(100%,44px\)/.test(idx) && /\.lp-item\{[^}]*min-height:44px;/.test(idx) && /\.lp-x\{[^}]*width:44px;height:44px;/.test(idx));
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
const codes = [...new Set(LEAGUES.map((l) => l.country_code))];
check('every league\'s country has a name in both languages', codes.every((c) => I.en['country.' + c] && I['pt-BR']['country.' + c]), codes.filter((c) => !I.en['country.' + c]).join(', '));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
