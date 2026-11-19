// Uruguay's Primera División (19 Nov 2026): news tagging and its five tables.
//
//   node tests/tagger-uruguay.test.js
//
// 1. Tagging, the measured check: the 505 frozen RSS items tagged with the
//    360 clubs we held (146 original + the 214 of 18 Nov) and again with the
//    16 Uruguayan clubs added (tests/fixtures/teams-uruguay.json, API-Football
//    /teams?league=268&season=2026). No existing club loses or gains a tag;
//    no name is dropped. We hold no Uruguayan source, so ambiguous names match
//    only in full (QUALIFIED_NAMES): Club Nacional never takes a bare
//    "Nacional" (CD Nacional's) nor "Atlético Nacional"; Wanderers never
//    "Bolton Wanderers"; Cerro never "Cerro Porteño"; Juventud and Progreso
//    are ordinary words.
// 2. The table: API-Football sends five tables named "Primera: …" (Tabla
//    Anual, Promedios, Torneo Intermedio, Apertura, Clausura). Each is its own
//    chip, read by its own name; the list opens on the tournament in play
//    (Clausura, listed last), never on an aggregate. Argentina, Série C and
//    MLS open where they did before.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildIndex, tagText, clipSummary, QUALIFIED_NAMES } from '../api/_lib/tagger.js';
import { parseFeed } from '../api/_lib/rss.js';
import { TEAM_ALIASES } from '../api/_lib/aliases.js';
import { NEWS_SOURCES } from '../api/_lib/sources.js';
import { BY_SLUG, LEAGUE_LANG } from '../api/_lib/leagues.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const rd = (p) => JSON.parse(read('tests/fixtures/' + p));

// ── The league ──
const U = BY_SLUG.uruguay;
check('Uruguay: API-Football 268, season 2026, tracked not playable, Spanish press', U && U.apiId === 268 && U.season === 2026 && U.active && !U.playable
  && JSON.stringify(LEAGUE_LANG.uruguay) === '["es"]' && U.name === 'Primera División' && U.code === 'URU');
const uru = rd('teams-uruguay.json').map((t) => ({ ...t, established: false }));
check('16 frozen Uruguayan clubs, all in the uruguay league', uru.length === 16 && uru.every((t) => t.league === 'uruguay'));

// ── 1. The measured check ──
const old = rd('teams.json'), eleven = rd('teams-new-leagues.json').map((t) => ({ ...t, established: false }));
const nameOf = new Map([...old, ...eleven, ...uru].map((t) => [t.api_team_id, t.name]));
const isUru = new Set(uru.map((t) => t.api_team_id));
const corpus = [];
for (const s of NEWS_SOURCES) for (const it of parseFeed(read(`tests/fixtures/rss/${s.slug}.xml`))) corpus.push({ ...it, src: s.slug, lang: s.lang });
const A = buildIndex([...old, ...eleven], TEAM_ALIASES);
const B = buildIndex([...old, ...eleven, ...uru], TEAM_ALIASES);
let lost = 0, gained = 0, uruTags = 0;
for (const it of corpus) {
  const snip = clipSummary(it.summary, 300);
  const a = new Set(tagText(A, it.title, snip, it.lang).map((h) => h.api_team_id));
  const b = tagText(B, it.title, snip, it.lang);
  for (const id of a) if (!b.some((h) => h.api_team_id === id)) lost++;
  for (const h of b) if (!a.has(h.api_team_id)) { if (isUru.has(h.api_team_id)) uruTags++; else gained++; }
}
check('HARD RULE: none of the 360 clubs we held loses a tag', lost === 0, String(lost));
check('…or gains one', gained === 0, String(gained));
check('no name dropped as ambiguous', B.dropped.length === 0, JSON.stringify(B.dropped));
eq('Uruguayan clubs on the frozen samples (no Uruguayan coverage that week)', uruTags, 0);

const who = (text, lang) => tagText(B, text, '', lang).map((h) => nameOf.get(h.api_team_id)).sort();
eq('"Nacional de Montevideo" is Club Nacional (and Peñarol is Peñarol)', who('Nacional de Montevideo vence a Peñarol en el clásico', 'es'), ['Club Nacional', 'Penarol']);
eq('"Club Nacional de Football" is Club Nacional', who('Club Nacional de Football presenta a su DT', 'es'), ['Club Nacional']);
check('"Atlético Nacional" is never Club Nacional', !who('Atlético Nacional enfrenta a Millonarios', 'es').includes('Club Nacional'));
eq('a bare "Nacional" in Spanish tags nobody (a common word; never Club Nacional)', who('El Nacional gana en Madeira', 'es'), []);
eq('English copy: a bare "Nacional" stays CD Nacional\'s, as before', who('Nacional beat Benfica in Madeira', 'en'), ['Benfica', 'Nacional']);
check('Club Nacional can never take a bare "Nacional"', QUALIFIED_NAMES['club nacional'].every((f) => f.split(' ').length > 1));
check('"Bolton Wanderers" is never Montevideo Wanderers', !who('Wolverhampton Wanderers and Bolton Wanderers', 'en').includes('Wanderers'));
eq('"Montevideo Wanderers" is', who('Montevideo Wanderers suma tres puntos', 'es'), ['Wanderers']);
eq('"Cerro Porteño" and "la Juventud" tag nobody', [who('Cerro Porteño goleó', 'es'), who('La Juventud uruguaya', 'es')], [[], []]);
eq('"Liverpool Montevideo" is the Uruguayan club; "Liverpool" alone is still Liverpool FC',
  [who('Liverpool Montevideo lidera el Clausura', 'es'), who('Liverpool win at Anfield', 'en')], [['Liverpool Montevideo'], ['Liverpool']]);
check('the qualified names touch no club we already held', [...old, ...eleven].every((t) => !Object.keys(QUALIFIED_NAMES).includes(t.name.toLowerCase())));

// ── 2. The five tables ──
const idx = read('public/index.html');
const fn = (name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idx); if (!m) throw new Error('no ' + name); return m[0]; };
const dict = { 'tb.annual': 'Annual table', 'tb.averages': 'Relegation averages', 'tb.which': 'Which table', 'tb.club': 'Club', 'tb.groupN': 'Group {n}', 'tb.updated': '', 'tb.final': '{season} · final', 'tb.none': 'none' };
const ctx = { MX: { league: null, tablePick: new Map(), tableChips: [] }, t: (k, v) => String(dict[k] || k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)),
  sanitize: (s) => String(s == null ? '' : s), smLocale: () => 'en', myClubIds: () => [], clubCrestById: () => '', clubLabel: (id) => 'Club ' + id, Date, Math, Map, Set, String, Number };
vm.createContext(ctx);
vm.runInContext(['mxPhaseOf', 'mxTableChips', 'mxTableName', 'mxIsAggregate', 'mxTableChipLabel', 'mxDefaultPlainChip', 'mxSeasonOver', 'mxSeasonLabel', 'mxGroupHtml', 'mxTableHtml'].map(fn).join('\n'), ctx);
const data = (labels) => ({ groups: labels.map((l, i) => ({ label: l, order: i, rows: [{ team_id: i + 1, rank: 1, points: 10, played: 5 }] })), fallback: false, updated: '' });
function open(league, labels) {
  ctx.MX.league = league; ctx.MX.tablePick = new Map();
  const html = ctx.mxTableHtml(data(labels));
  const chips = [...html.matchAll(/<button class="filter-btn( active)?"[^>]*>([^<]+)<\/button>/g)].map((m) => (m[1] ? '*' : '') + m[2]);
  return chips;
}
eq('Uruguay: five chips by their own names, opening on the Clausura', open({ id: 20, name: 'Primera División', current_season: 2026, season_end: '2026-11-23' },
  ['Primera: Tabla Anual', 'Primera: Promedios', 'Primera: Torneo Intermedio', 'Primera: Apertura', 'Primera: Clausura']),
  ['Annual table', 'Relegation averages', 'Torneo Intermedio', 'Apertura', '*Clausura']);
eq('Argentina: unchanged (phase chips + the annual table, opening on the latest phase)', open({ id: 7, name: 'Liga Profesional', current_season: 2026 },
  ['Apertura - Group A', 'Apertura - Group B', 'Clausura - Group A', 'Clausura - Group B', 'Liga Profesional Argentina']), ['Apertura', '*Clausura', 'Annual table']);
eq('Série C: unchanged (First stage, then the Second stage groups, opening on the Second stage)', open({ id: 18, name: 'Série C', current_season: 2026 },
  ['First stage', 'Second stage - Group A', 'Second stage - Group B']), ['First stage', '*Second stage']);
eq('MLS: unchanged (two conferences, opening on the first)', open({ id: 14, name: 'MLS', current_season: 2026 }, ['Western Conference', 'Eastern Conference']),
  ['*Western Conference', 'Eastern Conference']);
const box = {}; vm.createContext(box);
vm.runInContext(read('public/i18n.js'), Object.assign(box, { window: box, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, document: { documentElement: {}, querySelectorAll: () => [] } }));
check('"Relegation averages" in both languages', box.I18N && box.I18N.en['tb.averages'] && box.I18N['pt-BR']['tb.averages'] && box.I18N.en['tb.averages'] !== box.I18N['pt-BR']['tb.averages']);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
