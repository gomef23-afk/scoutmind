// Tolerant RSS/Atom reader.
//
// Hand-written because /api runs with zero npm dependencies. Real feeds are
// messier than the spec: CDATA around links, guids that are not URLs, Atom
// entries mixed with RSS items, namespaced tags, timezone abbreviations that
// Date.parse dislikes, and encodings declared but not honoured. Anything we
// cannot read we skip — one malformed item must never fail a whole run.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', agrave: 'à',
  ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß',
};

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    });
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/** Inner text of the first `<tag>` inside `block`, CDATA and entities resolved. */
function pick(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  return cleanText(m[1]);
}

function cleanText(raw) {
  let v = String(raw || '');
  // Several CDATA sections can appear in one element.
  v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  v = v.replace(/<[^>]*>/g, ' ');
  v = decodeEntities(v);
  v = v.replace(/\s+/g, ' ').trim();
  // ESPN ships the literal string "null" as a description. Serialising a
  // missing value is the feed's bug; do not print it on a card.
  if (/^(null|undefined|n\/a|-)$/i.test(v)) return '';
  return v;
}

/** An attribute on the first matching tag, e.g. link href. */
function pickAttr(block, tag, attr, requireAttr) {
  const re = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'gi');
  let m;
  while ((m = re.exec(block)) !== null) {
    const attrs = m[1] || '';
    if (requireAttr && !new RegExp(requireAttr, 'i').test(attrs)) continue;
    const a = attrs.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (a) return decodeEntities(a[1]).trim();
  }
  return '';
}

/**
 * Parse a feed document into items.
 * Returns [{ title, link, summary, guid, published }] — published is an ISO
 * string, or null when the feed gave us nothing usable.
 */
export function parseFeed(xml) {
  const doc = String(xml || '');
  const items = [];
  const blocks = doc.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];

  for (const block of blocks) {
    const title = pick(block, 'title');

    // RSS <link>text</link>; Atom <link href="..." rel="alternate"/>.
    let link = pick(block, 'link');
    if (!/^https?:\/\//i.test(link)) {
      link =
        pickAttr(block, 'link', 'href', 'rel\\s*=\\s*["\']alternate["\']') ||
        pickAttr(block, 'link', 'href') ||
        link;
    }

    const summary =
      pick(block, 'description') ||
      pick(block, 'content:encoded') ||
      pick(block, 'summary') ||
      pick(block, 'content') ||
      pick(block, 'atom:subtitle') ||
      '';

    const rawDate =
      pick(block, 'pubDate') ||
      pick(block, 'published') ||
      pick(block, 'updated') ||
      pick(block, 'dc:date') ||
      '';

    // guid is optional and is not always a URL; the link is the better
    // fallback identity, and the caller dedupes on whatever we return.
    const guid = pick(block, 'guid') || pick(block, 'id') || link || '';

    if (!title || !/^https?:\/\//i.test(link)) continue;

    items.push({
      title,
      link,
      summary,
      guid,
      published: parseDate(rawDate),
    });
  }

  return items;
}

/** RFC-822 / ISO-8601 / "EST"-style dates -> ISO string, or null. */
export function parseDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    // Drop a trailing alphabetic timezone Date.parse refuses, keep the offset
    // if one is present: "Thu, 24 Sep 2026 15:37:12 GMT+0300 (EEST)".
    t = Date.parse(s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+[A-Z]{3,4}$/, ' GMT'));
  }
  if (Number.isNaN(t)) return null;
  // A feed that reports the future is reporting a bug; clamp so one bad item
  // cannot pin itself to the top of the feed forever.
  const max = Date.now() + 6 * 3600_000;
  return new Date(Math.min(t, max)).toISOString();
}
