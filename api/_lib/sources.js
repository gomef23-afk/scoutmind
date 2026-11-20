// News sources.
//
// Source of truth for the seed in supabase/migrations/005_news.sql; the cron
// job reads the live rows from public.news_sources so Felipe can add, disable
// or re-language a feed from the dashboard without a deploy.
//
// lang            drives club tagging (see api/_lib/tagger.js) and the Home
//                 feed's language filter.
// country         only used to bucket Brazil/Europe for items we could not tag.
// headline_only   true for feeds that ship the full article body. We store a
//                 clipped snippet from every feed, but for these we store
//                 nothing but the headline. GE's feed carries whole articles.
//
// Four feeds from the original list were dead and are not here: they 404'd or
// timed out on every attempt.

export const NEWS_SOURCES = [
  {
    slug: 'ge_futebol',
    name: 'ge',
    url: 'https://pox.globo.com/rss/ge/futebol',
    lang: 'pt-BR',
    country: 'BR',
    // ge's feed carries whole articles. We store the same 300-character
    // sentence-clamped snippet as every other source and never the body; the
    // clamp is in clipSummary(). Pending legal review like the rest.
    headline_only: false,
    active: true,
  },
  {
    slug: 'espn_br',
    name: 'ESPN Brasil',
    url: 'https://www.espn.com.br/rss/futebol.xml',
    lang: 'pt-BR',
    country: 'BR',
    headline_only: false,
    active: true,
  },
  {
    slug: 'bbc_football',
    name: 'BBC Sport',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    lang: 'en',
    country: 'GB',
    headline_only: false,
    active: true,
  },
  {
    slug: 'sky_football',
    name: 'Sky Sports',
    url: 'https://www.skysports.com/rss/12040',
    lang: 'en',
    country: 'GB',
    headline_only: false,
    active: true,
  },
  {
    slug: 'ole_ar',
    name: 'Olé',
    url: 'https://www.ole.com.ar/rss/futbol-primera/',
    lang: 'es',
    country: 'AR',
    headline_only: false,
    active: true,
  },
  {
    slug: 'as_es',
    name: 'AS',
    url: 'https://as.com/rss/futbol/primera.xml',
    lang: 'es',
    country: 'ES',
    headline_only: false,
    active: true,
  },
  {
    slug: 'marca_es',
    name: 'Marca',
    url: 'https://e00-marca.uecdn.es/rss/futbol/primera-division.xml',
    lang: 'es',
    country: 'ES',
    headline_only: false,
    active: true,
  },
  {
    slug: 'gazzetta_it',
    name: 'La Gazzetta dello Sport',
    url: 'https://www.gazzetta.it/rss/calcio.xml',
    lang: 'it',
    country: 'IT',
    headline_only: false,
    active: true,
  },
  {
    slug: 'kicker_de',
    name: 'kicker',
    url: 'https://newsfeed.kicker.de/news/bundesliga',
    lang: 'de',
    country: 'DE',
    headline_only: false,
    active: true,
  },
  {
    slug: 'rmc_fr',
    name: 'RMC Sport',
    url: 'https://rmcsport.bfmtv.com/rss/football/',
    lang: 'fr',
    country: 'FR',
    headline_only: false,
    active: true,
  },
];

// ── The press of the tracked leagues (C2, 21 Nov 2026; migration 038) ──
// Seeded by supabase/migrations/038_press_sources.sql (tests/press-sources.test.js
// keeps the two equal). Chosen and checked on 21 Nov 2026: robots.txt allows
// each feed path; each was frozen once (tests/fixtures/rss-new) and every tag
// reviewed (tests/tagger-press.test.js). headline_only for feeds that carry the
// whole article (rule 17). exclude_patterns are this feed's non-football: they
// match the headline, snippet AND link, and beat a club tag (football-filter.js),
// which is what catches tagged basketball (Peñarol and Galatasaray have basketball
// teams) and betting tips. An outlet with several feeds keeps one name, so
// about.html counts it once. Not added: Saudi Gazette and Montevideo Portal
// (general news, 0 tags of 50 and 8 items), Arabic sources (our club names are
// in Latin script), Marca México (stale since Aug), El Universal (robots.txt
// disallows everything), Debate (403).
const BBC_AUDIO = ['bbc\\.co\\.uk/sounds/', 'bbc\\.co\\.uk/iplayer/'];
const TR_NOT_FOOTBALL = ['\\beuroleague\\b', '\\beurocup\\b', '\\bbsl\\b', '\\bbasketbol\\b', '\\bvoleybol\\b', '\\bmisli\\b'];
export const PRESS_SOURCES = [
  { slug: 'bbc_championship', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/championship/rss.xml', lang: 'en', country: 'GB',
    headline_only: false, active: true, exclude_patterns: BBC_AUDIO },
  { slug: 'guardian_championship', name: 'The Guardian', url: 'https://www.theguardian.com/football/championship/rss', lang: 'en', country: 'GB',
    headline_only: true, active: true, exclude_patterns: [] },
  { slug: 'bbc_scottish', name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/scottish/rss.xml', lang: 'en', country: 'GB',
    headline_only: false, active: true, exclude_patterns: BBC_AUDIO },
  { slug: 'guardian_scottish', name: 'The Guardian', url: 'https://www.theguardian.com/football/scottish-premiership/rss', lang: 'en', country: 'GB',
    headline_only: true, active: true, exclude_patterns: [] },
  { slug: 'guardian_mls', name: 'The Guardian', url: 'https://www.theguardian.com/football/mls/rss', lang: 'en', country: 'GB',
    headline_only: true, active: true, exclude_patterns: [] },
  // AD's sport feed mixes sports; its non-football sections are in the link.
  { slug: 'ad_sportwereld', name: 'AD', url: 'https://www.ad.nl/sportwereld/rss.xml', lang: 'nl', country: 'NL', headline_only: false, active: true,
    exclude_patterns: ['ad\\.nl/(tennis|darts|formule-1|schaatsen|wielrennen|andere-sporten|hockey|volleybal|basketbal|motorsport|atletiek|zwemmen|golf|paardensport|olympische-spelen|handbal|korfbal)/', '\\bwielren', '\\bschaats'] },
  { slug: 'vi_nieuws', name: 'Voetbal International', url: 'https://www.vi.nl/rss/nieuws', lang: 'nl', country: 'NL', headline_only: false, active: true, exclude_patterns: [] },
  // ISO-8859-1 (decodeFeed in rss.js); "modalidades" is every other sport.
  { slug: 'record_pt', name: 'Record', url: 'https://www.record.pt/rss', lang: 'pt-PT', country: 'PT', headline_only: false, active: true,
    exclude_patterns: ['record\\.pt/modalidades/', '\\bfutsal\\b', '\\bandebol\\b', '\\bhoquei\\b'] },
  { slug: 'dh_football', name: 'DH Les Sports+', url: 'https://www.dhnet.be/rss/section/sports/football.xml', lang: 'fr', country: 'BE', headline_only: false, active: true, exclude_patterns: [] },
  { slug: 'sporza_voetbal', name: 'Sporza', url: 'https://sporza.be/nl/categorie/voetbal.rss.xml', lang: 'nl', country: 'BE', headline_only: false, active: true, exclude_patterns: [] },
  // Hürriyet's sport feed carries the whole paper; its football is under /sporarena/.
  { slug: 'hurriyet_spor', name: 'Hürriyet', url: 'https://www.hurriyet.com.tr/rss/spor', lang: 'tr', country: 'TR', headline_only: false, active: true,
    exclude_patterns: ['hurriyet\\.com\\.tr/(?!sporarena/)', ...TR_NOT_FOOTBALL] },
  { slug: 'sabah_spor', name: 'Sabah', url: 'https://www.sabah.com.tr/rss/spor.xml', lang: 'tr', country: 'TR', headline_only: false, active: true,
    exclude_patterns: ['sabah\\.com\\.tr/spor/(basketbol|voleybol|tenis|motor-sporlari|atletizm)/', 'cagdas faktoring', ...TR_NOT_FOOTBALL] },
  // The whole paper; football is under /football/ and /saudi-pro-league/.
  { slug: 'arab_news', name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', lang: 'en', country: 'SA', headline_only: false, active: true,
    exclude_patterns: ['arabnews\\.com/(?!(football|saudi-pro-league|sport)/)'] },
  // Mexico's sports section; carries whole articles. ONEFA = college American football.
  { slug: 'infobae_mx', name: 'Infobae México', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/mexico/deportes/', lang: 'es', country: 'MX',
    headline_only: true, active: true, exclude_patterns: ['\\bonefa\\b', '\\bborregos\\b'] },
  // Carries whole articles; "LUB:" is the basketball league.
  { slug: 'tenfield', name: 'Tenfield', url: 'https://www.tenfield.com.uy/feed/', lang: 'es', country: 'UY', headline_only: true, active: true,
    exclude_patterns: ['^lub\\b', 'tenfield\\.com\\.uy/lub-'] },
];

/** Every source the news job reads (005's ten, then 038's fifteen). */
export const ALL_NEWS_SOURCES = [...NEWS_SOURCES, ...PRESS_SOURCES];

export default NEWS_SOURCES;
