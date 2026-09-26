// =============================================================================
//  Datos del avion para el panel de detalle.
//
//  GET /api/details?hex=e8043d&callsign=LAN800
//
//  -> { aircraft, route, photo }   (cada uno puede venir en null)
//
//  La logica vive en lib/details.js (ahi se explica cada fuente).
// =============================================================================

import { lookupDetails, HEX } from "../lib/details.js";
import { cacheFor, fail } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const hex = (req.query.hex || "").toString().toLowerCase();
  const callsign = (req.query.callsign || "").toString().toUpperCase().trim();
  if (!HEX.test(hex)) return fail(res, 400, "hex invalido");

  const data = await lookupDetails(hex, callsign);
  cacheFor(res, 3600, 86400);
  return res.status(200).json(data);
}
