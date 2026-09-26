// =============================================================================
//  Buscador de lugares para "ir a otra zona".
//
//  GET /api/places?q=madrid
//  -> { places: [{ name, detail, kind, lat, lon, bbox }] }
//
//  Usa Photon (komoot), que se basa en OpenStreetMap y SI permite buscar
//  mientras se escribe (Nominatim lo prohibe en sus terminos). Los aeropuertos
//  se reconocen por la etiqueta aeroway de OSM y se marcan como tales; el
//  orden es el de relevancia de Photon.
// =============================================================================

import { fetchJson, clean, num, cacheFor, fail } from "../lib/http.js";

const KIND = {
  aerodrome: "Aeropuerto", city: "Ciudad", town: "Ciudad", village: "Pueblo",
  state: "Region", country: "Pais", county: "Provincia", district: "Distrito",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const q = clean(req.query.q, 80);
  if (!q || q.length < 2) return res.status(200).json({ places: [] });

  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: "8" })}`;
  let d;
  try {
    d = await fetchJson(url, { timeout: 5000 });
  } catch {
    return fail(res, 502, "El buscador de lugares no responde. Intenta de nuevo en un momento.");
  }

  const places = (d.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    if (num(lat, -90, 90) === null || num(lon, -180, 180) === null) return null;
    const isAirport = p.osm_key === "aeroway" && p.osm_value === "aerodrome";
    const kind = isAirport ? "Aeropuerto" : KIND[p.type] || KIND[p.osm_value] || "Lugar";
    const detail = [p.city !== p.name ? p.city : null, p.state, p.country].filter(Boolean);
    // extent de Photon: [oeste, norte, este, sur]
    const e = p.extent;
    const bbox = Array.isArray(e) && e.length === 4 ? [e[0], e[3], e[2], e[1]] : null;
    return {
      name: clean(p.name, 80) || q,
      detail: clean([...new Set(detail)].join(", "), 120),
      kind, lat, lon, bbox,
      airport: isAirport,
    };
  }).filter(Boolean);

  cacheFor(res, 86400, 86400);
  return res.status(200).json({ places: places.slice(0, 6) });
}
