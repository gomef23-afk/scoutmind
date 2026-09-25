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

export default NEWS_SOURCES;
