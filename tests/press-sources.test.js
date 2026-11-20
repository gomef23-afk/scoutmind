// The press of the tracked leagues goes live (C2, 21 Nov 2026).
//
//   node tests/press-sources.test.js
//
// Fifteen sources (api/_lib/sources.js PRESS_SOURCES) and the aliases of the
// tracked leagues' clubs (api/_lib/aliases-tracked.js), seeded by migration
// 038. Covered:
// - 038 seeds exactly those rows, whole (slug, name, url, lang, country,
//   headline_only, active, exclude_patterns; team, alias, kind, langs,
//   short_ok), re-runnably, without touching `active` on a re-run;
// - every source: a language the tagger knows and the feed can show, a press
//   country, headline_only where the feed carries the whole article (rule 17);
// - exclude_patterns, run through the real football filter on the frozen
//   samples: they drop exactly the reviewed non-football (other sports, the
//   rest of the paper, betting tips, Tenfield's tagged basketball) and keep
//   the football (AD's FC Utrecht story under /utrecht/, NWSL is football);
// - the Home feed: Dutch and Turkish are feed languages, European Portuguese
//   is read under "Português", search tokenises them as 009 indexed them, the
//   new countries' untagged items fall in Europe; about.html FAQ 6 names the
//   languages with no count, and counts an outlet with several feeds once.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { NEWS_SOURCES, PRESS_SOURCES, ALL_NEWS_SOURCES } from '../api/_lib/sources.js';
import { TRACKED_ALIASES } from '../api/_lib/aliases-tracked.js';
import { parseFeed, decodeFeed } from '../api/_lib/rss.js';
import { isFootball } from '../api/_lib/football-filter.js';
import { buildIndex, tagText, clipSummary, LANGS } from '../api/_lib/tagger.js';
import { TEAM_ALIASES } from '../api/_lib/aliases.js';
import { COUNTRY_ISO } from '../api/_lib/leagues.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── The sources ──
eq('fifteen press sources, 25 in all; Saudi Gazette and Montevideo Portal left out', [PRESS_SOURCES.length, ALL_NEWS_SOURCES.length,
  PRESS_SOURCES.some((s) => /saudi_gazette|montevideo/.test(s.slug))], [15, 25, false]);
check('slugs unique across all sources', new Set(ALL_NEWS_SOURCES.map((s) => s.slug)).size === 25);
check('every source writes in a language the tagger knows', PRESS_SOURCES.every((s) => LANGS.includes(s.lang)), PRESS_SOURCES.filter((s) => !LANGS.includes(s.lang)).map((s) => s.slug).join());
check('every source has a press country the tagger knows', PRESS_SOURCES.every((s) => Object.values(COUNTRY_ISO).includes(s.country)));
eq('headline_only exactly for the feeds that carry the whole article', PRESS_SOURCES.filter((s) => s.headline_only).map((s) => s.slug).sort(),
  ['guardian_championship', 'guardian_mls', 'guardian_scottish', 'infobae_mx', 'tenfield']);
check('an outlet with several feeds keeps one name (BBC Sport, The Guardian)', PRESS_SOURCES.filter((s) => /^bbc_/.test(s.slug)).every((s) => s.name === 'BBC Sport')
  && PRESS_SOURCES.filter((s) => /^guardian_/.test(s.slug)).every((s) => s.name === 'The Guardian') && NEWS_SOURCES.find((s) => s.slug === 'bbc_football').name === 'BBC Sport');
check('every exclude pattern is a valid regex', PRESS_SOURCES.every((s) => s.exclude_patterns.every((p) => { try { new RegExp(p, 'i'); return true; } catch { return false; } })));

// ── Migration 038 = sources.js + aliases-tracked.js ──
const sql = read('supabase/migrations/038_press_sources.sql');
const body = sql.replace(/^\s*--[^\n]*$/gm, '');
check('038: one transaction, upserts only, nothing deleted', /^\s*begin;/m.test(body) && /^\s*commit;/m.test(body) && !/\bdelete\b|\btruncate\b|\bdrop\b/i.test(body)
  && /on conflict \(slug\) do update/.test(body) && /on conflict \(team_id, alias\) do update/.test(body));
check('038: a re-run leaves `active` alone (a source switched off stays off)', !/active\s*=\s*excluded\.active/.test(body));
const unq = (s) => s.replace(/^'|'$/g, '').replace(/''/g, "'");
const arrOf = (s) => (/^'\{\}'/.test(s) ? [] : /^null/.test(s) ? null : [...s.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")));
const srcBlock = (/insert into public\.news_sources[\s\S]*?values\s*([\s\S]*?)\non conflict/.exec(body) || [])[1] || '';
const srcRows = srcBlock.split(/\),\s*\n/).map((r) => r.trim().replace(/^\(|\)$/g, '')).filter(Boolean).map((r) => {
  const m = /^('(?:[^']|'')*'),\s*('(?:[^']|'')*'),\s*('(?:[^']|'')*'),\s*('(?:[^']|'')*'),\s*('(?:[^']|'')*'),\s*(true|false),\s*(true|false),\s*([\s\S]*)$/.exec(r);
  return m ? { slug: unq(m[1]), name: unq(m[2]), url: unq(m[3]), lang: unq(m[4]), country: unq(m[5]), headline_only: m[6] === 'true', active: m[7] === 'true',
    exclude_patterns: arrOf(m[8].replace(/::text\[\]$/, '')) } : { bad: r };
});
eq('038 seeds every press source, whole row, in order', srcRows, PRESS_SOURCES.map((s) => ({ slug: s.slug, name: s.name, url: s.url, lang: s.lang, country: s.country,
  headline_only: s.headline_only, active: s.active, exclude_patterns: s.exclude_patterns })));
const alBlock = (/insert into public\.team_aliases[\s\S]*?from \(values\s*([\s\S]*?)\n\) as v/.exec(body) || [])[1] || '';
const alRows = alBlock.split(/\),\s*\n/).map((r) => r.trim().replace(/^\(|\)$/g, '')).filter(Boolean).map((r) => {
  const m = /^(\d+),\s*('(?:[^']|'')*'),\s*'(\w)',\s*(null(?:::text\[\])?|array\[[^\]]*\](?:::text\[\])?),\s*(true|false)$/.exec(r);
  return m ? { api_team_id: Number(m[1]), alias: unq(m[2]), kind: m[3], langs: arrOf(m[4].replace(/::text\[\]$/, '')), short_ok: m[5] === 'true' } : { bad: r };
});
eq('038 seeds every tracked alias, whole row (kind, langs, short_ok)', alRows, TRACKED_ALIASES.map((a) => ({ api_team_id: a.api_team_id, alias: a.alias, kind: a.kind, langs: a.langs, short_ok: a.short_ok })));
check('038 joins aliases to teams by api_team_id (rows for clubs not held are skipped)', /join public\.teams t on t\.api_team_id = v\.api_team_id/.test(body));

// ── exclude_patterns on the frozen samples ──
const rd = (p) => JSON.parse(read('tests/fixtures/' + p));
const teams = [...rd('teams.json'), ...rd('teams-new-leagues.json').map((t) => ({ ...t, established: false })), ...rd('teams-uruguay.json').map((t) => ({ ...t, established: false }))];
const B = buildIndex(teams, [...TEAM_ALIASES, ...TRACKED_ALIASES]);
const dropped = {}, keptTitles = {};
for (const s of PRESS_SOURCES) {
  const bytes = readFileSync(new URL(`../tests/fixtures/rss-new/${s.slug}.xml`, import.meta.url));
  const items = parseFeed(s.slug === 'record_pt' ? decodeFeed(bytes, 'text/xml; charset=ISO-8859-1') : bytes.toString('utf8'));
  dropped[s.slug] = 0; keptTitles[s.slug] = [];
  for (const it of items) {
    const snip = clipSummary(it.summary, 300);
    const hits = tagText(B, it.title, snip, s.lang, s.country);
    if (isFootball(it.title, snip, hits.length, s.exclude_patterns, it.link)) keptTitles[s.slug].push(it.title); else dropped[s.slug]++;
  }
}
eq('items each feed\'s patterns drop (reviewed one by one on 21 Nov 2026)', dropped, {
  bbc_championship: 5, guardian_championship: 0, bbc_scottish: 0, guardian_scottish: 0, guardian_mls: 0, ad_sportwereld: 12, vi_nieuws: 0, record_pt: 6,
  dh_football: 0, sporza_voetbal: 0, hurriyet_spor: 38, sabah_spor: 4, arab_news: 46, infobae_mx: 22, tenfield: 12 });
check('Tenfield: no "LUB:" basketball item survives, tagged or not; its football does', !keptTitles.tenfield.some((t) => /^LUB/.test(t)) && keptTitles.tenfield.includes('La Anual es de Peñarol'));
check('AD: the FC Utrecht story under /utrecht/ is kept; F1, darts, skating are not', keptTitles.ad_sportwereld.some((t) => /FC Utrecht-huurling/.test(t)) && !keptTitles.ad_sportwereld.some((t) => /Verstappen|Van Gerwen|Daleman/.test(t)));
check('Guardian MLS: the NWSL story stays (women\'s football is football)', keptTitles.guardian_mls.some((t) => /NWSL/.test(t)));
check('Arab News keeps its football and Saudi Pro League sections only', keptTitles.arab_news.length === 4 && keptTitles.arab_news.some((t) => /Al-Nassr/.test(t)));
check('Hürriyet / Sabah: basketball and betting tips go, Galatasaray-Samsunspor stays', !keptTitles.hurriyet_spor.some((t) => /EuroLeague|Misli/.test(t))
  && !keptTitles.sabah_spor.some((t) => /Olivia Miles|Pablo Laso/.test(t)) && keptTitles.sabah_spor.some((t) => /Samsunspor/.test(t)));

// ── The Home feed and about.html ──
const idx = read('public/index.html');
const langsBlock = (/const CONTENT_LANGS=\[[\s\S]*?\];/.exec(idx) || [''])[0];
check('Dutch and Turkish are feed languages, by their own names', /\{code:'nl',\s*short:'NL',label:'Nederlands'\}/.test(langsBlock) && /\{code:'tr',\s*short:'TR',label:'Türkçe'\}/.test(langsBlock));
const ctx = {}; vm.createContext(ctx);
vm.runInContext((/function feedLang\(code\)\{[^\n]*\}/.exec(idx) || [''])[0] + '; this.feedLang=feedLang;', ctx);
eq('European Portuguese is read under Português; the rest as themselves', ['pt-PT', 'pt-BR', 'nl', 'tr', 'en'].map((c) => ctx.feedLang(c)), ['pt-BR', 'pt-BR', 'nl', 'tr', 'en']);
check('every place the feed compares an item\'s language goes through feedLang', !/langs\.indexOf\(n\.lang\)/.test(idx) && !/n\.lang!==currentLangFilter/.test(idx)
  && (idx.match(/feedLang\(n\.lang\)/g) || []).length >= 7, String((idx.match(/feedLang\(n\.lang\)/g) || []).length));
check('every press source\'s language is one the reader can choose', PRESS_SOURCES.every((s) => new RegExp(`\\{code:'${ctx.feedLang(s.lang)}'`).test(langsBlock)));
check('the browser language detects Dutch and Turkish', /if\(raw\.startsWith\('nl'\)\)return 'nl';/.test(idx) && /if\(raw\.startsWith\('tr'\)\)return 'tr';/.test(idx));
check('search uses \'simple\' for Dutch and Turkish, as 009 indexed them', /nl:'simple',tr:'simple'/.test(idx));
check('untagged items from NL, BE, PT, TR fall in Europe', /COUNTRY_REGION=\{[^}]*NL:'europe',BE:'europe',PT:'europe',TR:'europe'\}/.test(idx));
const box = {}; vm.createContext(box);
vm.runInContext(read('public/i18n.js'), Object.assign(box, { window: box, navigator: { languages: ['en'] }, localStorage: { getItem: () => null }, document: { documentElement: {}, querySelectorAll: () => [] } }));
const I = box.I18N;
check('FAQ 6 names Dutch and Turkish and both Portugueses, in both languages, with no count', /Dutch and Turkish/.test(I.en['about.faq.a6']) && /Brazil and Portugal/.test(I.en['about.faq.a6'])
  && /holandês e turco/.test(I['pt-BR']['about.faq.a6']) && /Brasil e de Portugal/.test(I['pt-BR']['about.faq.a6'])
  && !/\b(six|eight|seis|oito)\b/i.test(I.en['about.faq.a6'] + I['pt-BR']['about.faq.a6']));
check('about.html\'s FAQ 6 fallback says the same', /data-i18n="about\.faq\.a6">Portuguese \(from Brazil and Portugal\), English, Spanish, Italian, German, French, Dutch and Turkish\./.test(read('public/about.html')));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
