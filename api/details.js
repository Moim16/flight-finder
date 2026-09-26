// =============================================================================
//  Lo que la señal ADS-B no trae: quien es el avion y a donde va.
//
//  GET /api/details?hex=e8043d&callsign=LAN800
//
//  -> { aircraft, route, photo }   (cada uno puede venir en null)
//
//    aircraft  adsbdb por hex: matricula, modelo, fabricante, operador
//    route     adsbdb por callsign: aerolinea, origen y destino
//    photo     planespotters por hex (la atribucion al fotografo es
//              obligatoria por sus terminos: se devuelve y se muestra)
//
//  OJO con la ruta: sale del NUMERO DE VUELO, no del avion. Los vuelos con
//  escalas comparten numero (LAN800 es Santiago-Auckland-Sidney) y la base
//  guarda un solo tramo, asi que el cliente la contrasta con la posicion real
//  antes de mostrarla como cierta.
// =============================================================================

import { fetchJson, clean, num, cacheFor, fail } from "../lib/http.js";

const HEX = /^[0-9a-f]{6}$/;
const CALLSIGN = /^[A-Z0-9]{2,8}$/;

function airport(a) {
  if (!a) return null;
  const lat = num(a.latitude, -90, 90);
  const lon = num(a.longitude, -180, 180);
  if (lat === null || lon === null) return null;
  return {
    iata: clean(a.iata_code, 4), icao: clean(a.icao_code, 4),
    name: clean(a.name, 90), city: clean(a.municipality, 60),
    country: clean(a.country_name, 60), countryIso: clean(a.country_iso_name, 2),
    lat, lon,
  };
}

async function getAircraft(hex) {
  const d = await fetchJson(`https://api.adsbdb.com/v0/aircraft/${hex}`);
  const a = d?.response?.aircraft;
  if (!a) return null;
  return {
    registration: clean(a.registration, 12),
    type: clean(a.type, 60),
    icaoType: clean(a.icao_type, 8),
    manufacturer: clean(a.manufacturer, 60),
    owner: clean(a.registered_owner, 80),
    country: clean(a.registered_owner_country_name, 60),
    countryIso: clean(a.registered_owner_country_iso_name, 2),
  };
}

async function getRoute(callsign) {
  const d = await fetchJson(`https://api.adsbdb.com/v0/callsign/${callsign}`);
  const f = d?.response?.flightroute;
  if (!f) return null;
  const origin = airport(f.origin);
  const destination = airport(f.destination);
  if (!origin || !destination) return null;
  return {
    callsign: clean(f.callsign, 10),
    iata: clean(f.callsign_iata, 10),
    airline: f.airline ? { name: clean(f.airline.name, 60), iata: clean(f.airline.iata, 3), icao: clean(f.airline.icao, 4), country: clean(f.airline.country, 60) } : null,
    origin,
    destination,
  };
}

async function getPhoto(hex) {
  const d = await fetchJson(`https://api.planespotters.net/pub/photos/hex/${hex}`);
  const p = d?.photos?.[0];
  if (!p) return null;
  const src = p.thumbnail_large?.src || p.thumbnail?.src;
  // Solo se acepta el host de imagenes de planespotters: es el unico que la
  // CSP de la pagina deja cargar.
  if (!src || !/^https:\/\/t\.plnspttrs\.net\//.test(src)) return null;
  return { src, link: p.link || null, photographer: clean(p.photographer, 60) };
}

const settle = (p) => p.then((v) => v, () => null);

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const hex = (req.query.hex || "").toString().toLowerCase();
  const callsign = (req.query.callsign || "").toString().toUpperCase().trim();
  if (!HEX.test(hex)) return fail(res, 400, "hex invalido");

  const [aircraft, route, photo] = await Promise.all([
    settle(getAircraft(hex)),
    CALLSIGN.test(callsign) ? settle(getRoute(callsign)) : null,
    settle(getPhoto(hex)),
  ]);

  cacheFor(res, 3600, 86400);
  return res.status(200).json({ aircraft, route, photo });
}
