// The logged-out landing page (public/welcome.html) and the gate in front of
// the app (index.html).
//
//   node tests/landing.test.js
//
// The gate scripts and the landing's own script RUN here (node:vm) against a
// stubbed browser and a stubbed PostgREST. Covered:
// - the gate is the first script in index.html's head and decides before any
//   paint: signed in (Supabase session or sm_current_user) → the app, and
//   "Browse as guest" is forgotten; a query or sm_browse → the app; else
//   location.replace('/welcome.html'); no storage → the app;
// - welcome.html's mirror gate sends a signed-in visitor to /, keeping the query;
// - nothing fake: every data section is hidden in the HTML and shown only with
//   rows; the static page carries no number; the band is drawn by the shared
//   home-band.js; the example is the newest FINAL round that has a top score;
//   the default club is the most-followed (034, else the room overview's
//   count, else the first club with no "most followed" claim);
// - install hint: the visitor's platform only, both on a desktop, none when
//   already installed; links, header (no tab bar), footer, OG, precache;
// - migration 034: counts only, readable by anon, re-runnable, a verify query;
// - the band moved: index.html delegates to HomeBand, the styles are in theme.css.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const idx = read('public/index.html');
const wel = read('public/welcome.html');
const scripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// ── The gate (index.html) ──
const head = idx.slice(0, idx.indexOf('</head>'));
const gateAt = head.indexOf('<script>');
check('the gate is the first script, right after the charset, before the theme script and any stylesheet',
  gateAt > head.indexOf('<meta charset="UTF-8">') && gateAt < head.indexOf("localStorage.getItem('sm_theme')") && gateAt < head.indexOf('<link rel="stylesheet"')
  && !/<script[^>]*src=/.test(head.slice(0, gateAt)));
const gate = scripts(idx)[0];
function runGate(code, { store = {}, search = '', noStorage = false } = {}) {
  const calls = [];
  const ls = { getItem: (k) => (k in store ? store[k] : null), removeItem: (k) => { delete store[k]; }, setItem: (k, v) => { store[k] = String(v); } };
  const win = {};
  Object.defineProperty(win, 'localStorage', { get() { if (noStorage) throw new Error('SecurityError'); return ls; } });
  const ctx = { window: win, location: { search, replace: (u) => calls.push(u) } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { to: calls[0] || null, store };
}
const SB = 'sb-kdhbpzooyjxcglbxbuya-auth-token';
check('the session key is the project the app talks to', idx.includes("createClient('https://kdhbpzooyjxcglbxbuya.supabase.co'") && gate.includes(SB));
check('a stranger on the bare / goes to the landing page (replace)', runGate(gate).to === '/welcome.html');
check('signed in (Supabase session) → the app', runGate(gate, { store: { [SB]: '{}' } }).to === null);
check('signed in (sm_current_user) → the app', runGate(gate, { store: { sm_current_user: '{}' } }).to === null);
check('signing in forgets "Browse as guest"', !('sm_browse' in runGate(gate, { store: { [SB]: '{}', sm_browse: '1' } }).store));
check('"Browse as guest" chosen on this device → the app', runGate(gate, { store: { sm_browse: '1' } }).to === null);
check('any query → the app (app links, room / match / league join links)', ['?page=feed', '?room=7', '?match=1', '?league=ABC', '?deleted=1'].every((q) => runGate(gate, { search: q }).to === null));
check('no storage at all → the app, never a loop', runGate(gate, { noStorage: true }).to === null);

// ── The mirror gate (welcome.html) ──
const wHead = wel.slice(0, wel.indexOf('</head>'));
check('welcome.html: the mirror check is its first script', wHead.indexOf('<script>') > wHead.indexOf('<meta charset="UTF-8">') && wHead.indexOf('<script>') < wHead.indexOf('<link rel="stylesheet"'));
const mirror = scripts(wel)[0];
check('welcome.html: signed in → the app, keeping the query', runGate(mirror, { store: { [SB]: '{}' }, search: '?x=1' }).to === '/?x=1' && runGate(mirror, { store: { sm_current_user: '{}' } }).to === '/');
check('welcome.html: a stranger stays', runGate(mirror).to === null);
const same = (s) => (/var signedIn=[^;]+;/.exec(s) || [''])[0];
check('both gates use the same "signed in" test', same(gate) !== '' && same(gate) === same(mirror));

// ── The landing page, statically ──
check('header: wordmark, EN / PT, Sign in; no tab bar', /<header class="lh">[\s\S]*?class="lh-word"[\s\S]*?data-lang-switch[\s\S]*?href="\/auth\.html" data-i18n="land\.signin"[\s\S]*?<\/header>/.test(wel) && !/sm-tabs|sm-tab\b/.test(wel));
check('hero: Create account opens sign-up, Sign in, Browse as guest (remembered)',
  /href="\/auth\.html\?tab=signup" data-i18n="land\.create"/.test(wel) && /href="\/\?page=feed" onclick="browseAsGuest\(\)" data-i18n="land\.guest"/.test(wel)
  && /localStorage\.setItem\('sm_browse','1'\)/.test(wel));
check('auth.html opens on Create account for ?tab=signup', /params\.get\('tab'\) === 'signup'/.test(read('public/auth.html')));
check('every data section is hidden in the HTML until it has rows', ['id="mock" hidden', 'id="ex" hidden', 'id="comps-box" hidden', 'id="m-note" hidden'].every((s) => wel.includes(s)));
const bare = wel.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<head>[\s\S]*?<\/head>/, '').replace(/<[^>]*>/g, ' ');
check('no number in the static page (every figure comes from the database)', !/\d/.test(bare), (bare.match(/[^\s]*\d[^\s]*/g) || []).slice(0, 5).join(' '));
check('the four sections, in order, then the footer', ['class="hero"', 'id="game"', 'id="get"', 'class="free"', 'id="install"', 'class="lf"'].map((s) => wel.indexOf(s)).every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])));
check('the free line links Privacy and Terms; the footer About, Privacy, Terms, Contact and the language switch',
  /class="free"[\s\S]*?href="\/privacy\.html"[\s\S]*?href="\/terms\.html"/.test(wel)
  && /<footer class="lf">[\s\S]*?href="\/about\.html"[\s\S]*?href="\/privacy\.html"[\s\S]*?href="\/terms\.html"[\s\S]*?href="mailto:hello@scoutmind\.app"[\s\S]*?data-lang-switch[\s\S]*?<\/footer>/.test(wel));
check('OG points at the current preview image', wel.includes('<meta property="og:image" content="https://scoutmind.app/og.png?v=5">'));
check('reads use the public key only: no session, no SMAuth', !/SMAuth|sm_auth\.js|auth-token'\)\s*\)/.test(scripts(wel).slice(1).join('\n')) && /Authorization:'Bearer '\+SB_ANON/.test(wel));
check('precached, stamped and listed for bump-sw', /'\/welcome\.html'/.test(read('public/sw.js')) && /'welcome\.html'\]/.test(read('scripts/bump-sw.mjs')) && /src="\/home-band\.js\?v=[0-9a-f]+"/.test(wel));

// ── The landing page, running ──
const MAIN = scripts(wel).slice(-1)[0];
function el() { return { innerHTML: '', hidden: true, value: '', options: [], selectedOptions: [], setAttribute() {}, getAttribute() { return null; } }; }
function makeLanding({ ua = 'Mozilla/5.0 (Windows NT 10.0)', touch = 0, standalone = false, db = {}, lang = 'en' } = {}) {
  const els = {}; const get = (id) => (els[id] = els[id] || el());
  const platformCards = [{ p: 'ios', hidden: false }, { p: 'android', hidden: false }].map((c) => ({ getAttribute: () => c.p, set hidden(v) { c.hidden = v; }, get hidden() { return c.hidden; } }));
  const fetchStub = (url, init) => {
    const path = url.replace(/^.*\/rest\/v1\//, '');
    const hit = Object.keys(db).find((k) => path.startsWith(k));
    const body = hit ? db[hit] : [];
    if (body && body.__status) return Promise.resolve({ ok: false, status: body.__status, text: () => Promise.resolve('{"code":"PGRST205"}') });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(typeof body === 'function' ? body(path, init) : body), text: () => Promise.resolve('') });
  };
  const ctx = {
    console: { warn() {}, info() {}, error() {} }, Intl, Date, Promise, Set, JSON, Math, Number, String, Object, encodeURIComponent,
    navigator: { userAgent: ua, maxTouchPoints: touch, languages: [lang], language: lang, standalone },
    localStorage: { getItem: (k) => (k === 'sm_lang' ? lang : null), setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: standalone, addEventListener() {} }),
    document: { documentElement: {}, hidden: false, getElementById: get, querySelectorAll: (s) => (s === '[data-platform]' ? platformCards : []) },
    fetch: fetchStub, setInterval() {}, addEventListener() {}, CustomEvent: function () {}, dispatchEvent: () => true,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['public/i18n.js', 'public/club_names.js', 'public/league-names.js', 'public/home-band.js', 'public/icons.js']) vm.runInContext(read(f), ctx);
  vm.runInContext(MAIN.replace(/\blandStart\(\);\s*$/, ''), ctx);
  return { ctx, els, get, platformCards };
}
const settle = () => new Promise((r) => setTimeout(r, 30));
const LEAGUES = [{ id: 1, slug: 'serie_a', name: 'Serie A', country: 'Brazil', current_season: 2026 }, { id: 2, slug: 'premier_league', name: 'Premier League', country: 'England', current_season: 2026 }];
const TEAMS = [{ id: 7, api_team_id: 127, name: 'Flamengo', logo_url: null, league_id: 1 }, { id: 9, api_team_id: 121, name: 'Palmeiras', logo_url: null, league_id: 1 },
  { id: 40, api_team_id: 42, name: 'Arsenal', logo_url: null, league_id: 2 }, { id: 99, api_team_id: 1, name: 'Old Club', logo_url: null, league_id: 77 }];
const soon = new Date(Date.now() + 2 * 86400000).toISOString();
const BASE = {
  'leagues?': LEAGUES, 'teams?': TEAMS,
  'fixtures?': [{ id: 501, kickoff_utc: soon, status_short: 'NS', elapsed: null, home_goals: null, away_goals: null, home_team_id: 9, away_team_id: 7 }],
};

{
  // Most-followed from 034; the band drawn by HomeBand; competitions with codes.
  const L = makeLanding({ db: Object.assign({}, BASE, { 'club_follow_counts?': [{ club_id: 9, followers: 31 }], 'game_rounds?': [] }) });
  await L.ctx.landStart(); await settle();
  check('competitions: every active league, "Name · CODE", shown', !L.get('comps-box').hidden && /Série A · BRA|Serie A · BRA/.test(L.get('comps').innerHTML) && /Premier League · ENG/.test(L.get('comps').innerHTML));
  check('clubs of inactive leagues are left out', !L.get('m-pick').innerHTML.includes('Old Club') && (L.get('m-pick').innerHTML.match(/<option /g) || []).length === 3);
  check('opens on the most-followed club (034), and says so', L.ctx.LAND.clubId === 9 && !L.get('m-note').hidden && /value="9" selected/.test(L.get('m-pick').innerHTML));
  check('the mock is the real band: club row and slots from home-band.js', !L.get('mock').hidden && /class="hb-name">Palmeiras</.test(L.get('m-club').innerHTML)
    && /class="hb-slot"/.test(L.get('m-slots').innerHTML) && /Flamengo/.test(L.get('m-slots').innerHTML));
  check('mock slots are not buttons (nothing to open for a visitor)', !/role="button"/.test(L.get('m-slots').innerHTML));
  L.ctx.mockPick('40'); await settle();
  check('the picker switches the club, and the "most followed" line goes', L.ctx.LAND.clubId === 40 && /Arsenal/.test(L.get('m-club').innerHTML) && L.get('m-note').hidden);
}
{
  // 034 not run yet → the room overview's identical count (rule 21).
  const L = makeLanding({ db: Object.assign({}, BASE, { 'club_follow_counts?': { __status: 404 }, 'club_chat_overview?': [{ club_id: 40, member_count: 5 }] }) });
  await L.ctx.landStart(); await settle();
  check('before 034: the room overview\'s count picks the club', L.ctx.LAND.clubId === 40 && !L.get('m-note').hidden);
}
{
  // Nobody follows anything: the first club alphabetically, no claim.
  const L = makeLanding({ db: Object.assign({}, BASE, { 'club_follow_counts?': [{ club_id: 9, followers: 0 }] }) });
  await L.ctx.landStart(); await settle();
  check('no followers anywhere: the first club by name, and no "most followed" line', L.ctx.LAND.clubId === 40 && L.get('m-note').hidden);
}
{
  // No clubs and no leagues: every data section stays hidden.
  const L = makeLanding({ db: { 'leagues?': { __status: 500 }, 'teams?': { __status: 500 } } });
  await L.ctx.landStart(); await settle();
  check('no data: no mock, no competitions, no example', L.get('mock').hidden && L.get('comps-box').hidden && L.get('ex').hidden);
}
{
  // The example: the newest FINAL round with a top score; empty newer rounds are skipped.
  const db = Object.assign({}, BASE, {
    'game_rounds?': (p) => (/status=eq\.final/.test(p) ? [
      { id: 60, round_no: 12, round_label: 'Regular Season - 12', status: 'final', leagues: { slug: 'serie_a', name: 'Serie A', country: 'Brazil' } },
      { id: 29, round_no: 11, round_label: 'Regular Season - 11', status: 'final', leagues: { slug: 'serie_a', name: 'Serie A', country: 'Brazil' } }] : []),
    'game_round_rankings?': [{ round_id: 29, user_id: 'u1', name: 'Gavin', total: 41.5, rank: 1 }],
    'game_entries?': [{ id: 900, game_picks: [{ slot: 2, is_captain: true, players: { name: 'Pedro' } }, { slot: 1, is_captain: false, players: { name: 'Arrascaeta' } }] }],
    'game_pick_scores?': [{ slot: 1, total: 10 }, { slot: 2, total: 20 }, { slot: 2, total: 11.5 }],
  });
  const L = makeLanding({ db });
  const x = await L.ctx.loadExample();
  check('the example skips a finished round nobody played', x && x.round.id === 29);
  L.ctx.LAND.example = x; L.ctx.renderExample();
  const h = L.get('ex').innerHTML;
  check('the example: round, the top player\'s name as rankings show it, total, the five in slot order, points per pick summed',
    !L.get('ex').hidden && /Round 11/.test(h) && /class="ex-name">Gavin</.test(h) && />41\.5</.test(h) && h.indexOf('Arrascaeta') < h.indexOf('Pedro') && />31\.5</.test(h) && />10</.test(h));
  check('the captain is marked by a letter and named for screen readers', /<span class="ex-cap" aria-hidden="true">C<\/span><span class="sr">Captain<\/span><span class="ex-p">Pedro/.test(h));
  check('the example query only takes FINAL rounds', /status=eq\.final/.test(MAIN.slice(MAIN.indexOf('async function loadExample'))) && /rank=eq\.1&status=eq\.final/.test(MAIN));
  const none = makeLanding({ db: Object.assign({}, db, { 'game_round_rankings?': [] }) });
  check('no finished round with a top score → no example', (await none.ctx.loadExample()) === null);
}
{
  const ios = makeLanding({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }); ios.ctx.renderInstall();
  const and = makeLanding({ ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }); and.ctx.renderInstall();
  const ipad = makeLanding({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', touch: 5 }); ipad.ctx.renderInstall();
  const desk = makeLanding(); desk.ctx.renderInstall();
  const inst = makeLanding({ standalone: true }); inst.ctx.renderInstall();
  const shown = (L) => L.platformCards.filter((c) => !c.hidden).map((c) => c.getAttribute()).join(',');
  check('install hint: iPhone only on an iPhone, Android only on Android', shown(ios) === 'ios' && shown(and) === 'android');
  check('install hint: an iPad (desktop user agent, touch) gets the iPhone steps', shown(ipad) === 'ios');
  check('install hint: both on a desktop; none once installed', shown(desk) === 'ios,android' && !desk.get('install').hidden && inst.get('install').hidden);
}
{
  // Portuguese, with the device in Portuguese.
  const L = makeLanding({ lang: 'pt-BR', db: Object.assign({}, BASE, { 'club_follow_counts?': [{ club_id: 7, followers: 2 }] }) });
  await L.ctx.landStart(); await settle();
  check('in Portuguese: the band speaks pt-BR', /PRÓXIMO/i.test(L.get('m-slots').innerHTML) || /Próximo/.test(L.get('m-slots').innerHTML));
}

// ── Migration 034 ──
const sql = read('supabase/migrations/034_club_follow_counts.sql');
const body = sql.replace(/--[^\n]*/g, '');
check('034: a view, re-runnable, no table, no delete', /create or replace view public\.club_follow_counts/.test(body) && !/create table|delete from|drop table|truncate/i.test(body));
check('034: counts only: club_id and followers, never who', /select t\.id as club_id,\s*count\(u\.user_id\)::int as followers/.test(body) && !/select[^;]*\bemail\b/i.test(body));
check('034: the same follower rule as club_chat_overview (main club or a follow, once)', /union/.test(body) && /main_club_id/.test(body) && /f\.team_id/.test(body));
check('034: readable by anon and authenticated, select only', /revoke all on public\.club_follow_counts from anon, authenticated;/.test(body) && /grant select on public\.club_follow_counts to anon, authenticated;/.test(body));
check('034: a read-only verification query', /-- VERIFY/.test(sql) && /mismatches/.test(sql));

// ── The band, shared ──
check('index.html draws the band through HomeBand (no copy of its own)', /function hbSlot\(s,act\)\{ return HomeBand\.slotHtml\(s,act,hbCtx\(\)\); \}/.test(idx) && /HomeBand\.clubHtml\(club,HBD\.form,hbCtx\(\)\)/.test(idx));
check('the band\'s styles live in theme.css, not twice', /\.hb-slot\{/.test(read('public/theme.css')) && !/\n\.hb-slot\{/.test(idx) && /\.hb-chip\.W\{/.test(read('public/theme.css')));
check('the landing draws the band with the same functions', /HomeBand\.clubHtml\(/.test(MAIN) && /HomeBand\.slotHtml\(/.test(MAIN) && /HomeBand\.pickRound\(/.test(MAIN));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
