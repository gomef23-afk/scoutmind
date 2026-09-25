// Display names for clubs.
//
// API-Football's `teams.name` is a data field, not a label. It strips accents
// ("Sao Paulo", "Gremio"), abbreviates ("Gimnasia L.P.", "Independ. Rivadavia")
// and occasionally shouts ("Vasco DA Gama", "Argentinos JRS").
//
// There is no safe general algorithm here. Lowercasing runs of capitals would
// turn AC Milan into Ac Milan and RB Leipzig into Rb Leipzig — those names are
// CORRECT. So this is an explicit map of the names that are actually wrong,
// plus one narrow rule for Portuguese and Spanish particles.
//
// Keyed on api_team_id, not on the string, so a name change upstream cannot
// silently re-point an override at the wrong club.
//
// Loaded as a classic script by index.html and community.html, like
// leagues_data.js. tests/tagger.test.js evaluates this same file, so the map
// cannot drift from what the tests assert.

var CLUB_NAME_OVERRIDES = {
  // ── Série A (Brazil) ──
  126: 'São Paulo',
  130: 'Grêmio',
  132: 'Chapecoense-SC',          // stored lowercase: "Chapecoense-sc"
  133: 'Vasco da Gama',           // stored shouting: "Vasco DA Gama"
  134: 'Athletico Paranaense',
  136: 'Vitória',
  1062: 'Atlético-MG',

  // ── La Liga ──
  530: 'Atlético Madrid',
  535: 'Málaga',
  538: 'Celta de Vigo',
  542: 'Alavés',
  544: 'Deportivo La Coruña',

  // ── Serie A (Italy) ──
  // Nothing: the stored names are already correct, acronyms included
  // (AC Milan, AS Roma, Inter). Overriding them would be a no-op that hides
  // the day one of them changes upstream.

  // ── Liga Profesional (Argentina) ──
  434: 'Gimnasia La Plata',       // stored: "Gimnasia L.P."
  438: 'Vélez Sarsfield',
  440: 'Belgrano',
  441: 'Unión Santa Fe',
  445: 'Huracán',
  446: 'Lanús',
  450: 'Estudiantes La Plata',    // stored: "Estudiantes L.P."
  455: 'Atlético Tucumán',
  456: 'Talleres',
  457: "Newell's Old Boys",
  458: 'Argentinos Juniors',      // stored: "Argentinos JRS"
  473: 'Independiente Rivadavia', // stored: "Independ. Rivadavia"
  474: 'Sarmiento',
  478: 'Instituto',
  1065: 'Central Córdoba',
  1066: 'Gimnasia Mendoza',       // stored: "Gimnasia M."
  2424: 'Estudiantes de Río Cuarto',
};

// Particles that are lowercase inside a Spanish/Portuguese club name but are
// sometimes stored capitalised. Only ever touched BETWEEN two words, so a name
// starting or ending with one is left alone.
var CLUB_NAME_PARTICLES = ['da', 'de', 'do', 'dos', 'das', 'del', 'y', 'e'];

/**
 * `team` is a row with at least { api_team_id, name }.
 * Falls back to the stored name, so a club with no override still displays.
 */
function clubDisplayName(team) {
  if (!team) return '';
  var override = CLUB_NAME_OVERRIDES[team.api_team_id];
  if (override) return override;
  return fixClubParticles(team.name || '');
}

/** "Vasco DA Gama" -> "Vasco da Gama", but "AC Milan" is left alone. */
function fixClubParticles(name) {
  var words = String(name || '').split(' ');
  return words
    .map(function (w, i) {
      if (i === 0 || i === words.length - 1) return w;
      return CLUB_NAME_PARTICLES.indexOf(w.toLowerCase()) > -1 ? w.toLowerCase() : w;
    })
    .join(' ');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CLUB_NAME_OVERRIDES, clubDisplayName, fixClubParticles };
}
