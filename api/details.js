// =============================================================================
//  Datos del avion para el panel de detalle.
//
//  GET /api/details?hex=e8043d&callsign=LAN800&type=A320&mil=1
//
//  -> { aircraft, route, photo, military }   (cada uno puede venir en null)
//
//  La logica vive en lib/details.js (ahi se explica cada fuente). `military`
//  es la ficha del modelo militar y/o quien opera ese indicativo
//  (lib/military.js); `type` es el modelo que transmite el avion y `mil=1`
//  avisa que viene marcado como militar (necesario para los modelos que
//  tambien vuelan como civiles, como el Gulfstream).
// =============================================================================

import { lookupDetails, HEX } from "../lib/details.js";
import { militaryInfo } from "../lib/military.js";
import { cacheFor, fail } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const hex = (req.query.hex || "").toString().toLowerCase();
  const callsign = (req.query.callsign || "").toString().toUpperCase().trim();
  if (!HEX.test(hex)) return fail(res, 400, "hex invalido");

  const data = await lookupDetails(hex, callsign);
  const type = (req.query.type || data.aircraft?.icaoType || "").toString().toUpperCase().slice(0, 8);
  cacheFor(res, 3600, 86400);
  const isMilitary = req.query.mil === "1";
  return res.status(200).json({ ...data, military: militaryInfo(type, callsign, { isMilitary }) });
}
