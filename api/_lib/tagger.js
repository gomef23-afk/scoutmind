// Club tagging for news headlines.
//
// Precision matters more than recall here: an untagged article is invisible,
// an article tagged to the wrong club is wrong on somebody's club page. Every
// rule below exists because it fixed a real false positive on a real feed, and
// tests/tagger.test.js pins each one.
//
// Pure and dependency-free on purpose — the cron job feeds it rows from
// Supabase, the tests feed it rows from fixtures, and both must agree.

export const LANGS = ['pt-BR', 'en', 'es', 'it', 'de', 'fr'];

/** Language(s) the domestic press of each league writes in. */
export const LEAGUE_LANG = {
  serie_a: ['pt-BR'],
  argentina: ['es'],
  la_liga: ['es'],
  serie_a_it: ['it'],
  bundesliga: ['de'],
  ligue_1: ['fr'],
  premier_league: ['en'],
};

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

/** Lowercase, strip diacritics, collapse punctuation to single spaces. */
export function normalise(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Diacritics stripped but case and offsets preserved, for the case rules. */
function foldKeepCase(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
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
 */
export function buildIndex(teams, aliases = []) {
  const leagueOf = new Map();
  for (const t of teams) leagueOf.set(t.api_team_id, t.league);

  const rows = [
    ...teams.map((t) => ({
      api_team_id: t.api_team_id,
      alias: t.name,
      kind: 'o',
      langs: null,
      short_ok: false,
    })),
    ...aliases,
  ];

  // key -> { unscoped: Map<teamId,kind>, scoped: Map<lang, Map<teamId,kind>> }
  const staging = new Map();
  for (const r of rows) {
    const key = normalise(r.alias);
    if (!key) continue;
    if (key.replace(/ /g, '').length < MIN_ALIAS_LEN && !r.short_ok) continue;
    if (!leagueOf.has(r.api_team_id)) continue; // alias for a team we do not hold

    let slot = staging.get(key);
    if (!slot) staging.set(key, (slot = { unscoped: new Map(), scoped: new Map() }));

    if (r.langs && r.langs.length) {
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
    for (const lang of LANGS) {
      const claims = slot.scoped.get(lang) || slot.unscoped;
      if (claims.size === 0) continue;
      if (claims.size > 1) {
        dropped.push({ key, lang, teams: [...claims.keys()] });
        continue;
      }
      const [id, kind] = [...claims.entries()][0];
      perLang[lang] = id;
      kindByLang[lang] = kind;
    }
    if (Object.keys(perLang).length === 0) continue;
    entries.push({
      key,
      perLang,
      kindByLang,
      single: !key.includes(' '),
      words: key.split(' '),
    });
  }

  // Longest first: the span resolver relies on this order to let "inter milan"
  // beat "milan", and "independiente rivadavia" beat "independiente".
  entries.sort((a, b) => b.key.length - a.key.length || a.key.localeCompare(b.key));
  return { entries, leagueOf, dropped };
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

/**
 * Tag one item. Returns [{ api_team_id, via }] — `via` is the alias that hit,
 * which is what makes a surprising tag debuggable from the database.
 */
export function tagText(index, title, summary, lang) {
  const text = foldKeepCase(`${title || ''} . ${summary || ''}`);
  const low = text.toLowerCase();
  // Stripping diacritics preserves length, so offsets in `text` line up with
  // the original. Anything starting before this is in the headline.
  const titleEnd = foldKeepCase(title || '').length;
  const candidates = [];

  for (const e of index.entries) {
    const teamId = e.perLang[lang];
    if (teamId === undefined) continue;
    const kind = e.kindByLang[lang];
    const league = index.leagueOf.get(teamId);
    const homeLangs = LEAGUE_LANG[league] || [];

    // Nicknames are domestic: "Mengão" appears in Brazilian copy, not German.
    if (kind === 'n' && !homeLangs.includes(lang)) continue;

    // Rule (a): a common word foreign to this language never matches.
    const commonIn = COMMON[e.key];
    if (commonIn && commonIn.includes(lang) && !homeLangs.includes(lang)) continue;

    const rule = lang === 'pt-BR' ? PT_CONTEXT[e.key] : null;
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
