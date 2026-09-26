// =============================================================================
//  Buscador de lugares para "ir a otra zona".
//
//  GET /api/places?q=madrid
//  -> { places: [{ name, detail, kind, lat, lon, bbox, airport }] }
//
//  Usa Photon (komoot), que se basa en OpenStreetMap y SI permite buscar
//  mientras se escribe (Nominatim lo prohibe en sus terminos). Los aeropuertos
//  se reconocen por la etiqueta aeroway de OSM.
//
//  Dos arreglos sobre Photon, que no trae nombres en español:
//    - Los pasos estrategicos (Ormuz, Suez, Malaca...) salen primero, con su
//      nombre en español, desde lib/zones.js.
//    - Si un lugar viene escrito en otra escritura (persa, arabe, chino...),
//      se usa su nombre en ingles. No se pide TODO en ingles porque cambia el
//      orden: "Londres" pasaba a dar Londres de Argentina antes que Londres.
// =============================================================================

import { fetchJson, clean, num, cacheFor, fail } from "../lib/http.js";
import { matchZones } from "../lib/zones.js";

const KIND = {
  aerodrome: "Aeropuerto", city: "Ciudad", town: "Ciudad", village: "Pueblo",
  state: "Region", country: "Pais", county: "Provincia", district: "Distrito",
  strait: "Estrecho", sea: "Mar", bay: "Bahia", island: "Isla",
};

// ¿Se lee con el alfabeto latino? (letras latinas, con o sin tildes)
const LATIN = /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u;

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");
  const q = clean(req.query.q, 80);
  if (!q || q.length < 2) return res.status(200).json({ places: [] });

  const photon = (lang) => fetchJson(`https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: "8", ...(lang ? { lang } : {}) })}`, { timeout: 5000 });
  const [local, en] = await Promise.allSettled([photon(null), photon("en")]);
  if (local.status === "rejected" && en.status === "rejected") {
    return fail(res, 502, "El buscador de lugares no responde. Intenta de nuevo en un momento.");
  }
  const main = local.status === "fulfilled" ? local.value : en.value;
  const english = new Map();
  if (en.status === "fulfilled") {
    for (const f of en.value.features || []) english.set(`${f.properties?.osm_type}${f.properties?.osm_id}`, f.properties);
  }

  const readable = (props, key) => {
    const v = props?.[key];
    if (!v || LATIN.test(v)) return v;
    return english.get(`${props.osm_type}${props.osm_id}`)?.[key] || v;
  };

  const places = (main.features || []).map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    if (num(lat, -90, 90) === null || num(lon, -180, 180) === null) return null;
    const isAirport = p.osm_key === "aeroway" && p.osm_value === "aerodrome";
    const kind = isAirport ? "Aeropuerto" : KIND[p.type] || KIND[p.osm_value] || "Lugar";
    const name = readable(p, "name");
    const city = readable(p, "city");
    const detail = [city !== name ? city : null, readable(p, "state"), readable(p, "country")].filter(Boolean);
    // extent de Photon: [oeste, norte, este, sur]
    const e = p.extent;
    const bbox = Array.isArray(e) && e.length === 4 ? [e[0], e[3], e[2], e[1]] : null;
    return {
      name: clean(name, 80) || q,
      detail: clean([...new Set(detail)].join(", "), 120),
      kind, lat, lon, bbox,
      airport: isAirport,
    };
  }).filter(Boolean);

  const zones = matchZones(q).map((z) => ({
    name: z.name, detail: z.detail, kind: "Zona",
    lat: (z.bbox[1] + z.bbox[3]) / 2, lon: (z.bbox[0] + z.bbox[2]) / 2,
    bbox: z.bbox, airport: false,
  }));

  cacheFor(res, 86400, 86400);
  return res.status(200).json({ places: [...zones, ...places].slice(0, 6) });
}
