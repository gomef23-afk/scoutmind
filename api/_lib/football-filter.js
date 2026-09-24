// Is this item actually about football?
//
// The feeds are football feeds, but they leak: ge carries NFL-in-Rio features,
// ESPN Brasil ships Disney+ TV listings, Sky posts F1 and tennis.
//
// The rule comes from auditing all 502 rows of the first real run. Every
// genuine non-football item was UNTAGGED, and every item a keyword would have
// wrongly flagged was TAGGED to a club:
//
//   kept  "De Rossi: Sinner ci fa sentire orgogliosi"        tagged, football
//   kept  "Alcaraz se preocupa com temporada do Real Madrid" tagged, football
//   kept  "Kane denkt uber die Zeit nach Bayern nach"        tagged, football
//   drop  "NFL no Rio: como o Baltimore Ravens nasceu..."    untagged
//   drop  "O que assistir nesta quinta-feira no Disney+"     untagged
//
// So a club tag is treated as proof of football, and the keywords only decide
// untagged items. That gave zero false positives on the audited corpus.
//
// Nothing is ever deleted (rule 13) — items just get football_ok = false and
// drop out of the feed query.

const NON_FOOTBALL = [
  // TV / streaming listings
  /\bo que assistir\b/,
  /\bonde assistir na tv\b/,
  /\bdisney\s*\+/,
  /\bstar\s*\+/,
  /\bguia de tv\b/,
  // American sports
  /\bnfl\b/,
  /\bnba\b/,
  /\bmlb\b/,
  /\bnhl\b/,
  /\bsuper bowl\b/,
  /\bflag football\b/,
  // Motorsport
  /\bformula\s*1\b/,
  /\bf1\b/,
  /\bmotogp\b/,
  /\bnascar\b/,
  /\bgrand prix\b/,
  /\bgran premio\b/,
  // Racket / combat / other
  /\btenis\b/,
  /\btennis\b/,
  /\bwimbledon\b/,
  /\broland garros\b/,
  /\bufc\b/,
  /\bmma\b/,
  /\bbasquete\b/,
  /\bbaloncesto\b/,
  /\bpallacanestro\b/,
  /\bvolei\b/,
  /\bvoleibol\b/,
  /\bvolleyball\b/,
  /\bciclismo\b/,
  /\btour de france\b/,
  /\bcricket\b/,
  /\brugby\b/,
  // Golf. Sky's football feed carries Ryder/Presidents Cup coverage; this was
  // missed on the first pass and found by re-running against live rows.
  /\bgolf\b/,
  /\bryder cup\b/,
  /\bpresidents cup\b/,
  /\bpga\b/,
];

/** Lowercase and strip diacritics so "tênis" and "tenis" match one pattern. */
function fold(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * `extraPatterns` are per-source regex strings from news_sources.exclude_patterns,
 * so a feed that starts leaking something new can be fixed from the dashboard
 * without a deploy. A malformed pattern is ignored rather than failing the run.
 */
export function isFootball(title, summary, tagCount = 0, extraPatterns = null) {
  if (tagCount > 0) return true; // tagged to one of our clubs: football, by definition

  const text = fold(`${title || ''} ${summary || ''}`);

  for (const re of NON_FOOTBALL) {
    if (re.test(text)) return false;
  }

  if (extraPatterns && extraPatterns.length) {
    for (const p of extraPatterns) {
      try {
        if (new RegExp(fold(p), 'i').test(text)) return false;
      } catch {
        // Not a valid regex — ignore it rather than break ingestion.
      }
    }
  }

  return true;
}

export const NON_FOOTBALL_PATTERNS = NON_FOOTBALL;
