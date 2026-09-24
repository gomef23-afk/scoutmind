// Club aliases for news tagging, keyed on API-Football team ids.
//
// This module is the source of truth. supabase/migrations/005_news.sql seeds
// the same rows into public.team_aliases, and tests/tagger.test.js asserts the
// two agree — so adding an alias here without regenerating the SQL fails CI
// rather than silently drifting.
//
// kind:    'o' official/short name | 'n' nickname | 'a' acronym
// langs:   null = all source languages; otherwise only those languages
// short_ok: allow an alias under 4 characters (Fla, Flu, PSG, BVB)
//
// Nicknames only match sources in their club's own language, acronyms only in
// all caps, and one-word aliases only when capitalised. See api/_lib/tagger.js.
//
// MAINTENANCE: promoted clubs arrive each season with no aliases. After the
// teams job ingests a new season, add the new clubs' nicknames here and
// regenerate the seed block in 005_news.sql.

const A = (api_team_id, alias, kind = 'o', langs = null, short_ok = false) => ({
  api_team_id,
  alias,
  kind,
  langs,
  short_ok,
});

export const TEAM_ALIASES = [
  // ── Série A (Brazil) ──────────────────────────────────────────────────────
  A(134, 'Athletico-PR'), A(134, 'Athletico Paranaense'), A(134, 'Furacao', 'n'),
  A(1062, 'Atletico Mineiro'), A(1062, 'Galo', 'n'),
  A(118, 'EC Bahia'), A(118, 'Esquadrao de Aco', 'n'), A(118, 'Tricolor de Aco', 'n'),
  A(120, 'Botafogo-RJ'), A(120, 'Fogao', 'n'), A(120, 'Glorioso', 'n'),
  A(132, 'Chapecoense'), A(132, 'Chape', 'n'),
  A(131, 'SCCP'), A(131, 'Timao', 'n'), A(131, 'Coringao', 'n'),
  A(147, 'Coritiba FC'), A(147, 'Coxa', 'n'), A(147, 'Coxa Branca', 'n'),
  A(135, 'Raposa', 'n'), A(135, 'Cabuloso', 'n'),
  A(127, 'Mengao', 'n'), A(127, 'Nacao Rubro-Negra', 'n'),
  A(127, 'Fla', 'n', ['pt-BR'], true),
  A(124, 'Fluminense FC'), A(124, 'Tricolor Carioca', 'n'),
  A(124, 'Flu', 'n', ['pt-BR'], true),
  A(130, 'Imortal', 'n'), A(130, 'Tricolor Gaucho', 'n'),
  A(119, 'SC Internacional'), A(119, 'Inter de Porto Alegre'), A(119, 'Colorado', 'n'),
  // In Brazilian copy "Inter" is Internacional; everywhere else it is Inter Milan.
  A(119, 'Inter', 'o', ['pt-BR']),
  A(7848, 'Mirassol FC'),
  A(121, 'Verdao', 'n'), A(121, 'Alviverde', 'n'), A(121, 'Porco', 'n'),
  A(794, 'Bragantino'), A(794, 'Red Bull Bragantino'), A(794, 'Massa Bruta', 'n'),
  A(1198, 'Clube do Remo'), A(1198, 'Leao Azul', 'n'),
  A(128, 'Santos FC'), A(128, 'Peixe', 'n'), A(128, 'Alvinegro Praiano', 'n'),
  A(126, 'Sao Paulo FC'), A(126, 'SPFC'), A(126, 'Tricolor Paulista', 'n'), A(126, 'Soberano', 'n'),
  A(133, 'Vasco'), A(133, 'Vasco da Gama'), A(133, 'CRVG'), A(133, 'Gigante da Colina', 'n'),
  A(136, 'EC Vitoria'), A(136, 'Leao da Barra', 'n'),

  // ── Premier League ────────────────────────────────────────────────────────
  A(42, 'Gunners', 'n'),
  // "Villa" alone is David Villa in Spanish and Italian copy, and an ordinary
  // noun in both. Foreign press writing about the club uses "Aston Villa",
  // which matches on the team name in every language.
  A(66, 'Villa', 'o', ['en']), A(66, 'AVFC'),
  A(35, 'AFC Bournemouth'), A(35, 'Cherries', 'n'),
  A(55, 'Bees', 'n'),
  A(51, 'Brighton and Hove Albion'), A(51, 'BHAFC'), A(51, 'Seagulls', 'n'),
  A(1346, 'Coventry City'), A(1346, 'CCFC'), A(1346, 'Sky Blues', 'n'),
  A(52, 'Palace'), A(52, 'CPFC'), A(52, 'Eagles', 'n'),
  A(45, 'Toffees', 'n'),
  A(36, 'Cottagers', 'n'),
  A(64, 'Hull'), A(64, 'Tigers', 'n'),
  A(57, 'Ipswich Town'), A(57, 'Tractor Boys', 'n'),
  A(63, 'Leeds United'), A(63, 'Whites', 'n'),
  A(40, 'Reds', 'n'),
  A(50, 'Man City'), A(50, 'MCFC'), A(50, 'Citizens', 'n'),
  A(33, 'Man Utd'), A(33, 'Man United'), A(33, 'MUFC'), A(33, 'Red Devils', 'n'),
  A(34, 'Newcastle United'), A(34, 'NUFC'), A(34, 'Magpies', 'n'),
  A(65, 'Forest'), A(65, 'NFFC'),
  A(746, 'SAFC'), A(746, 'Black Cats', 'n'),
  A(47, 'Tottenham Hotspur'), A(47, 'THFC'), A(47, 'Spurs', 'n'),

  // ── La Liga ───────────────────────────────────────────────────────────────
  A(542, 'Deportivo Alaves'),
  A(531, 'Athletic Bilbao'), A(531, 'Athletic de Bilbao'), A(531, 'Leones', 'n'),
  A(530, 'Atletico de Madrid'), A(530, 'Atleti', 'n'), A(530, 'Colchoneros', 'n'),
  A(529, 'FC Barcelona'), A(529, 'Barca', 'n'), A(529, 'Blaugrana', 'n'),
  A(538, 'Celta'), A(538, 'RC Celta'),
  A(544, 'Deportivo'), A(544, 'RC Deportivo'), A(544, 'Depor', 'n'),
  A(797, 'Elche CF'),
  A(540, 'RCD Espanyol'), A(540, 'Periquitos', 'n'),
  A(546, 'Getafe CF'),
  A(539, 'Levante UD'), A(539, 'Granotas', 'n'),
  A(535, 'Malaga CF'),
  A(727, 'CA Osasuna'), A(727, 'Rojillos', 'n'),
  A(4665, 'Racing de Santander'),
  A(728, 'Rayo'), A(728, 'Franjirrojos', 'n'),
  A(543, 'Betis'), A(543, 'Verdiblancos', 'n'),
  A(541, 'Los Blancos', 'n'), A(541, 'Merengues', 'n'),
  A(548, 'La Real', 'n'), A(548, 'Txuri-urdin', 'n'),
  A(536, 'Sevilla FC'), A(536, 'Sevillistas', 'n'),
  A(532, 'Valencia CF'),
  A(533, 'Villarreal CF'), A(533, 'Submarino Amarillo', 'n'),

  // ── Bundesliga ────────────────────────────────────────────────────────────
  A(192, 'FC Koln'), A(192, 'Koln'), A(192, 'Cologne'), A(192, 'Effzeh', 'n'),
  A(167, 'Hoffenheim'), A(167, 'TSG Hoffenheim'),
  A(168, 'Leverkusen'), A(168, 'Werkself', 'n'),
  A(157, 'Bayern'), A(157, 'Bayern Munich'), A(157, 'FC Bayern'),
  A(165, 'Dortmund'), A(165, 'BVB', 'a', null, true),
  A(163, 'Gladbach'), A(163, 'Monchengladbach'),
  A(169, 'Frankfurt'), A(169, 'Eintracht'),
  A(170, 'Augsburg'),
  A(174, 'Schalke'), A(174, 'Schalke 04'),
  A(164, 'Mainz'), A(164, 'Mainz 05'),
  A(175, 'Hamburg'),
  A(173, 'Leipzig'), A(173, 'RasenBallsport'),
  A(160, 'Freiburg'),
  A(185, 'Paderborn'),
  A(1660, 'Elversberg'),
  A(182, '1. FC Union Berlin'), A(182, 'Eisern', 'n'),
  A(172, 'Stuttgart'),
  A(162, 'Bremen'), A(162, 'Werder'),

  // ── Serie A (Italy) ───────────────────────────────────────────────────────
  A(489, 'Milan'), A(489, 'Rossoneri', 'n'),
  A(497, 'Roma'), A(497, 'Giallorossi', 'n'),
  A(499, 'Atalanta BC'),
  A(500, 'Bologna FC'),
  A(490, 'Cagliari Calcio'),
  A(895, 'Como 1907'),
  A(502, 'ACF Fiorentina'), A(502, 'Viola', 'n'),
  A(512, 'Frosinone Calcio'),
  A(495, 'Genoa CFC'), A(495, 'Grifone', 'n'),
  A(505, 'Inter Milan'), A(505, 'Internazionale'), A(505, 'Nerazzurri', 'n'),
  A(505, 'Inter', 'o', ['it', 'en', 'es']),
  A(496, 'Juve', 'n'), A(496, 'Bianconeri', 'n'), A(496, 'Vecchia Signora', 'n'),
  A(487, 'SS Lazio'), A(487, 'Biancocelesti', 'n'),
  A(867, 'US Lecce'),
  A(1579, 'AC Monza'),
  A(492, 'SSC Napoli'), A(492, 'Partenopei', 'n'),
  A(523, 'Parma Calcio'),
  A(488, 'US Sassuolo'), A(488, 'Neroverdi', 'n'),
  A(503, 'Toro', 'n'), A(503, 'Granata', 'n'),
  A(494, 'Udinese Calcio'), A(494, 'Zebrette', 'n'),
  A(517, 'Venezia FC'),

  // ── Ligue 1 ───────────────────────────────────────────────────────────────
  A(77, 'Angers SCO'),
  A(108, 'AJ Auxerre'),
  A(110, 'Troyes'), A(110, 'ESTAC'),
  A(111, 'Le Havre AC'),
  A(1298, 'Le Mans FC'),
  A(116, 'RC Lens'), A(116, 'Sang et Or', 'n'),
  A(79, 'LOSC'), A(79, 'Lille OSC'), A(79, 'Dogues', 'n'),
  A(97, 'FC Lorient'), A(97, 'Merlus', 'n'),
  A(80, 'Olympique Lyonnais'),
  A(81, 'Olympique de Marseille'), A(81, 'Phoceens', 'n'),
  A(91, 'AS Monaco'),
  A(84, 'OGC Nice'), A(84, 'Aiglons', 'n'),
  A(85, 'Paris SG'), A(85, 'Paris Saint-Germain'), A(85, 'PSG', 'a', null, true),
  A(94, 'Stade Rennais'), A(94, 'SRFC'),
  A(106, 'Brest'), A(106, 'Stade Brestois'),
  A(95, 'RC Strasbourg'), A(95, 'RCSA'),
  A(96, 'Toulouse FC'),

  // ── Liga Profesional (Argentina) ──────────────────────────────────────────
  A(463, 'CA Aldosivi'), A(463, 'Tiburon', 'n'),
  A(458, 'Argentinos Juniors'), A(458, 'Bicho', 'n'),
  A(455, 'Decano', 'n'),
  A(449, 'CA Banfield'), A(449, 'Taladro', 'n'),
  A(2432, 'Barracas'),
  A(440, 'Belgrano'), A(440, 'Pirata', 'n'),
  A(451, 'Boca'), A(451, 'CABJ'), A(451, 'Xeneize', 'n'),
  A(1065, 'Central Cordoba'), A(1065, 'Ferroviario', 'n'),
  A(442, 'Defensa y Justicia'), A(442, 'Halcon', 'n'),
  A(476, 'Riestra'),
  A(2424, 'Estudiantes Rio Cuarto'),
  A(450, 'Estudiantes de La Plata'), A(450, 'Pincha', 'n'),
  A(434, 'Gimnasia La Plata'), A(434, 'Lobo', 'n'),
  A(1066, 'Gimnasia Mendoza'),
  A(445, 'CA Huracan'), A(445, 'Globo', 'n'),
  A(473, 'Independiente Rivadavia'),
  A(453, 'CA Independiente'),
  A(478, 'Instituto'), A(478, 'Gloria', 'n'),
  A(446, 'CA Lanus'), A(446, 'Granate', 'n'),
  A(457, 'Newells'), A(457, 'Leprosos', 'n'),
  A(1064, 'CA Platense'), A(1064, 'Calamar', 'n'),
  A(436, 'Academia', 'n'),
  A(435, 'River'), A(435, 'CARP'), A(435, 'Millonarios', 'n'),
  A(437, 'Canalla', 'n'),
  A(460, 'CASLA'), A(460, 'Ciclon', 'n'),
  A(474, 'Sarmiento'),
  A(456, 'Talleres'),
  A(452, 'CA Tigre'),
  A(441, 'Tatengue', 'n'),
  A(438, 'Velez'), A(438, 'Fortin', 'n'),
];

export default TEAM_ALIASES;
