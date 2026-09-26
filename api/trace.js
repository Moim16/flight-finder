// =============================================================================
//  Trayectoria del vuelo actual, para dibujar la estela completa desde el
//  despegue en cuanto se selecciona el avion (sin esperar a juntar puntos).
//
//  GET /api/trace?hex=3965b4
//  -> { hex, points: [[t_ms, lat, lon, alt_ft|null, enTierra 0|1, hueco 0|1], ...] }
//
//  Ver lib/trace.js para el formato de origen y como se recorta el tramo.
// =============================================================================

import { fetchTrace } from "../lib/trace.js";
import { HEX } from "../lib/details.js";
import { cacheFor, fail } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const hex = (req.query.hex || "").toString().toLowerCase();
  if (!HEX.test(hex)) return fail(res, 400, "hex invalido");

  let points;
  try {
    points = await fetchTrace(hex);
  } catch {
    return fail(res, 502, "No se pudo leer el historial del vuelo");
  }
  cacheFor(res, 20, 40);
  return res.status(200).json({ hex, points });
}
