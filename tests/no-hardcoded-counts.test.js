// No page states a league, club or outlet count as a literal (19 Nov 2026).
//
//   node tests/no-hardcoded-counts.test.js
//
// Uruguay made 18 leagues 19 and 360 clubs 376; every literal count on the
// site had to be found by hand, and "seven leagues", "146 clubs" and "ten
// outlets" had already gone stale once. Counts now come from the database
// (about.html's aboutStart(), welcome.html's landStart()) through {placeholders}.
//
// Scanned: every page and script in public/ (not vendor/), and both
// dictionaries in i18n.js, with comments stripped (code comments are not on
// the site). Fails on a digit or a number word (EN and PT, two to thirty, plus
// "hundred") directly before league / competition / club / outlet / source
// words in either language, or before "in the Scout Game" / "no Scout Game".
// ALLOW lists the phrases that are not a count of what we cover, and why.
// Also checks about.html's wiring: every number there is filled from
// leagues / teams / news_sources, and its plain wording carries no number.
// No dependencies.

import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const WORDS = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|hundred'
  + '|dois|duas|três|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|cem|centenas';
const NOUNS = 'leagues?|competitions?|clubs?|outlets?|sources?|ligas?|competições|competição|clubes?|veículos|fontes|in the Scout Game|no Scout Game|in the game|do jogo';
const COUNT = new RegExp(`(?:\\b(?:\\d+|${WORDS})\\b)(?:\\s+(?:top|football|news|tracked|covered|playable|other|outras|outros|de|of|our))?\\s+(?:${NOUNS})(?![\\p{L}])`, 'giu');

// Phrases that must never be read as a count of leagues, clubs or outlets
// (checked against every match, and pinned below so they stay allowed).
const ALLOW = [
  /\bfive players\b/i,          // the Scout Game's rule (pick five), not coverage
  /\bcinco jogadores\b/i,       // the same in Portuguese
  /\bfive league matches\b/i,   // the form chips: a club's last five matches
  /already run 10 leagues|are in 20 leagues already|já organiza 10 ligas|já está em 20 ligas/i,   // private-league caps (migration 025's guard), not coverage
];

/** Strips HTML comments, block comments and line comments (not "://" in URLs). */
function stripComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

const files = readdirSync(new URL('../public/', import.meta.url)).filter((f) => /\.(html|js)$/.test(f));
const hits = [];
for (const f of files) {
  const text = stripComments(read('public/' + f));
  for (const m of text.matchAll(COUNT)) {
    const around = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ');
    if (ALLOW.some((a) => a.test(around))) continue;
    hits.push(`${f}: "${m[0]}" … ${around}`);
  }
}
check(`no literal league / club / outlet count in public/ (${files.length} files scanned)`, hits.length === 0, hits.join('\n      '));

// The pattern itself catches what went stale before (so a regression is caught).
const STALE = ['Choose from 376 clubs across 19 leagues', 'the seven leagues in the game', 'public RSS feeds of ten outlets', '19 ligas, 376 clubes · 7 no Scout Game',
  'das sete ligas do jogo', 'de dez veículos', 'filtering 146 clubs', 'All + our seven leagues'];
check('the pattern catches every phrase that went stale before', STALE.every((s) => { COUNT.lastIndex = 0; return COUNT.test(s); }),
  STALE.filter((s) => { COUNT.lastIndex = 0; return !COUNT.test(s); }).join(' | '));
check('…and lets "five players" through', ['pick five players and a captain', 'escolha cinco jogadores'].every((s) => { COUNT.lastIndex = 0; return !COUNT.test(s); }));

// ── about.html: the numbers come from the database ──
const about = read('public/about.html');
check('about.html reads leagues (with playable, falling back without it), clubs and outlets with the anon key',
  /aboutGet\('leagues\?select=id,slug,name,country,country_code,playable&active=is\.true/.test(about)
  && /\.catch\(\(\) => aboutGet\('leagues\?select=id,slug,name,country&active=is\.true/.test(about)
  && /aboutGet\('teams\?select=league_id&limit=5000'\)/.test(about) && /aboutGet\('news_sources\?select=name,lang&active=is\.true/.test(about));
check('clubs = teams in an active league only', /const on = new Set\(leagues\.map\(\(l\) => l\.id\)\); ABOUT\.clubs = teams\.filter\(\(x\) => on\.has\(x\.league_id\)\)\.length \|\| null;/.test(about));
check('no hero tile carries a literal number; each is hidden until filled', !/<div class="hero-stat-num">\d/.test(about)
  && ['st-leagues', 'st-game', 'st-clubs', 'st-outlets'].every((id) => new RegExp(`<div id="${id}-box" hidden>`).test(about)) && /<div class="hero-stats" id="hero-stats" hidden>/.test(about));
check('the league chips are drawn from the rows, not written into the page', !/<div class="proof-league">/.test(about) && /<div class="proof-section" id="proof" hidden>/.test(about)
  && /LeagueNames\.label\(l\)/.test(about) && /<script src="\/league-names\.js(\?v=[0-9a-f]+)?"><\/script>/.test(about));
check('the outlet names come from news_sources, not a written list', /<div class="live-s" id="live-outlets" hidden><\/div>/.test(about) && !/Gazzetta, kicker, RMC/.test(about));
check('a filled sentence drops data-i18n, so the language switch does not put the plain wording back; the switch repaints',
  /el\.removeAttribute\('data-i18n'\);/.test(about) && /window\.addEventListener\('sm-lang', aboutPaint\);/.test(about));

// ── The strings ──
const box = {}; vm.createContext(box);
vm.runInContext(read('public/i18n.js'), Object.assign(box, { window: box, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, document: { documentElement: {}, querySelectorAll: () => [] } }));
const I = box.I18N;
const N = { 'about.proofN': ['clubs', 'game', 'leagues'], 'about.s1.dN': ['clubs', 'leagues'], 'about.s2.dN': ['langs', 'n'], 'about.stat.outletsN': ['langs'],
  'about.faq.a1N': ['list', 'n'], 'about.faq.a2N': ['also', 'alsoList', 'clubs', 'game', 'gameList', 'leagues'], 'about.faq.a2AllN': ['clubs', 'gameList', 'leagues'], 'about.faq.a5N': ['game'] };
for (const [k, vars] of Object.entries(N)) {
  for (const lang of ['en', 'pt-BR']) {
    const s = I[lang][k] || '';
    const got = [...new Set((s.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)))].sort();
    check(`${lang} ${k}: placeholders ${vars.join(', ')}, no digit`, JSON.stringify(got) === JSON.stringify(vars) && !/\d/.test(s.replace(/\{\w+\}/g, '').replace(/500/g, '')), `${got} | ${s}`);
  }
}
for (const k of ['about.s1.d', 'about.s2.d', 'about.faq.a1', 'about.faq.a2', 'about.faq.a5']) {
  check(`${k}: the plain wording (before the numbers answer) has no count, in both languages`, ['en', 'pt-BR'].every((l) => I[l][k] && !/\{\w+\}/.test(I[l][k])));
}
check('the old literal keys are gone', ['about.proof', 'about.stat.outlets'].every((k) => !(k in I.en) && !(k in I['pt-BR'])));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
