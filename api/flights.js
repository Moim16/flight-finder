// =============================================================================
//  Aviones alrededor de un punto.
//
//  GET /api/flights?lat=-33.39&lon=-70.79&r=80
//      lat, lon  centro (grados)
//      r         radio en millas nauticas (1..250)
//
//  -> { now, center:{lat,lon}, radius, aircraft:[...], sources:[...] }
//
//  El centro se redondea a 0,05° (~5 km) y el radio a un escalon fijo: dos
//  personas mirando casi la misma zona piden EXACTAMENTE la misma URL y la CDN
//  les sirve la misma respuesta. El cliente pide un poco mas de radio del que
//  ve para que el redondeo no deje aviones fuera del borde.
// =============================================================================

import { fetchAircraft, MAX_RADIUS_NM } from "../lib/sources.js";
import { distanceKm, KM_PER_NM } from "../lib/geo.js";
import { num, cacheFor, fail } from "../lib/http.js";

const RADIUS_STEPS = [10, 25, 50, 80, 120, 170, 250];
const TTL_MS = 4000;
const memo = new Map();   // cache local (dev y funcion tibia): clave -> { at, data }

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "Metodo no permitido");

  const lat = num(req.query.lat, -90, 90);
  const lon = num(req.query.lon, -180, 180);
  const reqR = num(req.query.r, 1, 5000) ?? 80;
  if (lat === null || lon === null) return fail(res, 400, "Faltan lat y lon validos");

  const cLat = Math.round(lat * 20) / 20;
  const cLon = Math.round(lon * 20) / 20;
  const radius = RADIUS_STEPS.find((s) => s >= reqR) ?? MAX_RADIUS_NM;
  const key = `${cLat},${cLon},${radius}`;

  let hit = memo.get(key);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const { aircraft, sources } = await fetchAircraft(cLat, cLon, radius);
    // OpenSky responde por caja: se recortan las esquinas para que "en la
    // zona" signifique lo mismo venga de donde venga el avion.
    const maxKm = radius * KM_PER_NM * 1.02;
    const inside = aircraft.filter((a) => distanceKm(cLat, cLon, a.lat, a.lon) <= maxKm);
    hit = { at: Date.now(), data: { now: Date.now(), center: { lat: cLat, lon: cLon }, radius, aircraft: inside, sources } };
    memo.set(key, hit);
    if (memo.size > 200) memo.delete(memo.keys().next().value);
  }

  cacheFor(res, 4, 6);
  return res.status(200).json(hit.data);
}
