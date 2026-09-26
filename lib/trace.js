// =============================================================================
//  Historial del vuelo actual de un avion.
//
//  adsb.lol publica, por avion, la traza de las ultimas ~24 h en formato
//  tar1090 (trace_full_<hex>.json). Cada punto es un arreglo:
//
//    [ segundos desde `timestamp`, lat, lon, altitud ("ground" | pies | null),
//      velocidad, rumbo, flags, vertical, detalle, fuente, alt. GPS, ... ]
//
//  flags & 1  -> hubo un hueco de señal antes de este punto
//  flags & 2  -> aqui empieza un tramo nuevo (el avion aterrizo y volvio a salir)
//
//  Esa traza trae TODOS los vuelos del dia, asi que se recorta al actual: desde
//  el ultimo inicio de tramo, o desde que dejo el suelo por ultima vez.
// =============================================================================

import { fetchJson, num } from "./http.js";

export const MAX_POINTS = 500;
const GAP_S = 300;   // sin puntos por 5 min: se dibuja como hueco

export function currentLeg(trace, baseTs) {
  if (!Array.isArray(trace) || !trace.length) return [];
  let start = 0;
  for (let i = trace.length - 1; i > 0; i--) {
    if (Number(trace[i][6]) & 2) { start = i; break; }
  }
  // Si ahora esta en el aire, el vuelo empieza en el ultimo punto en tierra
  // (la pista de despegue); ese punto se conserva para que la estela arranque
  // en el aeropuerto.
  const airborneNow = trace[trace.length - 1][3] !== "ground";
  if (airborneNow) {
    for (let i = trace.length - 1; i >= start; i--) {
      if (trace[i][3] === "ground") { start = i; break; }
    }
  }

  const leg = trace.slice(start);
  const step = Math.max(1, Math.ceil(leg.length / MAX_POINTS));
  const out = [];
  let prevT = null;
  for (let i = 0; i < leg.length; i++) {
    const p = leg[i];
    const t = baseTs + Number(p[0]);
    const gap = prevT !== null && (Number(p[6]) & 1 || t - prevT > GAP_S);
    prevT = t;
    // Al reducir puntos se conservan siempre el ultimo y los que marcan hueco.
    if (i % step !== 0 && i !== leg.length - 1 && !gap) continue;
    const lat = num(p[1], -90, 90);
    const lon = num(p[2], -180, 180);
    if (lat === null || lon === null) continue;
    const ground = p[3] === "ground";
    out.push([Math.round(t * 1000), lat, lon, ground ? 0 : num(p[3], -2000, 70000), ground ? 1 : 0, gap ? 1 : 0]);
  }
  return out;
}

export async function fetchTrace(hex) {
  try {
    const d = await fetchJson(`https://adsb.lol/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`, { timeout: 7000 });
    return currentLeg(d.trace, num(d.timestamp) ?? 0);
  } catch (err) {
    if (err.status === 404) return [];   // avion sin traza hoy
    throw err;
  }
}
