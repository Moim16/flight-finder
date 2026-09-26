// =============================================================================
//  Fichas de aviones militares: que es, para que se usa y sus datos basicos.
//
//  Se buscan por el codigo ICAO del modelo (el `type` que transmite o que
//  trae la base de datos: C17, K35R, P8...). Son datos PUBLICOS y aproximados,
//  los que figuran en las fichas de los fabricantes y enciclopedias: sirven
//  para entender que se esta viendo, no como especificacion tecnica.
//
//  Ademas, los indicativos de algunas fuerzas son conocidos (RCH = transporte
//  de la USAF, FORTE = dron Global Hawk...). Se usan para decir quien opera
//  el avion y para marcarlo como militar aunque la base no lo diga.
// =============================================================================

// Usos, en el orden en que se muestran.
export const ROLES = {
  transport: "Transporte",
  tanker: "Reabastecimiento en vuelo",
  awacs: "Alerta temprana y control",
  recon: "Reconocimiento e inteligencia",
  maritime: "Patrulla marítima",
  command: "Puesto de mando y comunicaciones",
  fighter: "Caza",
  bomber: "Bombardero",
  helicopter: "Helicóptero",
  tiltrotor: "Convertiplano",
  drone: "Dron",
  trainer: "Entrenamiento",
  liaison: "Enlace y transporte de autoridades",
  sar: "Búsqueda y rescate",
};

// Modelos que tambien vuelan como civiles (un Gulfstream puede ser un jet
// privado, un King Air un taxi aereo). Su ficha militar solo se muestra si el
// avion viene marcado como militar, y por si solos no lo marcan como tal.
export const DUAL_USE = new Set(["C130", "H47", "EC45", "GLF5", "B350", "AS65"]);

// specs: pares [etiqueta, valor] con los 2-3 datos que mejor explican el avion.
const T = (name, maker, role, firstFlight, crew, description, specs, operators) =>
  ({ name, maker, role, firstFlight, crew, description, specs, operators });

export const MILITARY_TYPES = {
  C17: T("C-17 Globemaster III", "Boeing", "transport", 1991, "3",
    "Transporte estratégico: lleva carga pesada, vehículos y tropas a otros continentes y puede aterrizar en pistas cortas.",
    [["Carga máxima", "≈ 77 t"], ["Velocidad de crucero", "≈ 830 km/h"]],
    "EE. UU., Reino Unido, Australia, Canadá, India, Catar, EAU, Kuwait y la OTAN"),
  C5M: T("C-5M Super Galaxy", "Lockheed Martin", "transport", 1968, "7",
    "El transporte más grande de la Fuerza Aérea de EE. UU.: mueve helicópteros, blindados y cargas que no caben en otro avión.",
    [["Carga máxima", "≈ 127 t"], ["Velocidad de crucero", "≈ 830 km/h"]],
    "EE. UU."),
  C130: T("C-130 Hercules", "Lockheed", "transport", 1954, "5",
    "Transporte táctico de cuatro hélices: carga, tropas, paracaidistas y evacuación médica, incluso desde pistas de tierra.",
    [["Carga máxima", "≈ 19 t"], ["Velocidad de crucero", "≈ 540 km/h"]],
    "Más de 60 países, entre ellos Chile"),
  C30J: T("C-130J Super Hercules", "Lockheed Martin", "transport", 1996, "3",
    "Versión moderna del Hercules, con motores y cabina nuevos: más alcance y menos tripulación para las mismas misiones tácticas.",
    [["Carga máxima", "≈ 19 t"], ["Velocidad de crucero", "≈ 640 km/h"]],
    "EE. UU., Reino Unido, Australia, Canadá, India, Italia, Francia, Alemania y otros"),
  A400: T("A400M Atlas", "Airbus", "transport", 2009, "3-4",
    "Transporte europeo que cubre el hueco entre el Hercules y el C-17; también puede reabastecer a otros aviones en vuelo.",
    [["Carga máxima", "≈ 37 t"], ["Velocidad de crucero", "≈ 780 km/h"]],
    "Alemania, Francia, España, Reino Unido, Turquía, Bélgica, Luxemburgo, Malasia, Kazajistán e Indonesia"),
  C27J: T("C-27J Spartan", "Leonardo", "transport", 1999, "2-3",
    "Transporte táctico mediano para pistas cortas y no preparadas.",
    [["Carga máxima", "≈ 11 t"]],
    "Italia, Australia, Grecia, Rumania, Perú y otros"),
  K35R: T("KC-135R Stratotanker", "Boeing", "tanker", 1956, "3",
    "Avión cisterna: vuela junto a cazas, bombarderos y transportes para pasarles combustible en el aire y extender su alcance.",
    [["Combustible que transfiere", "≈ 90 t"], ["Velocidad de crucero", "≈ 850 km/h"]],
    "EE. UU., Francia, Turquía, Singapur y Chile"),
  R135: T("RC-135 (Rivet Joint y variantes)", "Boeing", "recon", 1961, "≈ 25 (3 pilotos + especialistas)",
    "Inteligencia de señales: capta y analiza emisiones de radares y comunicaciones a gran distancia, sin entrar en el territorio vigilado.",
    [["Autonomía", "≈ 10 h, más con reabastecimiento"]],
    "EE. UU. y Reino Unido (Airseeker)"),
  E3TF: T("E-3 Sentry (AWACS)", "Boeing", "awacs", 1976, "4 de vuelo + 13-19 de misión",
    "Radar volante: el disco sobre el fuselaje vigila cientos de kilómetros a la redonda y coordina a los demás aviones.",
    [["Alcance del radar", "> 400 km"], ["Autonomía", "≈ 8 h"]],
    "EE. UU., OTAN, Francia y Arabia Saudita"),
  E3CF: null,   // misma ficha que E3TF (se completa abajo)
  E6: T("E-6 Mercury", "Boeing", "command", 1987, "≈ 22",
    "Enlace de comunicaciones con los submarinos estratégicos y puesto de mando aerotransportado de EE. UU.",
    [["Autonomía", "≈ 15 h"]],
    "EE. UU. (Marina)"),
  P8: T("P-8 Poseidon", "Boeing", "maritime", 2009, "9",
    "Patrulla marítima y antisubmarina basada en el Boeing 737: vigila rutas marítimas, busca submarinos y apoya rescates en el mar.",
    [["Autonomía", "≈ 10 h"], ["Velocidad", "≈ 900 km/h"]],
    "EE. UU., Australia, India, Reino Unido, Noruega, Nueva Zelanda, Corea del Sur y Alemania"),
  P3: T("P-3 Orion", "Lockheed", "maritime", 1959, "≈ 11",
    "Patrulla marítima de cuatro hélices, antecesor del P-8: vigilancia del mar, búsqueda de submarinos y rescate.",
    [["Autonomía", "≈ 12 h"]],
    "EE. UU., Japón, Australia, Chile, Argentina, Brasil y otros"),
  B52: T("B-52 Stratofortress", "Boeing", "bomber", 1952, "5",
    "Bombardero estratégico de largo alcance, en servicio desde los años 50 y modernizado varias veces.",
    [["Alcance", "≈ 14.000 km"], ["Velocidad de crucero", "≈ 840 km/h"]],
    "EE. UU."),
  B1: T("B-1B Lancer", "Rockwell", "bomber", 1974, "4",
    "Bombardero supersónico de ala de geometría variable (las alas se abren o se pliegan según la velocidad).",
    [["Velocidad máxima", "≈ Mach 1,25"]],
    "EE. UU."),
  B2: T("B-2 Spirit", "Northrop Grumman", "bomber", 1989, "2",
    "Bombardero furtivo con forma de ala volante, diseñado para ser difícil de detectar por radar.",
    [["Alcance", "≈ 11.000 km"]],
    "EE. UU."),
  F16: T("F-16 Fighting Falcon", "General Dynamics / Lockheed Martin", "fighter", 1974, "1",
    "Caza multirol monomotor: combate aéreo y ataque a tierra. Uno de los cazas más usados del mundo.",
    [["Velocidad máxima", "≈ Mach 2"]],
    "Más de 25 países, entre ellos Chile, EE. UU., Israel, Turquía y Grecia"),
  F15: T("F-15 Eagle", "McDonnell Douglas / Boeing", "fighter", 1972, "1-2",
    "Caza bimotor pensado para la superioridad aérea; las versiones E/EX también atacan a tierra.",
    [["Velocidad máxima", "≈ Mach 2,5"]],
    "EE. UU., Israel, Japón, Arabia Saudita, Catar, Singapur y Corea del Sur"),
  F35: T("F-35 Lightning II", "Lockheed Martin", "fighter", 2006, "1",
    "Caza furtivo multirol de quinta generación, con sensores que comparten información con otros aviones.",
    [["Velocidad máxima", "≈ Mach 1,6"]],
    "EE. UU., Reino Unido, Italia, Países Bajos, Noruega, Dinamarca, Australia, Japón, Corea del Sur, Israel y otros"),
  EUFI: T("Eurofighter Typhoon", "Eurofighter (Airbus, BAE, Leonardo)", "fighter", 1994, "1",
    "Caza multirol bimotor europeo, muy ágil: defensa aérea y ataque.",
    [["Velocidad máxima", "≈ Mach 2"]],
    "Alemania, Reino Unido, Italia, España, Austria, Arabia Saudita, Omán, Kuwait y Catar"),
  U2: T("U-2 Dragon Lady", "Lockheed", "recon", 1955, "1",
    "Reconocimiento a muy gran altitud (sobre 21.000 m), con cámaras y sensores; el piloto usa traje presurizado.",
    [["Techo", "> 21.000 m"]],
    "EE. UU."),
  GLHK: T("RQ-4 Global Hawk", "Northrop Grumman", "drone", 1998, "Sin tripulación a bordo",
    "Dron de reconocimiento a gran altitud: vigila áreas enormes durante más de un día. Suele transmitir con el indicativo FORTE.",
    [["Autonomía", "> 30 h"], ["Altitud", "≈ 18.000 m"]],
    "EE. UU., OTAN, Japón y Corea del Sur"),
  Q9: T("MQ-9 Reaper", "General Atomics", "drone", 2001, "Sin tripulación a bordo",
    "Dron de vigilancia y ataque de mediana altitud, pilotado a distancia.",
    [["Autonomía", "≈ 27 h"]],
    "EE. UU., Reino Unido, Francia, Italia, España, Países Bajos y otros"),
  H60: T("H-60 Black Hawk / Seahawk", "Sikorsky", "helicopter", 1974, "2-4",
    "Helicóptero utilitario: transporte de tropas, evacuación médica, rescate y, en su versión naval, guerra antisubmarina.",
    [["Pasajeros", "≈ 11 soldados"], ["Velocidad", "≈ 280 km/h"]],
    "EE. UU., Chile, Colombia, México, Australia, Japón y muchos otros"),
  H47: T("CH-47 Chinook", "Boeing", "helicopter", 1961, "3",
    "Helicóptero de carga pesada con dos rotores en tándem: mueve tropas, artillería y cargas colgadas.",
    [["Carga", "≈ 10 t"]],
    "EE. UU., Reino Unido, España, Países Bajos, Italia, Canadá, Australia, India y otros"),
  V22: T("V-22 Osprey", "Bell / Boeing", "tiltrotor", 1989, "3-4",
    "Convertiplano: despega y aterriza como helicóptero y gira sus motores para volar como avión.",
    [["Pasajeros", "≈ 24 soldados"], ["Velocidad", "≈ 450 km/h"]],
    "EE. UU. y Japón"),
  TEX2: T("T-6 Texan II", "Beechcraft / Textron", "trainer", 1998, "2",
    "Avión de entrenamiento básico de una hélice: es donde se forman los futuros pilotos militares.",
    [["Velocidad máxima", "≈ 590 km/h"]],
    "EE. UU., Canadá, Reino Unido, Grecia, Israel, México, Argentina, Marruecos, Nueva Zelanda y otros"),
  EC45: T("H145M / UH-72 Lakota", "Airbus Helicopters", "helicopter", 1999, "2",
    "Helicóptero utilitario ligero: enlace, entrenamiento, evacuación médica y apoyo en emergencias.",
    [["Pasajeros", "≈ 8-9"]],
    "EE. UU. (Ejército y Guardia Nacional), Alemania, Hungría, Serbia, Tailandia y otros"),
  GLF5: T("C-37A (Gulfstream V)", "Gulfstream", "liaison", 1995, "4-5",
    "Jet ejecutivo en versión militar: traslada autoridades civiles y militares de alto nivel.",
    [["Alcance", "≈ 11.000 km"]],
    "EE. UU. y otras fuerzas aéreas"),
  B350: T("C-12 Huron / MC-12 (King Air 350)", "Beechcraft", "liaison", 1972, "2",
    "Bimotor de hélice para enlace y transporte liviano; la versión MC-12 lleva sensores de vigilancia.",
    [["Pasajeros", "≈ 8"]],
    "EE. UU. y muchas otras fuerzas"),
  AS65: T("MH-65 Dolphin (AS365 Dauphin)", "Airbus Helicopters", "sar", 1975, "4",
    "Helicóptero de búsqueda y rescate: salvamento en el mar, vigilancia costera y control de puertos.",
    [["Autonomía", "≈ 3 h"]],
    "Guardia Costera de EE. UU. y fuerzas de otros países"),
};
MILITARY_TYPES.E3CF = MILITARY_TYPES.E3TF;

// Indicativos de fuerzas conocidas (los primeros caracteres del callsign).
export const MILITARY_CALLSIGNS = {
  RCH: "REACH · Mando de Movilidad Aérea de la Fuerza Aérea de EE. UU. (transporte y cisternas)",
  CNV: "CONVOY · Marina de EE. UU.",
  PAT: "PAT · Ejército de EE. UU. (transporte)",
  SPAR: "SPAR · Fuerza Aérea de EE. UU., transporte de autoridades",
  SAM: "SAM · Fuerza Aérea de EE. UU., misión aérea especial (autoridades)",
  FORTE: "FORTE · Fuerza Aérea de EE. UU., dron RQ-4 Global Hawk",
  RRR: "ASCOT · Real Fuerza Aérea británica (transporte y cisternas)",
  GAF: "Fuerza Aérea alemana",
  IAM: "Fuerza Aérea italiana",
  BAF: "Componente aéreo de Bélgica",
  NATO: "OTAN (AWACS de Geilenkirchen)",
};

function callsignOperator(callsign) {
  const cs = String(callsign || "").trim().toUpperCase();
  if (!cs) return null;
  // Los mas largos primero: "SPAR" antes que "SAM"... y FORTE antes que otros.
  const key = Object.keys(MILITARY_CALLSIGNS)
    .sort((a, b) => b.length - a.length)
    .find((k) => cs.startsWith(k) && /^[0-9]/.test(cs.slice(k.length) || "0"));
  return key ? MILITARY_CALLSIGNS[key] : null;
}

// ¿Hay algo en el tipo o el indicativo que diga "militar"? Complementa el
// bit de la base de datos de adsb.lol / adsb.fi, que no siempre esta.
export function looksMilitary(a) {
  const t = String(a.type || "").toUpperCase();
  if (MILITARY_TYPES[t] && !DUAL_USE.has(t)) return true;
  return callsignOperator(a.flight) !== null;
}

// La ficha para el panel de detalle, o null si no hay nada que decir.
// `isMilitary`: el avion ya viene marcado como militar (solo entonces se
// muestra la ficha de un modelo de doble uso).
export function militaryInfo(type, callsign, { isMilitary = false } = {}) {
  const code = String(type || "").toUpperCase();
  const operator = callsignOperator(callsign);
  const t = MILITARY_TYPES[code] && (!DUAL_USE.has(code) || isMilitary || operator) ? MILITARY_TYPES[code] : null;
  if (!t && !operator) return null;
  return {
    ...(t ? { ...t, roleLabel: ROLES[t.role] } : {}),
    callsignOperator: operator,
  };
}
