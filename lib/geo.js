// =============================================================================
//  Geometria sobre la esfera. La aviacion mide en millas nauticas (NM): una NM
//  es un minuto de arco de latitud, 1,852 km exactos.
// =============================================================================

export const KM_PER_NM = 1.852;
const R_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

// Distancia en km por el circulo maximo (haversine).
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Caja lat/lon que contiene el circulo de `radiusNm` alrededor del centro.
// OpenSky solo acepta cajas; los otros proveedores aceptan el circulo.
export function bboxAround(lat, lon, radiusNm) {
  const dLat = (radiusNm * KM_PER_NM) / 111.32;
  const cos = Math.max(0.05, Math.cos(rad(lat)));
  const dLon = Math.min(180, dLat / cos);
  return {
    lamin: Math.max(-90, lat - dLat),
    lamax: Math.min(90, lat + dLat),
    lomin: Math.max(-180, lon - dLon),
    lomax: Math.min(180, lon + dLon),
  };
}

// Donde esta un punto respecto de la ruta origen -> destino: cuanto se desvia
// del circulo maximo (km) y que fraccion del trayecto lleva (0..1).
export function routeFit(o, dst, lat, lon) {
  const total = distanceKm(o.lat, o.lon, dst.lat, dst.lon);
  const d13 = distanceKm(o.lat, o.lon, lat, lon) / R_KM;
  const t13 = rad(bearing(o.lat, o.lon, lat, lon));
  const t12 = rad(bearing(o.lat, o.lon, dst.lat, dst.lon));
  const xt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12));
  let along = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(xt)))) * R_KM;
  if (Math.cos(t13 - t12) < 0) along = -along;
  return { total, offKm: Math.abs(xt * R_KM), along, progress: total ? along / total : 0 };
}

// La ruta publicada se acepta solo si el avion va razonablemente sobre ella
// y HACIA el destino (el mismo numero de vuelo a veces se usa ida y vuelta).
// Misma regla que usa la pagina (checkedRoute en index.html).
export function routeMatches(route, lat, lon, track = null) {
  if (!route) return false;
  const fit = routeFit(route.origin, route.destination, lat, lon);
  if (track !== null && fit.progress < 0.98) {
    const toDest = bearing(lat, lon, route.destination.lat, route.destination.lon);
    if (Math.abs(((track - toDest + 540) % 360) - 180) > 90) return false;
  }
  return fit.offKm <= Math.max(150, fit.total * 0.15) && fit.progress > -0.08 && fit.progress < 1.08;
}

function bearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
