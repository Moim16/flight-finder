// =============================================================================
//  Proveedores de posiciones y su normalizacion a UN solo formato.
//
//  Ningun proveedor gratis cubre todo: cada uno depende de sus receptores
//  voluntarios, y en Sudamerica la cobertura de cada red por separado es muy
//  pobre. Por eso se consultan los tres a la vez y se funden por el codigo
//  ICAO del avion (hex): donde uno no llega, llega otro.
//
//    adsb.lol  - readsb, sin llave, radio hasta 250 NM
//    adsb.fi   - readsb, sin llave, radio hasta 250 NM
//    OpenSky   - formato propio, por caja; limitado por creditos diarios
//                (400 anonimo, 4000 con cuenta: OPENSKY_CLIENT_ID/SECRET)
//
//  Como se reparte un area entre los tres (circulos para readsb, cajas para
//  OpenSky) esta en lib/area.js.
//
//  El formato de salida (un "avion") es:
//    { hex, flight, reg, type, desc, owner, cat, lat, lon, alt, geomAlt,
//      ground, gs, track, vr, squawk, emergency, military, seen, src[], kind }
//  kind: "airline" | "cargo" | "private" | "mil" | "heli" (ver lib/kinds.js)
//  alt y geomAlt en pies, gs en nudos, vr en pies/min, seen en segundos.
// =============================================================================

import { fetchJson, num, clean } from "./http.js";

export const MAX_RADIUS_NM = 250;

const FT_PER_M = 3.28084;
const KT_PER_MS = 1.943844;
const FPM_PER_MS = 196.8504;

// Squawks reservados: secuestro, falla de radio, emergencia general.
const EMERGENCY_SQUAWK = { "7500": "secuestro", "7600": "sin radio", "7700": "emergencia" };
const READSB_EMERGENCY = {
  general: "emergencia", lifeguard: "emergencia medica", minfuel: "combustible minimo",
  nordo: "sin radio", unlawful: "secuestro", downed: "aeronave caida", reserved: "emergencia",
};

// Categorias C1..C3 son vehiculos de pista y obstaculos, no aviones.
const isSurfaceThing = (cat, type) => /^C[0-9]$/.test(cat || "") || type === "TWR" || type === "GND";

function emergencyOf(code, squawk) {
  if (code && code !== "none") return READSB_EMERGENCY[code] || "emergencia";
  return EMERGENCY_SQUAWK[squawk] || null;
}

/* ------------------------------------------------------------------ readsb */
export function normalizeReadsb(a, src) {
  const lat = num(a.lat, -90, 90);
  const lon = num(a.lon, -180, 180);
  const hex = clean(a.hex, 10)?.toLowerCase().replace(/^~/, "");
  if (lat === null || lon === null || !hex) return null;
  const cat = clean(a.category, 3);
  const type = clean(a.t, 8);
  if (isSurfaceThing(cat, type)) return null;

  const ground = a.alt_baro === "ground";
  const squawk = clean(a.squawk, 4);
  return {
    hex,
    flight: clean(a.flight, 10),
    reg: clean(a.r, 12),
    type,
    desc: clean(a.desc, 60),
    owner: clean(a.ownOp, 60),
    cat,
    lat, lon,
    alt: ground ? 0 : num(a.alt_baro, -2000, 70000),
    geomAlt: num(a.alt_geom, -2000, 70000),
    ground,
    gs: num(a.gs, 0, 2500),
    track: num(a.track ?? a.true_heading ?? a.mag_heading, 0, 360),
    vr: num(a.baro_rate ?? a.geom_rate, -20000, 20000),
    squawk,
    emergency: emergencyOf(a.emergency, squawk),
    military: (Number(a.dbFlags) & 1) === 1,
    seen: num(a.seen_pos ?? a.seen, 0) ?? 0,
    src: [src],
  };
}

async function fromReadsb(name, url) {
  const d = await fetchJson(url, { timeout: 4000 });
  const list = d.ac || d.aircraft || [];
  return list.map((a) => normalizeReadsb(a, name)).filter(Boolean);
}

/* ----------------------------------------------------------------- OpenSky */
// Indice 17 de /states/all?extended=1 -> categoria de emisor ADS-B.
const OPENSKY_CAT = {
  2: "A1", 3: "A2", 4: "A3", 5: "A4", 6: "A5", 7: "A6", 8: "A7",
  9: "B1", 10: "B2", 11: "B3", 12: "B4", 14: "B6", 15: "B7",
  16: "C1", 17: "C2", 18: "C3", 19: "C3", 20: "C3",
};

export function normalizeOpenSky(s, now) {
  const lon = num(s[5], -180, 180);
  const lat = num(s[6], -90, 90);
  const hex = clean(s[0], 10)?.toLowerCase();
  if (lat === null || lon === null || !hex) return null;
  const cat = OPENSKY_CAT[s[17]] || null;
  if (isSurfaceThing(cat)) return null;

  const ground = s[8] === true;
  const baro = num(s[7]);
  const geom = num(s[13]);
  const vel = num(s[9], 0);
  const vr = num(s[11]);
  const squawk = clean(s[14], 4);
  const tpos = num(s[3]);
  return {
    hex,
    flight: clean(s[1], 10),
    reg: null, type: null, desc: null, owner: null,
    cat,
    lat, lon,
    alt: ground ? 0 : baro === null ? null : Math.round(baro * FT_PER_M),
    geomAlt: geom === null ? null : Math.round(geom * FT_PER_M),
    ground,
    gs: vel === null ? null : Math.round(vel * KT_PER_MS * 10) / 10,
    track: num(s[10], 0, 360),
    vr: vr === null ? null : Math.round(vr * FPM_PER_MS),
    squawk,
    emergency: emergencyOf(null, squawk),
    military: false,
    seen: tpos === null ? 0 : Math.max(0, now - tpos),
    src: ["OpenSky"],
  };
}

// Estado del modulo: sobrevive entre invocaciones mientras la funcion siga
// "tibia". Si OpenSky responde 429 (sin creditos) se deja de consultar hasta
// la hora que indica, en vez de gastar cada peticion en un rechazo.
let openskyPausedUntil = 0;
let openskyToken = null;   // { value, expires }

async function openskyAuth() {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return {};
  if (openskyToken && openskyToken.expires > Date.now() + 30_000) {
    return { authorization: `Bearer ${openskyToken.value}` };
  }
  const r = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      // Sin tope, una conexion bloqueada dejaba cada respuesta esperando ~10 s.
      signal: AbortSignal.timeout(4000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    },
  );
  if (!r.ok) throw new Error(`OpenSky auth HTTP ${r.status}`);
  const t = await r.json();
  openskyToken = { value: t.access_token, expires: Date.now() + (t.expires_in || 1800) * 1000 };
  return { authorization: `Bearer ${openskyToken.value}` };
}

// Una caja lat/lon (lamin, lamax, lomin, lomax) dentro de -180..180.
export async function fromOpenSkyBox(b) {
  if (Date.now() < openskyPausedUntil) throw new Error("OpenSky en pausa por limite de creditos");
  const q = new URLSearchParams({
    lamin: b.lamin.toFixed(3), lomin: b.lomin.toFixed(3),
    lamax: b.lamax.toFixed(3), lomax: b.lomax.toFixed(3), extended: "1",
  });
  try {
    const d = await fetchJson(`https://opensky-network.org/api/states/all?${q}`, {
      timeout: 4500, headers: await openskyAuth(),
    });
    const now = num(d.time) ?? Date.now() / 1000;
    return (d.states || []).map((s) => normalizeOpenSky(s, now)).filter(Boolean);
  } catch (err) {
    // Sin creditos (429) o sin llegar (la red corta la conexion): se deja de
    // intentar por 10 minutos en vez de pagar la espera en cada respuesta.
    if (err.status === 429 || !err.status) openskyPausedUntil = Date.now() + 10 * 60_000;
    throw err;
  }
}

/* ------------------------------------------------------------------ fusion */
// Se funde por hex. La posicion que gana es la MAS RECIENTE (menor `seen`);
// los datos descriptivos (matricula, tipo) se completan con el que los tenga.
export function merge(lists) {
  const byHex = new Map();
  for (const list of lists) {
    for (const a of list) {
      const cur = byHex.get(a.hex);
      if (!cur) { byHex.set(a.hex, { ...a, src: [...a.src] }); continue; }
      const fresh = a.seen < cur.seen ? a : cur;
      const other = fresh === a ? cur : a;
      const out = { ...fresh };
      for (const k of Object.keys(out)) {
        if (out[k] === null || out[k] === undefined) out[k] = other[k];
      }
      out.military = cur.military || a.military;
      out.emergency = fresh.emergency || other.emergency;
      out.src = [...new Set([...cur.src, ...a.src])];
      byHex.set(a.hex, out);
    }
  }
  return [...byHex.values()];
}

// Circulo alrededor de un punto, en una red readsb. Radio maximo 250 NM.
export function fromReadsbCell(name, lat, lon, radiusNm) {
  const r = Math.round(Math.min(MAX_RADIUS_NM, Math.max(1, radiusNm)));
  const la = lat.toFixed(3), lo = lon.toFixed(3);
  const url = name === "adsb.fi"
    ? `https://opendata.adsb.fi/api/v2/lat/${la}/lon/${lo}/dist/${r}`
    : `https://api.adsb.lol/v2/point/${la}/${lo}/${r}`;
  return fromReadsb(name, url);
}
