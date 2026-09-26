// =============================================================================
//  Aviones de un area del mapa.
//
//  GET /api/flights?bbox=-76,-56,-66,-17      oeste,sur,este,norte (grados)
//  POST /api/flights?bbox=...  { opensky: { time, states: [...] } }
//      lo mismo, con los datos de OpenSky que el cliente le pidio a OpenSky
//      desde su propia conexion (OpenSky corta a Vercel; ver lib/area.js)
//  GET /api/flights?lat=-33.39&lon=-70.79&r=80   tambien vale: un punto y un
//                                                radio en NM (se convierte en
//                                                la caja que lo contiene)
//
//  -> { now, bbox:{w,s,e,n}, cells, partial, aircraft:[...], sources:[...] }
//
//  `partial` = la vista es tan grande que adsb.lol solo se consulto en los
//  circulos del centro (OpenSky si cubre todo). Ver lib/area.js.
//
//  El rectangulo se redondea hacia afuera a medio grado: dos personas mirando
//  casi lo mismo piden EXACTAMENTE la misma URL y la CDN les sirve la misma
//  respuesta.
// =============================================================================

import { fetchArea, normalizeBbox } from "../lib/area.js";
import { bboxAround } from "../lib/geo.js";
import { num, cacheFor, fail, readJson } from "../lib/http.js";

const MAX_STATES = 10_000;

// Lo que manda el cliente tal como lo entrego OpenSky: { time, states }.
// Se valida la forma; el contenido lo normaliza normalizeOpenSky.
function parseRelay(body) {
  const os = body?.opensky;
  if (!os || !Array.isArray(os.states) || os.states.length > MAX_STATES) return null;
  const states = os.states.filter((s) => Array.isArray(s) && s.length >= 17);
  return { time: Number(os.time), states };
}

function parseBbox(q) {
  if (q.bbox) {
    const parts = String(q.bbox).split(",").map(Number);
    if (parts.length !== 4 || parts.some((x) => !Number.isFinite(x))) return null;
    const [w, s, e, n] = parts;
    if (s < -90 || n > 90 || e - w > 720) return null;
    return { w, s, e, n };
  }
  const lat = num(q.lat, -90, 90);
  const lon = num(q.lon, -180, 180);
  if (lat === null || lon === null) return null;
  const r = num(q.r, 1, 5000) ?? 80;
  const b = bboxAround(lat, lon, r);
  return { w: b.lomin, s: b.lamin, e: b.lomax, n: b.lamax };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return fail(res, 405, "Metodo no permitido");
  const bbox = parseBbox(req.query);
  if (!bbox) return fail(res, 400, "Falta el area: bbox=oeste,sur,este,norte (o lat, lon y r)");

  let openskyStates = null;
  if (req.method === "POST") {
    openskyStates = parseRelay(await readJson(req));
    if (!openskyStates) return fail(res, 400, "Cuerpo invalido: se espera { opensky: { time, states } }");
  }

  const data = await fetchArea(normalizeBbox(bbox), { openskyStates });
  // Con datos del cliente la respuesta es solo suya: no va a la CDN.
  if (openskyStates) res.setHeader("cache-control", "no-store");
  else cacheFor(res, 4, 6);
  return res.status(200).json({ now: Date.now(), ...data });
}
