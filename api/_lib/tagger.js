// Club tagging for news headlines.
//
// Precision matters more than recall here: an untagged article is invisible,
// an article tagged to the wrong club is wrong on somebody's club page. Every
// rule below exists because it fixed a real false positive on a real feed, and
// tests/tagger.test.js pins each one.
//
// Pure and dependency-free on purpose — the cron job feeds it rows from
// Supabase, the tests feed it rows from fixtures, and both must agree.

import { LEAGUE_LANG as CONFIG_LEAGUE_LANG, LEAGUE_COUNTRY } from './leagues.js';

// C1 (21 Nov 2026): Dutch, European Portuguese and Turkish sources. pt-PT is its
// own language (a Brazilian nickname or scoped alias never applies to Record),
// but shares Portuguese's common words and grammar rules (COMMON, PT_CONTEXT).
export const LANGS = ['pt-BR', 'en', 'es', 'it', 'de', 'fr', 'nl', 'pt-PT', 'tr'];
const PORTUGUESE = new Set(['pt-BR', 'pt-PT']);

/**
 * Language(s) the domestic press of each league writes in: from the one
 * league list (api/_lib/leagues.js, `langs` of the leagues that tag news).
 */
export const LEAGUE_LANG = CONFIG_LEAGUE_LANG;

// Club names and nicknames that are also ordinary words or place names in the
// listed languages. Rule (a): a common word that is FOREIGN to the source's
// language never matches — an Italian paper writing "como" means "as", a
// Brazilian one writing "Como" at the start of a sentence means "How".
// The club still matches in its own language, where context rules take over.
export const COMMON = {
  como: ['pt-BR', 'es'],
  vitoria: ['pt-BR'],
  remo: ['pt-BR', 'es', 'it'],
  internacional: ['pt-BR', 'es'],
  bahia: ['pt-BR', 'es'],
  santos: ['pt-BR', 'es'],
  peixe: ['pt-BR'],
  galo: ['pt-BR'],
  raposa: ['pt-BR'],
  coxa: ['pt-BR'],
  imortal: ['pt-BR'],
  colorado: ['pt-BR', 'es', 'en'],
  soberano: ['pt-BR'],
  porco: ['pt-BR'],
  globo: ['pt-BR', 'es'],
  gloria: ['es', 'pt-BR'],
  instituto: ['es'],
  academia: ['es'],
  talleres: ['es'],
  barracas: ['es'],
  leones: ['es'],
  boca: ['es'],
  tigre: ['es', 'pt-BR'],
  lobo: ['es'],
  river: ['en'],
  millonarios: ['es'],
  decano: ['es'],
  pirata: ['es'],
  granate: ['es'],
  halcon: ['es'],
  bicho: ['es'],
  tiburon: ['es'],
  forest: ['en'],
  villa: ['en', 'es'],
  hull: ['en'],
  palace: ['en'],
  eagles: ['en'],
  bees: ['en'],
  reds: ['en'],
  whites: ['en'],
  tigers: ['en'],
  cherries: ['en'],
  citizens: ['en'],
  nice: ['en', 'fr'],
  lens: ['en', 'fr'],
  monaco: ['en', 'fr', 'it'],
  milan: ['en'],
  toro: ['it', 'es'],
  viola: ['it', 'en'],
  granata: ['it'],
  bayern: ['de'],
  hamburg: ['de', 'en'],
  frankfurt: ['de', 'en'],
  bremen: ['de'],
  brest: ['fr'],
  union: ['de', 'es', 'en'],
  central: ['es', 'en'],
  parma: ['it'],
  genoa: ['it'],
  // 18 Nov 2026, the measured check for the new leagues: CD Nacional (Portugal)
  // matched "Atlético Nacional", "Policía Nacional" and "Primera División
  // nacional" on the frozen samples.
  nacional: ['pt-BR', 'es'],
};

/**
 * Names that are an ordinary noun on their own and only mean the club with a
 * qualifier ("Derby County", never a bare "derby": the measured check of
 * 18 Nov 2026 found "the derby" in English and "Debüt im Derby" in German).
 * Such a name never enters the index by itself; an alias with more words does.
 */
export const NEEDS_QUALIFIER = new Set([
  'derby',
  // C1: "Al-Shabab" is also the militant group (Arab News), "NEOM" the city
  // project, "estrela" a star. Only "Al Shabab FC", "NEOM SC", "Estrela da
  // Amadora" match (aliases-tracked.js).
  'al shabab', 'neom', 'estrela',
]);

/**
 * Names that mean the club only in its own country's press (C1, 21 Nov 2026).
 * Keyed by the club's normalised name; the country is its league's
 * (LEAGUE_COUNTRY). From any other source they tag nobody (or keep meaning
 * what they meant before): a bare "Nacional" in a Uruguayan source is Club
 * Nacional, in a Portuguese one CD Nacional; "Santos" in a Mexican source is
 * Santos Laguna, everywhere else Santos FC; "América" and "Pumas" only in
 * Mexico (a continent; Argentina's rugby team). Uruguay's bare names were
 * QUALIFIED_NAMES only, since we held no Uruguayan source.
 */
export const PRESS_NAMES = {
  'club nacional': ['Nacional'],
  wanderers: ['Wanderers'],
  cerro: ['Cerro'],
  juventud: ['Juventud'],
  progreso: ['Progreso'],
  'santos laguna': ['Santos'],
  'club america': ['América'],
  'u n a m pumas': ['Pumas'],
  // The measured check of C1 (Tenfield, DH, Infobae, Arab News):
  'liverpool montevideo': ['Liverpool'],   // "Danubio-Liverpool" in Uruguay is not Liverpool FC
  'racing montevideo': ['Racing'],         // nor "Racing" Racing Club
  charleroi: ['Sporting'],                 // "le Sporting" in Belgium is Charleroi, not Sporting CP
  leon: ['León'],                          // a first name elsewhere ("Leon Smith", Arab News)
};

/**
 * Aliases that mean the club only in the listed countries' press, whoever's
 * alias they are. River Plate's nickname "Millonarios" is also a Colombian
 * club's name: Spanish papers covering Colombian football ("Atlético Nacional
 * enfrenta a Millonarios") tagged River Plate.
 */
export const PRESS_ONLY = {
  millonarios: ['AR'],
  // Athletic Club's nickname; in Mexico "Leones Negros" is another club (Infobae).
  leones: ['ES'],
};

/**
 * Words around a name that make it something else, in every language (C1).
 * Tokens are compared folded and lowercased.
 */
export const AROUND = {
  america: { blockPrev: ['copa', 'sud', 'norte', 'centro', 'latino'], blockNext: ['latina', 'central', 'do', 'del', 'mineiro', 'mg', 'de'] },
  sporting: { blockNext: ['gijon', 'kansas', 'kc', 'cristal', 'san', 'clube', 'braga', 'charleroi'] },
  'al ahli': { blockPrev: ['shabab'] },
  'al ittihad': { blockNext: ['kalba', 'alexandria'] },
  // Surnames: "Antonio Carlos Santos", "Armando León" (Infobae).
  santos: { blockPrevCapitalised: true },
  leon: { blockPrevCapitalised: true },
  // College American football in Mexico (ONEFA, Infobae): "Auténticos Tigres",
  // "Pumas CU", "Borregos del TEC de Monterrey / de Puebla".
  tigres: { blockPrev: ['autenticos'] },
  pumas: { blockNext: ['cu'] },
  monterrey: { blockPrev: ['de', 'tec'] },
  puebla: { blockPrev: ['de', 'tec'] },
  leones: { blockNext: ['negros'] },
};

/**
 * "in <town>" means the town (C1 extends the English rule of 18 Nov to the new
 * languages): a one-word name of a club added after the original seven, right
 * after one of these words, is a place, not the club.
 */
const TOWN_PREV = { en: ['in'], nl: ['in', 'uit'], 'pt-PT': ['em'] };

/**
 * Club names that are too ambiguous on their own, matched only through the
 * unambiguous forms listed (Uruguay's Primera División, 19 Nov 2026). Since
 * C1 the bare forms also count in the club's own country's press
 * (PRESS_NAMES, from the source's country). Elsewhere Club Nacional never matches a bare "Nacional"
 * (CD Nacional's, and "Atlético Nacional" is a third club); Wanderers never
 * "Bolton Wanderers"; Cerro never "Cerro Porteño" or a hill; Juventud and
 * Progreso are ordinary Spanish words.
 */
export const QUALIFIED_NAMES = {
  'club nacional': ['Club Nacional de Football', 'Nacional de Montevideo'],
  wanderers: ['Montevideo Wanderers'],
  cerro: ['Club Atlético Cerro', 'Cerro de Montevideo'],
  juventud: ['Juventud de Las Piedras'],
  progreso: ['Club Atlético Progreso'],
  // C1: "Leon" is a first name; the bare "León" counts in Mexican press only (PRESS_NAMES).
  leon: ['Club León', 'León FC'],
};

// Portuguese context rules. Brazilian press writes the bare club name
// constantly ("Santos acerta venda"), so we cannot require a qualifier — we
// reject the specific shapes that mean something else instead.
export const PT_CONTEXT = {
  // The clubs are masculine (o/do/no Bahia). A feminine article means the
  // state of Bahia or the noun "vitória".
  bahia: { blockPrev: ['a', 'as', 'da', 'das', 'na', 'nas', 'pela', 'pelas', 'numa'] },
  vitoria: { blockPrev: ['a', 'as', 'da', 'das', 'na', 'nas', 'pela', 'pelas', 'numa'] },
  // "Cristiano Ronaldo dos Santos" — a surname, not the club.
  santos: { blockPrevCapitalised: true, blockPrev: ['dos', 'de', 'da'] },
  // "Supercopa Internacional" — an adjective, not the club.
  internacional: { blockPrevCapitalised: true },
  // "Inter Miami", "Inter Milan" — a different club entirely.
  inter: { blockNextCapitalised: true },
};

/** Shortest alias we will match unless the seed marks it short_ok. */
const MIN_ALIAS_LEN = 4;

/**
 * Lowercase, strip diacritics, collapse punctuation to single spaces. Turkish
 * dotless ı has no decomposition, so it is folded by hand ("Kasımpaşa" →
 * "kasimpasa"), one character for one so offsets stay put.
 */
export function normalise(s) {
  return (s || '')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Diacritics stripped but case and offsets preserved, for the case rules. */
function foldKeepCase(s) {
  return (s || '').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Build the match index.
 *
 * `teams`   : [{ api_team_id, name, league }]     — team names are implicit aliases
 * `aliases` : [{ api_team_id, alias, kind, langs, short_ok }]
 *             kind: 'o' official | 'n' nickname | 'a' acronym
 *             langs: null = every language, or ['pt-BR', ...]
 *
 * A language-scoped alias OVERRIDES an unscoped one for that language: this is
 * what lets "Inter" mean Internacional in Portuguese and Inter Milan elsewhere.
 * If two different clubs still claim a key in the same language, that language
 * is dropped for that key — an ambiguous tag is worse than none.
 *
 * Except when a club from a league added later (`established: false`, the 11
 * leagues of 18 Nov 2026) is one of the claimants: an existing club must never
 * lose a tag because a newcomer shares its name. Then the club whose league's
 * press writes in this language wins ("Athletic Club" in Brazilian copy is the
 * Série B club; in Spanish, Athletic Bilbao); failing that, the existing club;
 * only if neither decides is the key dropped. A team without the field is
 * established, so a clash among the original clubs behaves exactly as before.
 */
export function buildIndex(teams, aliases = []) {
  const leagueOf = new Map();
  const established = new Map();
  for (const t of teams) {
    leagueOf.set(t.api_team_id, t.league);
    established.set(t.api_team_id, t.established !== false);
  }
  const resolve = (lang, ids) => {
    if (!ids.some((id) => !established.get(id))) return null;           // only original clubs: unchanged
    const home = ids.filter((id) => (LEAGUE_LANG[leagueOf.get(id)] || []).includes(lang));
    if (home.length === 1) return home[0];
    const old = ids.filter((id) => established.get(id));
    return old.length === 1 ? old[0] : null;
  };

  // A club's own name is an implicit alias, unless it is in QUALIFIED_NAMES:
  // then only its unambiguous full forms are.
  const nameRows = (t) => (QUALIFIED_NAMES[normalise(t.name)] || [t.name]).map((alias) => ({
    api_team_id: t.api_team_id,
    alias,
    kind: 'o',
    langs: null,
    short_ok: false,
  }));
  // Names meant only in the club's own country's press (PRESS_NAMES).
  const pressRows = (t) => (PRESS_NAMES[normalise(t.name)] || []).map((alias) => ({
    api_team_id: t.api_team_id,
    alias,
    kind: 'o',
    countries: [LEAGUE_COUNTRY[t.league]].filter(Boolean),
  }));
  const rows = [
    ...teams.flatMap(nameRows),
    ...teams.flatMap(pressRows),
    ...aliases,
  ];

  // key -> { unscoped: Map<teamId,kind>, scoped: Map<lang, Map<teamId,kind>>,
  //          byCountry: Map<country, Set<teamId>> }
  const staging = new Map();
  for (const r of rows) {
    const key = normalise(r.alias);
    if (!key) continue;
    if (key.replace(/ /g, '').length < MIN_ALIAS_LEN && !r.short_ok) continue;
    if (NEEDS_QUALIFIER.has(key)) continue;   // "derby" alone is a noun, not Derby County
    if (!leagueOf.has(r.api_team_id)) continue; // alias for a team we do not hold

    let slot = staging.get(key);
    if (!slot) staging.set(key, (slot = { unscoped: new Map(), scoped: new Map(), byCountry: new Map() }));

    if (r.countries) {
      for (const c of r.countries) {
        if (!slot.byCountry.has(c)) slot.byCountry.set(c, new Set());
        slot.byCountry.get(c).add(r.api_team_id);
      }
    } else if (r.langs && r.langs.length) {
      for (const lang of r.langs) {
        let m = slot.scoped.get(lang);
        if (!m) slot.scoped.set(lang, (m = new Map()));
        m.set(r.api_team_id, r.kind || 'o');
      }
    } else {
      slot.unscoped.set(r.api_team_id, r.kind || 'o');
    }
  }

  const entries = [];
  const dropped = [];
  for (const [key, slot] of staging) {
    const perLang = {};
    const kindByLang = {};
    // A clash, kept whole: the source's country may decide it at tag time
    // (tagText). lang -> [[teamId, kind], ...]
    const claimsByLang = {};
    for (const lang of LANGS) {
      const claims = slot.scoped.get(lang) || slot.unscoped;
      if (claims.size === 0) continue;
      let id, kind;
      if (claims.size > 1) {
        claimsByLang[lang] = [...claims.entries()];
        const pick = resolve(lang, [...claims.keys()]);
        if (pick == null) {
          dropped.push({ key, lang, teams: [...claims.keys()] });
          continue;
        }
        [id, kind] = [pick, claims.get(pick)];
      } else {
        [id, kind] = [...claims.entries()][0];
      }
      perLang[lang] = id;
      kindByLang[lang] = kind;
    }
    // country -> teamId, for PRESS_NAMES (one club per country, else none)
    const perCountry = {};
    for (const [c, ids] of slot.byCountry) if (ids.size === 1) perCountry[c] = [...ids][0];
    if (Object.keys(perLang).length === 0 && Object.keys(claimsByLang).length === 0 && Object.keys(perCountry).length === 0) continue;
    entries.push({
      key,
      perLang,
      kindByLang,
      claimsByLang,
      perCountry,
      single: !key.includes(' '),
      words: key.split(' '),
    });
  }

  // Longest first: the span resolver relies on this order to let "inter milan"
  // beat "milan", and "independiente rivadavia" beat "independiente".
  entries.sort((a, b) => b.key.length - a.key.length || a.key.localeCompare(b.key));
  return { entries, leagueOf, dropped, established };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Token immediately before `at`, skipping quotes/brackets/dashes. */
function prevToken(text, at) {
  let i = at - 1;
  while (i >= 0 && /[\s–—"'(\[]/.test(text[i])) i--;
  if (i < 0) return null;
  const end = i + 1;
  while (i >= 0 && /[A-Za-z0-9]/.test(text[i])) i--;
  return text.slice(i + 1, end) || null;
}

/** Token immediately after the match that starts at `at`. */
function nextToken(text, at) {
  let i = at;
  while (i < text.length && /[A-Za-z0-9]/.test(text[i])) i++;
  while (i < text.length && /[\s–—"'\-)\]]/.test(text[i])) i++;
  const start = i;
  while (i < text.length && /[A-Za-z0-9]/.test(text[i])) i++;
  return text.slice(start, i) || null;
}

/** Token starting right after position `end` (after a whole, possibly multi-word, match). */
function tokenAfter(text, end) {
  let i = end;
  while (i < text.length && /[\s–—"'\-)\]]/.test(text[i])) i++;
  const start = i;
  while (i < text.length && /[A-Za-z0-9]/.test(text[i])) i++;
  return text.slice(start, i) || null;
}

/**
 * Tag one item. Returns [{ api_team_id, via }] — `via` is the alias that hit,
 * which is what makes a surprising tag debuggable from the database.
 *
 * `country` is the source's (news_sources.country, ISO alpha-2; C1). It decides
 * a name clash in favour of the one claimant whose league is that country's,
 * unlocks PRESS_NAMES for that country, and gates PRESS_ONLY aliases. Without
 * it (and from a country no claimant plays in) everything is as before.
 */
export function tagText(index, title, summary, lang, country = null) {
  const text = foldKeepCase(`${title || ''} . ${summary || ''}`);
  const low = text.toLowerCase();
  // Stripping diacritics preserves length, so offsets in `text` line up with
  // the original. Anything starting before this is in the headline.
  const titleEnd = foldKeepCase(title || '').length;
  const candidates = [];

  for (const e of index.entries) {
    let teamId = e.perLang[lang];
    let kind = e.kindByLang[lang];
    if (country) {
      if (e.perCountry && e.perCountry[country] !== undefined) {
        // A name meant only in this country's press (PRESS_NAMES).
        teamId = e.perCountry[country];
        kind = 'o';
      } else if (e.claimsByLang && e.claimsByLang[lang]) {
        // A clash: the one claimant whose league is this source's country wins.
        const home = e.claimsByLang[lang].filter(([id]) => LEAGUE_COUNTRY[index.leagueOf.get(id)] === country);
        if (home.length === 1) [teamId, kind] = home[0];
      }
    }
    if (teamId === undefined) continue;
    const only = PRESS_ONLY[e.key];
    if (only && !only.includes(country)) continue;
    const league = index.leagueOf.get(teamId);
    const homeLangs = LEAGUE_LANG[league] || [];

    // Nicknames are domestic: "Mengão" appears in Brazilian copy, not German.
    if (kind === 'n' && !homeLangs.includes(lang)) continue;

    // Rule (a): a common word foreign to this language never matches. European
    // Portuguese shares Brazilian Portuguese's common words.
    const commonIn = COMMON[e.key];
    const isCommon = commonIn && (commonIn.includes(lang) || (lang === 'pt-PT' && commonIn.includes('pt-BR')));
    if (isCommon && !homeLangs.includes(lang)) continue;

    const rule = PORTUGUESE.has(lang) ? PT_CONTEXT[e.key] : null;
    const around = AROUND[e.key];
    const townWords = TOWN_PREV[lang];
    const re = new RegExp(
      `(^|[^A-Za-z0-9])${e.words.map(escapeRe).join('[^A-Za-z0-9]+')}(?![A-Za-z0-9])`,
      'g'
    );

    let m;
    while ((m = re.exec(low)) !== null) {
      const at = m.index + m[1].length;
      const end = m.index + m[0].length;
      const seg = text.slice(at, end);

      // Acronyms only count in all caps: "PSG" yes, "psg" no.
      if (kind === 'a') {
        if (seg !== seg.toUpperCase()) continue;
      } else if (e.single && !/^[A-Z]/.test(seg)) {
        // A one-word club name must be capitalised to be a name at all.
        continue;
      }

      // Place rule for the clubs added on 18 Nov 2026 (most are named after
      // their town): "in Cardiff" is the city ("Fury will fight Joshua in
      // Cardiff", the measured check); C1 adds Dutch "in / uit" and European
      // Portuguese "em". The original clubs keep their old rules.
      if (townWords && e.single && index.established && index.established.get(teamId) === false) {
        const pw = prevToken(text, at);
        if (pw && townWords.includes(pw.toLowerCase())) continue;
      }

      // Words around the name that make it something else ("Copa América").
      if (around) {
        const pw = prevToken(text, at);
        if (around.blockPrev && pw && around.blockPrev.includes(pw.toLowerCase())) continue;
        if (around.blockPrevCapitalised && pw && /^[A-Z]/.test(pw)) continue;
        const nw = tokenAfter(text, end);
        if (around.blockNext && nw && around.blockNext.includes(nw.toLowerCase())) continue;
      }

      if (rule) {
        const pw = prevToken(text, at);
        if (pw) {
          const pl = pw.toLowerCase();
          if (rule.blockPrev && rule.blockPrev.includes(pl)) continue;
          if (rule.blockPrevCapitalised && /^[A-Z]/.test(pw)) continue;
        }
        if (rule.blockNextCapitalised) {
          const nw = nextToken(text, at);
          if (nw && /^[A-Z]/.test(nw)) continue;
        }
      }

      candidates.push({ at, end, api_team_id: teamId, via: e.key });
    }
  }

  // Longest match wins its span. Without this, "Inter Milan" also tags AC
  // Milan and "Independiente Rivadavia" also tags Independiente.
  candidates.sort((a, b) => b.end - b.at - (a.end - a.at) || a.at - b.at);
  const taken = [];
  const hits = new Map();
  for (const c of candidates) {
    if (taken.some((t) => c.at < t.end && t.at < c.end)) continue;
    taken.push(c);
    const prev = hits.get(c.api_team_id);
    const in_title = c.at < titleEnd;
    if (!prev) {
      hits.set(c.api_team_id, { via: c.via, in_title });
    } else if (in_title && !prev.in_title) {
      // A club named in the headline is what the article is about; a mention
      // further down is background. Prefer the headline hit.
      hits.set(c.api_team_id, { via: c.via, in_title });
    }
  }

  return [...hits.entries()].map(([api_team_id, h]) => ({
    api_team_id,
    via: h.via,
    in_title: h.in_title,
  }));
}

/**
 * Plain-text summary, clamped at a sentence boundary at or under `max`.
 * We store a snippet and link out; we never store the article.
 */
export function clipSummary(raw, max = 300) {
  const s = String(raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = cut.match(/^[\s\S]*[.!?](\s|$)/);
  if (sentence && sentence[0].length > max * 0.4) return sentence[0].trim();
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + '…';
}
