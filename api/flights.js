// =============================================================================
//  Aviones de un area del mapa.
//
//  GET /api/flights?bbox=-76,-56,-66,-17      oeste,sur,este,norte (grados)
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
import { num, cacheFor, fail } from "../lib/http.js";

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
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const bbox = parseBbox(req.query);
  if (!bbox) return fail(res, 400, "Falta el area: bbox=oeste,sur,este,norte (o lat, lon y r)");

  const data = await fetchArea(normalizeBbox(bbox));
  cacheFor(res, 4, 6);
  return res.status(200).json({ now: Date.now(), ...data });
}
