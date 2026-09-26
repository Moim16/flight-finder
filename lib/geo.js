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
