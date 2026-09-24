// News pipeline tests — RSS parsing, club tagging, snippet clamping, and the
// seed data agreeing with the migration.
//
//   node tests/tagger.test.js
//
// No dependencies and no test runner: `node` alone, like everything under
// /api. Exit code is 0 on success, 1 on any failure.
//
// The tagging cases are the ones that were reviewed by hand against 505 real
// headlines. Each rejection case below is a false positive that actually
// happened; if a rule is loosened, one of these starts failing.

import { buildIndex, tagText, clipSummary, normalise, LEAGUE_LANG } from '../api/_lib/tagger.js';
import { parseFeed, parseDate, decodeEntities } from '../api/_lib/rss.js';
import { TEAM_ALIASES } from '../api/_lib/aliases.js';
import { NEWS_SOURCES } from '../api/_lib/sources.js';
import { isFootball } from '../api/_lib/football-filter.js';

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failures.push(detail ? `${name}\n      ${detail}` : name);
  }
}

function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, `got  ${g}\n      want ${w}`);
}

/**
 * `read(relPath)` returns the file's text. Node passes a fs-backed reader;
 * the browser harness passes a fetch-backed one. Same assertions either way.
 */
export async function run(read) {
  const teams = JSON.parse(await read('tests/fixtures/teams.json'));
  const index = buildIndex(teams, TEAM_ALIASES);
  const nameOf = (id) => (teams.find((t) => t.api_team_id === id) || {}).name || `#${id}`;

  /** Tag and render as a sorted "Name(alias)" list, so failures are readable. */
  const tag = (title, lang, summary = '') =>
    tagText(index, title, summary, lang)
      .map((h) => `${nameOf(h.api_team_id)}(${h.via})`)
      .sort();

  // ── seed data ───────────────────────────────────────────────────────────
  eq('seed: 146 teams', teams.length, 146);
  eq('seed: 279 aliases', TEAM_ALIASES.length, 279);
  eq('seed: 10 sources', NEWS_SOURCES.length, 10);
  check(
    'seed: every alias points at a team we hold',
    TEAM_ALIASES.every((a) => teams.some((t) => t.api_team_id === a.api_team_id)),
    TEAM_ALIASES.filter((a) => !teams.some((t) => t.api_team_id === a.api_team_id))
      .map((a) => `${a.alias} -> ${a.api_team_id}`)
      .join(', ')
  );
  check(
    'seed: every league has a source language',
    teams.every((t) => LEAGUE_LANG[t.league]),
    [...new Set(teams.map((t) => t.league).filter((l) => !LEAGUE_LANG[l]))].join(', ')
  );

  // ── index ───────────────────────────────────────────────────────────────
  eq('index: 420 entries', index.entries.length, 420);
  eq('index: nothing ambiguous had to be dropped', index.dropped, []);

  const entry = (key) => index.entries.find((e) => e.key === key);
  // A language-scoped alias beats an unscoped one: "Inter" is Internacional in
  // Brazil and Inter Milan everywhere else.
  eq('index: inter -> Internacional in pt', entry('inter').perLang['pt-BR'], 119);
  eq('index: inter -> Inter in it', entry('inter').perLang.it, 505);
  eq('index: inter -> Inter in en', entry('inter').perLang.en, 505);
  eq('index: fla is pt-only', Object.keys(entry('fla').perLang), ['pt-BR']);
  eq('index: flu is pt-only', Object.keys(entry('flu').perLang), ['pt-BR']);
  check('index: short aliases need short_ok', !entry('psg') || entry('psg').perLang.en === 85);
  check('index: "rojo" was dropped (Marcos Rojo is a player)', !entry('rojo'));
  check('index: "tricolor" is too ambiguous to index', !entry('tricolor'));

  // ── the 17 reviewed probes ──────────────────────────────────────────────
  const probes = [
    // Portuguese context rules: the club is masculine, so a feminine article
    // means the state of Bahia or the noun "vitória".
    ['O Vitória venceu o Bahia', 'pt-BR', ['Bahia(bahia)', 'Vitoria(vitoria)']],
    ['Fortes chuvas na Bahia atingem a regiao', 'pt-BR', []],
    ['Foi a vitória do Grêmio no classico', 'pt-BR', ['Gremio(gremio)']],
    // "dos Santos" is a surname.
    ['Cristiano Ronaldo dos Santos Aveiro marcou', 'pt-BR', []],
    ['Santos acerta venda de lateral', 'pt-BR', ['Santos(santos)']],
    // "Internacional" after a capitalised word is an adjective.
    ['Jogar a Supercopa Internacional ante Rosario', 'pt-BR', []],
    ['Inter vence o Grêmio no Beira-Rio', 'pt-BR', ['Gremio(gremio)', 'Internacional(inter)']],
    ['Inter-Milan derby ends level', 'en', ['Inter(inter milan)']],
    // Fla/Flu are under the length limit but allowed, pt-only and capitalised.
    ['Fla-Flu decide o titulo', 'pt-BR', ['Flamengo(fla)', 'Fluminense(flu)']],
    ['PSG beat Lyon in Paris', 'en', ['Lyon(lyon)', 'Paris Saint Germain(psg)']],
    ['the psg squad trained today', 'en', []],
    // "Inter Miami" is not Internacional.
    ['embarca para sua passagem pelo Inter Miami', 'pt-BR', []],
    ['saida de Eduardo Baptista para o Inter e fala em lei', 'pt-BR', ['Internacional(inter)']],
    // Rule (a): "como" is an ordinary word in pt, a club in it.
    ['Como o Flamengo venceu o jogo', 'pt-BR', ['Flamengo(flamengo)']],
    ['Il Como ha vinto la partita', 'it', ['Como(como)']],
    // Longest match wins its span.
    ['Independiente Rivadavia gano el partido', 'es', ['Independ. Rivadavia(independiente rivadavia)']],
    ['Inter Milan ha vinto', 'it', ['Inter(inter milan)']],
  ];
  for (const [title, lang, want] of probes) {
    eq(`probe [${lang}] ${title}`, tag(title, lang), want.slice().sort());
  }

  // ── more rejections that rules exist for ────────────────────────────────
  eq('nickname stays in its own language', tag('Der Mengao gewann', 'de'), []);
  eq('acronym must be capitalised', tag('le bvb a gagne', 'fr'), []);
  eq('one-word club must be capitalised', tag('a good forest walk', 'en'), []);
  eq('foreign common word never matches', tag('Remo ha vinto', 'it'), []);
  // "Villa" is scoped to en: in Spanish and Italian it is David Villa, or a
  // house. The full club name still matches everywhere, so nothing is lost.
  eq('Villa is David Villa in Spanish', tag('David Villa habla sobre el Barcelona', 'es'), ['Barcelona(barcelona)']);
  eq('Villa is the club in English', tag('Villa beat Arsenal at Villa Park', 'en'), ['Arsenal(arsenal)', 'Aston Villa(villa)']);
  eq('full club name still matches abroad', tag('Aston Villa gano al Arsenal', 'es'), ['Arsenal(arsenal)', 'Aston Villa(aston villa)']);

  // ── headline vs summary ─────────────────────────────────────────────────
  // Drives ranking: a club named in the headline is what the piece is about.
  const hit = (t, s, l, id) =>
    tagText(index, t, s, l).find((h) => h.api_team_id === id);
  eq('in_title: club in the headline', hit('Santos acerta venda', '', 'pt-BR', 128).in_title, true);
  // Lowercase "o" before the club: a capitalised previous word would trip the
  // surname rule and drop the tag entirely.
  eq('in_title: club only in the summary',
    hit('Mercado agitado hoje', 'Negociacao avanca e o Santos confirma a saida', 'pt-BR', 128).in_title, false);
  eq('in_title: headline beats a later mention',
    hit('Santos acerta venda', 'Negociacao avanca e o Santos confirma', 'pt-BR', 128).in_title, true);
  // Accents must not shift the offset that decides this.
  eq('in_title: survives diacritics',
    hit('Grêmio vence o clássico', 'Depois do jogo', 'pt-BR', 130).in_title, true);

  // ── football-only filter ────────────────────────────────────────────────
  // A club tag is proof of football; keywords only judge untagged items.
  eq('football: tagged item always passes', isFootball('NFL and NBA roundup', '', 1), true);
  eq('football: untagged NFL feature blocked',
    isFootball('NFL no Rio: como o Baltimore Ravens nasceu', '', 0), false);
  eq('football: untagged TV listing blocked',
    isFootball('O que assistir nesta quinta-feira no Disney+', '', 0), false);
  eq('football: untagged F1 blocked',
    isFootball('Norris rules McLaren out of Baku pole fight', 'Formula 1', 0), false);
  eq('football: untagged golf blocked',
    isFootball('How Scheffler and Burns edged Lee and Im', 'Ryder Cup golf', 0), false);
  eq('football: accented spelling blocked',
    isFootball('Tênis: Alcaraz avança', '', 0), false);
  // A football fixture listing must survive — "onde assistir" is how Brazilian
  // outlets headline kickoff times.
  eq('football: fixture listing kept',
    isFootball('Brasil x Australia: onde assistir ao vivo, horario e escalacoes', '', 0), true);
  eq('football: ordinary transfer story kept',
    isFootball('Flamengo acerta contratacao de lateral', '', 0), true);
  eq('football: per-source pattern applies',
    isFootball('Weekly podcast roundup', '', 0, ['podcast']), false);
  eq('football: a broken per-source pattern is ignored',
    isFootball('Flamengo vence', '', 0, ['(((']), true);

  // ── snippet clamping ────────────────────────────────────────────────────
  eq('clip: short text untouched', clipSummary('Short one.'), 'Short one.');
  eq('clip: strips html', clipSummary('<p>Hello <b>there</b></p>'), 'Hello there');
  const long = 'A'.repeat(50) + '. ' + 'B'.repeat(400);
  check('clip: never exceeds the cap', clipSummary(long, 300).length <= 301);
  // A sentence boundary is preferred only when it keeps most of the snippet;
  // a full stop at character 8 would throw away almost everything.
  check(
    'clip: prefers a late sentence boundary',
    clipSummary('A'.repeat(200) + '. ' + 'B'.repeat(400), 300).endsWith('.')
  );
  check(
    'clip: ignores an early sentence boundary',
    clipSummary('One. ' + 'C'.repeat(400), 300).endsWith('…')
  );
  check(
    'clip: never cuts mid-word',
    /(\s|\b)…$/.test(clipSummary('word '.repeat(200), 300)) ||
      !clipSummary('word '.repeat(200), 300).endsWith('…'),
    clipSummary('word '.repeat(200), 300).slice(-20)
  );
  eq('normalise strips diacritics', normalise('Grêmio  FC!'), 'gremio fc');

  // ── RSS parsing ─────────────────────────────────────────────────────────
  eq('entities: numeric and named', decodeEntities('a&amp;b &#233; &#x27;'), "a&b é '");
  check('date: rfc822 parses', !!parseDate('Thu, 24 Sep 2026 15:37:12 EST'));
  eq('date: empty is null', parseDate(''), null);
  check('date: future is clamped', new Date(parseDate('Thu, 24 Sep 2099 00:00:00 GMT')) <= new Date(Date.now() + 7 * 3600_000));

  const corpus = [];
  for (const s of NEWS_SOURCES) {
    const xml = await read(`tests/fixtures/rss/${s.slug}.xml`);
    const items = parseFeed(xml);
    check(`parse: ${s.slug} yields items`, items.length > 0, `${items.length} items`);
    check(
      `parse: ${s.slug} every item has a title and an http link`,
      items.every((i) => i.title && /^https?:\/\//.test(i.link))
    );
    for (const it of items) corpus.push({ ...it, src: s.slug, lang: s.lang });
  }
  eq('parse: 505 items across 10 fixtures', corpus.length, 505);
  check(
    'parse: no item keeps a literal "null" summary',
    corpus.every((i) => i.summary !== 'null')
  );
  check(
    'parse: every item has a usable date',
    corpus.every((i) => i.published === null || !Number.isNaN(Date.parse(i.published)))
  );

  // ── corpus regression ───────────────────────────────────────────────────
  // Exact counts over frozen fixtures. A rule change that moves these is not
  // necessarily wrong, but it must be looked at and the numbers updated.
  const perSource = {};
  const sixClub = [];
  const SIX = ['Santos', 'Vitoria', 'Internacional', 'Bahia', 'Remo', 'Como'];
  for (const it of corpus) {
    const snippet = clipSummary(it.summary, 300);
    const hits = tagText(index, it.title, snippet, it.lang);
    perSource[it.src] = (perSource[it.src] || 0) + (hits.length ? 1 : 0);
    for (const h of hits) {
      if (SIX.includes(nameOf(h.api_team_id))) {
        sixClub.push(`${nameOf(h.api_team_id)}<-${h.via}`);
      }
    }
  }
  eq('corpus: tag rate per source', perSource, {
    ge_futebol: 48,
    espn_br: 12,
    bbc_football: 26,
    sky_football: 1,
    ole_ar: 10,
    as_es: 36,
    marca_es: 32,
    gazzetta_it: 61,
    kicker_de: 13,
    rmc_fr: 11,
  });

  // The six clubs whose names are ordinary Portuguese words. Every one of
  // these five matches was verified by hand to be the club, not the word.
  eq('corpus: common-word clubs match exactly 5 times', sixClub.sort(), [
    'Bahia<-bahia',
    'Internacional<-inter',
    'Santos<-santos',
    'Santos<-santos',
    'Vitoria<-vitoria',
  ]);

  // ── seed vs migration ───────────────────────────────────────────────────
  const sql = await read('supabase/migrations/005_news.sql');

  // Compare the WHOLE row, not just id+alias: scoping "Villa" to en or losing
  // the langs on "Inter" is exactly the drift that would mistag articles while
  // every count still looked right.
  const ROW_RE =
    /\(\s*(\d+)\s*,\s*'((?:[^']|'')*)'\s*,\s*'([ona])'\s*,\s*(null(?:::text\[\])?|array\[[^\]]*\])\s*,\s*(true|false)\s*\)/g;
  const sqlLangs = (raw) =>
    raw.startsWith('null')
      ? null
      : [...raw.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const fingerprint = (id, alias, kind, langs, shortOk) =>
    `${id}|${alias}|${kind}|${langs ? langs.join('+') : '*'}|${shortOk}`;

  const sqlRows = new Set(
    [...sql.matchAll(ROW_RE)].map((m) =>
      fingerprint(m[1], m[2].replace(/''/g, "'"), m[3], sqlLangs(m[4]), m[5] === 'true')
    )
  );
  const jsRows = new Set(
    TEAM_ALIASES.map((a) =>
      fingerprint(a.api_team_id, a.alias, a.kind, a.langs, Boolean(a.short_ok))
    )
  );
  const missingInSql = [...jsRows].filter((a) => !sqlRows.has(a));
  const missingInJs = [...sqlRows].filter((a) => !jsRows.has(a));
  eq('migration: seeds all 279 alias rows', sqlRows.size, TEAM_ALIASES.length);
  check('migration: every aliases.js row is in the seed', missingInSql.length === 0, missingInSql.join(' ; '));
  check('migration: every seed row is in aliases.js', missingInJs.length === 0, missingInJs.join(' ; '));

  // The language-scoped and short aliases, spelled out. These are the rows a
  // careless edit breaks silently.
  eq(
    'migration: language-scoped / short aliases',
    TEAM_ALIASES.filter((a) => a.langs || a.short_ok)
      .map((a) => `${a.alias}:${a.langs ? a.langs.join('+') : '*'}:${a.short_ok}`)
      .sort(),
    [
      'BVB:*:true',
      'Fla:pt-BR:true',
      'Flu:pt-BR:true',
      'Inter:it+en+es:false',
      'Inter:pt-BR:false',
      'PSG:*:true',
      'Villa:en:false',
    ]
  );

  // The legacy 003 layout must be dropped, not merged into.
  check('migration: drops the legacy 003 news tables', /drop table if exists public\.news_item_teams/.test(sql) && /drop table if exists public\.news_items/.test(sql));
  check('migration: refuses to drop tables that hold rows', /raise exception/i.test(sql));
  check('migration: guarantees the on-conflict target on team_aliases', /team_aliases_team_alias_uidx/.test(sql));
  for (const s of NEWS_SOURCES) {
    check(`migration: seeds source ${s.slug}`, sql.includes(`'${s.slug}'`));
  }

  return { passed, failures };
}

// ── node entry point ──────────────────────────────────────────────────────
// Only when run directly (`node tests/tagger.test.js`). Guarding on "are we in
// node" instead would auto-run and process.exit() on import, so nothing could
// import run() to drive it with a different reader.
async function isMain() {
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) return false;
  if (!process.argv[1]) return false;
  const { pathToFileURL } = await import('node:url');
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (await isMain()) {
  const { readFileSync } = await import('node:fs');
  const read = async (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const { passed: p, failures: f } = await run(read);
  for (const msg of f) console.log(`  FAIL  ${msg}`);
  console.log(`\n${p} passed, ${f.length} failed`);
  process.exit(f.length ? 1 : 0);
}
