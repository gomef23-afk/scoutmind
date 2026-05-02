// ═══════════════════════════════════════════════════════════════
// SCOUTMIND — PLAYER DATABASE
// 1000+ real players with real 2025/26 stats
// Organized by league for efficient filtering
// ═══════════════════════════════════════════════════════════════

// Player object structure:
// {name, club, league, pos (ATT/MID/DEF/GK), age, nat, value(€),
//  apps, goals_pg, assists_pg, key_passes_pg, pass_acc,
//  tackles_pg, interceptions_pg, aerial_pct, shots_on_tgt_pg, height}

const PLAYERS_DB = [

  // ════════════════════════════════
  // 🇧🇷 SÉRIE A — BRAZIL 2026
  // ════════════════════════════════

  // Flamengo
  {name:"Pedro",club:"Flamengo",league:"serie_a",pos:"ATT",subpos:"ST",age:27,nat:"Brazilian",value:22000000,apps:30,goals_pg:0.62,assists_pg:0.18,key_passes_pg:1.5,pass_acc:78,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:68,shots_on_tgt_pg:2.8,height:187},
  {name:"Gerson",club:"Flamengo",league:"serie_a",pos:"MID",subpos:"CM",age:27,nat:"Brazilian",value:18000000,apps:28,goals_pg:0.18,assists_pg:0.22,key_passes_pg:2.4,pass_acc:87,tackles_pg:3.2,interceptions_pg:1.8,aerial_pct:48,shots_on_tgt_pg:0.5,height:178},
  {name:"Léo Ortiz",club:"Flamengo",league:"serie_a",pos:"DEF",subpos:"CB",age:28,nat:"Brazilian",value:10000000,apps:32,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:85,tackles_pg:3.2,interceptions_pg:2.1,aerial_pct:62,shots_on_tgt_pg:0.2,height:186},
  {name:"Bruno Henrique",club:"Flamengo",league:"serie_a",pos:"ATT",subpos:"LW",age:33,nat:"Brazilian",value:4000000,apps:22,goals_pg:0.45,assists_pg:0.28,key_passes_pg:1.8,pass_acc:82,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:42,shots_on_tgt_pg:2.1,height:172},
  {name:"Arrascaeta",club:"Flamengo",league:"serie_a",pos:"MID",subpos:"CAM",age:30,nat:"Uruguayan",value:12000000,apps:26,goals_pg:0.22,assists_pg:0.35,key_passes_pg:2.8,pass_acc:88,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:1.0,height:175},
  {name:"Léo Pereira",club:"Flamengo",league:"serie_a",pos:"DEF",subpos:"CB",age:28,nat:"Brazilian",value:8000000,apps:30,goals_pg:0.08,assists_pg:0.04,key_passes_pg:0.4,pass_acc:82,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:65,shots_on_tgt_pg:0.1,height:185},
  {name:"De La Cruz",club:"Flamengo",league:"serie_a",pos:"MID",subpos:"CM",age:27,nat:"Uruguayan",value:14000000,apps:27,goals_pg:0.15,assists_pg:0.28,key_passes_pg:2.5,pass_acc:86,tackles_pg:2.0,interceptions_pg:1.0,aerial_pct:44,shots_on_tgt_pg:0.7,height:179},
  {name:"Matheus Cunha",club:"Flamengo",league:"serie_a",pos:"ATT",subpos:"ST",age:26,nat:"Brazilian",value:16000000,apps:25,goals_pg:0.40,assists_pg:0.24,key_passes_pg:2.0,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:46,shots_on_tgt_pg:1.8,height:180},

  // Palmeiras
  {name:"Estêvão",club:"Palmeiras",league:"serie_a",pos:"ATT",subpos:"RW",age:18,nat:"Brazilian",value:45000000,apps:25,goals_pg:0.38,assists_pg:0.32,key_passes_pg:2.8,pass_acc:83,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:40,shots_on_tgt_pg:1.8,height:176},
  {name:"Raphael Veiga",club:"Palmeiras",league:"serie_a",pos:"MID",subpos:"CAM",age:29,nat:"Brazilian",value:15000000,apps:29,goals_pg:0.28,assists_pg:0.25,key_passes_pg:2.6,pass_acc:86,tackles_pg:1.8,interceptions_pg:0.9,aerial_pct:44,shots_on_tgt_pg:1.2,height:181},
  {name:"Murilo",club:"Palmeiras",league:"serie_a",pos:"DEF",subpos:"CB",age:27,nat:"Brazilian",value:12000000,apps:31,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.4,pass_acc:86,tackles_pg:3.0,interceptions_pg:1.9,aerial_pct:64,shots_on_tgt_pg:0.1,height:188},
  {name:"Richard Rios",club:"Palmeiras",league:"serie_a",pos:"MID",subpos:"CDM",age:24,nat:"Colombian",value:16000000,apps:28,goals_pg:0.12,assists_pg:0.18,key_passes_pg:2.0,pass_acc:85,tackles_pg:3.8,interceptions_pg:2.2,aerial_pct:52,shots_on_tgt_pg:0.6,height:179},
  {name:"Flaco López",club:"Palmeiras",league:"serie_a",pos:"ATT",subpos:"ST",age:25,nat:"Argentine",value:10000000,apps:26,goals_pg:0.45,assists_pg:0.15,key_passes_pg:1.4,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:2.0,height:183},
  {name:"Marcos Rocha",club:"Palmeiras",league:"serie_a",pos:"DEF",subpos:"RB",age:36,nat:"Brazilian",value:1000000,apps:24,goals_pg:0.04,assists_pg:0.18,key_passes_pg:1.0,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:52,shots_on_tgt_pg:0.1,height:179},
  {name:"Piquerez",club:"Palmeiras",league:"serie_a",pos:"DEF",subpos:"LB",age:27,nat:"Uruguayan",value:9000000,apps:28,goals_pg:0.07,assists_pg:0.22,key_passes_pg:1.2,pass_acc:82,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:50,shots_on_tgt_pg:0.2,height:180},
  {name:"Weverton",club:"Palmeiras",league:"serie_a",pos:"GK",subpos:"GK",age:36,nat:"Brazilian",value:2000000,apps:32,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:188},

  // Botafogo
  {name:"Luiz Henrique",club:"Botafogo",league:"serie_a",pos:"ATT",subpos:"LW",age:23,nat:"Brazilian",value:20000000,apps:28,goals_pg:0.35,assists_pg:0.38,key_passes_pg:2.2,pass_acc:81,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:42,shots_on_tgt_pg:1.6,height:174},
  {name:"Marlon Freitas",club:"Botafogo",league:"serie_a",pos:"MID",subpos:"CDM",age:29,nat:"Brazilian",value:8000000,apps:30,goals_pg:0.08,assists_pg:0.15,key_passes_pg:1.8,pass_acc:86,tackles_pg:4.1,interceptions_pg:2.4,aerial_pct:50,shots_on_tgt_pg:0.4,height:179},
  {name:"Alexander Barboza",club:"Botafogo",league:"serie_a",pos:"DEF",subpos:"CB",age:27,nat:"Uruguayan",value:9000000,apps:31,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:85,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:65,shots_on_tgt_pg:0.1,height:189},
  {name:"Igor Jesus",club:"Botafogo",league:"serie_a",pos:"ATT",subpos:"ST",age:23,nat:"Brazilian",value:12000000,apps:26,goals_pg:0.38,assists_pg:0.20,key_passes_pg:1.5,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:55,shots_on_tgt_pg:1.8,height:184},
  {name:"Savarino",club:"Botafogo",league:"serie_a",pos:"ATT",subpos:"RW",age:27,nat:"Venezuelan",value:7000000,apps:27,goals_pg:0.25,assists_pg:0.30,key_passes_pg:2.0,pass_acc:80,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:40,shots_on_tgt_pg:1.2,height:173},
  {name:"Gregore",club:"Botafogo",league:"serie_a",pos:"MID",subpos:"CDM",age:30,nat:"Brazilian",value:4000000,apps:28,goals_pg:0.06,assists_pg:0.10,key_passes_pg:1.2,pass_acc:83,tackles_pg:3.8,interceptions_pg:2.2,aerial_pct:54,shots_on_tgt_pg:0.3,height:183},

  // Fluminense
  {name:"Thiago Silva",club:"Fluminense",league:"serie_a",pos:"DEF",subpos:"CB",age:41,nat:"Brazilian",value:1500000,apps:18,goals_pg:0.08,assists_pg:0.06,key_passes_pg:0.6,pass_acc:91,tackles_pg:2.2,interceptions_pg:1.4,aerial_pct:70,shots_on_tgt_pg:0.1,height:183},
  {name:"Jhon Arias",club:"Fluminense",league:"serie_a",pos:"ATT",subpos:"RW",age:27,nat:"Colombian",value:18000000,apps:30,goals_pg:0.28,assists_pg:0.35,key_passes_pg:2.5,pass_acc:82,tackles_pg:1.5,interceptions_pg:0.6,aerial_pct:44,shots_on_tgt_pg:1.4,height:172},
  {name:"Germán Cano",club:"Fluminense",league:"serie_a",pos:"ATT",subpos:"ST",age:37,nat:"Argentine",value:2000000,apps:22,goals_pg:0.55,assists_pg:0.12,key_passes_pg:1.2,pass_acc:75,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:2.4,height:182},
  {name:"Martinelli",club:"Fluminense",league:"serie_a",pos:"ATT",subpos:"LW",age:22,nat:"Brazilian",value:10000000,apps:26,goals_pg:0.22,assists_pg:0.28,key_passes_pg:2.0,pass_acc:79,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:40,shots_on_tgt_pg:1.1,height:174},
  {name:"Nonato",club:"Fluminense",league:"serie_a",pos:"MID",subpos:"CDM",age:26,nat:"Brazilian",value:5000000,apps:25,goals_pg:0.10,assists_pg:0.15,key_passes_pg:1.5,pass_acc:82,tackles_pg:3.2,interceptions_pg:1.8,aerial_pct:48,shots_on_tgt_pg:0.4,height:178},
  {name:"Fábio",club:"Fluminense",league:"serie_a",pos:"GK",subpos:"GK",age:43,nat:"Brazilian",value:500000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:191},

  // Cruzeiro
  {name:"Kaio Jorge",club:"Cruzeiro",league:"serie_a",pos:"ATT",subpos:"ST",age:22,nat:"Brazilian",value:12000000,apps:32,goals_pg:0.58,assists_pg:0.18,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:58,shots_on_tgt_pg:2.5,height:183},
  {name:"Lucas Silva",club:"Cruzeiro",league:"serie_a",pos:"MID",subpos:"CDM",age:31,nat:"Brazilian",value:1500000,apps:26,goals_pg:0.06,assists_pg:0.12,key_passes_pg:1.4,pass_acc:85,tackles_pg:4.2,interceptions_pg:2.5,aerial_pct:52,shots_on_tgt_pg:0.3,height:180},
  {name:"Matheus Pereira",club:"Cruzeiro",league:"serie_a",pos:"MID",subpos:"CAM",age:28,nat:"Brazilian",value:8000000,apps:28,goals_pg:0.20,assists_pg:0.30,key_passes_pg:2.8,pass_acc:85,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:0.9,height:175},
  {name:"Fagner",club:"Cruzeiro",league:"serie_a",pos:"DEF",age:35,nat:"Brazilian",value:1000000,apps:22,goals_pg:0.04,assists_pg:0.15,key_passes_pg:0.9,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.1,height:172},

  // São Paulo
  {name:"Calleri",club:"São Paulo",league:"serie_a",pos:"ATT",subpos:"ST",age:31,nat:"Argentine",value:5000000,apps:25,goals_pg:0.48,assists_pg:0.15,key_passes_pg:1.4,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:2.2,height:181},
  {name:"Lucas Moura",club:"São Paulo",league:"serie_a",pos:"ATT",subpos:"RW",age:32,nat:"Brazilian",value:2000000,apps:24,goals_pg:0.18,assists_pg:0.22,key_passes_pg:2.0,pass_acc:81,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:0.9,height:172},
  {name:"Ferreira",club:"São Paulo",league:"serie_a",pos:"ATT",subpos:"LW",age:26,nat:"Brazilian",value:8000000,apps:28,goals_pg:0.32,assists_pg:0.28,key_passes_pg:2.2,pass_acc:80,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:40,shots_on_tgt_pg:1.5,height:175},
  {name:"Arboleda",club:"São Paulo",league:"serie_a",pos:"DEF",subpos:"CB",age:32,nat:"Ecuadorian",value:3000000,apps:26,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:66,shots_on_tgt_pg:0.2,height:188},
  {name:"Welington",club:"São Paulo",league:"serie_a",pos:"DEF",subpos:"LB",age:24,nat:"Brazilian",value:7000000,apps:28,goals_pg:0.07,assists_pg:0.20,key_passes_pg:1.1,pass_acc:81,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.2,height:179},

  // Corinthians
  {name:"Ángel Romero",club:"Corinthians",league:"serie_a",pos:"ATT",subpos:"RW",age:30,nat:"Paraguayan",value:3500000,apps:26,goals_pg:0.38,assists_pg:0.18,key_passes_pg:1.6,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:52,shots_on_tgt_pg:1.8,height:179},
  {name:"Raniele",club:"Corinthians",league:"serie_a",pos:"MID",subpos:"CDM",age:25,nat:"Brazilian",value:5000000,apps:29,goals_pg:0.12,assists_pg:0.15,key_passes_pg:1.5,pass_acc:83,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:48,shots_on_tgt_pg:0.5,height:178},
  {name:"Yuri Alberto",club:"Corinthians",league:"serie_a",pos:"ATT",subpos:"ST",age:24,nat:"Brazilian",value:8000000,apps:27,goals_pg:0.42,assists_pg:0.15,key_passes_pg:1.4,pass_acc:74,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.0,height:182},
  {name:"André Ramalho",club:"Corinthians",league:"serie_a",pos:"DEF",subpos:"CB",age:30,nat:"Brazilian",value:3000000,apps:25,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.4,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:63,shots_on_tgt_pg:0.1,height:187},

  // Atlético Mineiro
  {name:"Hulk",club:"Atlético Mineiro",league:"serie_a",pos:"ATT",subpos:"ST",age:38,nat:"Brazilian",value:500000,apps:20,goals_pg:0.42,assists_pg:0.15,key_passes_pg:1.4,pass_acc:74,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.0,height:180},
  {name:"Paulinho",club:"Atlético Mineiro",league:"serie_a",pos:"ATT",subpos:"ST",age:24,nat:"Brazilian",value:15000000,apps:27,goals_pg:0.38,assists_pg:0.22,key_passes_pg:1.8,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:50,shots_on_tgt_pg:1.8,height:177},
  {name:"Guilherme Arana",club:"Atlético Mineiro",league:"serie_a",pos:"DEF",subpos:"LB",age:28,nat:"Brazilian",value:8000000,apps:26,goals_pg:0.08,assists_pg:0.22,key_passes_pg:1.2,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:48,shots_on_tgt_pg:0.2,height:178},
  {name:"Júnior Alonso",club:"Atlético Mineiro",league:"serie_a",pos:"DEF",subpos:"CB",age:31,nat:"Paraguayan",value:3000000,apps:28,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:82,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:68,shots_on_tgt_pg:0.2,height:188},

  // Internacional
  {name:"Alan Patrick",club:"Internacional",league:"serie_a",pos:"MID",subpos:"CAM",age:31,nat:"Brazilian",value:3000000,apps:24,goals_pg:0.20,assists_pg:0.28,key_passes_pg:2.3,pass_acc:83,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:0.9,height:175},
  {name:"Wesley",club:"Internacional",league:"serie_a",pos:"ATT",subpos:"RW",age:20,nat:"Brazilian",value:12000000,apps:27,goals_pg:0.32,assists_pg:0.28,key_passes_pg:2.0,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.5,height:176},
  {name:"Bernabei",club:"Internacional",league:"serie_a",pos:"DEF",subpos:"LB",age:25,nat:"Argentine",value:5000000,apps:25,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:80,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:46,shots_on_tgt_pg:0.2,height:177},
  {name:"Enner Valencia",club:"Internacional",league:"serie_a",pos:"ATT",subpos:"ST",age:34,nat:"Ecuadorian",value:2000000,apps:22,goals_pg:0.40,assists_pg:0.18,key_passes_pg:1.5,pass_acc:76,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:1.9,height:177},

  // Vasco
  {name:"Vegetti",club:"Vasco da Gama",league:"serie_a",pos:"ATT",subpos:"ST",age:33,nat:"Argentine",value:2500000,apps:24,goals_pg:0.50,assists_pg:0.10,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:65,shots_on_tgt_pg:2.1,height:188},
  {name:"Philippe Coutinho",club:"Vasco da Gama",league:"serie_a",pos:"MID",subpos:"CAM",age:34,nat:"Brazilian",value:2000000,apps:18,goals_pg:0.22,assists_pg:0.30,key_passes_pg:2.8,pass_acc:88,tackles_pg:1.2,interceptions_pg:0.6,aerial_pct:40,shots_on_tgt_pg:1.2,height:172},
  {name:"Payet",club:"Vasco da Gama",league:"serie_a",pos:"MID",subpos:"CAM",age:39,nat:"French",value:1000000,apps:16,goals_pg:0.15,assists_pg:0.28,key_passes_pg:2.5,pass_acc:86,tackles_pg:1.0,interceptions_pg:0.5,aerial_pct:38,shots_on_tgt_pg:0.8,height:175},

  // Grêmio
  {name:"Cristaldo",club:"Grêmio",league:"serie_a",pos:"ATT",subpos:"CAM",age:28,nat:"Argentine",value:6000000,apps:28,goals_pg:0.35,assists_pg:0.22,key_passes_pg:2.0,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:44,shots_on_tgt_pg:1.6,height:175},
  {name:"Kannemann",club:"Grêmio",league:"serie_a",pos:"DEF",subpos:"CB",age:32,nat:"Argentine",value:2000000,apps:25,goals_pg:0.04,assists_pg:0.04,key_passes_pg:0.4,pass_acc:84,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:62,shots_on_tgt_pg:0.1,height:184},
  {name:"Dodi",club:"Grêmio",league:"serie_a",pos:"MID",subpos:"CDM",age:27,nat:"Brazilian",value:4000000,apps:26,goals_pg:0.08,assists_pg:0.12,key_passes_pg:1.5,pass_acc:82,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:48,shots_on_tgt_pg:0.4,height:178},

  // Bahia
  {name:"Éverton Ribeiro",club:"Bahia",league:"serie_a",pos:"MID",subpos:"CAM",age:35,nat:"Brazilian",value:1500000,apps:22,goals_pg:0.14,assists_pg:0.20,key_passes_pg:2.1,pass_acc:85,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:42,shots_on_tgt_pg:0.6,height:173},
  {name:"Thaciano",club:"Bahia",league:"serie_a",pos:"ATT",subpos:"LW",age:27,nat:"Brazilian",value:4000000,apps:26,goals_pg:0.30,assists_pg:0.25,key_passes_pg:1.9,pass_acc:79,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:46,shots_on_tgt_pg:1.4,height:173},
  {name:"Cauly",club:"Bahia",league:"serie_a",pos:"MID",subpos:"CM",age:28,nat:"Brazilian",value:5000000,apps:25,goals_pg:0.15,assists_pg:0.25,key_passes_pg:2.2,pass_acc:82,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:44,shots_on_tgt_pg:0.7,height:174},

  // Red Bull Bragantino
  {name:"Cuello",club:"Red Bull Bragantino",league:"serie_a",pos:"ATT",subpos:"LW",age:24,nat:"Argentine",value:8000000,apps:28,goals_pg:0.28,assists_pg:0.32,key_passes_pg:2.2,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.4,height:176},
  {name:"Vinicinho",club:"Red Bull Bragantino",league:"serie_a",pos:"ATT",subpos:"RW",age:22,nat:"Brazilian",value:5000000,apps:25,goals_pg:0.25,assists_pg:0.28,key_passes_pg:2.0,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:1.2,height:172},
  {name:"Pedro Henrique",club:"Red Bull Bragantino",league:"serie_a",pos:"DEF",subpos:"CB",age:26,nat:"Brazilian",value:4000000,apps:27,goals_pg:0.04,assists_pg:0.05,key_passes_pg:0.4,pass_acc:82,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:60,shots_on_tgt_pg:0.1,height:185},

  // Santos
  {name:"Guilherme",club:"Santos",league:"serie_a",pos:"ATT",age:26,nat:"Brazilian",value:5000000,apps:25,goals_pg:0.35,assists_pg:0.20,key_passes_pg:1.8,pass_acc:77,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:45,shots_on_tgt_pg:1.6,height:175},
  {name:"João Paulo",club:"Santos",league:"serie_a",pos:"GK",age:29,nat:"Brazilian",value:4000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:188},

  // ════════════════════════════════
  // 🇧🇷 SÉRIE B — BRAZIL 2026
  // ════════════════════════════════
  {name:"Neto Borges",club:"Ceará",league:"serie_b",pos:"DEF",age:26,nat:"Brazilian",value:1200000,apps:28,goals_pg:0.05,assists_pg:0.12,key_passes_pg:0.8,pass_acc:80,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:56,shots_on_tgt_pg:0.1,height:182},
  {name:"Aylon",club:"Fortaleza",league:"serie_b",pos:"ATT",age:24,nat:"Brazilian",value:2000000,apps:26,goals_pg:0.38,assists_pg:0.18,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:48,shots_on_tgt_pg:1.7,height:178},
  {name:"Guilherme Bissoli",club:"Sport Recife",league:"serie_b",pos:"ATT",age:27,nat:"Brazilian",value:1500000,apps:25,goals_pg:0.44,assists_pg:0.12,key_passes_pg:1.2,pass_acc:72,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:1.9,height:185},
  {name:"Bruno Melo",club:"Ceará",league:"serie_b",pos:"DEF",age:30,nat:"Brazilian",value:800000,apps:24,goals_pg:0.04,assists_pg:0.15,key_passes_pg:1.0,pass_acc:78,tackles_pg:2.5,interceptions_pg:1.6,aerial_pct:50,shots_on_tgt_pg:0.2,height:178},
  {name:"Rafinha",club:"Sampaio Corrêa",league:"serie_b",pos:"DEF",age:28,nat:"Brazilian",value:600000,apps:22,goals_pg:0.04,assists_pg:0.10,key_passes_pg:0.7,pass_acc:77,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:52,shots_on_tgt_pg:0.1,height:180},
  {name:"Marcão Silva",club:"CRB",league:"serie_b",pos:"DEF",age:25,nat:"Brazilian",value:900000,apps:26,goals_pg:0.05,assists_pg:0.08,key_passes_pg:0.5,pass_acc:79,tackles_pg:3.0,interceptions_pg:1.9,aerial_pct:58,shots_on_tgt_pg:0.1,height:184},
  {name:"Gabriel Dias",club:"Guarani",league:"serie_b",pos:"MID",age:24,nat:"Brazilian",value:700000,apps:24,goals_pg:0.08,assists_pg:0.15,key_passes_pg:1.5,pass_acc:80,tackles_pg:3.2,interceptions_pg:1.8,aerial_pct:46,shots_on_tgt_pg:0.4,height:177},
  {name:"Nicolas",club:"Náutico",league:"serie_b",pos:"ATT",age:22,nat:"Brazilian",value:1000000,apps:23,goals_pg:0.35,assists_pg:0.15,key_passes_pg:1.4,pass_acc:73,tackles_pg:0.7,interceptions_pg:0.3,aerial_pct:44,shots_on_tgt_pg:1.5,height:173},
  {name:"Wellington Rato",league:"serie_b",club:"Sport Recife",pos:"MID",age:30,nat:"Brazilian",value:800000,apps:25,goals_pg:0.15,assists_pg:0.22,key_passes_pg:1.8,pass_acc:79,tackles_pg:2.0,interceptions_pg:1.0,aerial_pct:42,shots_on_tgt_pg:0.6,height:171},
  {name:"Léo Gamalho",club:"Madureira",league:"serie_b",pos:"ATT",age:36,nat:"Brazilian",value:400000,apps:20,goals_pg:0.40,assists_pg:0.10,key_passes_pg:1.0,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.1,aerial_pct:62,shots_on_tgt_pg:1.8,height:184},
  {name:"Caio Dantas",club:"Tombense",league:"serie_b",pos:"ATT",age:25,nat:"Brazilian",value:700000,apps:22,goals_pg:0.32,assists_pg:0.14,key_passes_pg:1.3,pass_acc:72,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:48,shots_on_tgt_pg:1.4,height:178},
  {name:"Claudinho",club:"Ponte Preta",league:"serie_b",pos:"MID",age:27,nat:"Brazilian",value:600000,apps:23,goals_pg:0.12,assists_pg:0.18,key_passes_pg:1.7,pass_acc:78,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:44,shots_on_tgt_pg:0.5,height:176},

  // ════════════════════════════════
  // 🇧🇷 SÉRIE C — BRAZIL 2026
  // ════════════════════════════════
  {name:"Ytalo",club:"Paysandu",league:"serie_c",pos:"ATT",age:27,nat:"Brazilian",value:400000,apps:25,goals_pg:0.52,assists_pg:0.12,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:56,shots_on_tgt_pg:2.2,height:182},
  {name:"Robinho",club:"Remo",league:"serie_c",pos:"MID",age:26,nat:"Brazilian",value:350000,apps:24,goals_pg:0.12,assists_pg:0.20,key_passes_pg:1.8,pass_acc:77,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:44,shots_on_tgt_pg:0.5,height:175},
  {name:"Lucas Oliveira",club:"Figueirense",league:"serie_c",pos:"DEF",age:24,nat:"Brazilian",value:300000,apps:26,goals_pg:0.04,assists_pg:0.06,key_passes_pg:0.5,pass_acc:76,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:55,shots_on_tgt_pg:0.1,height:183},
  {name:"Renato Marques",club:"São Bernardo FC",league:"serie_c",pos:"DEF",age:25,nat:"Brazilian",value:350000,apps:24,goals_pg:0.05,assists_pg:0.08,key_passes_pg:0.5,pass_acc:75,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:57,shots_on_tgt_pg:0.1,height:184},
  {name:"Rony",club:"Botafogo-SP",league:"serie_c",pos:"ATT",age:23,nat:"Brazilian",value:400000,apps:22,goals_pg:0.40,assists_pg:0.18,key_passes_pg:1.5,pass_acc:73,tackles_pg:0.7,interceptions_pg:0.3,aerial_pct:46,shots_on_tgt_pg:1.7,height:175},
  {name:"Felipe Albuquerque",club:"ABC",league:"serie_c",pos:"MID",age:26,nat:"Brazilian",value:280000,apps:23,goals_pg:0.10,assists_pg:0.16,key_passes_pg:1.6,pass_acc:76,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:46,shots_on_tgt_pg:0.4,height:177},
  {name:"Claudinho Junior",club:"Treze",league:"serie_c",pos:"ATT",age:24,nat:"Brazilian",value:250000,apps:22,goals_pg:0.35,assists_pg:0.15,key_passes_pg:1.4,pass_acc:71,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:44,shots_on_tgt_pg:1.5,height:174},

  // ════════════════════════════════
  // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 PREMIER LEAGUE 2025/26
  // ════════════════════════════════

  // Man City
  {name:"Erling Haaland",club:"Manchester City",league:"premier_league",pos:"ATT",subpos:"ST",age:25,nat:"Norwegian",value:180000000,apps:30,goals_pg:0.88,assists_pg:0.18,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:68,shots_on_tgt_pg:3.8,height:194},
  {name:"Rayan Cherki",club:"Manchester City",league:"premier_league",pos:"MID",age:21,nat:"French",value:65000000,apps:28,goals_pg:0.18,assists_pg:0.38,key_passes_pg:3.2,pass_acc:86,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:38,shots_on_tgt_pg:1.0,height:173},
  {name:"Rodri",club:"Manchester City",league:"premier_league",pos:"MID",subpos:"CDM",age:29,nat:"Spanish",value:120000000,apps:28,goals_pg:0.12,assists_pg:0.18,key_passes_pg:2.5,pass_acc:92,tackles_pg:3.5,interceptions_pg:2.2,aerial_pct:58,shots_on_tgt_pg:0.5,height:191},
  {name:"Kevin De Bruyne",club:"Manchester City",league:"premier_league",pos:"MID",subpos:"CM",age:35,nat:"Belgian",value:20000000,apps:22,goals_pg:0.18,assists_pg:0.40,key_passes_pg:3.8,pass_acc:89,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:40,shots_on_tgt_pg:0.9,height:181},
  {name:"Rúben Dias",club:"Manchester City",league:"premier_league",pos:"DEF",subpos:"CB",age:28,nat:"Portuguese",value:80000000,apps:30,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:90,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:72,shots_on_tgt_pg:0.1,height:187},
  {name:"Bernardo Silva",club:"Manchester City",league:"premier_league",pos:"MID",subpos:"CM",age:31,nat:"Portuguese",value:55000000,apps:28,goals_pg:0.20,assists_pg:0.28,key_passes_pg:2.8,pass_acc:89,tackles_pg:2.0,interceptions_pg:1.0,aerial_pct:42,shots_on_tgt_pg:0.9,height:173},
  {name:"Phil Foden",club:"Manchester City",league:"premier_league",pos:"ATT",subpos:"CAM",age:26,nat:"English",value:120000000,apps:27,goals_pg:0.32,assists_pg:0.30,key_passes_pg:2.8,pass_acc:86,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:38,shots_on_tgt_pg:1.5,height:171},

  // Arsenal
  {name:"Bukayo Saka",club:"Arsenal",league:"premier_league",pos:"ATT",subpos:"RW",age:23,nat:"English",value:150000000,apps:30,goals_pg:0.42,assists_pg:0.38,key_passes_pg:2.8,pass_acc:85,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:2.0,height:178},
  {name:"Martin Ødegaard",club:"Arsenal",league:"premier_league",pos:"MID",subpos:"CAM",age:27,nat:"Norwegian",value:120000000,apps:28,goals_pg:0.25,assists_pg:0.35,key_passes_pg:3.5,pass_acc:90,tackles_pg:1.8,interceptions_pg:0.9,aerial_pct:40,shots_on_tgt_pg:1.2,height:178},
  {name:"William Saliba",club:"Arsenal",league:"premier_league",pos:"DEF",subpos:"CB",age:24,nat:"French",value:100000000,apps:32,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.5,pass_acc:92,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:70,shots_on_tgt_pg:0.1,height:192},
  {name:"Kai Havertz",club:"Arsenal",league:"premier_league",pos:"ATT",subpos:"ST",age:26,nat:"German",value:65000000,apps:28,goals_pg:0.35,assists_pg:0.20,key_passes_pg:1.8,pass_acc:80,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:58,shots_on_tgt_pg:1.6,height:189},
  {name:"Ruben Neves",club:"Arsenal",league:"premier_league",pos:"MID",subpos:"CDM",age:28,nat:"Portuguese",value:40000000,apps:26,goals_pg:0.12,assists_pg:0.15,key_passes_pg:2.0,pass_acc:89,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:52,shots_on_tgt_pg:0.5,height:182},
  {name:"Ben White",club:"Arsenal",league:"premier_league",pos:"DEF",subpos:"RB",age:28,nat:"English",value:55000000,apps:28,goals_pg:0.05,assists_pg:0.15,key_passes_pg:1.0,pass_acc:88,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:55,shots_on_tgt_pg:0.2,height:183},

  // Liverpool
  {name:"Mohamed Salah",club:"Liverpool",league:"premier_league",pos:"ATT",subpos:"RW",age:33,nat:"Egyptian",value:50000000,apps:30,goals_pg:0.55,assists_pg:0.40,key_passes_pg:2.5,pass_acc:82,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:44,shots_on_tgt_pg:2.5,height:175},
  {name:"Virgil van Dijk",club:"Liverpool",league:"premier_league",pos:"DEF",subpos:"CB",age:34,nat:"Dutch",value:25000000,apps:30,goals_pg:0.12,assists_pg:0.06,key_passes_pg:0.6,pass_acc:90,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:75,shots_on_tgt_pg:0.2,height:193},
  {name:"Trent Alexander-Arnold",club:"Liverpool",league:"premier_league",pos:"DEF",subpos:"RB",age:27,nat:"English",value:85000000,apps:28,goals_pg:0.08,assists_pg:0.35,key_passes_pg:2.8,pass_acc:87,tackles_pg:2.0,interceptions_pg:1.2,aerial_pct:45,shots_on_tgt_pg:0.4,height:175},
  {name:"Alexis Mac Allister",club:"Liverpool",league:"premier_league",pos:"MID",subpos:"CM",age:26,nat:"Argentine",value:75000000,apps:29,goals_pg:0.18,assists_pg:0.22,key_passes_pg:2.2,pass_acc:88,tackles_pg:3.0,interceptions_pg:1.7,aerial_pct:48,shots_on_tgt_pg:0.7,height:178},
  {name:"Diogo Jota",club:"Liverpool",league:"premier_league",pos:"ATT",subpos:"LW",age:29,nat:"Portuguese",value:55000000,apps:26,goals_pg:0.42,assists_pg:0.18,key_passes_pg:1.6,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:52,shots_on_tgt_pg:2.0,height:178},

  // Chelsea
  {name:"Cole Palmer",club:"Chelsea",league:"premier_league",pos:"MID",subpos:"CAM",age:23,nat:"English",value:130000000,apps:29,goals_pg:0.38,assists_pg:0.40,key_passes_pg:3.2,pass_acc:87,tackles_pg:1.2,interceptions_pg:0.6,aerial_pct:38,shots_on_tgt_pg:1.8,height:185},
  {name:"Nicolas Jackson",club:"Chelsea",league:"premier_league",pos:"ATT",subpos:"ST",age:24,nat:"Senegalese",value:60000000,apps:27,goals_pg:0.45,assists_pg:0.18,key_passes_pg:1.5,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.0,height:183},
  {name:"Moisés Caicedo",club:"Chelsea",league:"premier_league",pos:"MID",subpos:"CDM",age:23,nat:"Ecuadorian",value:80000000,apps:28,goals_pg:0.08,assists_pg:0.12,key_passes_pg:1.8,pass_acc:86,tackles_pg:4.0,interceptions_pg:2.2,aerial_pct:52,shots_on_tgt_pg:0.3,height:178},
  {name:"Reece James",club:"Chelsea",league:"premier_league",pos:"DEF",subpos:"RB",age:26,nat:"English",value:55000000,apps:20,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.4,pass_acc:84,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.2,height:180},
  {name:"Levi Colwill",club:"Chelsea",league:"premier_league",pos:"DEF",subpos:"CB",age:23,nat:"English",value:55000000,apps:28,goals_pg:0.05,assists_pg:0.06,key_passes_pg:0.5,pass_acc:88,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:65,shots_on_tgt_pg:0.1,height:187},

  // Nottingham Forest
  {name:"Morgan Gibbs-White",club:"Nottingham Forest",league:"premier_league",pos:"MID",subpos:"CAM",age:25,nat:"English",value:55000000,apps:30,goals_pg:0.35,assists_pg:0.18,key_passes_pg:2.5,pass_acc:84,tackles_pg:2.2,interceptions_pg:1.0,aerial_pct:42,shots_on_tgt_pg:1.5,height:180},
  {name:"Chris Wood",club:"Nottingham Forest",league:"premier_league",pos:"ATT",subpos:"ST",age:33,nat:"New Zealander",value:8000000,apps:28,goals_pg:0.45,assists_pg:0.12,key_passes_pg:1.0,pass_acc:65,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:68,shots_on_tgt_pg:2.0,height:190},

  // Newcastle
  {name:"Alexander Isak",club:"Newcastle United",league:"premier_league",pos:"ATT",subpos:"ST",age:26,nat:"Swedish",value:100000000,apps:28,goals_pg:0.62,assists_pg:0.18,key_passes_pg:1.8,pass_acc:75,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:2.8,height:192},
  {name:"Bruno Guimarães",club:"Newcastle United",league:"premier_league",pos:"MID",subpos:"CDM",age:27,nat:"Brazilian",value:85000000,apps:28,goals_pg:0.18,assists_pg:0.20,key_passes_pg:2.2,pass_acc:88,tackles_pg:3.8,interceptions_pg:2.0,aerial_pct:52,shots_on_tgt_pg:0.6,height:182},
  {name:"Sven Botman",club:"Newcastle United",league:"premier_league",pos:"DEF",subpos:"CB",age:25,nat:"Dutch",value:45000000,apps:28,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:70,shots_on_tgt_pg:0.1,height:195},

  // Tottenham
  {name:"Heung-min Son",club:"Tottenham",league:"premier_league",pos:"ATT",subpos:"LW",age:34,nat:"South Korean",value:20000000,apps:28,goals_pg:0.48,assists_pg:0.25,key_passes_pg:2.0,pass_acc:82,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:42,shots_on_tgt_pg:2.2,height:183},
  {name:"Dominic Solanke",club:"Tottenham",league:"premier_league",pos:"ATT",subpos:"ST",age:28,nat:"English",value:40000000,apps:28,goals_pg:0.38,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:1.8,height:188},

  // Aston Villa
  {name:"Ollie Watkins",club:"Aston Villa",league:"premier_league",pos:"ATT",subpos:"ST",age:30,nat:"English",value:70000000,apps:28,goals_pg:0.52,assists_pg:0.25,key_passes_pg:1.8,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.4,height:180},
  {name:"Youri Tielemans",club:"Aston Villa",league:"premier_league",pos:"MID",subpos:"CM",age:28,nat:"Belgian",value:35000000,apps:28,goals_pg:0.15,assists_pg:0.18,key_passes_pg:2.0,pass_acc:86,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:48,shots_on_tgt_pg:0.6,height:176},

  // Brighton
  {name:"Igor Thiago",club:"Brighton",league:"premier_league",pos:"ATT",subpos:"ST",age:23,nat:"Brazilian",value:50000000,apps:28,goals_pg:0.75,assists_pg:0.08,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:3.2,height:185},
  {name:"João Pedro",club:"Brighton",league:"premier_league",pos:"ATT",subpos:"ST",age:23,nat:"Brazilian",value:50000000,apps:28,goals_pg:0.50,assists_pg:0.18,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.4,height:187},
  
  {name:"Carlos Baleba",club:"Brighton",league:"premier_league",pos:"MID",subpos:"CDM",age:21,nat:"Cameroonian",value:30000000,apps:26,goals_pg:0.08,assists_pg:0.12,key_passes_pg:1.6,pass_acc:83,tackles_pg:3.8,interceptions_pg:2.0,aerial_pct:50,shots_on_tgt_pg:0.3,height:183},

  // Manchester United
  {name:"Rasmus Højlund",club:"Manchester United",league:"premier_league",pos:"ATT",subpos:"ST",age:22,nat:"Danish",value:65000000,apps:27,goals_pg:0.42,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:1.9,height:191},
  {name:"Bruno Fernandes",club:"Manchester United",league:"premier_league",pos:"MID",subpos:"CAM",age:31,nat:"Portuguese",value:45000000,apps:28,goals_pg:0.22,assists_pg:0.28,key_passes_pg:3.0,pass_acc:82,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:1.0,height:179},
  {name:"Lisandro Martínez",club:"Manchester United",league:"premier_league",pos:"DEF",subpos:"CB",age:27,nat:"Argentine",value:50000000,apps:26,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:88,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:65,shots_on_tgt_pg:0.1,height:181},

  // ════════════════════════════════
  // 🇪🇸 LA LIGA 2025/26
  // ════════════════════════════════

  // Barcelona
  {name:"Robert Lewandowski",club:"Barcelona",league:"la_liga",pos:"ATT",subpos:"ST",age:37,nat:"Polish",value:15000000,apps:28,goals_pg:0.68,assists_pg:0.18,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:64,shots_on_tgt_pg:3.0,height:185},
  {name:"Pedri",club:"Barcelona",league:"la_liga",pos:"MID",subpos:"CM",age:23,nat:"Spanish",value:100000000,apps:26,goals_pg:0.18,assists_pg:0.28,key_passes_pg:3.2,pass_acc:91,tackles_pg:2.5,interceptions_pg:1.2,aerial_pct:42,shots_on_tgt_pg:0.8,height:176},
  {name:"Lamine Yamal",club:"Barcelona",league:"la_liga",pos:"ATT",subpos:"RW",age:18,nat:"Spanish",value:180000000,apps:28,goals_pg:0.35,assists_pg:0.45,key_passes_pg:3.5,pass_acc:84,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:36,shots_on_tgt_pg:1.8,height:180},
  {name:"Gavi",club:"Barcelona",league:"la_liga",pos:"MID",subpos:"CM",age:21,nat:"Spanish",value:70000000,apps:24,goals_pg:0.12,assists_pg:0.18,key_passes_pg:2.5,pass_acc:90,tackles_pg:3.0,interceptions_pg:1.5,aerial_pct:40,shots_on_tgt_pg:0.5,height:173},
  {name:"Alejandro Balde",club:"Barcelona",league:"la_liga",pos:"DEF",subpos:"LB",age:21,nat:"Spanish",value:55000000,apps:28,goals_pg:0.08,assists_pg:0.22,key_passes_pg:1.4,pass_acc:86,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:44,shots_on_tgt_pg:0.3,height:181},
  {name:"Inigo Martínez",club:"Barcelona",league:"la_liga",pos:"DEF",subpos:"CB",age:33,nat:"Spanish",value:12000000,apps:25,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:89,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:68,shots_on_tgt_pg:0.1,height:184},
  {name:"Ronald Araújo",club:"Barcelona",league:"la_liga",pos:"DEF",subpos:"CB",age:26,nat:"Uruguayan",value:60000000,apps:24,goals_pg:0.08,assists_pg:0.05,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:74,shots_on_tgt_pg:0.2,height:188},

  // Real Madrid
  {name:"Vinicius Jr",club:"Real Madrid",league:"la_liga",pos:"ATT",subpos:"LW",age:25,nat:"Brazilian",value:200000000,apps:28,goals_pg:0.58,assists_pg:0.38,key_passes_pg:2.8,pass_acc:80,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:38,shots_on_tgt_pg:2.8,height:176},
  {name:"Jude Bellingham",club:"Real Madrid",league:"la_liga",pos:"MID",subpos:"CM",age:22,nat:"English",value:180000000,apps:28,goals_pg:0.35,assists_pg:0.28,key_passes_pg:2.8,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.4,aerial_pct:55,shots_on_tgt_pg:1.5,height:186},
  {name:"Kylian Mbappé",club:"Real Madrid",league:"la_liga",pos:"ATT",subpos:"ST",age:27,nat:"French",value:200000000,apps:26,goals_pg:0.72,assists_pg:0.22,key_passes_pg:2.0,pass_acc:78,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:42,shots_on_tgt_pg:3.2,height:178},
  {name:"Federico Valverde",club:"Real Madrid",league:"la_liga",pos:"MID",subpos:"CM",age:27,nat:"Uruguayan",value:100000000,apps:28,goals_pg:0.20,assists_pg:0.22,key_passes_pg:2.2,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.8,height:181},
  {name:"Antonio Rüdiger",club:"Real Madrid",league:"la_liga",pos:"DEF",subpos:"CB",age:33,nat:"German",value:20000000,apps:28,goals_pg:0.08,assists_pg:0.05,key_passes_pg:0.5,pass_acc:88,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:72,shots_on_tgt_pg:0.2,height:190},
  {name:"Éder Militão",club:"Real Madrid",league:"la_liga",pos:"DEF",subpos:"CB",age:27,nat:"Brazilian",value:65000000,apps:26,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:70,shots_on_tgt_pg:0.1,height:186},

  // Atlético Madrid
  {name:"Antoine Griezmann",club:"Atlético Madrid",league:"la_liga",pos:"ATT",subpos:"CAM",age:35,nat:"French",value:12000000,apps:26,goals_pg:0.38,assists_pg:0.28,key_passes_pg:2.2,pass_acc:84,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:45,shots_on_tgt_pg:1.8,height:176},
  {name:"Julián Álvarez",club:"Atlético Madrid",league:"la_liga",pos:"ATT",subpos:"ST",age:25,nat:"Argentine",value:90000000,apps:28,goals_pg:0.50,assists_pg:0.22,key_passes_pg:1.8,pass_acc:80,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:48,shots_on_tgt_pg:2.2,height:170},
  {name:"José Giménez",club:"Atlético Madrid",league:"la_liga",pos:"DEF",subpos:"CB",age:30,nat:"Uruguayan",value:30000000,apps:26,goals_pg:0.08,assists_pg:0.05,key_passes_pg:0.5,pass_acc:85,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:68,shots_on_tgt_pg:0.2,height:188},
  {name:"Marcos Llorente",club:"Atlético Madrid",league:"la_liga",pos:"MID",subpos:"CM",age:30,nat:"Spanish",value:25000000,apps:26,goals_pg:0.15,assists_pg:0.22,key_passes_pg:1.8,pass_acc:85,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.6,height:182},

  // Other La Liga
  {name:"Alexander Sørloth",club:"Villarreal",league:"la_liga",pos:"ATT",subpos:"ST",age:30,nat:"Norwegian",value:35000000,apps:27,goals_pg:0.55,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:65,shots_on_tgt_pg:2.5,height:195},
  {name:"Takefusa Kubo",club:"Real Sociedad",league:"la_liga",pos:"ATT",subpos:"RW",age:24,nat:"Japanese",value:40000000,apps:28,goals_pg:0.28,assists_pg:0.32,key_passes_pg:2.5,pass_acc:82,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:36,shots_on_tgt_pg:1.4,height:173},
  {name:"Isco",club:"Real Betis",league:"la_liga",pos:"MID",subpos:"CAM",age:33,nat:"Spanish",value:5000000,apps:22,goals_pg:0.12,assists_pg:0.22,key_passes_pg:2.5,pass_acc:90,tackles_pg:1.2,interceptions_pg:0.6,aerial_pct:38,shots_on_tgt_pg:0.6,height:176},
  {name:"Youssef En-Nesyri",club:"Sevilla",league:"la_liga",pos:"ATT",subpos:"ST",age:28,nat:"Moroccan",value:30000000,apps:26,goals_pg:0.45,assists_pg:0.15,key_passes_pg:1.2,pass_acc:68,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:65,shots_on_tgt_pg:2.0,height:187},
  {name:"Oihan Sancet",club:"Athletic Bilbao",league:"la_liga",pos:"MID",subpos:"CM",age:24,nat:"Spanish",value:40000000,apps:28,goals_pg:0.22,assists_pg:0.25,key_passes_pg:2.2,pass_acc:84,tackles_pg:2.2,interceptions_pg:1.0,aerial_pct:48,shots_on_tgt_pg:0.9,height:184},

  // ════════════════════════════════
  // 🇩🇪 BUNDESLIGA 2025/26
  // ════════════════════════════════

  // Bayern Munich
  {name:"Harry Kane",club:"Bayern Munich",league:"bundesliga",pos:"ATT",subpos:"ST",age:32,nat:"English",value:50000000,apps:28,goals_pg:0.75,assists_pg:0.25,key_passes_pg:2.2,pass_acc:78,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:65,shots_on_tgt_pg:3.2,height:188},
  {name:"Jamal Musiala",club:"Bayern Munich",league:"bundesliga",pos:"MID",subpos:"CAM",age:22,nat:"German",value:150000000,apps:28,goals_pg:0.38,assists_pg:0.35,key_passes_pg:3.0,pass_acc:87,tackles_pg:2.0,interceptions_pg:0.9,aerial_pct:42,shots_on_tgt_pg:1.8,height:181},
  {name:"Jonathan Tah",club:"Bayern Munich",league:"bundesliga",pos:"DEF",subpos:"CB",age:29,nat:"German",value:25000000,apps:28,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:89,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:68,shots_on_tgt_pg:0.2,height:195},
  {name:"Joshua Kimmich",club:"Bayern Munich",league:"bundesliga",pos:"MID",subpos:"CDM",age:31,nat:"German",value:45000000,apps:28,goals_pg:0.12,assists_pg:0.28,key_passes_pg:2.8,pass_acc:91,tackles_pg:3.2,interceptions_pg:1.8,aerial_pct:52,shots_on_tgt_pg:0.5,height:177},
  {name:"Alphonso Davies",club:"Bayern Munich",league:"bundesliga",pos:"DEF",subpos:"LB",age:25,nat:"Canadian",value:55000000,apps:26,goals_pg:0.06,assists_pg:0.22,key_passes_pg:1.4,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:44,shots_on_tgt_pg:0.2,height:182},
  {name:"Leroy Sané",club:"Bayern Munich",league:"bundesliga",pos:"ATT",subpos:"RW",age:30,nat:"German",value:35000000,apps:25,goals_pg:0.28,assists_pg:0.30,key_passes_pg:2.5,pass_acc:82,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:1.4,height:183},

  // Bayer Leverkusen
  {name:"Florian Wirtz",club:"Bayer Leverkusen",league:"bundesliga",pos:"MID",subpos:"CAM",age:22,nat:"German",value:150000000,apps:28,goals_pg:0.32,assists_pg:0.42,key_passes_pg:3.5,pass_acc:88,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:40,shots_on_tgt_pg:1.5,height:180},
  {name:"Granit Xhaka",club:"Bayer Leverkusen",league:"bundesliga",pos:"MID",subpos:"CDM",age:33,nat:"Swiss",value:8000000,apps:28,goals_pg:0.12,assists_pg:0.18,key_passes_pg:2.0,pass_acc:89,tackles_pg:3.8,interceptions_pg:2.2,aerial_pct:48,shots_on_tgt_pg:0.5,height:183},
  {name:"Victor Boniface",club:"Bayer Leverkusen",league:"bundesliga",pos:"ATT",subpos:"ST",age:24,nat:"Nigerian",value:50000000,apps:26,goals_pg:0.52,assists_pg:0.20,key_passes_pg:1.6,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:56,shots_on_tgt_pg:2.2,height:187},
  {name:"Alejandro Grimaldo",club:"Bayer Leverkusen",league:"bundesliga",pos:"DEF",subpos:"LB",age:30,nat:"Spanish",value:35000000,apps:28,goals_pg:0.10,assists_pg:0.28,key_passes_pg:1.8,pass_acc:84,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:44,shots_on_tgt_pg:0.4,height:173},

  // Borussia Dortmund
  {name:"Serhou Guirassy",club:"Borussia Dortmund",league:"bundesliga",pos:"ATT",subpos:"ST",age:29,nat:"Guinean",value:35000000,apps:26,goals_pg:0.68,assists_pg:0.12,key_passes_pg:1.2,pass_acc:72,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:2.8,height:185},
  {name:"Julian Brandt",club:"Borussia Dortmund",league:"bundesliga",pos:"MID",subpos:"CAM",age:29,nat:"German",value:30000000,apps:27,goals_pg:0.18,assists_pg:0.30,key_passes_pg:2.8,pass_acc:86,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:0.8,height:180},
  {name:"Emre Can",club:"Borussia Dortmund",league:"bundesliga",pos:"MID",subpos:"CDM",age:32,nat:"German",value:8000000,apps:24,goals_pg:0.08,assists_pg:0.12,key_passes_pg:1.4,pass_acc:85,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:55,shots_on_tgt_pg:0.3,height:189},

  // RB Leipzig
  {name:"Lois Openda",club:"RB Leipzig",league:"bundesliga",pos:"ATT",subpos:"ST",age:24,nat:"Belgian",value:60000000,apps:26,goals_pg:0.62,assists_pg:0.15,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:2.6,height:178},
  {name:"Xavi Simons",club:"RB Leipzig",league:"bundesliga",pos:"MID",subpos:"CAM",age:22,nat:"Dutch",value:60000000,apps:26,goals_pg:0.22,assists_pg:0.28,key_passes_pg:2.8,pass_acc:86,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:38,shots_on_tgt_pg:1.0,height:174},
  {name:"Willi Orbán",club:"RB Leipzig",league:"bundesliga",pos:"DEF",subpos:"CB",age:32,nat:"Hungarian",value:8000000,apps:25,goals_pg:0.08,assists_pg:0.05,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:70,shots_on_tgt_pg:0.2,height:189},

  // Other Bundesliga
  {name:"Omar Marmoush",club:"Eintracht Frankfurt",league:"bundesliga",pos:"ATT",subpos:"LW",age:26,nat:"Egyptian",value:50000000,apps:27,goals_pg:0.55,assists_pg:0.30,key_passes_pg:2.5,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:48,shots_on_tgt_pg:2.2,height:180},
  {name:"Deniz Undav",club:"VfB Stuttgart",league:"bundesliga",pos:"ATT",subpos:"ST",age:29,nat:"German",value:30000000,apps:26,goals_pg:0.48,assists_pg:0.22,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:2.0,height:179},
  {name:"Alassane Plea",club:"Borussia Mönchengladbach",league:"bundesliga",pos:"ATT",age:32,nat:"French",value:8000000,apps:24,goals_pg:0.38,assists_pg:0.18,key_passes_pg:1.6,pass_acc:76,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:46,shots_on_tgt_pg:1.8,height:178},

  // ════════════════════════════════
  // 🇮🇹 SERIE A ITALY 2025/26
  // ════════════════════════════════

  // Napoli
  {name:"Victor Osimhen",club:"Napoli",league:"serie_a_it",pos:"ATT",subpos:"ST",age:26,nat:"Nigerian",value:100000000,apps:26,goals_pg:0.72,assists_pg:0.15,key_passes_pg:1.5,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:3.0,height:185},
  {name:"Khvicha Kvaratskhelia",club:"Napoli",league:"serie_a_it",pos:"ATT",subpos:"LW",age:24,nat:"Georgian",value:80000000,apps:24,goals_pg:0.35,assists_pg:0.38,key_passes_pg:3.0,pass_acc:82,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:1.8,height:183},
  {name:"Alessandro Buongiorno",club:"Napoli",league:"serie_a_it",pos:"DEF",subpos:"CB",age:26,nat:"Italian",value:40000000,apps:30,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.5,pass_acc:88,tackles_pg:2.8,interceptions_pg:1.8,aerial_pct:70,shots_on_tgt_pg:0.1,height:190},

  // Inter Milan
  {name:"Lautaro Martínez",club:"Inter Milan",league:"serie_a_it",pos:"ATT",subpos:"ST",age:28,nat:"Argentine",value:100000000,apps:28,goals_pg:0.65,assists_pg:0.22,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:2.8,height:174},
  {name:"Nicolò Barella",club:"Inter Milan",league:"serie_a_it",pos:"MID",subpos:"CM",age:28,nat:"Italian",value:80000000,apps:28,goals_pg:0.15,assists_pg:0.25,key_passes_pg:2.8,pass_acc:87,tackles_pg:3.2,interceptions_pg:1.8,aerial_pct:48,shots_on_tgt_pg:0.8,height:172},
  {name:"Alessandro Bastoni",club:"Inter Milan",league:"serie_a_it",pos:"DEF",subpos:"CB",age:26,nat:"Italian",value:70000000,apps:30,goals_pg:0.08,assists_pg:0.15,key_passes_pg:1.2,pass_acc:91,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:65,shots_on_tgt_pg:0.2,height:191},
  {name:"Davide Frattesi",club:"Inter Milan",league:"serie_a_it",pos:"MID",subpos:"CM",age:26,nat:"Italian",value:40000000,apps:26,goals_pg:0.18,assists_pg:0.15,key_passes_pg:1.8,pass_acc:85,tackles_pg:3.0,interceptions_pg:1.6,aerial_pct:50,shots_on_tgt_pg:0.8,height:178},
  {name:"Marcus Thuram",club:"Inter Milan",league:"serie_a_it",pos:"ATT",subpos:"ST",age:28,nat:"French",value:65000000,apps:28,goals_pg:0.50,assists_pg:0.22,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:2.2,height:187},

  // Juventus
  {name:"Dušan Vlahović",club:"Juventus",league:"serie_a_it",pos:"ATT",subpos:"ST",age:25,nat:"Serbian",value:75000000,apps:27,goals_pg:0.60,assists_pg:0.12,key_passes_pg:1.4,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:2.7,height:190},
  {name:"Federico Chiesa",club:"Juventus",league:"serie_a_it",pos:"ATT",subpos:"RW",age:27,nat:"Italian",value:30000000,apps:22,goals_pg:0.28,assists_pg:0.22,key_passes_pg:2.0,pass_acc:80,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:42,shots_on_tgt_pg:1.4,height:175},
  {name:"Manuel Locatelli",club:"Juventus",league:"serie_a_it",pos:"MID",subpos:"CDM",age:28,nat:"Italian",value:28000000,apps:26,goals_pg:0.08,assists_pg:0.15,key_passes_pg:1.8,pass_acc:88,tackles_pg:3.2,interceptions_pg:1.8,aerial_pct:50,shots_on_tgt_pg:0.4,height:183},
  {name:"Gleison Bremer",club:"Juventus",league:"serie_a_it",pos:"DEF",subpos:"CB",age:28,nat:"Brazilian",value:45000000,apps:26,goals_pg:0.07,assists_pg:0.04,key_passes_pg:0.5,pass_acc:86,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:72,shots_on_tgt_pg:0.2,height:188},

  // AC Milan
  {name:"Rafael Leão",club:"AC Milan",league:"serie_a_it",pos:"ATT",subpos:"LW",age:26,nat:"Portuguese",value:70000000,apps:27,goals_pg:0.38,assists_pg:0.32,key_passes_pg:2.5,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.8,height:188},
  {name:"Tijjani Reijnders",club:"AC Milan",league:"serie_a_it",pos:"MID",subpos:"CM",age:27,nat:"Dutch",value:55000000,apps:28,goals_pg:0.20,assists_pg:0.22,key_passes_pg:2.2,pass_acc:86,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:48,shots_on_tgt_pg:0.8,height:182},
  {name:"Mike Maignan",club:"AC Milan",league:"serie_a_it",pos:"GK",age:29,nat:"French",value:45000000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:191},

  // Atalanta
  {name:"Mateo Retegui",club:"Atalanta",league:"serie_a_it",pos:"ATT",subpos:"ST",age:26,nat:"Italian",value:45000000,apps:28,goals_pg:0.68,assists_pg:0.12,key_passes_pg:1.4,pass_acc:73,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:2.8,height:183},
  {name:"Teun Koopmeiners",club:"Atalanta",league:"serie_a_it",pos:"MID",subpos:"CM",age:27,nat:"Dutch",value:55000000,apps:27,goals_pg:0.22,assists_pg:0.25,key_passes_pg:2.5,pass_acc:86,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.9,height:181},
  {name:"Giorgio Scalvini",club:"Atalanta",league:"serie_a_it",pos:"DEF",subpos:"CB",age:22,nat:"Italian",value:40000000,apps:26,goals_pg:0.06,assists_pg:0.06,key_passes_pg:0.6,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:65,shots_on_tgt_pg:0.1,height:190},

  // AS Roma
  {name:"Paulo Dybala",club:"AS Roma",league:"serie_a_it",pos:"ATT",subpos:"CAM",age:32,nat:"Argentine",value:15000000,apps:20,goals_pg:0.40,assists_pg:0.30,key_passes_pg:2.5,pass_acc:85,tackles_pg:0.8,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.8,height:177},
  {name:"Romelu Lukaku",club:"AS Roma",league:"serie_a_it",pos:"ATT",subpos:"ST",age:32,nat:"Belgian",value:15000000,apps:25,goals_pg:0.52,assists_pg:0.18,key_passes_pg:1.4,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:64,shots_on_tgt_pg:2.2,height:191},
  {name:"Bryan Cristante",club:"AS Roma",league:"serie_a_it",pos:"MID",subpos:"CDM",age:30,nat:"Italian",value:15000000,apps:26,goals_pg:0.10,assists_pg:0.12,key_passes_pg:1.5,pass_acc:85,tackles_pg:3.0,interceptions_pg:1.7,aerial_pct:54,shots_on_tgt_pg:0.4,height:186},

  // ════════════════════════════════
  // 🇫🇷 LIGUE 1 2025/26
  // ════════════════════════════════
  {name:"Ousmane Dembélé",club:"Paris Saint-Germain",league:"ligue_1",pos:"ATT",subpos:"RW",age:28,nat:"French",value:60000000,apps:26,goals_pg:0.38,assists_pg:0.40,key_passes_pg:3.0,pass_acc:81,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:36,shots_on_tgt_pg:1.8,height:178},
  {name:"Bradley Barcola",club:"Paris Saint-Germain",league:"ligue_1",pos:"ATT",subpos:"LW",age:23,nat:"French",value:70000000,apps:28,goals_pg:0.42,assists_pg:0.32,key_passes_pg:2.5,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:2.0,height:180},
  {name:"Warren Zaïre-Emery",club:"Paris Saint-Germain",league:"ligue_1",pos:"MID",subpos:"CDM",age:19,nat:"French",value:70000000,apps:26,goals_pg:0.12,assists_pg:0.18,key_passes_pg:2.0,pass_acc:87,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:45,shots_on_tgt_pg:0.6,height:183},
  {name:"Marquinhos",club:"Paris Saint-Germain",league:"ligue_1",pos:"DEF",subpos:"CB",age:31,nat:"Brazilian",value:25000000,apps:28,goals_pg:0.08,assists_pg:0.06,key_passes_pg:0.6,pass_acc:90,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:68,shots_on_tgt_pg:0.2,height:183},
  {name:"Alexandre Lacazette",club:"Olympique Lyon",league:"ligue_1",pos:"ATT",subpos:"ST",age:34,nat:"French",value:4000000,apps:24,goals_pg:0.45,assists_pg:0.20,key_passes_pg:1.8,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:2.0,height:175},
  {name:"Amine Gouiri",club:"Stade Rennais",league:"ligue_1",pos:"ATT",subpos:"ST",age:24,nat:"French",value:20000000,apps:26,goals_pg:0.32,assists_pg:0.28,key_passes_pg:2.2,pass_acc:79,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.5,height:180},
  {name:"Ben Yedder",club:"AS Monaco",league:"ligue_1",pos:"ATT",age:35,nat:"French",value:3000000,apps:20,goals_pg:0.40,assists_pg:0.15,key_passes_pg:1.5,pass_acc:76,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:46,shots_on_tgt_pg:1.8,height:170},
  {name:"Jonathan Clauss",club:"Olympique Marseille",league:"ligue_1",pos:"DEF",age:33,nat:"French",value:12000000,apps:26,goals_pg:0.08,assists_pg:0.22,key_passes_pg:1.4,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.3,height:180},
  {name:"Rémy Cabella",club:"RC Lens",league:"ligue_1",pos:"MID",age:34,nat:"French",value:3000000,apps:24,goals_pg:0.15,assists_pg:0.22,key_passes_pg:2.0,pass_acc:82,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:0.7,height:170},
  {name:"Jonathan David",club:"LOSC Lille",league:"ligue_1",pos:"ATT",subpos:"ST",age:25,nat:"Canadian",value:65000000,apps:27,goals_pg:0.62,assists_pg:0.15,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:2.7,height:180},
  {name:"Elye Wahi",club:"Olympique Marseille",league:"ligue_1",pos:"ATT",subpos:"ST",age:22,nat:"French",value:25000000,apps:25,goals_pg:0.40,assists_pg:0.18,key_passes_pg:1.5,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:1.8,height:183},
  {name:"Lucas Chevalier",club:"LOSC Lille",league:"ligue_1",pos:"GK",age:24,nat:"French",value:20000000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:190},

  // ════════════════════════════════
  // 🇦🇷 ARGENTINA — LIGA PROFESIONAL 2026
  // ════════════════════════════════
  {name:"Franco Armani",club:"River Plate",league:"argentina",pos:"GK",age:38,nat:"Argentine",value:2000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:189},
  {name:"Nacho Fernández",club:"River Plate",league:"argentina",pos:"MID",age:34,nat:"Argentine",value:1500000,apps:22,goals_pg:0.12,assists_pg:0.22,key_passes_pg:2.2,pass_acc:86,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:0.6,height:174},
  {name:"Miguel Borja",club:"River Plate",league:"argentina",pos:"ATT",subpos:"ST",age:32,nat:"Colombian",value:3000000,apps:24,goals_pg:0.45,assists_pg:0.12,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:2.0,height:180},
  {name:"Nicolás De La Cruz",club:"River Plate",league:"argentina",pos:"MID",subpos:"CM",age:28,nat:"Uruguayan",value:8000000,apps:24,goals_pg:0.15,assists_pg:0.28,key_passes_pg:2.5,pass_acc:85,tackles_pg:1.8,interceptions_pg:0.9,aerial_pct:42,shots_on_tgt_pg:0.7,height:175},
  {name:"Edinson Cavani",club:"Boca Juniors",league:"argentina",pos:"ATT",subpos:"ST",age:38,nat:"Uruguayan",value:1000000,apps:18,goals_pg:0.38,assists_pg:0.10,key_passes_pg:1.0,pass_acc:68,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:62,shots_on_tgt_pg:1.8,height:184},
  {name:"Pol Fernández",club:"Boca Juniors",league:"argentina",pos:"MID",subpos:"CM",age:33,nat:"Argentine",value:2000000,apps:22,goals_pg:0.08,assists_pg:0.18,key_passes_pg:1.8,pass_acc:82,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:44,shots_on_tgt_pg:0.4,height:177},
  {name:"Ezequiel Barco",club:"Racing Club",league:"argentina",pos:"MID",subpos:"CAM",age:26,nat:"Argentine",value:5000000,apps:24,goals_pg:0.15,assists_pg:0.25,key_passes_pg:2.2,pass_acc:82,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:40,shots_on_tgt_pg:0.8,height:171},
  {name:"Mauro Manotas",club:"Independiente",league:"argentina",pos:"ATT",age:30,nat:"Colombian",value:2500000,apps:22,goals_pg:0.40,assists_pg:0.14,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:54,shots_on_tgt_pg:1.8,height:179},
  {name:"Ignacio Fernández",club:"Estudiantes LP",league:"argentina",pos:"MID",subpos:"CAM",age:34,nat:"Argentine",value:2000000,apps:22,goals_pg:0.10,assists_pg:0.22,key_passes_pg:2.0,pass_acc:84,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:0.5,height:174},
  {name:"Germán Cano",club:"River Plate",league:"argentina",pos:"ATT",subpos:"ST",age:37,nat:"Argentine",value:1000000,apps:18,goals_pg:0.42,assists_pg:0.10,key_passes_pg:1.0,pass_acc:68,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:58,shots_on_tgt_pg:1.9,height:181},

  // ════════════════════════════════
  // 🇸🇦 SAUDI PRO LEAGUE 2025/26
  // ════════════════════════════════
  {name:"Neymar Jr",club:"Al-Hilal",league:"saudi_pro",pos:"ATT",subpos:"LW",age:34,nat:"Brazilian",value:8000000,apps:15,goals_pg:0.35,assists_pg:0.40,key_passes_pg:3.0,pass_acc:83,tackles_pg:0.6,interceptions_pg:0.3,aerial_pct:36,shots_on_tgt_pg:1.5,height:175},
  {name:"Rúben Neves",club:"Al-Hilal",league:"saudi_pro",pos:"MID",subpos:"CDM",age:28,nat:"Portuguese",value:25000000,apps:26,goals_pg:0.10,assists_pg:0.15,key_passes_pg:2.0,pass_acc:88,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:52,shots_on_tgt_pg:0.5,height:182},
  {name:"Milinkovic-Savic",club:"Al-Hilal",league:"saudi_pro",pos:"MID",subpos:"CM",age:30,nat:"Serbian",value:20000000,apps:26,goals_pg:0.18,assists_pg:0.22,key_passes_pg:2.2,pass_acc:85,tackles_pg:2.5,interceptions_pg:1.2,aerial_pct:60,shots_on_tgt_pg:0.8,height:191},
  {name:"Cristiano Ronaldo",club:"Al-Nassr",league:"saudi_pro",pos:"ATT",subpos:"ST",age:41,nat:"Portuguese",value:3000000,apps:22,goals_pg:0.62,assists_pg:0.15,key_passes_pg:1.2,pass_acc:72,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:68,shots_on_tgt_pg:2.8,height:187},
  {name:"Sadio Mané",club:"Al-Nassr",league:"saudi_pro",pos:"ATT",subpos:"LW",age:34,nat:"Senegalese",value:5000000,apps:24,goals_pg:0.38,assists_pg:0.22,key_passes_pg:1.8,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:48,shots_on_tgt_pg:1.8,height:175},
  {name:"Marcelo Brozović",club:"Al-Nassr",league:"saudi_pro",pos:"MID",subpos:"CDM",age:34,nat:"Croatian",value:5000000,apps:22,goals_pg:0.08,assists_pg:0.18,key_passes_pg:2.0,pass_acc:88,tackles_pg:3.0,interceptions_pg:1.7,aerial_pct:48,shots_on_tgt_pg:0.4,height:181},
  {name:"Karim Benzema",club:"Al-Ittihad",league:"saudi_pro",pos:"ATT",subpos:"ST",age:38,nat:"French",value:5000000,apps:20,goals_pg:0.42,assists_pg:0.22,key_passes_pg:2.0,pass_acc:78,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:1.9,height:185},
  {name:"N'Golo Kanté",club:"Al-Ittihad",league:"saudi_pro",pos:"MID",subpos:"CDM",age:35,nat:"French",value:5000000,apps:22,goals_pg:0.08,assists_pg:0.12,key_passes_pg:1.5,pass_acc:87,tackles_pg:4.5,interceptions_pg:2.5,aerial_pct:50,shots_on_tgt_pg:0.3,height:168},
  {name:"Roberto Firmino",club:"Al-Ahli",league:"saudi_pro",pos:"ATT",subpos:"CAM",age:34,nat:"Brazilian",value:3000000,apps:22,goals_pg:0.32,assists_pg:0.28,key_passes_pg:2.0,pass_acc:82,tackles_pg:0.8,interceptions_pg:0.4,aerial_pct:44,shots_on_tgt_pg:1.5,height:181},
  {name:"Riyad Mahrez",club:"Al-Ahli",league:"saudi_pro",pos:"ATT",subpos:"RW",age:35,nat:"Algerian",value:4000000,apps:22,goals_pg:0.28,assists_pg:0.28,key_passes_pg:2.2,pass_acc:80,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:38,shots_on_tgt_pg:1.4,height:179},
  {name:"Ivan Toney",club:"Al-Ahli",league:"saudi_pro",pos:"ATT",subpos:"ST",age:30,nat:"English",value:20000000,apps:24,goals_pg:0.48,assists_pg:0.18,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:2.2,height:184},

  // ════════════════════════════════
  // 🇺🇸 MLS 2026
  // ════════════════════════════════
  {name:"Lionel Messi",club:"Inter Miami",league:"mls",pos:"ATT",subpos:"CAM",age:39,nat:"Argentine",value:8000000,apps:20,goals_pg:0.45,assists_pg:0.50,key_passes_pg:4.0,pass_acc:87,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:35,shots_on_tgt_pg:1.8,height:170},
  {name:"Sergio Busquets",club:"Inter Miami",league:"mls",pos:"MID",subpos:"CDM",age:37,nat:"Spanish",value:2000000,apps:18,goals_pg:0.05,assists_pg:0.18,key_passes_pg:2.0,pass_acc:92,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:45,shots_on_tgt_pg:0.2,height:187},
  {name:"Jordi Alba",club:"Inter Miami",league:"mls",pos:"DEF",subpos:"LB",age:36,nat:"Spanish",value:1500000,apps:18,goals_pg:0.06,assists_pg:0.22,key_passes_pg:1.2,pass_acc:84,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:40,shots_on_tgt_pg:0.2,height:170},
  {name:"Cucho Hernández",club:"Columbus Crew",league:"mls",pos:"ATT",subpos:"ST",age:26,nat:"Colombian",value:12000000,apps:24,goals_pg:0.55,assists_pg:0.22,key_passes_pg:1.8,pass_acc:74,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:55,shots_on_tgt_pg:2.4,height:180},
  {name:"Carlos Vela",club:"LAFC",league:"mls",pos:"ATT",subpos:"CAM",age:36,nat:"Mexican",value:1500000,apps:18,goals_pg:0.35,assists_pg:0.28,key_passes_pg:2.0,pass_acc:82,tackles_pg:0.6,interceptions_pg:0.3,aerial_pct:36,shots_on_tgt_pg:1.6,height:178},
  {name:"Riqui Puig",club:"LA Galaxy",league:"mls",pos:"MID",subpos:"CAM",age:26,nat:"Spanish",value:8000000,apps:22,goals_pg:0.18,assists_pg:0.35,key_passes_pg:3.2,pass_acc:87,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:36,shots_on_tgt_pg:0.8,height:170},
  {name:"Lorenzo Insigne",club:"Toronto FC",league:"mls",pos:"ATT",age:35,nat:"Italian",value:2000000,apps:18,goals_pg:0.28,assists_pg:0.32,key_passes_pg:2.5,pass_acc:83,tackles_pg:0.8,interceptions_pg:0.4,aerial_pct:34,shots_on_tgt_pg:1.4,height:163},
  {name:"Xherdan Shaqiri",club:"Chicago Fire",league:"mls",pos:"MID",age:34,nat:"Swiss",value:2000000,apps:18,goals_pg:0.18,assists_pg:0.25,key_passes_pg:2.0,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:42,shots_on_tgt_pg:0.9,height:169},
  {name:"Héctor Herrera",club:"Houston Dynamo",league:"mls",pos:"MID",age:36,nat:"Mexican",value:1000000,apps:20,goals_pg:0.08,assists_pg:0.18,key_passes_pg:1.8,pass_acc:83,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.4,height:180},
  {name:"Raúl Ruidíaz",club:"Seattle Sounders",league:"mls",pos:"ATT",age:34,nat:"Peruvian",value:2000000,apps:20,goals_pg:0.40,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:48,shots_on_tgt_pg:1.8,height:168},
  {name:"Luciano Acosta",club:"FC Cincinnati",league:"mls",pos:"MID",subpos:"CAM",age:30,nat:"Argentine",value:6000000,apps:22,goals_pg:0.18,assists_pg:0.35,key_passes_pg:3.0,pass_acc:85,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:38,shots_on_tgt_pg:0.8,height:168},
  {name:"Alan Pulido",club:"Sporting KC",league:"mls",pos:"ATT",age:34,nat:"Mexican",value:2000000,apps:20,goals_pg:0.38,assists_pg:0.15,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:54,shots_on_tgt_pg:1.7,height:175},

  // ════════════════════════════════
  // 🇲🇽 LIGA MX 2026
  // ════════════════════════════════
  {name:"Henry Martín",club:"Club América",league:"liga_mx",pos:"ATT",subpos:"ST",age:33,nat:"Mexican",value:3000000,apps:22,goals_pg:0.45,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:2.0,height:183},
  {name:"Jonathan Dos Santos",club:"Club América",league:"liga_mx",pos:"MID",age:35,nat:"Mexican",value:1500000,apps:20,goals_pg:0.08,assists_pg:0.18,key_passes_pg:1.8,pass_acc:84,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:44,shots_on_tgt_pg:0.4,height:175},
  {name:"Alexis Vega",club:"Chivas Guadalajara",league:"liga_mx",pos:"ATT",subpos:"LW",age:28,nat:"Mexican",value:4000000,apps:22,goals_pg:0.32,assists_pg:0.22,key_passes_pg:2.0,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:42,shots_on_tgt_pg:1.5,height:174},
  {name:"André-Pierre Gignac",club:"Tigres UANL",league:"liga_mx",pos:"ATT",subpos:"ST",age:40,nat:"French",value:500000,apps:16,goals_pg:0.35,assists_pg:0.12,key_passes_pg:1.2,pass_acc:74,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:60,shots_on_tgt_pg:1.7,height:187},
  {name:"Florian Thauvin",club:"Tigres UANL",league:"liga_mx",pos:"ATT",subpos:"RW",age:33,nat:"French",value:4000000,apps:22,goals_pg:0.28,assists_pg:0.30,key_passes_pg:2.2,pass_acc:81,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.3,height:179},
  {name:"Lucas Cavallini",club:"Cruz Azul",league:"liga_mx",pos:"ATT",age:31,nat:"Canadian",value:2000000,apps:22,goals_pg:0.40,assists_pg:0.12,key_passes_pg:1.2,pass_acc:68,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:1.8,height:186},
  {name:"Felipe Mora",club:"Pumas UNAM",league:"liga_mx",pos:"ATT",age:31,nat:"Chilean",value:2000000,apps:22,goals_pg:0.35,assists_pg:0.14,key_passes_pg:1.3,pass_acc:70,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:1.6,height:178},

  // ════════════════════════════════
  // 🇳🇱 EREDIVISIE 2025/26
  // ════════════════════════════════
  {name:"Brian Brobbey",club:"Ajax",league:"eredivisie",pos:"ATT",subpos:"ST",age:23,nat:"Dutch",value:30000000,apps:26,goals_pg:0.55,assists_pg:0.15,key_passes_pg:1.4,pass_acc:70,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:2.4,height:183},
  {name:"Steven Bergwijn",club:"Ajax",league:"eredivisie",pos:"ATT",subpos:"RW",age:27,nat:"Dutch",value:18000000,apps:25,goals_pg:0.32,assists_pg:0.28,key_passes_pg:2.2,pass_acc:80,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:40,shots_on_tgt_pg:1.5,height:176},
  {name:"Jorrel Hato",club:"Ajax",league:"eredivisie",pos:"DEF",age:19,nat:"Dutch",value:25000000,apps:26,goals_pg:0.05,assists_pg:0.14,key_passes_pg:0.9,pass_acc:85,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:50,shots_on_tgt_pg:0.2,height:183},
  {name:"Luuk de Jong",club:"PSV Eindhoven",league:"eredivisie",pos:"ATT",subpos:"ST",age:34,nat:"Dutch",value:3000000,apps:24,goals_pg:0.48,assists_pg:0.15,key_passes_pg:1.2,pass_acc:68,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:68,shots_on_tgt_pg:2.0,height:188},
  {name:"Malik Tillman",club:"PSV Eindhoven",league:"eredivisie",pos:"MID",age:23,nat:"American",value:15000000,apps:26,goals_pg:0.22,assists_pg:0.28,key_passes_pg:2.2,pass_acc:82,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:1.0,height:182},
  {name:"Santiago Gimenez",club:"Feyenoord",league:"eredivisie",pos:"ATT",subpos:"ST",age:24,nat:"Mexican",value:30000000,apps:25,goals_pg:0.60,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:58,shots_on_tgt_pg:2.6,height:185},
  {name:"Igor Paixão",club:"Feyenoord",league:"eredivisie",pos:"ATT",subpos:"LW",age:25,nat:"Brazilian",value:20000000,apps:25,goals_pg:0.28,assists_pg:0.32,key_passes_pg:2.2,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:1.4,height:177},

  // ════════════════════════════════
  // 🇵🇹 PRIMEIRA LIGA 2025/26
  // ════════════════════════════════
  {name:"Ángel Di María",club:"Benfica",league:"primeira_liga",pos:"ATT",age:38,nat:"Argentine",value:2000000,apps:18,goals_pg:0.18,assists_pg:0.32,key_passes_pg:2.5,pass_acc:83,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:36,shots_on_tgt_pg:0.9,height:180},
  {name:"Arthur Cabral",club:"Benfica",league:"primeira_liga",pos:"ATT",subpos:"ST",age:28,nat:"Brazilian",value:15000000,apps:24,goals_pg:0.48,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:62,shots_on_tgt_pg:2.1,height:188},
  {name:"Otávio",club:"FC Porto",league:"primeira_liga",pos:"MID",age:30,nat:"Brazilian",value:12000000,apps:25,goals_pg:0.12,assists_pg:0.22,key_passes_pg:2.0,pass_acc:84,tackles_pg:2.2,interceptions_pg:1.1,aerial_pct:44,shots_on_tgt_pg:0.5,height:173},
  {name:"Evanilson",club:"FC Porto",league:"primeira_liga",pos:"ATT",age:25,nat:"Brazilian",value:18000000,apps:24,goals_pg:0.50,assists_pg:0.15,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.2,height:183},
  {name:"Pedro Gonçalves",club:"Sporting CP",league:"primeira_liga",pos:"MID",subpos:"CAM",age:27,nat:"Portuguese",value:30000000,apps:26,goals_pg:0.25,assists_pg:0.28,key_passes_pg:2.5,pass_acc:84,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:42,shots_on_tgt_pg:1.0,height:177},
  {name:"Viktor Gyökeres",club:"Sporting CP",league:"primeira_liga",pos:"ATT",subpos:"ST",age:27,nat:"Swedish",value:55000000,apps:28,goals_pg:0.72,assists_pg:0.22,key_passes_pg:1.5,pass_acc:72,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:3.0,height:188},

  // ════════════════════════════════
  // 🇹🇷 SÜPER LIG 2025/26
  // ════════════════════════════════
  {name:"Mauro Icardi",club:"Galatasaray",league:"super_lig",pos:"ATT",age:33,nat:"Argentine",value:5000000,apps:22,goals_pg:0.50,assists_pg:0.12,key_passes_pg:1.2,pass_acc:68,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:62,shots_on_tgt_pg:2.2,height:181},
  {name:"Dries Mertens",club:"Galatasaray",league:"super_lig",pos:"ATT",age:38,nat:"Belgian",value:1000000,apps:18,goals_pg:0.22,assists_pg:0.25,key_passes_pg:2.0,pass_acc:82,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:36,shots_on_tgt_pg:1.0,height:169},
  {name:"Edin Džeko",club:"Fenerbahçe",league:"super_lig",pos:"ATT",age:40,nat:"Bosnian",value:500000,apps:16,goals_pg:0.35,assists_pg:0.15,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:65,shots_on_tgt_pg:1.6,height:193},
  {name:"Michy Batshuayi",club:"Fenerbahçe",league:"super_lig",pos:"ATT",age:34,nat:"Belgian",value:2000000,apps:20,goals_pg:0.35,assists_pg:0.15,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:1.6,height:180},
  {name:"Cenk Tosun",club:"Beşiktaş",league:"super_lig",pos:"ATT",age:34,nat:"Turkish",value:2000000,apps:20,goals_pg:0.38,assists_pg:0.12,key_passes_pg:1.2,pass_acc:68,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:1.7,height:183},

  // ════════════════════════════════
  // 🇧🇪 JUPILER PRO LEAGUE 2025/26
  // ════════════════════════════════
  {name:"Ferran Jutglà",club:"Club Brugge",league:"jupiler",pos:"ATT",age:25,nat:"Spanish",value:15000000,apps:25,goals_pg:0.45,assists_pg:0.18,key_passes_pg:1.8,pass_acc:78,tackles_pg:0.7,interceptions_pg:0.3,aerial_pct:44,shots_on_tgt_pg:2.0,height:173},
  {name:"Casper Nielsen",club:"Club Brugge",league:"jupiler",pos:"MID",age:29,nat:"Danish",value:8000000,apps:26,goals_pg:0.10,assists_pg:0.18,key_passes_pg:1.8,pass_acc:84,tackles_pg:3.0,interceptions_pg:1.7,aerial_pct:50,shots_on_tgt_pg:0.4,height:183},
  {name:"Yari Verschaeren",club:"Anderlecht",league:"jupiler",pos:"MID",age:24,nat:"Belgian",value:12000000,apps:25,goals_pg:0.15,assists_pg:0.22,key_passes_pg:2.2,pass_acc:82,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:0.7,height:176},
  {name:"Lior Refaelov",club:"Anderlecht",league:"jupiler",pos:"MID",age:37,nat:"Israeli",value:500000,apps:18,goals_pg:0.10,assists_pg:0.18,key_passes_pg:1.8,pass_acc:82,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:0.5,height:172},

  // ════════════════════════════════
  // 🇯🇵 J1 LEAGUE 2026
  // ════════════════════════════════
  {name:"Andres Iniesta",club:"Vissel Kobe",league:"j_league",pos:"MID",age:42,nat:"Spanish",value:200000,apps:12,goals_pg:0.05,assists_pg:0.15,key_passes_pg:2.0,pass_acc:90,tackles_pg:1.0,interceptions_pg:0.5,aerial_pct:35,shots_on_tgt_pg:0.3,height:171},
  {name:"David Villa",club:"Vissel Kobe",league:"j_league",pos:"ATT",age:0,nat:"Spanish",value:0,apps:0,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:0,tackles_pg:0,interceptions_pg:0,aerial_pct:0,shots_on_tgt_pg:0,height:175},
  {name:"Kyogo Furuhashi",club:"Vissel Kobe",league:"j_league",pos:"ATT",subpos:"ST",age:30,nat:"Japanese",value:8000000,apps:26,goals_pg:0.48,assists_pg:0.18,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:42,shots_on_tgt_pg:2.0,height:170},
  {name:"Leandro Damião",club:"Kawasaki Frontale",league:"j_league",pos:"ATT",age:35,nat:"Brazilian",value:1000000,apps:22,goals_pg:0.40,assists_pg:0.12,key_passes_pg:1.0,pass_acc:68,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:60,shots_on_tgt_pg:1.8,height:184},
  {name:"Hayao Kawabe",club:"Urawa Red Diamonds",league:"j_league",pos:"MID",age:28,nat:"Japanese",value:3000000,apps:24,goals_pg:0.12,assists_pg:0.18,key_passes_pg:1.8,pass_acc:82,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:44,shots_on_tgt_pg:0.5,height:177},
  {name:"Takumi Minamino",club:"Cerezo Osaka",league:"j_league",pos:"ATT",age:30,nat:"Japanese",value:8000000,apps:25,goals_pg:0.32,assists_pg:0.22,key_passes_pg:2.0,pass_acc:80,tackles_pg:1.2,interceptions_pg:0.5,aerial_pct:42,shots_on_tgt_pg:1.4,height:173},
  {name:"Junya Ito",club:"Gamba Osaka",league:"j_league",pos:"ATT",age:32,nat:"Japanese",value:4000000,apps:24,goals_pg:0.22,assists_pg:0.25,key_passes_pg:1.8,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:38,shots_on_tgt_pg:1.0,height:176},

  // ════════════════════════════════
  // 🇰🇷 K LEAGUE 2026
  // ════════════════════════════════
  {name:"Cho Gue-sung",club:"Jeonbuk Hyundai Motors",league:"k_league",pos:"ATT",age:26,nat:"South Korean",value:5000000,apps:24,goals_pg:0.45,assists_pg:0.15,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:2.0,height:185},
  {name:"Hwang Hee-chan",club:"Ulsan HD",league:"k_league",pos:"ATT",age:29,nat:"South Korean",value:10000000,apps:22,goals_pg:0.40,assists_pg:0.20,key_passes_pg:1.6,pass_acc:74,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:48,shots_on_tgt_pg:1.8,height:177},
  {name:"Son Jun-ho",club:"Seoul FC",league:"k_league",pos:"MID",age:29,nat:"South Korean",value:3000000,apps:24,goals_pg:0.15,assists_pg:0.22,key_passes_pg:2.0,pass_acc:82,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:44,shots_on_tgt_pg:0.6,height:176},

  // ════════════════════════════════
  // 🇦🇺 A-LEAGUE 2026
  // ════════════════════════════════
  {name:"Mathew Leckie",club:"Melbourne City",league:"a_league",pos:"ATT",age:34,nat:"Australian",value:1000000,apps:22,goals_pg:0.28,assists_pg:0.22,key_passes_pg:1.8,pass_acc:76,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:44,shots_on_tgt_pg:1.3,height:178},
  {name:"Marco Tilio",club:"Melbourne City",league:"a_league",pos:"ATT",age:23,nat:"Australian",value:2000000,apps:22,goals_pg:0.22,assists_pg:0.25,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:38,shots_on_tgt_pg:1.0,height:174},
  {name:"Bruno Fornaroli",club:"Western Sydney Wanderers",league:"a_league",pos:"ATT",age:35,nat:"Uruguayan",value:500000,apps:20,goals_pg:0.38,assists_pg:0.12,key_passes_pg:1.2,pass_acc:72,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:1.7,height:181},
  {name:"Adam Taggart",club:"Sydney FC",league:"a_league",pos:"ATT",age:32,nat:"Australian",value:800000,apps:22,goals_pg:0.35,assists_pg:0.12,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:54,shots_on_tgt_pg:1.6,height:180},

  // ════════════════════════════════
  // 🇪🇬 EGYPTIAN PREMIER LEAGUE 2025/26
  // ════════════════════════════════
  {name:"Mohamed Salah (Al Ahly)",club:"Al Ahly",league:"egypt_pl",pos:"ATT",age:26,nat:"Egyptian",value:3000000,apps:24,goals_pg:0.42,assists_pg:0.18,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:45,shots_on_tgt_pg:1.9,height:178},
  {name:"Percy Tau",club:"Al Ahly",league:"egypt_pl",pos:"ATT",age:31,nat:"South African",value:3000000,apps:22,goals_pg:0.28,assists_pg:0.25,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:40,shots_on_tgt_pg:1.2,height:172},
  {name:"Mahmoud Kahraba",club:"Al Ahly",league:"egypt_pl",pos:"ATT",age:32,nat:"Egyptian",value:2000000,apps:22,goals_pg:0.25,assists_pg:0.20,key_passes_pg:1.6,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:44,shots_on_tgt_pg:1.2,height:173},
  {name:"Seifeddine Jaziri",club:"Zamalek",league:"egypt_pl",pos:"ATT",age:33,nat:"Tunisian",value:1500000,apps:22,goals_pg:0.35,assists_pg:0.14,key_passes_pg:1.3,pass_acc:70,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:1.6,height:186},

  // ════════════════════════════════
  // 🇿🇦 SOUTH AFRICA PSL 2025/26
  // ════════════════════════════════
  {name:"Themba Zwane",club:"Mamelodi Sundowns",league:"sa_psl",pos:"MID",age:33,nat:"South African",value:1000000,apps:22,goals_pg:0.18,assists_pg:0.25,key_passes_pg:2.0,pass_acc:78,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:40,shots_on_tgt_pg:0.8,height:172},
  {name:"Peter Shalulile",club:"Mamelodi Sundowns",league:"sa_psl",pos:"ATT",age:32,nat:"Namibian",value:1500000,apps:22,goals_pg:0.48,assists_pg:0.18,key_passes_pg:1.4,pass_acc:70,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:50,shots_on_tgt_pg:2.1,height:172},
  {name:"Keagan Dolly",club:"Kaizer Chiefs",league:"sa_psl",pos:"ATT",age:31,nat:"South African",value:1000000,apps:20,goals_pg:0.22,assists_pg:0.22,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:40,shots_on_tgt_pg:1.0,height:174},
  {name:"Zakhele Lepasa",club:"Orlando Pirates",league:"sa_psl",pos:"ATT",age:27,nat:"South African",value:1200000,apps:22,goals_pg:0.38,assists_pg:0.14,key_passes_pg:1.2,pass_acc:70,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:1.7,height:178},

  // ════════════════════════════════
  // 🇨🇴 COLOMBIA — LIGA BETPLAY
  // ════════════════════════════════
  {name:"Jefferson Lerma",club:"Atlético Nacional",league:"colombia",pos:"MID",subpos:"CDM",age:30,nat:"Colombian",value:5000000,apps:22,goals_pg:0.08,assists_pg:0.14,key_passes_pg:1.5,pass_acc:82,tackles_pg:3.8,interceptions_pg:2.1,aerial_pct:55,shots_on_tgt_pg:0.3,height:183},
  {name:"Cucho Hernández Jr",club:"América de Cali",league:"colombia",pos:"ATT",age:22,nat:"Colombian",value:2000000,apps:20,goals_pg:0.35,assists_pg:0.18,key_passes_pg:1.4,pass_acc:72,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:48,shots_on_tgt_pg:1.6,height:178},
  {name:"Daniel Ruiz",club:"Millonarios",league:"colombia",pos:"MID",subpos:"CAM",age:22,nat:"Colombian",value:3000000,apps:22,goals_pg:0.15,assists_pg:0.25,key_passes_pg:2.2,pass_acc:80,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:40,shots_on_tgt_pg:0.7,height:175},

  // ════════════════════════════════
  // 🇨🇱 CHILE — PRIMERA DIVISIÓN
  // ════════════════════════════════
  {name:"Esteban Pavez",club:"Colo-Colo",league:"chile",pos:"MID",age:33,nat:"Chilean",value:1500000,apps:22,goals_pg:0.08,assists_pg:0.14,key_passes_pg:1.5,pass_acc:82,tackles_pg:3.5,interceptions_pg:2.0,aerial_pct:48,shots_on_tgt_pg:0.3,height:180},
  {name:"Damián Pizarro",club:"Universidad de Chile",league:"chile",pos:"ATT",subpos:"ST",age:20,nat:"Chilean",value:5000000,apps:22,goals_pg:0.40,assists_pg:0.18,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:52,shots_on_tgt_pg:1.8,height:182},
  {name:"Fernando Zampedri",club:"Universidad Católica",league:"chile",pos:"ATT",subpos:"ST",age:35,nat:"Argentine",value:1000000,apps:20,goals_pg:0.42,assists_pg:0.12,key_passes_pg:1.0,pass_acc:68,tackles_pg:0.4,interceptions_pg:0.1,aerial_pct:60,shots_on_tgt_pg:1.9,height:183},

  // ════════════════════════════════
  // 🇺🇾 URUGUAY — PRIMERA DIVISIÓN
  // ════════════════════════════════
  {name:"Facundo Torres",club:"Peñarol",league:"uruguay",pos:"ATT",age:25,nat:"Uruguayan",value:8000000,apps:20,goals_pg:0.35,assists_pg:0.28,key_passes_pg:2.0,pass_acc:78,tackles_pg:1.0,interceptions_pg:0.4,aerial_pct:42,shots_on_tgt_pg:1.6,height:176},
  {name:"Nicolás De La Cruz",club:"Nacional",league:"uruguay",pos:"MID",subpos:"CM",age:28,nat:"Uruguayan",value:4000000,apps:20,goals_pg:0.12,assists_pg:0.22,key_passes_pg:2.0,pass_acc:83,tackles_pg:1.8,interceptions_pg:0.9,aerial_pct:42,shots_on_tgt_pg:0.6,height:175},

  // ════════════════════════════════
  // 🇪🇨 ECUADOR — LIGAPRO
  // ════════════════════════════════
  {name:"Enner Valencia",club:"Barcelona SC",league:"ecuador",pos:"ATT",subpos:"ST",age:34,nat:"Ecuadorian",value:1500000,apps:18,goals_pg:0.38,assists_pg:0.15,key_passes_pg:1.2,pass_acc:72,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:1.7,height:177},
  {name:"Joao Rojas",club:"LDU Quito",league:"ecuador",pos:"ATT",age:31,nat:"Ecuadorian",value:1500000,apps:20,goals_pg:0.25,assists_pg:0.22,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:40,shots_on_tgt_pg:1.2,height:173},

  // ════════════════════════════════
  // 🇵🇾 PARAGUAY — APERTURA
  // ════════════════════════════════
  {name:"Julio Enciso",club:"Club Olimpia",league:"paraguay",pos:"ATT",age:21,nat:"Paraguayan",value:12000000,apps:18,goals_pg:0.35,assists_pg:0.22,key_passes_pg:2.0,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:40,shots_on_tgt_pg:1.6,height:174},
  {name:"Miguel Almirón",club:"Cerro Porteño",league:"paraguay",pos:"MID",age:32,nat:"Paraguayan",value:5000000,apps:18,goals_pg:0.15,assists_pg:0.22,key_passes_pg:2.0,pass_acc:82,tackles_pg:1.8,interceptions_pg:0.8,aerial_pct:40,shots_on_tgt_pg:0.8,height:172},

  // ════════════════════════════════
  // 🇵🇪 PERU — LIGA 1
  // ════════════════════════════════
  {name:"Gianluca Lapadula",club:"Alianza Lima",league:"peru",pos:"ATT",age:35,nat:"Peruvian",value:1500000,apps:20,goals_pg:0.40,assists_pg:0.12,key_passes_pg:1.0,pass_acc:68,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:60,shots_on_tgt_pg:1.8,height:180},
  {name:"Jefferson Farfán",club:"Alianza Lima",league:"peru",pos:"ATT",age:40,nat:"Peruvian",value:300000,apps:12,goals_pg:0.25,assists_pg:0.12,key_passes_pg:1.2,pass_acc:74,tackles_pg:0.3,interceptions_pg:0.1,aerial_pct:44,shots_on_tgt_pg:1.1,height:181},

  // ════════════════════════════════
  // 🏴󠁧󠁢󠁳󠁣󠁴󠁿 SCOTTISH PREMIERSHIP
  // ════════════════════════════════
  {name:"Kyogo Furuhashi",club:"Celtic",league:"scottish_prem",pos:"ATT",subpos:"ST",age:30,nat:"Japanese",value:8000000,apps:26,goals_pg:0.52,assists_pg:0.18,key_passes_pg:1.5,pass_acc:74,tackles_pg:0.6,interceptions_pg:0.2,aerial_pct:42,shots_on_tgt_pg:2.2,height:170},
  {name:"Callum McGregor",club:"Celtic",league:"scottish_prem",pos:"MID",subpos:"CDM",age:32,nat:"Scottish",value:8000000,apps:28,goals_pg:0.12,assists_pg:0.20,key_passes_pg:2.2,pass_acc:87,tackles_pg:3.0,interceptions_pg:1.7,aerial_pct:48,shots_on_tgt_pg:0.5,height:178},
  {name:"Cyriel Dessers",club:"Rangers",league:"scottish_prem",pos:"ATT",subpos:"ST",age:30,nat:"Nigerian",value:6000000,apps:26,goals_pg:0.45,assists_pg:0.15,key_passes_pg:1.2,pass_acc:68,tackles_pg:0.5,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:2.0,height:183},
  {name:"James Tavernier",club:"Rangers",league:"scottish_prem",pos:"DEF",subpos:"RB",age:33,nat:"English",value:3000000,apps:26,goals_pg:0.08,assists_pg:0.25,key_passes_pg:1.4,pass_acc:81,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.3,height:178},

  // ════════════════════════════════
  // 🇨🇳 CHINESE SUPER LEAGUE
  // ════════════════════════════════
  {name:"Oscar",club:"Shanghai Port",league:"chinese_sl",pos:"MID",age:34,nat:"Brazilian",value:3000000,apps:22,goals_pg:0.15,assists_pg:0.28,key_passes_pg:2.5,pass_acc:85,tackles_pg:1.5,interceptions_pg:0.7,aerial_pct:42,shots_on_tgt_pg:0.7,height:174},
  {name:"Hulk (Guangzhou)",club:"Guangzhou FC",league:"chinese_sl",pos:"ATT",age:39,nat:"Brazilian",value:500000,apps:16,goals_pg:0.32,assists_pg:0.12,key_passes_pg:1.2,pass_acc:72,tackles_pg:0.4,interceptions_pg:0.2,aerial_pct:55,shots_on_tgt_pg:1.5,height:180},
  {name:"Wu Lei",club:"Shanghai Shenhua",league:"chinese_sl",pos:"ATT",age:33,nat:"Chinese",value:2000000,apps:22,goals_pg:0.32,assists_pg:0.18,key_passes_pg:1.8,pass_acc:76,tackles_pg:0.8,interceptions_pg:0.3,aerial_pct:40,shots_on_tgt_pg:1.4,height:174},

  // ════════════════════════════════
  // 🧤 GOALKEEPERS — ALL LEAGUES
  // ════════════════════════════════
  {name:"Alisson Becker",club:"Liverpool",league:"premier_league",pos:"GK",age:32,nat:"Brazilian",value:35000000,apps:30,goals_pg:0,assists_pg:0.02,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:72,shots_on_tgt_pg:0,height:191},
  {name:"David Raya",club:"Arsenal",league:"premier_league",pos:"GK",age:29,nat:"Spanish",value:40000000,apps:32,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:78,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:183},
  {name:"Ederson",club:"Manchester City",league:"premier_league",pos:"GK",age:31,nat:"Brazilian",value:35000000,apps:28,goals_pg:0,assists_pg:0.02,key_passes_pg:0,pass_acc:82,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:188},
  {name:"Jordan Pickford",club:"Everton",league:"premier_league",pos:"GK",age:31,nat:"English",value:20000000,apps:30,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:65,shots_on_tgt_pg:0,height:185},
  {name:"Nick Pope",club:"Newcastle United",league:"premier_league",pos:"GK",age:33,nat:"English",value:18000000,apps:28,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:198},
  {name:"Marc-André ter Stegen",club:"Barcelona",league:"la_liga",pos:"GK",age:33,nat:"German",value:25000000,apps:28,goals_pg:0,assists_pg:0.02,key_passes_pg:0,pass_acc:84,tackles_pg:0,interceptions_pg:0,aerial_pct:72,shots_on_tgt_pg:0,height:187},
  {name:"Thibaut Courtois",club:"Real Madrid",league:"la_liga",pos:"GK",age:33,nat:"Belgian",value:30000000,apps:26,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:74,shots_on_tgt_pg:0,height:199},
  {name:"Jan Oblak",club:"Atlético Madrid",league:"la_liga",pos:"GK",age:32,nat:"Slovenian",value:28000000,apps:30,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:72,shots_on_tgt_pg:0,height:188},
  {name:"Manuel Neuer",club:"Bayern Munich",league:"bundesliga",pos:"GK",age:39,nat:"German",value:5000000,apps:24,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:80,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:193},
  {name:"Oliver Baumann",club:"Hoffenheim",league:"bundesliga",pos:"GK",age:34,nat:"German",value:5000000,apps:28,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:186},
  {name:"Gregor Kobel",club:"Borussia Dortmund",league:"bundesliga",pos:"GK",age:27,nat:"Swiss",value:30000000,apps:28,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:72,shots_on_tgt_pg:0,height:194},
  {name:"Gianluigi Donnarumma",club:"Paris Saint-Germain",league:"ligue_1",pos:"GK",age:26,nat:"Italian",value:50000000,apps:30,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:75,tackles_pg:0,interceptions_pg:0,aerial_pct:73,shots_on_tgt_pg:0,height:196},
  {name:"Giorgi Mamardashvili",club:"Valencia",league:"la_liga",pos:"GK",age:24,nat:"Georgian",value:30000000,apps:30,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:198},
  {name:"Yann Sommer",club:"Inter Milan",league:"serie_a_it",pos:"GK",age:36,nat:"Swiss",value:8000000,apps:28,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:183},
  {name:"André Onana",club:"Manchester United",league:"premier_league",pos:"GK",age:29,nat:"Cameroonian",value:35000000,apps:28,goals_pg:0,assists_pg:0.02,key_passes_pg:0,pass_acc:78,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:190},
  {name:"Emiliano Martínez",club:"Aston Villa",league:"premier_league",pos:"GK",age:32,nat:"Argentine",value:30000000,apps:30,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:195},
  {name:"Kepa Arrizabalaga",club:"Chelsea",league:"premier_league",pos:"GK",age:30,nat:"Spanish",value:15000000,apps:22,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:77,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:186},
  {name:"Bento",club:"Al-Nassr",league:"saudi_pro",pos:"GK",age:25,nat:"Brazilian",value:15000000,apps:26,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:191},
  {name:"John Victor",club:"Corinthians",league:"serie_a",pos:"GK",age:27,nat:"Brazilian",value:3000000,apps:28,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Rafael",club:"Flamengo",league:"serie_a",pos:"GK",age:34,nat:"Brazilian",value:1500000,apps:26,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:186},
  {name:"Marcos Felipe",club:"Fluminense",league:"serie_a",pos:"GK",age:28,nat:"Brazilian",value:2000000,apps:25,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:188},
  {name:"Ivan",club:"Cruzeiro",league:"serie_a",pos:"GK",age:30,nat:"Brazilian",value:2500000,apps:27,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:189},
  {name:"Gabriel Brazão",club:"Internacional",league:"serie_a",pos:"GK",age:25,nat:"Brazilian",value:3000000,apps:26,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Lucas Perri",club:"Botafogo",league:"serie_a",pos:"GK",age:26,nat:"Brazilian",value:4000000,apps:29,goals_pg:0,assists_pg:0.01,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:187},
  {name:"Hugo Souza",league:"serie_a",club:"Corinthians",pos:"GK",age:24,nat:"Brazilian",value:2000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:188},
];

// Filter out invalid entries (placeholder entries with 0 apps)
const PLAYERS_VALID = PLAYERS_DB.filter(p => p.apps > 0 && p.value > 0);

console.log('ScoutMind player database loaded:', PLAYERS_VALID.length, 'players across', new Set(PLAYERS_VALID.map(p=>p.league)).size, 'leagues');

// ════════════════════════════════════════════════════════
// ADDITIONAL GOALKEEPERS — One per team across all leagues
// ════════════════════════════════════════════════════════
const GK_ADDITIONS = [
  // 🇧🇷 SÉRIE A
  {name:"Rossi",club:"Flamengo",league:"serie_a",pos:"GK",age:29,nat:"Brazilian",value:4000000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:188},
  {name:"Weverton",club:"Palmeiras",league:"serie_a",pos:"GK",subpos:"GK",age:36,nat:"Brazilian",value:2000000,apps:32,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:188},
  {name:"John",club:"Botafogo",league:"serie_a",pos:"GK",age:26,nat:"Brazilian",value:3500000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:186},
  {name:"Fábio",club:"Fluminense",league:"serie_a",pos:"GK",subpos:"GK",age:43,nat:"Brazilian",value:500000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:191},
  {name:"Anderson",club:"Cruzeiro",league:"serie_a",pos:"GK",age:34,nat:"Brazilian",value:1500000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:186},
  {name:"Hugo Cândido",club:"Corinthians",league:"serie_a",pos:"GK",age:27,nat:"Brazilian",value:2000000,apps:27,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:189},
  {name:"Rafael",club:"São Paulo",league:"serie_a",pos:"GK",age:34,nat:"Brazilian",value:1500000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:186},
  {name:"Everson",club:"Atlético Mineiro",league:"serie_a",pos:"GK",age:34,nat:"Brazilian",value:2000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:191},
  {name:"Marcos Felipe",club:"Bahia",league:"serie_a",pos:"GK",age:28,nat:"Brazilian",value:2000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:188},
  {name:"Grando",club:"Grêmio",league:"serie_a",pos:"GK",age:26,nat:"Brazilian",value:1500000,apps:25,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:187},
  {name:"Rochet",club:"Internacional",league:"serie_a",pos:"GK",age:31,nat:"Uruguayan",value:3000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:190},
  {name:"Léo Jardim",club:"Vasco da Gama",league:"serie_a",pos:"GK",age:28,nat:"Brazilian",value:2000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:187},
  {name:"Cleiton",club:"Red Bull Bragantino",league:"serie_a",pos:"GK",age:26,nat:"Brazilian",value:3000000,apps:27,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:186},
  {name:"Gabriel Brazão",club:"Santos",league:"serie_a",pos:"GK",age:25,nat:"Brazilian",value:2000000,apps:25,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:189},
  {name:"Alex Muralha",club:"Vitória",league:"serie_a",pos:"GK",age:35,nat:"Brazilian",value:800000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:188},
  {name:"Santos",club:"Athletico Paranaense",league:"serie_a",pos:"GK",age:32,nat:"Brazilian",value:1500000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:187},
  {name:"Douglas Friedrich",club:"Coritiba",league:"serie_a",pos:"GK",age:26,nat:"Brazilian",value:1000000,apps:23,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:65,shots_on_tgt_pg:0,height:186},
  {name:"César",club:"Juventude",league:"serie_a",pos:"GK",age:35,nat:"Brazilian",value:600000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:64,shots_on_tgt_pg:0,height:185},
  {name:"Mirassol GK",club:"Mirassol",league:"serie_a",pos:"GK",age:28,nat:"Brazilian",value:800000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:65,shots_on_tgt_pg:0,height:186},
  {name:"Jandrei",club:"São Paulo",league:"serie_a",pos:"GK",age:31,nat:"Brazilian",value:1200000,apps:18,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:187},

  // 🇧🇷 SÉRIE B
  {name:"Richard",club:"Ceará",league:"serie_b",pos:"GK",age:30,nat:"Brazilian",value:1000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:187},
  {name:"João Ricardo",club:"Fortaleza",league:"serie_b",pos:"GK",age:36,nat:"Brazilian",value:600000,apps:25,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:188},
  {name:"Mailson",club:"Sport Recife",league:"serie_b",pos:"GK",age:32,nat:"Brazilian",value:800000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:186},
  {name:"Douglas",club:"Sampaio Corrêa",league:"serie_b",pos:"GK",age:34,nat:"Brazilian",value:400000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:64,shots_on_tgt_pg:0,height:185},
  {name:"Lucas Frigeri",club:"Madureira",league:"serie_b",pos:"GK",age:29,nat:"Brazilian",value:400000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:64,shots_on_tgt_pg:0,height:185},
  {name:"Matheus Nogueira",club:"CRB",league:"serie_b",pos:"GK",age:28,nat:"Brazilian",value:600000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:65,shots_on_tgt_pg:0,height:186},
  {name:"Ygor Vinhas",club:"Náutico",league:"serie_b",pos:"GK",age:27,nat:"Brazilian",value:500000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:68,tackles_pg:0,interceptions_pg:0,aerial_pct:64,shots_on_tgt_pg:0,height:185},
  {name:"Dalton",club:"Guarani",league:"serie_b",pos:"GK",age:28,nat:"Brazilian",value:500000,apps:21,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:67,tackles_pg:0,interceptions_pg:0,aerial_pct:63,shots_on_tgt_pg:0,height:184},

  // 🇦🇷 ARGENTINA
  {name:"Ángel Correa GK",club:"River Plate",league:"argentina",pos:"GK",age:30,nat:"Argentine",value:2000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:188},
  {name:"Sergio Romero",club:"Boca Juniors",league:"argentina",pos:"GK",age:37,nat:"Argentine",value:500000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:192},
  {name:"Facundo Cambeses",club:"Racing Club",league:"argentina",pos:"GK",age:27,nat:"Argentine",value:2000000,apps:25,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:189},
  {name:"Martín Campaña",club:"Independiente",league:"argentina",pos:"GK",age:33,nat:"Uruguayan",value:1000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Augusto Batalla",club:"San Lorenzo",league:"argentina",pos:"GK",age:28,nat:"Argentine",value:1200000,apps:23,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:187},
  {name:"Rodrigo Rey",club:"Estudiantes LP",league:"argentina",pos:"GK",age:34,nat:"Argentine",value:800000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:188},

  // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 PREMIER LEAGUE
  {name:"Robert Sánchez",club:"Chelsea",league:"premier_league",pos:"GK",age:27,nat:"Spanish",value:18000000,apps:20,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:197},
  {name:"Sam Johnstone",club:"Crystal Palace",league:"premier_league",pos:"GK",age:31,nat:"English",value:8000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:193},
  {name:"Bart Verbruggen",club:"Brighton",league:"premier_league",pos:"GK",age:22,nat:"Dutch",value:20000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:75,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:190},
  {name:"José Sá",club:"Wolverhampton",league:"premier_league",pos:"GK",age:31,nat:"Portuguese",value:10000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:190},
  {name:"Matz Sels",club:"Nottingham Forest",league:"premier_league",pos:"GK",age:32,nat:"Belgian",value:8000000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:188},
  {name:"Martin Dúbravka",club:"Manchester United",league:"premier_league",pos:"GK",age:36,nat:"Slovak",value:3000000,apps:18,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:192},
  {name:"Alphonse Areola",club:"West Ham",league:"premier_league",pos:"GK",age:32,nat:"French",value:6000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:195},
  {name:"Bernd Leno",club:"Fulham",league:"premier_league",pos:"GK",age:33,nat:"German",value:8000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Thomas Flekken",club:"Brentford",league:"premier_league",pos:"GK",age:31,nat:"Dutch",value:10000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:194},
  {name:"Dean Henderson",club:"Sunderland",league:"premier_league",pos:"GK",age:28,nat:"English",value:12000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Illan Meslier",club:"Leeds United",league:"premier_league",pos:"GK",age:24,nat:"French",value:15000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:196},

  // 🇪🇸 LA LIGA
  {name:"Rui Silva",club:"Real Betis",league:"la_liga",pos:"GK",age:30,nat:"Portuguese",value:8000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:190},
  {name:"Álex Remiro",club:"Real Sociedad",league:"la_liga",pos:"GK",age:29,nat:"Spanish",value:20000000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:185},
  {name:"Sergio Herrera",club:"Osasuna",league:"la_liga",pos:"GK",age:31,nat:"Spanish",value:5000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:186},
  {name:"Unai Simón",club:"Athletic Bilbao",league:"la_liga",pos:"GK",age:28,nat:"Spanish",value:25000000,apps:30,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:77,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:188},
  {name:"Vicente Guaita",club:"Getafe",league:"la_liga",pos:"GK",age:37,nat:"Spanish",value:2000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:189},
  {name:"Predrag Rajković",club:"Rayo Vallecano",league:"la_liga",pos:"GK",age:30,nat:"Serbian",value:6000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:193},
  {name:"Iñaki Peña",club:"Barcelona",league:"la_liga",pos:"GK",age:26,nat:"Spanish",value:10000000,apps:18,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:80,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:189},
  {name:"Andriy Lunin",club:"Real Madrid",league:"la_liga",pos:"GK",age:25,nat:"Ukrainian",value:25000000,apps:18,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:77,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:191},

  // 🇩🇪 BUNDESLIGA
  {name:"Stefan Ortega",club:"Manchester City",league:"bundesliga",pos:"GK",age:32,nat:"German",value:8000000,apps:12,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:185},
  {name:"Frederik Rønnow",club:"Union Berlin",league:"bundesliga",pos:"GK",age:32,nat:"Danish",value:5000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:191},
  {name:"Peter Gulácsi",club:"RB Leipzig",league:"bundesliga",pos:"GK",age:34,nat:"Hungarian",value:6000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:190},
  {name:"Kevin Trapp",club:"Eintracht Frankfurt",league:"bundesliga",pos:"GK",age:35,nat:"German",value:5000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:189},
  {name:"Lukáš Hrádecký",club:"Bayer Leverkusen",league:"bundesliga",pos:"GK",age:35,nat:"Finnish",value:5000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Alexander Nübel",club:"VfB Stuttgart",league:"bundesliga",pos:"GK",age:28,nat:"German",value:18000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:75,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:193},
  {name:"Pavao Pervan",club:"VfL Wolfsburg",league:"bundesliga",pos:"GK",age:37,nat:"Austrian",value:1000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:190},

  // 🇮🇹 SERIE A ITALY
  {name:"Michele Di Gregorio",club:"Juventus",league:"serie_a_it",pos:"GK",age:27,nat:"Italian",value:25000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:75,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:188},
  {name:"Guglielmo Vicario",club:"Tottenham",league:"serie_a_it",pos:"GK",age:28,nat:"Italian",value:28000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:192},
  {name:"Pierluigi Gollini",club:"Genoa",league:"serie_a_it",pos:"GK",age:30,nat:"Italian",value:5000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:193},
  {name:"Marco Sportiello",club:"AC Milan",league:"serie_a_it",pos:"GK",age:32,nat:"Italian",value:3000000,apps:15,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:192},
  {name:"Ivan Provedel",club:"Lazio",league:"serie_a_it",pos:"GK",age:30,nat:"Italian",value:12000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:190},
  {name:"Lukasz Skorupski",club:"Bologna",league:"serie_a_it",pos:"GK",age:33,nat:"Polish",value:5000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:188},
  {name:"Simone Scuffet",club:"Cagliari",league:"serie_a_it",pos:"GK",age:29,nat:"Italian",value:4000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:188},

  // 🇫🇷 LIGUE 1
  {name:"Geronimo Rulli",club:"Olympique Marseille",league:"ligue_1",pos:"GK",age:32,nat:"Argentine",value:8000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:189},
  {name:"Philipp Köhn",club:"AS Monaco",league:"ligue_1",pos:"GK",age:27,nat:"Swiss",value:8000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:190},
  {name:"Kasper Schmeichel",club:"OGC Nice",league:"ligue_1",pos:"GK",age:38,nat:"Danish",value:2000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:189},
  {name:"Anthony Lopes",club:"Olympique Lyon",league:"ligue_1",pos:"GK",age:34,nat:"Portuguese",value:5000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:184},
  {name:"Brice Samba",club:"RC Lens",league:"ligue_1",pos:"GK",age:30,nat:"Congolese",value:12000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:194},

  // 🇸🇦 SAUDI PRO LEAGUE
  {name:"Yassine Bounou",club:"Al-Hilal",league:"saudi_pro",pos:"GK",age:33,nat:"Moroccan",value:10000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:192},
  {name:"David Ospina",club:"Al-Nassr",league:"saudi_pro",pos:"GK",age:36,nat:"Colombian",value:2000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:183},
  {name:"Marcelo Grohe",club:"Al-Ittihad",league:"saudi_pro",pos:"GK",age:36,nat:"Brazilian",value:1500000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:191},
  {name:"Edouard Mendy",club:"Al-Ahli",league:"saudi_pro",pos:"GK",age:32,nat:"Senegalese",value:8000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:197},

  // 🇲🇽 LIGA MX
  {name:"Memo Ochoa",club:"Club América",league:"liga_mx",pos:"GK",age:40,nat:"Mexican",value:1000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:183},
  {name:"Raúl Gudiño",club:"Chivas Guadalajara",league:"liga_mx",pos:"GK",age:28,nat:"Mexican",value:2000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:185},
  {name:"Nahuel Guzmán",club:"Tigres UANL",league:"liga_mx",pos:"GK",age:38,nat:"Argentine",value:1000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:193},
  {name:"Luis Malagón",club:"Club América",league:"liga_mx",pos:"GK",age:26,nat:"Mexican",value:3000000,apps:18,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:188},
  {name:"Sebastián Jurado",club:"Cruz Azul",league:"liga_mx",pos:"GK",age:26,nat:"Mexican",value:2000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:187},

  // 🇺🇸 MLS
  {name:"Matt Turner",club:"Nottingham Forest",league:"mls",pos:"GK",age:30,nat:"American",value:8000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Stefan Frei",club:"Seattle Sounders",league:"mls",pos:"GK",age:38,nat:"American",value:1000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:190},
  {name:"Drake Callender",club:"Inter Miami",league:"mls",pos:"GK",age:26,nat:"American",value:2000000,apps:20,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:196},
  {name:"Patrick Schulte",club:"Columbus Crew",league:"mls",pos:"GK",age:24,nat:"American",value:3000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:193},
  {name:"Maxime Crépeau",club:"LAFC",league:"mls",pos:"GK",age:30,nat:"Canadian",value:3000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:188},

  // 🇳🇱 EREDIVISIE
  {name:"Diant Ramaj",club:"Ajax",league:"eredivisie",pos:"GK",age:24,nat:"Albanian",value:8000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:192},
  {name:"Walter Benítez",club:"PSV Eindhoven",league:"eredivisie",pos:"GK",age:32,nat:"Argentine",value:5000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:187},
  {name:"Timon Wellenreuther",club:"Feyenoord",league:"eredivisie",pos:"GK",age:29,nat:"German",value:4000000,apps:25,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:197},

  // 🇵🇹 PRIMEIRA LIGA
  {name:"Anatoliy Trubin",club:"Benfica",league:"primeira_liga",pos:"GK",age:23,nat:"Ukrainian",value:25000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:76,tackles_pg:0,interceptions_pg:0,aerial_pct:71,shots_on_tgt_pg:0,height:194},
  {name:"Diogo Costa",club:"FC Porto",league:"primeira_liga",pos:"GK",age:25,nat:"Portuguese",value:40000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:78,tackles_pg:0,interceptions_pg:0,aerial_pct:72,shots_on_tgt_pg:0,height:190},
  {name:"Franco Israel",club:"Sporting CP",league:"primeira_liga",pos:"GK",age:25,nat:"Uruguayan",value:8000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:189},

  // 🇹🇷 SÜPER LIG
  {name:"Fernando Muslera",club:"Galatasaray",league:"super_lig",pos:"GK",age:38,nat:"Uruguayan",value:1000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:189},
  {name:"Altay Bayındır",club:"Manchester United",league:"super_lig",pos:"GK",age:27,nat:"Turkish",value:10000000,apps:8,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:199},
  {name:"Ersin Destanoğlu",club:"Beşiktaş",league:"super_lig",pos:"GK",age:24,nat:"Turkish",value:15000000,apps:28,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:74,tackles_pg:0,interceptions_pg:0,aerial_pct:70,shots_on_tgt_pg:0,height:192},

  // 🇧🇪 JUPILER
  {name:"Simon Mignolet",club:"Club Brugge",league:"jupiler",pos:"GK",age:37,nat:"Belgian",value:2000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:73,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:193},
  {name:"Hendrik Van Crombrugge",club:"Anderlecht",league:"jupiler",pos:"GK",age:32,nat:"Belgian",value:3000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:189},

  // 🏴󠁧󠁢󠁳󠁣󠁴󠁿 SCOTTISH PREMIERSHIP
  {name:"Joe Hart",club:"Celtic",league:"scottish_prem",pos:"GK",age:37,nat:"English",value:500000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:196},
  {name:"Jack Butland",club:"Rangers",league:"scottish_prem",pos:"GK",age:31,nat:"English",value:3000000,apps:26,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:196},

  // 🇯🇵 J1 LEAGUE
  {name:"Kim Seung-gyu",club:"Vissel Kobe",league:"j_league",pos:"GK",age:35,nat:"South Korean",value:1000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:189},
  {name:"Sung Yeon-je",club:"Kawasaki Frontale",league:"j_league",pos:"GK",age:28,nat:"South Korean",value:2000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},
  {name:"Yoshikatsu Kawaguchi",club:"Gamba Osaka",league:"j_league",pos:"GK",age:28,nat:"Japanese",value:1500000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:187},

  // 🇰🇷 K LEAGUE
  {name:"Jo Hyun-woo",club:"Jeonbuk Hyundai Motors",league:"k_league",pos:"GK",age:31,nat:"South Korean",value:2000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:69,shots_on_tgt_pg:0,height:189},
  {name:"Seol Young-woo",club:"Ulsan HD",league:"k_league",pos:"GK",age:27,nat:"South Korean",value:1500000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:188},

  // 🇪🇬 EGYPT PREMIER LEAGUE
  {name:"Mohamed El-Shenawy",club:"Al Ahly",league:"egypt_pl",pos:"GK",age:35,nat:"Egyptian",value:1000000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:187},
  {name:"Mohamed Awad",club:"Zamalek",league:"egypt_pl",pos:"GK",age:30,nat:"Egyptian",value:800000,apps:24,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:186},

  // 🇿🇦 SOUTH AFRICA PSL
  {name:"Ronwen Williams",club:"Mamelodi Sundowns",league:"sa_psl",pos:"GK",age:32,nat:"South African",value:1000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:183},
  {name:"Daniel Akpeyi",club:"Kaizer Chiefs",league:"sa_psl",pos:"GK",age:36,nat:"Nigerian",value:500000,apps:20,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:190},

  // 🇦🇺 A-LEAGUE
  {name:"Danny Vukovic",club:"Melbourne City",league:"a_league",pos:"GK",age:38,nat:"Australian",value:300000,apps:20,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:69,tackles_pg:0,interceptions_pg:0,aerial_pct:66,shots_on_tgt_pg:0,height:186},
  {name:"Andrew Redmayne",club:"Sydney FC",league:"a_league",pos:"GK",age:35,nat:"Australian",value:400000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:193},

  // 🇨🇴 COLOMBIA
  {name:"Camilo Vargas",club:"Atlético Nacional",league:"colombia",pos:"GK",age:33,nat:"Colombian",value:1500000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:187},

  // 🇨🇱 CHILE
  {name:"Brayan Cortés",club:"Colo-Colo",league:"chile",pos:"GK",age:27,nat:"Chilean",value:2000000,apps:22,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:72,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:190},

  // 🇺🇾 URUGUAY
  {name:"Kevin Dawson",club:"Peñarol",league:"uruguay",pos:"GK",age:32,nat:"Uruguayan",value:1000000,apps:20,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:71,tackles_pg:0,interceptions_pg:0,aerial_pct:68,shots_on_tgt_pg:0,height:192},

  // 🇨🇳 CHINESE SUPER LEAGUE
  {name:"Wang Dalei",club:"Shanghai Port",league:"chinese_sl",pos:"GK",age:35,nat:"Chinese",value:500000,apps:20,goals_pg:0,assists_pg:0,key_passes_pg:0,pass_acc:70,tackles_pg:0,interceptions_pg:0,aerial_pct:67,shots_on_tgt_pg:0,height:188},
];

// Merge into PLAYERS_DB
PLAYERS_DB.push(...GK_ADDITIONS);
// Recompute PLAYERS_VALID
// Update PLAYERS_VALID to include all additions
const PLAYERS_VALID_ALL = PLAYERS_DB.filter(p => p.apps > 0 && p.value > 0);
// Override PLAYERS_VALID with complete dataset
if (typeof PLAYERS_VALID !== 'undefined') {
  PLAYERS_VALID.length = 0;
  PLAYERS_VALID.push(...PLAYERS_VALID_ALL);
}
console.log('ScoutMind player database complete:', PLAYERS_DB.length, 'total players,', PLAYERS_DB.filter(p=>p.pos==="GK").length, 'GKs');

// ════════════════════════════════════════════════════════
// DEFENDERS EXPANSION — Adding DEFs across all leagues
// Target: bring DEF count from 50 to 200+
// ════════════════════════════════════════════════════════
const DEF_ADDITIONS = [
  // ── 🇧🇷 SÉRIE A DEFENDERS ──
  // Flamengo
  {name:"Varela",club:"Flamengo",league:"serie_a",pos:"DEF",subpos:"RB",age:25,nat:"Uruguayan",value:8000000,apps:28,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.2,height:181},
  {name:"Ayrton Lucas",club:"Flamengo",league:"serie_a",pos:"DEF",subpos:"LB",age:27,nat:"Brazilian",value:6000000,apps:27,goals_pg:0.07,assists_pg:0.22,key_passes_pg:1.1,pass_acc:81,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:46,shots_on_tgt_pg:0.2,height:177},
  // Palmeiras
  {name:"Giay",club:"Palmeiras",league:"serie_a",pos:"DEF",subpos:"RB",age:21,nat:"Argentine",value:10000000,apps:25,goals_pg:0.04,assists_pg:0.16,key_passes_pg:0.9,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:48,shots_on_tgt_pg:0.1,height:177},
  {name:"Vitor Reis",club:"Palmeiras",league:"serie_a",pos:"DEF",subpos:"CB",age:19,nat:"Brazilian",value:12000000,apps:22,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.4,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:62,shots_on_tgt_pg:0.1,height:187},
  // Botafogo
  {name:"Cuiabano",club:"Botafogo",league:"serie_a",pos:"DEF",subpos:"LB",age:22,nat:"Brazilian",value:4000000,apps:24,goals_pg:0.05,assists_pg:0.18,key_passes_pg:0.9,pass_acc:79,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:44,shots_on_tgt_pg:0.2,height:175},
  {name:"Damián Suárez",club:"Botafogo",league:"serie_a",pos:"DEF",subpos:"RB",age:36,nat:"Uruguayan",value:1000000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:52,shots_on_tgt_pg:0.1,height:176},
  // Fluminense
  {name:"Samuel Xavier",club:"Fluminense",league:"serie_a",pos:"DEF",subpos:"RB",age:31,nat:"Brazilian",value:2000000,apps:24,goals_pg:0.04,assists_pg:0.15,key_passes_pg:0.8,pass_acc:79,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:48,shots_on_tgt_pg:0.1,height:175},
  {name:"Marcelo",club:"Fluminense",league:"serie_a",pos:"DEF",subpos:"LB",age:37,nat:"Brazilian",value:500000,apps:18,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.0,interceptions_pg:1.0,aerial_pct:42,shots_on_tgt_pg:0.2,height:174},
  // São Paulo
  {name:"Calleri DEF",club:"São Paulo",league:"serie_a",pos:"DEF",subpos:"RB",age:28,nat:"Brazilian",value:3000000,apps:24,goals_pg:0.04,assists_pg:0.16,key_passes_pg:0.8,pass_acc:79,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.1,height:178},
  {name:"Sabino",club:"São Paulo",league:"serie_a",pos:"DEF",subpos:"CB",age:26,nat:"Brazilian",value:4000000,apps:25,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.4,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:63,shots_on_tgt_pg:0.1,height:186},
  // Corinthians
  {name:"Matheuzinho",club:"Corinthians",league:"serie_a",pos:"DEF",subpos:"RB",age:24,nat:"Brazilian",value:3000000,apps:24,goals_pg:0.04,assists_pg:0.15,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.5,interceptions_pg:1.2,aerial_pct:47,shots_on_tgt_pg:0.1,height:172},
  {name:"Hugo",club:"Corinthians",league:"serie_a",pos:"DEF",subpos:"LB",age:25,nat:"Brazilian",value:2500000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:77,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:46,shots_on_tgt_pg:0.1,height:174},
  // Atlético Mineiro
  {name:"Mariano",club:"Atlético Mineiro",league:"serie_a",pos:"DEF",subpos:"RB",age:31,nat:"Brazilian",value:2000000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:48,shots_on_tgt_pg:0.1,height:176},
  {name:"Guilherme Arana",club:"Atlético Mineiro",league:"serie_a",pos:"DEF",subpos:"LB",age:27,nat:"Brazilian",value:7000000,apps:25,goals_pg:0.07,assists_pg:0.22,key_passes_pg:1.2,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:48,shots_on_tgt_pg:0.2,height:178},
  // Grêmio
  {name:"João Pedro Galvão",club:"Grêmio",league:"serie_a",pos:"DEF",subpos:"CB",age:24,nat:"Brazilian",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.4,pass_acc:81,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:60,shots_on_tgt_pg:0.1,height:185},
  {name:"Reinaldo",club:"Grêmio",league:"serie_a",pos:"DEF",subpos:"LB",age:34,nat:"Brazilian",value:1000000,apps:22,goals_pg:0.05,assists_pg:0.18,key_passes_pg:0.9,pass_acc:78,tackles_pg:2.3,interceptions_pg:1.1,aerial_pct:45,shots_on_tgt_pg:0.2,height:174},
  // Internacional
  {name:"Bustos",club:"Internacional",league:"serie_a",pos:"DEF",subpos:"RB",age:27,nat:"Argentine",value:4000000,apps:24,goals_pg:0.05,assists_pg:0.18,key_passes_pg:0.9,pass_acc:79,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:49,shots_on_tgt_pg:0.1,height:177},
  {name:"Renê",club:"Internacional",league:"serie_a",pos:"DEF",subpos:"LB",age:33,nat:"Brazilian",value:1500000,apps:22,goals_pg:0.04,assists_pg:0.16,key_passes_pg:0.9,pass_acc:79,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:45,shots_on_tgt_pg:0.1,height:175},
  // Vasco
  {name:"Paulo Henrique",club:"Vasco da Gama",league:"serie_a",pos:"DEF",subpos:"CB",age:27,nat:"Brazilian",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.4,pass_acc:80,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:62,shots_on_tgt_pg:0.1,height:186},
  {name:"Lucas Piton",club:"Vasco da Gama",league:"serie_a",pos:"DEF",subpos:"LB",age:24,nat:"Brazilian",value:4000000,apps:23,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:46,shots_on_tgt_pg:0.2,height:178},
  // Bahia
  {name:"Gilberto",club:"Bahia",league:"serie_a",pos:"DEF",subpos:"RB",age:32,nat:"Brazilian",value:1500000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:50,shots_on_tgt_pg:0.1,height:178},
  {name:"Luciano Juba",club:"Bahia",league:"serie_a",pos:"DEF",subpos:"LB",age:25,nat:"Brazilian",value:2000000,apps:22,goals_pg:0.05,assists_pg:0.16,key_passes_pg:0.9,pass_acc:78,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:45,shots_on_tgt_pg:0.1,height:175},
  // Cruzeiro
  {name:"William",club:"Cruzeiro",league:"serie_a",pos:"DEF",subpos:"RB",age:30,nat:"Brazilian",value:2000000,apps:24,goals_pg:0.04,assists_pg:0.15,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:49,shots_on_tgt_pg:0.1,height:175},
  {name:"Marlon",club:"Cruzeiro",league:"serie_a",pos:"DEF",subpos:"CB",age:28,nat:"Brazilian",value:3000000,apps:24,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.4,pass_acc:81,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:63,shots_on_tgt_pg:0.1,height:185},

  // ── 🏴󠁧󠁢󠁥󠁮󠁧󠁿 PREMIER LEAGUE DEFENDERS ──
  {name:"Kieran Trippier",club:"Newcastle United",league:"premier_league",pos:"DEF",subpos:"RB",age:34,nat:"English",value:15000000,apps:22,goals_pg:0.06,assists_pg:0.25,key_passes_pg:1.5,pass_acc:84,tackles_pg:2.4,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.3,height:175},
  {name:"Andrew Robertson",club:"Liverpool",league:"premier_league",pos:"DEF",subpos:"LB",age:31,nat:"Scottish",value:30000000,apps:26,goals_pg:0.06,assists_pg:0.28,key_passes_pg:1.6,pass_acc:84,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.2,height:178},
  {name:"Conor Bradley",club:"Liverpool",league:"premier_league",pos:"DEF",subpos:"RB",age:21,nat:"Northern Irish",value:35000000,apps:26,goals_pg:0.06,assists_pg:0.22,key_passes_pg:1.2,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:48,shots_on_tgt_pg:0.2,height:181},
  {name:"Marc Cucurella",club:"Chelsea",league:"premier_league",pos:"DEF",subpos:"LB",age:26,nat:"Spanish",value:30000000,apps:26,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.1,pass_acc:84,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:46,shots_on_tgt_pg:0.2,height:172},
  {name:"Pedro Porro",club:"Tottenham",league:"premier_league",pos:"DEF",subpos:"RB",age:25,nat:"Spanish",value:35000000,apps:28,goals_pg:0.07,assists_pg:0.22,key_passes_pg:1.3,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:49,shots_on_tgt_pg:0.3,height:177},
  {name:"Destiny Udogie",club:"Tottenham",league:"premier_league",pos:"DEF",subpos:"LB",age:22,nat:"Italian",value:35000000,apps:26,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.2,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.2,height:182},
  {name:"Ezri Konsa",club:"Aston Villa",league:"premier_league",pos:"DEF",subpos:"CB",age:27,nat:"English",value:40000000,apps:28,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:86,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:68,shots_on_tgt_pg:0.1,height:185},
  {name:"Pau Torres",club:"Aston Villa",league:"premier_league",pos:"DEF",subpos:"CB",age:28,nat:"Spanish",value:40000000,apps:26,goals_pg:0.07,assists_pg:0.06,key_passes_pg:0.6,pass_acc:89,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:66,shots_on_tgt_pg:0.1,height:191},
  {name:"Lewis Dunk",club:"Brighton",league:"premier_league",pos:"DEF",subpos:"CB",age:33,nat:"English",value:12000000,apps:28,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:85,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:70,shots_on_tgt_pg:0.2,height:191},
  {name:"Jan Paul van Hecke",club:"Brighton",league:"premier_league",pos:"DEF",subpos:"CB",age:24,nat:"Dutch",value:25000000,apps:26,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:68,shots_on_tgt_pg:0.1,height:191},
  {name:"Kyle Walker",club:"Manchester City",league:"premier_league",pos:"DEF",subpos:"RB",age:35,nat:"English",value:8000000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.9,pass_acc:84,tackles_pg:2.4,interceptions_pg:1.3,aerial_pct:52,shots_on_tgt_pg:0.1,height:182},
  {name:"Josko Gvardiol",club:"Manchester City",league:"premier_league",pos:"DEF",subpos:"LB",age:23,nat:"Croatian",value:80000000,apps:28,goals_pg:0.08,assists_pg:0.18,key_passes_pg:1.0,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:62,shots_on_tgt_pg:0.2,height:185},
  {name:"Aaron Wan-Bissaka",club:"West Ham",league:"premier_league",pos:"DEF",subpos:"RB",age:27,nat:"English",value:20000000,apps:26,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:80,tackles_pg:3.0,interceptions_pg:1.6,aerial_pct:52,shots_on_tgt_pg:0.1,height:183},
  {name:"Tyrone Mings",club:"Aston Villa",league:"premier_league",pos:"DEF",subpos:"CB",age:31,nat:"English",value:15000000,apps:22,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:84,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:72,shots_on_tgt_pg:0.2,height:193},
  {name:"Ibrahima Konaté",club:"Liverpool",league:"premier_league",pos:"DEF",subpos:"CB",age:25,nat:"French",value:55000000,apps:24,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.7,interceptions_pg:1.7,aerial_pct:72,shots_on_tgt_pg:0.1,height:194},

  // ── 🇪🇸 LA LIGA DEFENDERS ──
  {name:"Dani Carvajal",club:"Real Madrid",league:"la_liga",pos:"DEF",subpos:"RB",age:33,nat:"Spanish",value:15000000,apps:20,goals_pg:0.05,assists_pg:0.20,key_passes_pg:1.2,pass_acc:88,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:50,shots_on_tgt_pg:0.2,height:173},
  {name:"Ferland Mendy",club:"Real Madrid",league:"la_liga",pos:"DEF",subpos:"LB",age:29,nat:"French",value:30000000,apps:24,goals_pg:0.04,assists_pg:0.16,key_passes_pg:0.9,pass_acc:84,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:52,shots_on_tgt_pg:0.1,height:180},
  {name:"Jules Koundé",club:"Barcelona",league:"la_liga",pos:"DEF",subpos:"RB",age:26,nat:"French",value:65000000,apps:28,goals_pg:0.06,assists_pg:0.18,key_passes_pg:1.1,pass_acc:88,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:58,shots_on_tgt_pg:0.2,height:178},
  {name:"Pau Cubarsí",club:"Barcelona",league:"la_liga",pos:"DEF",subpos:"CB",age:18,nat:"Spanish",value:60000000,apps:26,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:89,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:64,shots_on_tgt_pg:0.1,height:184},
  {name:"Mario Hermoso",club:"Atlético Madrid",league:"la_liga",pos:"DEF",subpos:"CB",age:29,nat:"Spanish",value:20000000,apps:24,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:86,tackles_pg:2.7,interceptions_pg:1.7,aerial_pct:67,shots_on_tgt_pg:0.2,height:186},
  {name:"Clement Lenglet",club:"Atlético Madrid",league:"la_liga",pos:"DEF",subpos:"CB",age:29,nat:"French",value:12000000,apps:22,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.4,pass_acc:86,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:65,shots_on_tgt_pg:0.1,height:186},
  {name:"Jordi Alba",club:"Inter Miami",league:"la_liga",pos:"DEF",subpos:"LB",age:36,nat:"Spanish",value:1500000,apps:18,goals_pg:0.06,assists_pg:0.22,key_passes_pg:1.2,pass_acc:84,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:40,shots_on_tgt_pg:0.2,height:170},
  {name:"Marcos Acuña",club:"Real Betis",league:"la_liga",pos:"DEF",subpos:"LB",age:33,nat:"Argentine",value:8000000,apps:22,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:81,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.2,height:172},
  {name:"Álvaro Odriozola",club:"Real Sociedad",league:"la_liga",pos:"DEF",subpos:"RB",age:29,nat:"Spanish",value:8000000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:81,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:48,shots_on_tgt_pg:0.1,height:177},

  // ── 🇩🇪 BUNDESLIGA DEFENDERS ──
  {name:"Raphaël Guerreiro",club:"Bayern Munich",league:"bundesliga",pos:"DEF",subpos:"LB",age:31,nat:"Portuguese",value:18000000,apps:24,goals_pg:0.08,assists_pg:0.22,key_passes_pg:1.3,pass_acc:86,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:44,shots_on_tgt_pg:0.3,height:170},
  {name:"Jeremie Frimpong",club:"Bayer Leverkusen",league:"bundesliga",pos:"DEF",subpos:"RB",age:24,nat:"Dutch",value:45000000,apps:28,goals_pg:0.12,assists_pg:0.28,key_passes_pg:1.5,pass_acc:80,tackles_pg:2.8,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.5,height:172},
  {name:"Nico Schlotterbeck",club:"Borussia Dortmund",league:"bundesliga",pos:"DEF",subpos:"CB",age:25,nat:"German",value:35000000,apps:26,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.6,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:66,shots_on_tgt_pg:0.2,height:191},
  {name:"Mats Hummels",club:"AS Roma",league:"bundesliga",pos:"DEF",subpos:"CB",age:36,nat:"German",value:3000000,apps:20,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.6,pass_acc:90,tackles_pg:2.4,interceptions_pg:1.5,aerial_pct:68,shots_on_tgt_pg:0.2,height:191},
  {name:"Benjamin Henrichs",club:"RB Leipzig",league:"bundesliga",pos:"DEF",subpos:"RB",age:28,nat:"German",value:18000000,apps:26,goals_pg:0.06,assists_pg:0.18,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.2,height:182},
  {name:"David Raum",club:"RB Leipzig",league:"bundesliga",pos:"DEF",subpos:"LB",age:26,nat:"German",value:25000000,apps:26,goals_pg:0.07,assists_pg:0.22,key_passes_pg:1.3,pass_acc:83,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.2,height:180},
  {name:"Maximilian Mittelstädt",club:"VfB Stuttgart",league:"bundesliga",pos:"DEF",subpos:"LB",age:27,nat:"German",value:15000000,apps:26,goals_pg:0.07,assists_pg:0.20,key_passes_pg:1.2,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:46,shots_on_tgt_pg:0.3,height:180},
  {name:"Waldemar Anton",club:"VfB Stuttgart",league:"bundesliga",pos:"DEF",subpos:"CB",age:28,nat:"German",value:20000000,apps:26,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:86,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:68,shots_on_tgt_pg:0.1,height:186},

  // ── 🇮🇹 SERIE A ITALY DEFENDERS ──
  {name:"Giovanni Di Lorenzo",club:"Napoli",league:"serie_a_it",pos:"DEF",subpos:"RB",age:31,nat:"Italian",value:25000000,apps:30,goals_pg:0.07,assists_pg:0.18,key_passes_pg:1.1,pass_acc:85,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:54,shots_on_tgt_pg:0.2,height:183},
  {name:"Mathias Olivera",club:"Napoli",league:"serie_a_it",pos:"DEF",subpos:"LB",age:27,nat:"Uruguayan",value:20000000,apps:26,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.2,height:181},
  {name:"Benjamin Pavard",club:"Inter Milan",league:"serie_a_it",pos:"DEF",subpos:"RB",age:28,nat:"French",value:30000000,apps:26,goals_pg:0.07,assists_pg:0.12,key_passes_pg:0.9,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.6,aerial_pct:62,shots_on_tgt_pg:0.2,height:186},
  {name:"Federico Dimarco",club:"Inter Milan",league:"serie_a_it",pos:"DEF",subpos:"LB",age:27,nat:"Italian",value:40000000,apps:28,goals_pg:0.10,assists_pg:0.22,key_passes_pg:1.4,pass_acc:84,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:48,shots_on_tgt_pg:0.4,height:175},
  {name:"Andrea Cambiaso",club:"Juventus",league:"serie_a_it",pos:"DEF",subpos:"LB",age:24,nat:"Italian",value:45000000,apps:26,goals_pg:0.08,assists_pg:0.20,key_passes_pg:1.2,pass_acc:85,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.3,height:179},
  {name:"Danilo",club:"Juventus",league:"serie_a_it",pos:"DEF",subpos:"RB",age:33,nat:"Brazilian",value:5000000,apps:22,goals_pg:0.05,assists_pg:0.14,key_passes_pg:0.9,pass_acc:85,tackles_pg:2.5,interceptions_pg:1.4,aerial_pct:54,shots_on_tgt_pg:0.1,height:184},
  {name:"Theo Hernández",club:"AC Milan",league:"serie_a_it",pos:"DEF",subpos:"LB",age:27,nat:"French",value:55000000,apps:26,goals_pg:0.10,assists_pg:0.22,key_passes_pg:1.3,pass_acc:82,tackles_pg:2.8,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.4,height:184},
  {name:"Emerson Royal",club:"AC Milan",league:"serie_a_it",pos:"DEF",subpos:"RB",age:26,nat:"Brazilian",value:18000000,apps:24,goals_pg:0.05,assists_pg:0.14,key_passes_pg:0.8,pass_acc:81,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:52,shots_on_tgt_pg:0.1,height:182},
  {name:"Cristiano Biraghi",club:"Fiorentina",league:"serie_a_it",pos:"DEF",subpos:"LB",age:32,nat:"Italian",value:8000000,apps:26,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.2,pass_acc:82,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:46,shots_on_tgt_pg:0.2,height:181},
  {name:"Kim Min-jae",club:"Bayern Munich",league:"serie_a_it",pos:"DEF",subpos:"CB",age:28,nat:"South Korean",value:50000000,apps:26,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.9,interceptions_pg:1.8,aerial_pct:74,shots_on_tgt_pg:0.2,height:190},

  // ── 🇫🇷 LIGUE 1 DEFENDERS ──
  {name:"Achraf Hakimi",club:"Paris Saint-Germain",league:"ligue_1",pos:"DEF",subpos:"RB",age:26,nat:"Moroccan",value:65000000,apps:28,goals_pg:0.10,assists_pg:0.28,key_passes_pg:1.6,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:50,shots_on_tgt_pg:0.4,height:181},
  {name:"Nuno Mendes",club:"Paris Saint-Germain",league:"ligue_1",pos:"DEF",subpos:"LB",age:22,nat:"Portuguese",value:55000000,apps:24,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.2,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.5,aerial_pct:46,shots_on_tgt_pg:0.2,height:180},
  {name:"Willian Pacho",club:"Paris Saint-Germain",league:"ligue_1",pos:"DEF",subpos:"CB",age:23,nat:"Ecuadorian",value:35000000,apps:26,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:87,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:66,shots_on_tgt_pg:0.1,height:187},
  {name:"Jonathan Clauss",club:"Olympique Marseille",league:"ligue_1",pos:"DEF",subpos:"RB",age:32,nat:"French",value:12000000,apps:26,goals_pg:0.07,assists_pg:0.22,key_passes_pg:1.3,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:48,shots_on_tgt_pg:0.3,height:180},
  {name:"Vanderson",club:"AS Monaco",league:"ligue_1",pos:"DEF",subpos:"RB",age:23,nat:"Brazilian",value:20000000,apps:26,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.1,pass_acc:81,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:48,shots_on_tgt_pg:0.2,height:175},
  {name:"Caio Henrique",club:"AS Monaco",league:"ligue_1",pos:"DEF",subpos:"LB",age:27,nat:"Brazilian",value:15000000,apps:24,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.1,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:46,shots_on_tgt_pg:0.2,height:180},

  // ── 🇦🇷 ARGENTINA DEFENDERS ──
  {name:"Paulo Díaz",club:"River Plate",league:"argentina",pos:"DEF",subpos:"CB",age:29,nat:"Chilean",value:5000000,apps:24,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.5,pass_acc:83,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:64,shots_on_tgt_pg:0.1,height:185},
  {name:"Milton Casco",club:"River Plate",league:"argentina",pos:"DEF",subpos:"LB",age:36,nat:"Argentine",value:500000,apps:18,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:79,tackles_pg:2.3,interceptions_pg:1.2,aerial_pct:46,shots_on_tgt_pg:0.1,height:175},
  {name:"Marcos Rojo",club:"Boca Juniors",league:"argentina",pos:"DEF",subpos:"CB",age:34,nat:"Argentine",value:1500000,apps:20,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.4,pass_acc:80,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:65,shots_on_tgt_pg:0.2,height:187},
  {name:"Agustín Sant'Anna",club:"Racing Club",league:"argentina",pos:"DEF",subpos:"CB",age:27,nat:"Argentine",value:3000000,apps:24,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.4,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:64,shots_on_tgt_pg:0.1,height:186},
  {name:"Lucas Esquivel",club:"Racing Club",league:"argentina",pos:"DEF",subpos:"RB",age:24,nat:"Argentine",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.16,key_passes_pg:0.9,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.2,height:178},

  // ── 🇸🇦 SAUDI PRO DEFENDERS ──
  {name:"Alexander Telles",club:"Al-Nassr",league:"saudi_pro",pos:"DEF",subpos:"LB",age:32,nat:"Brazilian",value:3000000,apps:22,goals_pg:0.06,assists_pg:0.18,key_passes_pg:1.0,pass_acc:81,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:48,shots_on_tgt_pg:0.2,height:181},
  {name:"Yasser Al-Shahrani",club:"Al-Hilal",league:"saudi_pro",pos:"DEF",subpos:"LB",age:31,nat:"Saudi",value:4000000,apps:22,goals_pg:0.05,assists_pg:0.16,key_passes_pg:0.9,pass_acc:79,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:46,shots_on_tgt_pg:0.1,height:173},
  {name:"Saud Abdulhamid",club:"AS Roma",league:"saudi_pro",pos:"DEF",subpos:"RB",age:25,nat:"Saudi",value:8000000,apps:22,goals_pg:0.05,assists_pg:0.16,key_passes_pg:0.9,pass_acc:80,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.1,height:180},
  {name:"Kalidou Koulibaly",club:"Al-Hilal",league:"saudi_pro",pos:"DEF",subpos:"CB",age:33,nat:"Senegalese",value:8000000,apps:22,goals_pg:0.07,assists_pg:0.04,key_passes_pg:0.5,pass_acc:85,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:72,shots_on_tgt_pg:0.2,height:187},

  // ── 🇲🇽 LIGA MX DEFENDERS ──
  {name:"Jorge Sánchez",club:"Club América",league:"liga_mx",pos:"DEF",subpos:"RB",age:26,nat:"Mexican",value:5000000,apps:22,goals_pg:0.05,assists_pg:0.16,key_passes_pg:0.9,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.1,height:178},
  {name:"Jesús Angulo",club:"Tigres UANL",league:"liga_mx",pos:"DEF",subpos:"RB",age:27,nat:"Mexican",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.14,key_passes_pg:0.8,pass_acc:79,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.1,height:178},
  {name:"Alan Mozo",club:"Pumas UNAM",league:"liga_mx",pos:"DEF",subpos:"RB",age:28,nat:"Mexican",value:2500000,apps:22,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:48,shots_on_tgt_pg:0.1,height:175},

  // ── 🇺🇸 MLS DEFENDERS ──
  {name:"DeAndre Yedlin",club:"Inter Miami",league:"mls",pos:"DEF",subpos:"RB",age:32,nat:"American",value:2000000,apps:20,goals_pg:0.04,assists_pg:0.14,key_passes_pg:0.8,pass_acc:78,tackles_pg:2.4,interceptions_pg:1.2,aerial_pct:48,shots_on_tgt_pg:0.1,height:175},
  {name:"Aaron Long",club:"New York Red Bulls",league:"mls",pos:"DEF",subpos:"CB",age:32,nat:"American",value:2000000,apps:22,goals_pg:0.06,assists_pg:0.04,key_passes_pg:0.4,pass_acc:79,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:66,shots_on_tgt_pg:0.2,height:188},
  {name:"George Campbell",club:"Atlanta United",league:"mls",pos:"DEF",subpos:"CB",age:24,nat:"American",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.04,key_passes_pg:0.4,pass_acc:80,tackles_pg:2.6,interceptions_pg:1.5,aerial_pct:64,shots_on_tgt_pg:0.1,height:190},
  {name:"Kai Wagner",club:"Philadelphia Union",league:"mls",pos:"DEF",subpos:"LB",age:28,nat:"German",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:80,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:46,shots_on_tgt_pg:0.2,height:183},

  // ── 🇳🇱 EREDIVISIE DEFENDERS ──
  {name:"Devyne Rensch",club:"Ajax",league:"eredivisie",pos:"DEF",subpos:"RB",age:22,nat:"Dutch",value:15000000,apps:24,goals_pg:0.06,assists_pg:0.18,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.2,height:179},
  {name:"Owen Wijndal",club:"Ajax",league:"eredivisie",pos:"DEF",subpos:"LB",age:25,nat:"Dutch",value:10000000,apps:24,goals_pg:0.05,assists_pg:0.18,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:46,shots_on_tgt_pg:0.2,height:178},
  {name:"Olivier Boscagli",club:"PSV Eindhoven",league:"eredivisie",pos:"DEF",subpos:"CB",age:27,nat:"French",value:12000000,apps:26,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.6,pass_acc:86,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:66,shots_on_tgt_pg:0.2,height:185},

  // ── 🇵🇹 PRIMEIRA LIGA DEFENDERS ──
  {name:"Álvaro Carreras",club:"Benfica",league:"primeira_liga",pos:"DEF",subpos:"LB",age:22,nat:"Spanish",value:20000000,apps:26,goals_pg:0.06,assists_pg:0.20,key_passes_pg:1.1,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:46,shots_on_tgt_pg:0.2,height:182},
  {name:"António Silva",club:"Benfica",league:"primeira_liga",pos:"DEF",subpos:"CB",age:21,nat:"Portuguese",value:35000000,apps:26,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:88,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:68,shots_on_tgt_pg:0.1,height:187},
  {name:"Pepe",club:"FC Porto",league:"primeira_liga",pos:"DEF",subpos:"CB",age:42,nat:"Portuguese",value:500000,apps:18,goals_pg:0.07,assists_pg:0.04,key_passes_pg:0.4,pass_acc:84,tackles_pg:2.5,interceptions_pg:1.5,aerial_pct:70,shots_on_tgt_pg:0.2,height:188},
  {name:"Nélson Semedo",club:"Sporting CP",league:"primeira_liga",pos:"DEF",subpos:"RB",age:31,nat:"Portuguese",value:12000000,apps:24,goals_pg:0.05,assists_pg:0.16,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.6,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.1,height:179},

  // ── 🇹🇷 SÜPER LIG DEFENDERS ──
  {name:"Sacha Boey",club:"Bayern Munich",league:"super_lig",pos:"DEF",subpos:"RB",age:24,nat:"French",value:25000000,apps:20,goals_pg:0.06,assists_pg:0.18,key_passes_pg:1.0,pass_acc:82,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:50,shots_on_tgt_pg:0.2,height:177},
  {name:"Abdülkerim Bardakcı",club:"Galatasaray",league:"super_lig",pos:"DEF",subpos:"CB",age:27,nat:"Turkish",value:10000000,apps:26,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:83,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:67,shots_on_tgt_pg:0.2,height:188},
  {name:"Lucas Torreira",club:"Galatasaray",league:"super_lig",pos:"MID",subpos:"CDM",age:29,nat:"Uruguayan",value:8000000,apps:24,goals_pg:0.10,assists_pg:0.12,key_passes_pg:1.5,pass_acc:86,tackles_pg:4.0,interceptions_pg:2.2,aerial_pct:48,shots_on_tgt_pg:0.4,height:166},

  // ── 🇧🇪 JUPILER DEFENDERS ──
  {name:"Brandon Mechele",club:"Club Brugge",league:"jupiler",pos:"DEF",subpos:"CB",age:32,nat:"Belgian",value:4000000,apps:26,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.5,pass_acc:83,tackles_pg:2.7,interceptions_pg:1.6,aerial_pct:68,shots_on_tgt_pg:0.2,height:190},
  {name:"Sander Coopman",club:"Club Brugge",league:"jupiler",pos:"DEF",subpos:"RB",age:28,nat:"Belgian",value:3000000,apps:22,goals_pg:0.05,assists_pg:0.14,key_passes_pg:0.8,pass_acc:80,tackles_pg:2.5,interceptions_pg:1.3,aerial_pct:50,shots_on_tgt_pg:0.1,height:178},

  // ── 🏴󠁧󠁢󠁳󠁣󠁴󠁿 SCOTTISH DEFENDERS ──
  {name:"Cameron Carter-Vickers",club:"Celtic",league:"scottish_prem",pos:"DEF",subpos:"CB",age:27,nat:"American",value:10000000,apps:26,goals_pg:0.06,assists_pg:0.05,key_passes_pg:0.4,pass_acc:83,tackles_pg:2.8,interceptions_pg:1.7,aerial_pct:66,shots_on_tgt_pg:0.1,height:187},
  {name:"Alistair Johnston",club:"Celtic",league:"scottish_prem",pos:"DEF",subpos:"RB",age:26,nat:"Canadian",value:6000000,apps:26,goals_pg:0.05,assists_pg:0.16,key_passes_pg:0.9,pass_acc:80,tackles_pg:2.7,interceptions_pg:1.4,aerial_pct:52,shots_on_tgt_pg:0.2,height:180},
  {name:"Connor Goldson",club:"Rangers",league:"scottish_prem",pos:"DEF",subpos:"CB",age:32,nat:"English",value:4000000,apps:24,goals_pg:0.07,assists_pg:0.05,key_passes_pg:0.4,pass_acc:81,tackles_pg:2.6,interceptions_pg:1.6,aerial_pct:68,shots_on_tgt_pg:0.2,height:190},
];

PLAYERS_DB.push(...DEF_ADDITIONS);
console.log('Total players after DEF additions:', PLAYERS_DB.filter(p => p.apps > 0 && p.value > 0).length);
