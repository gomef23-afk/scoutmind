// League names with the country code, everywhere a league is named
// (Sequence 2 commit 4b, decision of 17 Nov 2026): "Série A · BRA",
// "Serie A · ITA". Flags are emoji and the spec rules emoji out, and two of
// our leagues read the same without the country, so the code is always there.
//
// LeagueNames.label(x) takes whatever the caller holds:
//   - a slug ('serie_a_it'), or a league's exact name ('Série A');
//   - an object with any of { slug, name, country } (a leagues row, an embed).
// The country comes from the object when it has one, else from the seven
// leagues we carry (listed below), else there is none and only the name shows
// (an international competition has no country).
// Pure: no DOM, no network. Pinned by tests/league-names.test.js. Precached
// (rule 24).
(function (root) {
  'use strict';

  /** ISO-style three-letter codes, as on a scoreboard. */
  const COUNTRY_CODE = {
    Brazil: 'BRA', England: 'ENG', Spain: 'ESP', Germany: 'GER',
    Italy: 'ITA', France: 'FRA', Argentina: 'ARG',
  };

  /** The leagues we carry (leagues.slug / name / country, Nov 2026). */
  const LEAGUES = [
    { slug: 'serie_a', name: 'Série A', country: 'Brazil' },
    { slug: 'premier_league', name: 'Premier League', country: 'England' },
    { slug: 'la_liga', name: 'La Liga', country: 'Spain' },
    { slug: 'bundesliga', name: 'Bundesliga', country: 'Germany' },
    { slug: 'serie_a_it', name: 'Serie A', country: 'Italy' },
    { slug: 'ligue_1', name: 'Ligue 1', country: 'France' },
    { slug: 'argentina', name: 'Liga Profesional', country: 'Argentina' },
  ];

  /** One of LEAGUES by slug, then by exact name (accents count). */
  function find(x) {
    if (!x) return null;
    if (typeof x === 'string') return LEAGUES.find((l) => l.slug === x) || LEAGUES.find((l) => l.name === x) || null;
    return (x.slug && LEAGUES.find((l) => l.slug === x.slug)) || (x.name && LEAGUES.find((l) => l.name === x.name)) || null;
  }

  /** The country code, or '' when there is no country. */
  function code(x) {
    const known = find(x);
    const country = (x && typeof x === 'object' && x.country) || (known && known.country) || '';
    if (!country) return '';
    return COUNTRY_CODE[country] || String(country).slice(0, 3).toUpperCase();
  }

  /** The league's name, plain (no code). */
  function name(x) {
    if (!x) return '';
    const known = find(x);
    if (typeof x === 'object') return x.name || (known && known.name) || '';
    return known ? known.name : x;
  }

  /** "Série A · BRA"; the name alone when there is no country; '' for nothing. */
  function label(x) {
    const n = name(x);
    if (!n) return '';
    const c = code(x);
    return c ? n + ' · ' + c : n;
  }

  root.LeagueNames = { label, name, code, find, LEAGUES, COUNTRY_CODE };
})(typeof window !== 'undefined' ? window : globalThis);
