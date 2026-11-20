// Club aliases for the leagues tracked since 17-19 Nov 2026 (C1, 21 Nov 2026).
//
// Same shape and rules as aliases.js (whose 279 rows stay exactly as seeded by
// migration 005). These are seeded into public.team_aliases by migration 038,
// and tests/tagger-press.test.js asserts the two agree.
//
// Only names the press really writes for the club, and only where the bare
// form is not something else. Held back on purpose (see tagger.js):
//   * names that are a different thing in the same press: "Al Shabab" (also
//     the militant group, in Arab News), "NEOM" (the city project), "Estrela"
//     (a star): NEEDS_QUALIFIER, so only the longer forms below match;
//   * names that mean the club only in its own country's press ("Santos" is
//     Santos Laguna in Mexico and Santos FC everywhere else; "América",
//     "Pumas", Uruguay's bare "Nacional"): PRESS_NAMES in tagger.js;
//   * "Porto", "Braga": also a city and a Brazilian surname, and "Porto
//     Alegre" is Internacional's city, so never in Brazilian copy (langs).

const A = (api_team_id, alias, kind = 'o', langs = null, short_ok = false) => ({ api_team_id, alias, kind, langs, short_ok });
// Every source language except Brazilian Portuguese.
const NOT_BR = ['en', 'es', 'it', 'de', 'fr', 'nl', 'pt-PT', 'tr'];

export const TRACKED_ALIASES = [
  // ── Eredivisie ──
  A(197, 'PSV', 'a', null, true), A(201, 'AZ', 'a', null, true), A(413, 'NEC', 'a', null, true),
  A(198, 'ADO', 'a', null, true), A(415, 'FC Twente'), A(207, 'FC Utrecht'), A(202, 'FC Groningen'), A(210, 'sc Heerenveen'),
  // ── Primeira Liga ──
  A(212, 'Porto', 'o', NOT_BR), A(217, 'Braga', 'o', NOT_BR), A(217, 'Sporting de Braga'), A(217, 'Sporting Braga'),
  A(228, 'Sporting', 'o', ['en', 'it', 'de', 'fr', 'nl', 'pt-PT', 'pt-BR', 'tr']), A(228, 'Sporting Lisbon'), A(228, 'Sporting de Lisboa'),
  A(224, 'Vitória de Guimarães'), A(224, 'Vitória Guimarães'), A(15130, 'Estrela da Amadora'), A(15130, 'Estrela Amadora'),
  // ── Belgium ──
  A(569, 'Club Brugge'), A(569, 'Club Bruges'), A(741, 'Cercle Bruges'), A(733, 'Standard de Liège'), A(733, 'Standard', 'o', ['fr', 'nl']),
  A(1393, 'Union Saint-Gilloise'), A(1393, 'Union SG'), A(735, 'Sint-Truiden'), A(735, 'Saint-Trond'), A(735, 'STVV', 'a'),
  A(266, 'Mechelen'), A(266, 'Malines'), A(261, 'Westerlo'), A(738, 'Beveren'), A(259, 'Lommel'), A(5902, 'La Louvière'),
  A(736, 'Sporting Charleroi'), A(631, 'La Gantoise'), A(734, 'Courtrai'), A(260, 'OH Louvain'), A(740, 'Royal Antwerp'),
  // ── Süper Lig ──
  A(997, 'Gençlerbirliği'), A(1009, 'Erzurumspor'), A(3579, 'Amedspor'), A(1007, 'Çaykur Rizespor'),
  // ── Saudi Pro League ──
  A(2932, 'Al Hilal'), A(2938, 'Al Ittihad'), A(2929, 'Al Ahli'), A(2930, 'Al Faisaly'), A(2933, 'Al Qadsiah'), A(2933, 'Al Qadisiyah'),
  A(2940, 'Al Shabab FC'), A(10513, 'NEOM SC'), A(2934, 'Al Ettifaq'), A(2936, 'Al Taawoun'),
  // ── Liga MX ──
  A(2278, 'Chivas'), A(2279, 'Tigres'), A(2286, 'Pumas UNAM'), A(2287, 'Club América'), A(2292, 'Pachuca'), A(2280, 'Tijuana'),
  A(2280, 'Xolos', 'n'), A(2290, 'Querétaro'), A(2312, 'Atlante'), A(2289, 'Club León'),
  // Not aliased: "Juárez" (a surname), "San Luis" (an Argentine province, in Olé).
  // ── Uruguay (bare names in Uruguayan press only: PRESS_NAMES in tagger.js) ──
  // Not "Defensor": the Spanish word for a defender.
  A(2358, 'Liverpool de Montevideo'), A(2359, 'Racing de Montevideo'), A(2368, 'Central Español'),
];

export default TRACKED_ALIASES;
