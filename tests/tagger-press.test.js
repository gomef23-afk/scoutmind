// News tagging for the press of the tracked leagues (C1, 21 Nov 2026).
//
//   node tests/tagger-press.test.js
//
// C1 adds Dutch, European Portuguese and Turkish sources, the SOURCE COUNTRY
// (news_sources.country) as a tagging signal, aliases for the clubs of the
// tracked leagues (aliases-tracked.js), names meant only in a club's own
// country's press (PRESS_NAMES: Uruguay's bare "Nacional", Mexico's "Santos",
// "América", "Pumas"...), aliases gated to one press (PRESS_ONLY: River's
// "Millonarios" only in Argentina) and context words (AROUND).
//
// 1. HARD RULE, the measured check: every tag the tagger made on the 505 frozen
//    items BEFORE C1 (tests/fixtures/tags-baseline-pre-c1.json, 367 tags,
//    generated from the pre-C1 tagger) is still made. The only new tags on
//    that corpus are the two reviewed ones (both right).
// 2. The 17 candidate feeds of C2, frozen on 21 Nov 2026 and trimmed to what
//    we store (tests/fixtures/rss-new): how many items each tags, and the
//    false positives found while reviewing every tag, fixed and pinned.
// 3. Probes for each rule. 4. The plumbing: Turkish ı, ISO-8859-1 feeds, a
//    CDATA escaped as text, the news job passing the country.
// No dependencies.

import { readFileSync, readdirSync } from 'node:fs';
import { buildIndex, tagText, clipSummary, normalise, LANGS, PRESS_NAMES, PRESS_ONLY, NEEDS_QUALIFIER } from '../api/_lib/tagger.js';
import { parseFeed, decodeFeed } from '../api/_lib/rss.js';
import { TEAM_ALIASES } from '../api/_lib/aliases.js';
import { TRACKED_ALIASES } from '../api/_lib/aliases-tracked.js';
import { NEWS_SOURCES } from '../api/_lib/sources.js';
import { LEAGUES, LEAGUE_LANG, LEAGUE_COUNTRY } from '../api/_lib/leagues.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const rd = (p) => JSON.parse(read('tests/fixtures/' + p));

const teams = [...rd('teams.json'), ...rd('teams-new-leagues.json').map((t) => ({ ...t, established: false })), ...rd('teams-uruguay.json').map((t) => ({ ...t, established: false }))];
const nameOf = new Map(teams.map((t) => [t.api_team_id, t.name]));
const leagueOf = new Map(teams.map((t) => [t.api_team_id, t.league]));
const B = buildIndex(teams, [...TEAM_ALIASES, ...TRACKED_ALIASES]);

// ── The config ──
check('new source languages: Dutch, European Portuguese, Turkish', ['nl', 'pt-PT', 'tr'].every((l) => LANGS.includes(l)));
eq('press languages of the tracked leagues', ['eredivisie', 'primeira_liga', 'belgian_pro_league', 'super_lig', 'saudi_pro_league', 'mls', 'liga_mx', 'uruguay'].map((s) => LEAGUE_LANG[s]),
  [['nl'], ['pt-PT'], ['fr', 'nl'], ['tr'], ['en'], ['en'], ['es'], ['es']]);
// A cup (C-1) has no press of its own: its clubs are tagged through their league.
check('every league has its press country (ISO alpha-2, as news_sources.country); a cup none', LEAGUES.filter((l) => l.type !== 'cup').every((l) => /^[A-Z]{2}$/.test(LEAGUE_COUNTRY[l.slug] || ''))
  && LEAGUES.filter((l) => l.type === 'cup').every((l) => LEAGUE_COUNTRY[l.slug] === null),
  LEAGUES.filter((l) => l.type !== 'cup' && !LEAGUE_COUNTRY[l.slug]).map((l) => l.slug).join(', '));
eq('…England and Scotland are GB, as the BBC is', [LEAGUE_COUNTRY.premier_league, LEAGUE_COUNTRY.scottish_premiership, LEAGUE_COUNTRY.uruguay, LEAGUE_COUNTRY.liga_mx], ['GB', 'GB', 'UY', 'MX']);
check('every tracked alias points at a club we hold, of a tracked (not original) league', TRACKED_ALIASES.every((a) => leagueOf.has(a.api_team_id)
  && !['serie_a', 'premier_league', 'la_liga', 'bundesliga', 'serie_a_it', 'ligue_1', 'argentina'].includes(leagueOf.get(a.api_team_id))),
  TRACKED_ALIASES.filter((a) => !leagueOf.has(a.api_team_id)).map((a) => a.alias).join(', '));
check('no name is dropped as ambiguous', B.dropped.length === 0, JSON.stringify(B.dropped));
check('every PRESS_NAMES club exists', Object.keys(PRESS_NAMES).every((k) => teams.some((t) => normalise(t.name) === k)), Object.keys(PRESS_NAMES).filter((k) => !teams.some((t) => normalise(t.name) === k)).join(', '));

// ── 1. HARD RULE: nothing tagged before C1 is lost ──
const base = rd('tags-baseline-pre-c1.json').tags;
eq('the baseline: 367 tags on the 505 frozen items', base.length, 367);
const now = new Set();
const gained = [];
const baseSet = new Set(base.map(([s, g, id]) => `${s}|${g}|${id}`));
let items = 0;
for (const s of NEWS_SOURCES) for (const it of parseFeed(read(`tests/fixtures/rss/${s.slug}.xml`))) {
  items++;
  for (const h of tagText(B, it.title, clipSummary(it.summary, 300), s.lang, s.country)) {
    const k = `${s.slug}|${it.guid}|${h.api_team_id}`;
    now.add(k);
    if (!baseSet.has(k)) gained.push(`${s.slug}: ${nameOf.get(h.api_team_id)}`);
  }
}
eq('505 items', items, 505);
const lost = base.filter(([s, g, id]) => !now.has(`${s}|${g}|${id}`)).map(([s, , id]) => `${s}: ${nameOf.get(id)}`);
check('HARD RULE: none of the 367 earlier tags is lost', lost.length === 0, lost.join('; '));
eq('the only new tags are the two reviewed ones ("presidente do Sporting"; "Former Beveren head coach")', gained.sort(), ['bbc_football: SK Beveren', 'ge_futebol: Sporting CP']);

// ── 2. The candidate feeds of C2 ──
const FEEDS = {
  bbc_championship: ['en', 'GB', 29], guardian_championship: ['en', 'GB', 19], bbc_scottish: ['en', 'GB', 4], guardian_scottish: ['en', 'GB', 16], guardian_mls: ['en', 'GB', 8],
  ad_sportwereld: ['nl', 'NL', 10], vi_nieuws: ['nl', 'NL', 19], record_pt: ['pt-PT', 'PT', 13], dh_football: ['fr', 'BE', 51], sporza_voetbal: ['nl', 'BE', 10],
  hurriyet_spor: ['tr', 'TR', 41], sabah_spor: ['tr', 'TR', 5], arab_news: ['en', 'SA', 2], saudi_gazette: ['en', 'SA', 0], infobae_mx: ['es', 'MX', 20],
  tenfield: ['es', 'UY', 22], montevideo_portal: ['es', 'UY', 0],
};
const HEADLINE_ONLY = ['guardian_championship', 'guardian_scottish', 'guardian_mls', 'saudi_gazette', 'infobae_mx', 'tenfield'];
const feed = {};
for (const [slug, [lang, country]] of Object.entries(FEEDS)) {
  const bytes = readFileSync(new URL(`../tests/fixtures/rss-new/${slug}.xml`, import.meta.url));
  feed[slug] = parseFeed(slug === 'record_pt' ? decodeFeed(bytes, 'text/xml; charset=ISO-8859-1') : bytes.toString('utf8'))
    .map((it) => ({ ...it, hits: tagText(B, it.title, clipSummary(it.summary, 300), lang, country) }));
}
eq('17 frozen feeds', readdirSync(new URL('../tests/fixtures/rss-new/', import.meta.url)).filter((f) => f.endsWith('.xml')).length, 17);
eq('items tagged per feed (reviewed tag by tag on 21 Nov 2026)', Object.fromEntries(Object.keys(FEEDS).map((s) => [s, feed[s].filter((i) => i.hits.length).length])),
  Object.fromEntries(Object.entries(FEEDS).map(([s, v]) => [s, v[2]])));
const tagsOf = (slug, pred) => feed[slug].filter(pred).flatMap((i) => i.hits.map((h) => nameOf.get(h.api_team_id)));
check('rule 17: the frozen samples hold no article text (snippets ≤ 300, none for headline-only feeds)', Object.keys(FEEDS).filter((s) => s !== 'record_pt').every((s) =>
  feed[s].every((i) => (i.summary || '').length <= 301) && (!HEADLINE_ONLY.includes(s) || feed[s].every((i) => !i.summary))));
check('Tenfield (UY): "Liverpool" / "Racing" are the Montevideo clubs, never Liverpool FC or Racing Club', !tagsOf('tenfield', () => true).some((n) => n === 'Liverpool' || n === 'Racing Club')
  && tagsOf('tenfield', (i) => /Liverpool/.test(i.title)).includes('Liverpool Montevideo'));
check('DH (BE): "Sporting Charleroi" / "le Sporting" never Sporting CP', !tagsOf('dh_football', (i) => /Charleroi|Sporting/.test(i.title + i.summary)).includes('Sporting CP'));
check('Arab News (SA): "Leon Smith" is not Club León', !tagsOf('arab_news', () => true).includes('Leon'));
check('Infobae (MX): college American football (ONEFA) tags nobody', tagsOf('infobae_mx', (i) => /ONEFA|Borregos/.test(i.title)).length === 0);
check('Infobae (MX): "Leones Negros" is not Athletic Club, "Antonio Carlos Santos" not Santos Laguna, "Armando León" not León',
  !tagsOf('infobae_mx', () => true).some((n) => n === 'Athletic Club') && tagsOf('infobae_mx', (i) => /Carlos Santos|Armando León/.test(i.title)).length === 0);
check('Infobae (MX): "Tigres vs América" is Tigres UANL and Club América', JSON.stringify(tagsOf('infobae_mx', (i) => /^Tigres vs América/.test(i.title)).sort()) === '["Club America","Tigres UANL"]');
check('Record (PT): "FC Porto-Paredes" is FC Porto, read from ISO-8859-1', feed.record_pt.some((i) => i.title === 'FC Porto-Paredes, 1-1 (2.ª parte)' && i.hits.some((h) => nameOf.get(h.api_team_id) === 'FC Porto')));
check('Hürriyet (TR): Turkish clubs from Turkish spelling (Fenerbahçe, Beşiktaş, Gençlerbirliği)', ['Fenerbahçe', 'Beşiktaş', 'Gençlerbirliği S.K.'].every((n) => tagsOf('hurriyet_spor', () => true).includes(n)));

// ── 3. Probes ──
const who = (text, lang, country) => tagText(B, text, '', lang, country).map((h) => nameOf.get(h.api_team_id)).sort();
const P = [
  ['Millonarios: River Plate only in Argentine press', 'Atlético Nacional enfrenta a Millonarios', 'es', 'ES', []],
  ['…and there it is River', 'River, los Millonarios, ganó el superclásico', 'es', 'AR', ['River Plate']],
  ['a bare "Nacional" in Uruguayan press is Club Nacional', 'Nacional venció a Peñarol en el Parque Central', 'es', 'UY', ['Club Nacional', 'Penarol']],
  ['…in Portuguese press CD Nacional', 'O Nacional empatou na Madeira', 'pt-PT', 'PT', ['Nacional']],
  ['…in Spanish press nobody, as before', 'El Nacional gana en Madeira', 'es', 'ES', []],
  ['"Santos" in Mexican press is Santos Laguna', 'Santos goleó a Pachuca en Torreón', 'es', 'MX', ['CF Pachuca', 'Santos Laguna']],
  ['…in Brazilian press Santos FC, as before', 'Santos vence o Palmeiras na Vila', 'pt-BR', 'BR', ['Palmeiras', 'Santos']],
  ['…and never Santos Laguna outside Mexico', 'Santos y Palmeiras en la Libertadores', 'es', 'AR', ['Palmeiras']],
  ['"América" in Mexican press is Club América; "Copa América" is not', 'America vence a Tigres en el Azteca', 'es', 'MX', ['Club America', 'Tigres UANL']],
  ['"Copa América" tags nobody', 'La Copa América 2027 se jugará en México', 'es', 'MX', []],
  ['"Los Pumas" in Argentina are the rugby team', 'Los Pumas vencieron a Inglaterra en Twickenham', 'es', 'AR', []],
  ['Turkish ı: Kasımpaşa', 'Kasımpaşa, Beşiktaş\'ı 2-1 yendi', 'tr', 'TR', ['Beşiktaş', 'Kasımpaşa']],
  ['Dutch acronyms', 'PSV wint van Ajax in Eindhoven', 'nl', 'NL', ['Ajax', 'PSV Eindhoven']],
  ['Dutch "in <town>" is the town', 'Brand in Zwolle verwoest boerderij', 'nl', 'NL', []],
  ['"Porto" in Portuguese press; "em Braga" is the town', 'Porto vence em Braga', 'pt-PT', 'PT', ['FC Porto']],
  ['"Porto Alegre" is never FC Porto', 'Internacional vence em Porto Alegre', 'pt-BR', 'BR', ['Internacional']],
  ['"Sporting Gijón" is not Sporting CP', 'Sporting Gijon sign striker', 'en', 'GB', []],
  ['"Al-Shabab" militants, "NEOM", "Shabab Al Ahli" tag nobody', 'Al-Shabab militants attack base. NEOM unveils project. Shabab Al Ahli beat Al Wahda', 'en', 'SA', []],
  ['Cerro and Cerro Largo, both', 'Cerro Largo y Cerro empataron', 'es', 'UY', ['Cerro', 'Cerro Largo']],
  ['"Estrela da Amadora" yes, "a estrela do jogo" no', 'Estrela da Amadora perde; a estrela do jogo foi Gyökeres', 'pt-PT', 'PT', ['Estrela']],
  ['"le Sporting" in Belgium is Charleroi', 'Le Sporting a battu Anderlecht', 'fr', 'BE', ['Anderlecht', 'Charleroi']],
  ['…in France still Sporting CP', 'Le Sporting Portugal bat Benfica', 'fr', 'FR', ['Benfica', 'Sporting CP']],
  ['"Liverpool" in England is still Liverpool FC', 'Liverpool beat Racing Club in friendly', 'en', 'GB', ['Liverpool', 'Racing Club']],
  ['"León" in Mexican press; "Leon Smith" anywhere is a person', 'León vence a Pachuca', 'es', 'MX', ['CF Pachuca', 'Leon']],
  ['"Leon Smith" tags nobody', 'Leon Smith steps down as Davis Cup captain', 'en', 'SA', []],
  ['"Los Leones" in Spain is Athletic Club', 'Los Leones ganan en San Mamés', 'es', 'ES', ['Athletic Club']],
  ['without a country, as before C1 (Spanish "Nacional" tags nobody)', 'Nacional vence a Peñarol', 'es', null, ['Penarol']],
];
for (const [name, text, lang, c, want] of P) eq(name, who(text, lang, c), want);
check('the gates are data: Millonarios in Argentina only; Al Shabab / NEOM / Estrela need a qualifier', JSON.stringify(PRESS_ONLY.millonarios) === '["AR"]'
  && ['al shabab', 'neom', 'estrela'].every((k) => NEEDS_QUALIFIER.has(k)));

// ── 4. Plumbing ──
eq('Turkish dotless ı folds to i', [normalise('Kasımpaşa'), normalise('Gençlerbirliği'), normalise('İstanbul')], ['kasimpasa', 'genclerbirligi', 'istanbul']);
const rec = readFileSync(new URL('../tests/fixtures/rss-new/record_pt.xml', import.meta.url));
check('an ISO-8859-1 feed reads right by its header or its prolog; UTF-8 stays UTF-8', /2\.ª parte/.test(decodeFeed(rec, 'text/xml; charset=ISO-8859-1'))
  && /2\.ª parte/.test(decodeFeed(rec, 'text/xml')) && !/2\.ª parte/.test(rec.toString('utf8')) && decodeFeed(Buffer.from('<?xml version="1.0"?><a>ç</a>'), '') === '<?xml version="1.0"?><a>ç</a>');
check('a CDATA section escaped as text is unwrapped', parseFeed('<rss><item><title>&lt;![CDATA[ FC Porto-Paredes ]]&gt;</title><link>https://x.pt/a</link></item></rss>')[0].title === 'FC Porto-Paredes');
const news = read('api/_cron/news.js');
check('news.js decodes each feed by its charset and passes the source\'s country to the tagger',
  /return decodeFeed\(new Uint8Array\(await res\.arrayBuffer\(\)\), res\.headers\.get\('content-type'\) \|\| ''\);/.test(news)
  && /tagText\(index, item\.title, snippet, source\.lang, source\.country\)/.test(news) && /select=id,slug,name,url,lang,country,/.test(news));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
