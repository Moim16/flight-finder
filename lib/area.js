// =============================================================================
//  Todos los aviones de un AREA (el rectangulo que se ve en el mapa).
//
//  Cada fuente sabe responder una forma distinta:
//
//    OpenSky   una caja de cualquier tamaño -> UNA consulta cubre toda la
//              vista. Es la base: en Europa entrega ~730 aviones de una vez.
//    adsb.lol  solo circulos de hasta 250 NM, y corta (429) si se le piden
//              muchos seguidos -> hasta 2 circulos, los del centro
//    adsb.fi   circulos, limitado a 1 consulta por segundo -> solo el del
//              centro
//
//  O sea: toda la vista sale de OpenSky, y el centro ademas se completa con
//  las redes readsb, que ven aviones que OpenSky no.
//
//  Los circulos salen de una grilla FIJA sobre el globo (no dependen de donde
//  este el centro de la pantalla). Asi, mover el mapa un poco repite casi los
//  mismos circulos y se reusan del cache, en vez de pedir todo de nuevo.
//
//  Todo se funde por hex (lib/sources.js#merge) y se recorta al rectangulo
//  pedido: un avion visto por dos fuentes, o por dos circulos que se tocan,
//  aparece UNA vez.
//
//  OPENSKY DESDE EL CLIENTE. OpenSky corta las conexiones que vienen de
//  nubes (AWS, donde corre Vercel, y tambien Cloudflare). Desde un telefono
//  si responde, asi que la app movil le pide los datos ella misma y los manda
//  aqui (`openskyStates`); el servidor los normaliza, funde y clasifica con
//  las mismas reglas que todo lo demas. Si no llegan, se intenta directo
//  (funciona cuando el servidor corre en una PC de casa).
// =============================================================================

import { fromReadsbCell, fromOpenSkyBox, normalizeOpenSky, merge, MAX_RADIUS_NM } from "./sources.js";
import { kindOf } from "./kinds.js";
import { distanceKm } from "./geo.js";

// Separacion de la grilla. Con circulos de 250 NM (463 km) y centros cada
// 620 km, la esquina mas lejana de cada celda queda a ~440 km: sin huecos.
export const CELL_KM = 620;
export const MAX_CELLS = 2;      // circulos de adsb.lol por consulta
export const FI_CELLS = 1;       // circulos de adsb.fi (1 consulta/s)
const PAUSE_MS = 60_000;         // tras un 429, esa fuente descansa un minuto
const MAX_LAT = 85;

const CELL_TTL_MS = 4000;
const OPENSKY_TTL_MS = 12000;    // OpenSky cobra creditos por consulta
const memo = new Map();          // "fuente|clave" -> { at, promise }
const pausedUntil = {};          // fuente -> ms

// Una fuente que respondio 429 no se vuelve a consultar hasta que pase la
// pausa: insistir solo alarga el castigo.
function guarded(name, run) {
  return async () => {
    if (Date.now() < (pausedUntil[name] || 0)) throw new Error(`${name} en pausa por limite de consultas`);
    try { return await run(); }
    catch (err) { if (err.status === 429) pausedUntil[name] = Date.now() + PAUSE_MS; throw err; }
  };
}

// El mismo pedido dentro del TTL comparte la respuesta (y la promesa, si
// todavia esta en camino): dos usuarios, o dos celdas iguales, una consulta.
function cached(key, ttl, run) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = run();
  memo.set(key, { at: Date.now(), promise });
  promise.catch(() => memo.delete(key));
  if (memo.size > 500) memo.delete(memo.keys().next().value);
  return promise;
}

const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
const rad = (d) => (d * Math.PI) / 180;

// Rectangulo valido y redondeado hacia afuera a medio grado: casi la misma
// vista produce exactamente la misma clave (y la CDN la reusa).
export function normalizeBbox({ w, s, e, n }) {
  let S = Math.max(-MAX_LAT, Math.floor(Math.min(s, n) * 2) / 2);
  let N = Math.min(MAX_LAT, Math.ceil(Math.max(s, n) * 2) / 2);
  let W = Math.floor(w * 2) / 2;
  let E = Math.ceil(e * 2) / 2;
  if (E <= W) E = W + 0.5;
  if (E - W >= 360) { W = -180; E = 180; }
  // Se lleva el oeste a -180..180 conservando el ancho (el este puede pasar
  // de 180 si la vista cruza el antimeridiano).
  const shift = wrapLon(W) - W;
  return { w: W + shift, s: S, e: E + shift, n: N };
}

// Centros de la grilla que tocan el rectangulo, del mas cercano al centro de
// la vista al mas lejano.
export function cellsFor(b) {
  const latStep = CELL_KM / 111.32;
  const cells = [];
  for (let k = Math.round(b.s / latStep); k <= Math.round(b.n / latStep); k++) {
    const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, k * latStep));
    // Paso de longitud medido en el borde MAS CERCANO al ecuador de la fila,
    // donde un grado mide mas: asi la fila entera queda cubierta.
    const edge = Math.max(0, Math.abs(lat) - latStep / 2);
    const lonStep = Math.min(360, latStep / Math.max(0.05, Math.cos(rad(edge))));
    for (let j = Math.round(b.w / lonStep); j <= Math.round(b.e / lonStep); j++) {
      cells.push({ lat: Math.round(lat * 1000) / 1000, lon: Math.round(wrapLon(j * lonStep) * 1000) / 1000 });
    }
  }
  const cLat = (b.s + b.n) / 2;
  const cLon = wrapLon((b.w + b.e) / 2);
  const seen = new Set();
  return cells
    .filter((c) => { const k = `${c.lat},${c.lon}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c) => ({ ...c, d: distanceKm(cLat, cLon, c.lat, c.lon) }))
    .sort((x, y) => x.d - y.d);
}

// OpenSky solo acepta cajas dentro de -180..180: si la vista cruza el
// antimeridiano, van dos.
export function openskyBoxes(b) {
  if (b.e <= 180) return [{ lamin: b.s, lamax: b.n, lomin: b.w, lomax: b.e }];
  return [
    { lamin: b.s, lamax: b.n, lomin: b.w, lomax: 180 },
    { lamin: b.s, lamax: b.n, lomin: -180, lomax: b.e - 360 },
  ];
}

export function insideBbox(a, b) {
  if (a.lat < b.s || a.lat > b.n) return false;
  let lon = a.lon;
  while (lon < b.w) lon += 360;
  return lon <= b.e;
}

export async function fetchArea(bbox, { openskyStates = null } = {}) {
  const b = normalizeBbox(bbox);
  const all = cellsFor(b);
  const cells = all.slice(0, MAX_CELLS);

  const jobs = [];
  for (const c of cells) {
    jobs.push(["adsb.lol", cached(`lol|${c.lat},${c.lon}`, CELL_TTL_MS, guarded("adsb.lol", () => fromReadsbCell("adsb.lol", c.lat, c.lon, MAX_RADIUS_NM)))]);
  }
  for (const c of cells.slice(0, FI_CELLS)) {
    jobs.push(["adsb.fi", cached(`fi|${c.lat},${c.lon}`, CELL_TTL_MS, guarded("adsb.fi", () => fromReadsbCell("adsb.fi", c.lat, c.lon, MAX_RADIUS_NM)))]);
  }
  if (openskyStates) {
    const { time, states } = openskyStates;
    const now = Number.isFinite(time) ? time : Date.now() / 1000;
    jobs.push(["OpenSky", Promise.resolve(states.map((s) => normalizeOpenSky(s, now)).filter(Boolean))]);
  } else {
    for (const box of openskyBoxes(b)) {
      jobs.push(["OpenSky", cached(`os|${box.lamin},${box.lamax},${box.lomin},${box.lomax}`, OPENSKY_TTL_MS, () => fromOpenSkyBox(box))]);
    }
  }

  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  const lists = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  // El tipo se calcula DESPUES de fundir: el indicativo o el bit militar
  // pueden venir de una fuente distinta a la de la posicion.
  const aircraft = merge(lists)
    .filter((a) => insideBbox(a, b))
    .map((a) => ({ ...a, kind: kindOf(a) }));

  // Por fuente: si respondio (al menos una de sus consultas) y cuantos de los
  // aviones del resultado vio.
  const sources = ["adsb.lol", "adsb.fi", "OpenSky"].map((name) => {
    const mine = results.filter((_, i) => jobs[i][0] === name);
    const ok = mine.some((r) => r.status === "fulfilled");
    const failed = mine.find((r) => r.status === "rejected");
    return {
      name, ok,
      count: aircraft.filter((a) => a.src.includes(name)).length,
      ...(ok || !failed ? {} : { error: String(failed.reason?.message || failed.reason) }),
    };
  });

  // partial: la vista excede los circulos readsb; lo de afuera es solo OpenSky.
  return { bbox: b, cells: cells.length, partial: all.length > cells.length, aircraft, sources };
}
