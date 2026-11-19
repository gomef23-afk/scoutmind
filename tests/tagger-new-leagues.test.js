// News tagging for the clubs of the 11 leagues added in Nov 2026 — the
// measured check of 18 Nov 2026, frozen.
//
//   node tests/tagger-new-leagues.test.js
//
// The 505 frozen RSS items (tests/fixtures/rss) are tagged twice: with the
// 146 original clubs only, and with the 214 new clubs added
// (tests/fixtures/teams-new-leagues.json, from API-Football /teams on
// 18 Nov 2026). Pinned:
// - HARD RULE (decision 5): no original club loses (or gains) a single tag;
// - no club name is dropped as ambiguous any more: a clash with a new club is
//   won by the club of the source's press language, else by the original club
//   ("Athletic Club": Série B in Brazilian copy, Athletic Bilbao elsewhere);
//   a clash among original clubs behaves exactly as before (dropped);
// - the exact 33 tags the new clubs gain, every one checked by hand;
// - the three false tags the first measurement found stay gone: CD Nacional
//   ("Atlético Nacional", "Policía Nacional", "Primera División nacional"),
//   Derby County (a "derby"), Cardiff City (Fury v Joshua "in Cardiff").
// No dependencies.

import { readFileSync } from 'node:fs';
import { buildIndex, tagText, clipSummary, LEAGUE_LANG, NEEDS_QUALIFIER, COMMON } from '../api/_lib/tagger.js';
import { parseFeed } from '../api/_lib/rss.js';
import { TEAM_ALIASES } from '../api/_lib/aliases.js';
import { NEWS_SOURCES } from '../api/_lib/sources.js';
import { LEAGUES, ESTABLISHED_SLUGS, TAGGED_SLUGS } from '../api/_lib/leagues.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const old = JSON.parse(read('tests/fixtures/teams.json'));
const fresh = JSON.parse(read('tests/fixtures/teams-new-leagues.json')).map((t) => ({ ...t, established: false }));
const nameOf = new Map([...old, ...fresh].map((t) => [t.api_team_id, t.name]));
const isNew = new Set(fresh.map((t) => t.api_team_id));
// The eleven of 18 Nov 2026 (Uruguay, 19 Nov, has its own check: tests/tagger-uruguay.test.js).
const NEW_SLUGS = ['championship', 'eredivisie', 'primeira_liga', 'belgian_pro_league', 'scottish_premiership', 'super_lig', 'saudi_pro_league', 'mls', 'liga_mx', 'serie_b', 'serie_c'];

// ── The frozen teams ──
check('214 new clubs, from exactly the 11 tracked leagues', fresh.length === 214
  && JSON.stringify([...new Set(fresh.map((t) => t.league))].sort()) === JSON.stringify(NEW_SLUGS.slice().sort()));
check('no new club is also an original club', fresh.every((t) => !old.some((o) => o.api_team_id === t.api_team_id)));
check('every new league tags news and has its press languages on record', NEW_SLUGS.every((s) => TAGGED_SLUGS.has(s) && Array.isArray(LEAGUE_LANG[s])));
eq('the established leagues are the original seven', [...ESTABLISHED_SLUGS].sort(), ['argentina', 'bundesliga', 'la_liga', 'ligue_1', 'premier_league', 'serie_a', 'serie_a_it']);
check('original clubs come from established leagues only', old.every((t) => ESTABLISHED_SLUGS.has(t.league)));

// ── The corpus, tagged twice ──
const corpus = [];
for (const s of NEWS_SOURCES) for (const it of parseFeed(read(`tests/fixtures/rss/${s.slug}.xml`))) corpus.push({ ...it, src: s.slug, lang: s.lang });
check('505 frozen items', corpus.length === 505);
const A = buildIndex(old, TEAM_ALIASES);
const B = buildIndex([...old, ...fresh], TEAM_ALIASES);
let lost = 0, gainedOld = 0;
const lostRows = [], newTags = [];
for (const it of corpus) {
  const snip = clipSummary(it.summary, 300);
  const a = new Set(tagText(A, it.title, snip, it.lang).map((h) => h.api_team_id));
  const b = tagText(B, it.title, snip, it.lang);
  const bIds = new Set(b.map((h) => h.api_team_id));
  for (const id of a) if (!bIds.has(id)) { lost++; lostRows.push(`${nameOf.get(id)} — ${it.title.slice(0, 60)}`); }
  for (const h of b) if (!a.has(h.api_team_id)) { if (isNew.has(h.api_team_id)) newTags.push(`${it.src}: ${nameOf.get(h.api_team_id)}`); else gainedOld++; }
}
check('HARD RULE: no original club loses a tag', lost === 0, lostRows.join(' | '));
check('…or gains one', gainedOld === 0, String(gainedOld));
check('no name is dropped as ambiguous with the new clubs in', B.dropped.length === 0, JSON.stringify(B.dropped));
eq('the 33 tags the new clubs gain (each checked by hand on 18 Nov 2026)', newTags.sort(), [
  'as_es: Benfica', 'as_es: Cardiff',
  'bbc_football: Burnley', 'bbc_football: Cardiff', 'bbc_football: Celtic', 'bbc_football: Columbus Crew', 'bbc_football: Hibernian', 'bbc_football: Portsmouth',
  'bbc_football: Preston', 'bbc_football: Rangers', 'bbc_football: Rangers', 'bbc_football: Southampton', 'bbc_football: Southampton', 'bbc_football: Southampton',
  'bbc_football: Southampton', 'bbc_football: Wrexham',
  'espn_br: Criciuma', 'espn_br: Cuiaba',
  'ge_futebol: Avai', 'ge_futebol: Brusque', 'ge_futebol: Criciuma', 'ge_futebol: Criciuma', 'ge_futebol: Criciuma', 'ge_futebol: Cuiaba', 'ge_futebol: Feyenoord',
  'ge_futebol: Goias', 'ge_futebol: Inter Miami', 'ge_futebol: Londrina', 'ge_futebol: Novorizontino', 'ge_futebol: Paysandu', 'ge_futebol: Santa Cruz', 'ge_futebol: Vila Nova',
  'sky_football: Preston',
]);

// ── The clash rule, on purpose-built lines ──
const athleticNew = fresh.find((t) => t.name === 'Athletic Club' && t.league === 'serie_b');
const bilbao = old.find((t) => t.name === 'Athletic Club' && t.league === 'la_liga');
check('the frozen data holds the real clash: two clubs called "Athletic Club"', !!athleticNew && !!bilbao);
const ids = (text, lang) => tagText(B, text, '', lang).map((h) => h.api_team_id);
eq('Brazilian copy: "Athletic Club" is the Série B club (its press language)', ids('Athletic Club vence fora de casa', 'pt-BR'), [athleticNew.api_team_id]);
eq('Spanish copy: Athletic Bilbao (its press language)', ids('El Athletic Club gana en San Mamés', 'es'), [bilbao.api_team_id]);
eq('English copy: neither league writes in English → the original club keeps it', ids('Athletic Club win again', 'en'), [bilbao.api_team_id]);
eq('"Athletic Bilbao" still tags Bilbao in Brazilian copy', ids('Athletic Bilbao contrata atacante', 'pt-BR'), [bilbao.api_team_id]);
const twoOld = buildIndex([{ api_team_id: 1, name: 'Sporting Test', league: 'serie_a' }, { api_team_id: 2, name: 'Sporting Test', league: 'la_liga' }]);
check('a clash among original clubs is still dropped (unchanged behaviour)', twoOld.dropped.length > 0 && tagText(twoOld, 'Sporting Test wins', '', 'en').length === 0);

// ── The three false tags of the first measurement ──
const nacional = fresh.find((t) => t.name === 'Nacional');
check('CD Nacional does not tag "Atlético Nacional" or "Primera División nacional"', !!nacional
  && !ids('Atlético Nacional enfrenta a Chapecoense', 'pt-BR').includes(nacional.api_team_id)
  && !ids('cuándo regresa la Liga Nacional', 'es').includes(nacional.api_team_id) && COMMON.nacional.includes('pt-BR'));
check('a bare "Derby" never tags Derby County', NEEDS_QUALIFIER.has('derby') && !ids('Debüt im Derby', 'de').some((id) => nameOf.get(id) === 'Derby')
  && !ids('Derby day at Anfield', 'en').some((id) => nameOf.get(id) === 'Derby'));
const cardiff = fresh.find((t) => t.name === 'Cardiff');
check('"in Cardiff" is the city, "Cardiff\'s Bielik" is the club', !ids('Fury will fight Joshua in Cardiff', 'en').includes(cardiff.api_team_id)
  && ids("FA charges Cardiff's Bielik", 'en').includes(cardiff.api_team_id));
check('the "in <town>" rule leaves the original clubs alone', ids('A night out in Brighton', 'en').some((id) => nameOf.get(id) === 'Brighton') || !old.some((t) => t.name === 'Brighton'));

// ── The job ──
const news = read('api/cron/news.js');
check('news.js marks each club established or new (ESTABLISHED_SLUGS)', /established: ESTABLISHED_SLUGS\.has\(leagueSlug\.get\(t\.league_id\)\)/.test(news));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
