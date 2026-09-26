// =============================================================================
//  Prueba rapida, sin red: normalizacion de cada proveedor, fusion por hex y
//  el handler de /api/flights con un fetch simulado.
//
//    node scripts/smoke.mjs
// =============================================================================

import assert from "node:assert/strict";
import { normalizeReadsb, normalizeOpenSky, merge } from "../lib/sources.js";
import { currentLeg } from "../lib/trace.js";
import { routeMatches } from "../lib/geo.js";
import { kindOf } from "../lib/kinds.js";

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (err) { console.error(`  FALLA  ${name}\n${err.stack}`); process.exitCode = 1; }
};

/* ------------------------------------------------------------ readsb */
await test("readsb: avion en vuelo", () => {
  const a = normalizeReadsb({
    hex: "E8043D", flight: "LXP204  ", r: "CC-BAZ", t: "A320", alt_baro: 28075, alt_geom: 29150,
    gs: 409.1, track: 24.2, baro_rate: -1920, squawk: "1234", category: "A3", lat: -34.35, lon: -71.28, seen_pos: 1.2,
  }, "adsb.lol");
  assert.equal(a.hex, "e8043d");
  assert.equal(a.flight, "LXP204");
  assert.equal(a.alt, 28075);
  assert.equal(a.ground, false);
  assert.equal(a.vr, -1920);
  assert.equal(a.emergency, null);
  assert.deepEqual(a.src, ["adsb.lol"]);
});

await test("readsb: en tierra y squawk 7700", () => {
  const a = normalizeReadsb({ hex: "abc123", alt_baro: "ground", gs: 12, squawk: "7700", lat: 1, lon: 2 }, "adsb.fi");
  assert.equal(a.ground, true);
  assert.equal(a.alt, 0);
  assert.equal(a.emergency, "emergencia");
});

await test("readsb: descarta torres, vehiculos y sin posicion", () => {
  assert.equal(normalizeReadsb({ hex: "42584c", t: "TWR", lat: 51, lon: 0 }, "x"), null);
  assert.equal(normalizeReadsb({ hex: "425953", category: "C2", lat: 51, lon: 0 }, "x"), null);
  assert.equal(normalizeReadsb({ hex: "aaaaaa" }, "x"), null);
});

await test("readsb: bit militar de dbFlags", () => {
  assert.equal(normalizeReadsb({ hex: "ae1234", dbFlags: 1, lat: 1, lon: 1 }, "x").military, true);
});

/* ----------------------------------------------------------- OpenSky */
await test("OpenSky: unidades a pies, nudos y pies/min", () => {
  const now = 1790389117;
  const s = ["e8043d", "LXP204  ", "Chile", now - 3, now - 1, -71.2812, -34.3512, 8557.26, false, 210.45, 24.25, -9.75, null, 8884.92, null, false, 0, 4];
  const a = normalizeOpenSky(s, now);
  assert.equal(a.alt, 28075);            // 8557,26 m
  assert.equal(a.gs, 409.1);             // 210,45 m/s
  assert.equal(a.vr, -1919);             // -9,75 m/s
  assert.equal(a.cat, "A3");
  assert.equal(a.seen, 3);
});

/* ------------------------------------------------------------ fusion */
await test("fusion: gana la posicion mas reciente y se completan los datos", () => {
  const lol = { hex: "e8043d", flight: "LXP204", reg: "CC-BAZ", type: "A320", lat: 1, lon: 1, alt: 28000, seen: 5, src: ["adsb.lol"], military: false, emergency: null };
  const osk = { hex: "e8043d", flight: "LXP204", reg: null, type: null, lat: 1.01, lon: 1.01, alt: 27900, seen: 1, src: ["OpenSky"], military: false, emergency: null };
  const other = { hex: "ffffff", lat: 0, lon: 0, seen: 0, src: ["adsb.fi"] };
  const out = merge([[lol], [osk, other]]);
  assert.equal(out.length, 2);
  const a = out.find((x) => x.hex === "e8043d");
  assert.equal(a.lat, 1.01);             // OpenSky es mas fresco
  assert.equal(a.reg, "CC-BAZ");         // pero la matricula viene de adsb.lol
  assert.deepEqual(a.src.sort(), ["OpenSky", "adsb.lol"]);
});

/* ------------------------------------------------- handler con fetch falso */
await test("/api/flights: el area completa, una fuente caida no tumba la respuesta", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("adsb.lol")) return new Response(JSON.stringify({ ac: [
      { hex: "e8043d", flight: "LXP204", lat: -33.4, lon: -70.8, alt_baro: 5000, seen_pos: 1 },
      { hex: "abcdef", flight: "FDX10", lat: -10, lon: -70.8, alt_baro: 5000, seen_pos: 1 },   // fuera del area
    ] }));
    if (u.includes("adsb.fi")) return new Response("fallo", { status: 503 });
    if (u.includes("opensky")) return new Response(JSON.stringify({ time: 1, states: [
      ["cc1111", "SKU100", "Chile", 1, 1, -70.7, -33.3, 3000, false, 100, 90, 0, null, 3100, null, false, 0, 0],
      ["e8043d", "LXP204", "Chile", 1, 1, -70.81, -33.41, 1500, false, 100, 90, 0, null, 1600, null, false, 0, 0], // repetido
    ] }));
    throw new Error("url inesperada " + u);
  };
  try {
    const { default: handler } = await import("../api/flights.js");
    const res = fakeRes();
    await handler({ method: "GET", query: { bbox: "-71.9,-34.1,-69.9,-32.6" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.bbox, { w: -72, s: -34.5, e: -69.5, n: -32.5 });   // redondeado hacia afuera
    assert.equal(res.body.aircraft.length, 2);                                      // sin repetidos ni los de afuera
    assert.ok(res.body.aircraft.every((a) => a.kind));
    const lxp = res.body.aircraft.find((a) => a.hex === "e8043d");
    assert.deepEqual(lxp.src.sort(), ["OpenSky", "adsb.lol"]);
    const fi = res.body.sources.find((s) => s.name === "adsb.fi");
    assert.equal(fi.ok, false);
    assert.match(res.headers["cache-control"], /s-maxage=4/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("area: la grilla cubre la vista y cruza el antimeridiano", async () => {
  const { cellsFor, normalizeBbox, openskyBoxes } = await import("../lib/area.js");
  const b = normalizeBbox({ w: 175, s: -20, e: 185, n: -15 });
  assert.equal(b.w, 175); assert.equal(b.e, 185);
  assert.equal(openskyBoxes(b).length, 2);
  assert.ok(cellsFor(b).every((c) => c.lon >= -180 && c.lon <= 180));
  assert.deepEqual(normalizeBbox({ w: -200, s: 0, e: 200, n: 10 }), { w: -180, s: 0, e: 180, n: 10 });
});

/* ------------------------------------------------------------ historial */
await test("historial: se queda con el vuelo actual (desde el ultimo despegue)", () => {
  const base = 1_790_000_000;
  const trace = [
    [0, 10, 10, 30000, 0, 0, 0],          // vuelo anterior
    [600, 10.5, 10.5, "ground", 0, 0, 0], // aterrizo
    [900, 10.5, 10.5, "ground", 0, 0, 2], // tramo nuevo
    [1000, 10.5, 10.5, "ground", 0, 0, 0],// ultimo punto en pista
    [1100, 10.6, 10.6, 3000, 0, 0, 0],
    [2000, 11, 11, 35000, 0, 0, 1],       // hueco de señal antes de este
  ];
  const leg = currentLeg(trace, base);
  assert.equal(leg.length, 3);
  assert.deepEqual(leg[0], [(base + 1000) * 1000, 10.5, 10.5, 0, 1, 0]);
  assert.equal(leg[2][5], 1);             // marcado como hueco
});

await test("historial: reduce a MAX_POINTS conservando el ultimo", () => {
  const trace = Array.from({ length: 2000 }, (_, i) => [i * 5, 1 + i / 1e4, 1, 10000, 0, 0, 0]);
  const leg = currentLeg(trace, 0);
  assert.ok(leg.length <= 501);
  assert.equal(leg[leg.length - 1][0], 1999 * 5 * 1000);
});

/* ---------------------------------------------------------------- tipos */
await test("tipo de vuelo", () => {
  assert.equal(kindOf({ flight: "LAN800", cat: "A5" }), "airline");
  assert.equal(kindOf({ flight: "FDX5021" }), "cargo");
  assert.equal(kindOf({ flight: "NJE812Q" }), "private");      // jet ejecutivo
  assert.equal(kindOf({ flight: "CCABC", cat: "A1" }), "private"); // matricula
  assert.equal(kindOf({ flight: "ABC123", cat: "A1" }), "private"); // avioneta con indicativo
  assert.equal(kindOf({ flight: "RCH553", military: true }), "mil");
  assert.equal(kindOf({ flight: "LAN800", cat: "A7" }), "heli");
  // Sin el bit de la base (llego solo por OpenSky): el modelo o el indicativo
  assert.equal(kindOf({ flight: "RCH553" }), "mil");
  assert.equal(kindOf({ flight: "FORTE11" }), "mil");
  assert.equal(kindOf({ flight: "XYZ1", type: "K35R" }), "mil");
  assert.equal(kindOf({ flight: "LAN800", type: "C130" }), "airline");   // hay Hercules civiles
  assert.notEqual(kindOf({ flight: "SAMOA1" }), "mil");                  // SAM + letras no es SAM
});

await test("ficha militar", async () => {
  const { militaryInfo } = await import("../lib/military.js");
  const c17 = militaryInfo("C17", "RCH553");
  assert.equal(c17.name, "C-17 Globemaster III");
  assert.equal(c17.roleLabel, "Transporte");
  assert.match(c17.callsignOperator, /Movilidad Aérea/);
  assert.equal(militaryInfo("E3CF").name, "E-3 Sentry (AWACS)");
  assert.equal(militaryInfo("A320", "LAN800"), null);
  assert.ok(militaryInfo(null, "NATO01").callsignOperator);
  // Doble uso: un Gulfstream privado no muestra ficha militar; uno marcado, si
  assert.equal(militaryInfo("GLF5", "N123AB"), null);
  assert.equal(militaryInfo("GLF5", "VM510", { isMilitary: true }).roleLabel, "Enlace y transporte de autoridades");
  assert.equal(kindOf({ flight: "N123AB", type: "GLF5" }), "private");
});

/* --------------------------------------------------------------- rutas */
await test("ruta: sobre la linea pero en sentido contrario no vale", () => {
  const route = { origin: { lat: 51.47, lon: -0.45 }, destination: { lat: 2.74, lon: 101.7 } };   // LHR -> KUL
  assert.equal(routeMatches(route, 49.25, 12.1, 115), true);    // rumbo al sureste: hacia KUL
  assert.equal(routeMatches(route, 49.25, 12.1, 294), false);   // rumbo al noroeste: vuelve a Londres
  assert.equal(routeMatches(route, 49.25, 12.1), true);         // sin rumbo: solo la posicion
});

/* ---------------------------------------------------------- compartir */
await test("/vuelo/<hex>: vista previa con titulo, ruta validada y foto", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/aircraft/")) return new Response(JSON.stringify({ response: { aircraft: { registration: "9V-SMA", type: "A350 941", manufacturer: "Airbus", registered_owner: "Singapore Airlines" } } }));
    if (u.includes("/callsign/")) return new Response(JSON.stringify({ response: { flightroute: {
      callsign: "SIA322", airline: { name: "Singapore Airlines" },
      origin: { iata_code: "LHR", municipality: "London", name: "Heathrow", latitude: 51.47, longitude: -0.45 },
      destination: { iata_code: "SIN", municipality: "Singapore", name: "Changi", latitude: 1.36, longitude: 103.99 } } } }));
    if (u.includes("planespotters")) return new Response(JSON.stringify({ photos: [{ thumbnail_large: { src: "https://t.plnspttrs.net/1/x_280.jpg" }, link: "https://www.planespotters.net/photo/1", photographer: "Ana" }] }));
    throw new Error("url inesperada " + u);
  };
  try {
    const { default: handler } = await import("../api/share.js");
    const res = htmlRes();
    await handler({ query: { hex: "76cdb1", cs: "SIA322", lat: "48.0", lon: "16.0" }, headers: { host: "radar.test" } }, res);
    assert.match(res.body, /<title>SIA322 en vivo · LHR → SIN · Radar de vuelos<\/title>/);
    assert.match(res.body, /og:image" content="https:\/\/t\.plnspttrs\.net\/1\/x_280\.jpg"/);
    assert.match(res.body, /og:url" content="https:\/\/radar\.test\/vuelo\/76cdb1\?lat=48\.0&amp;lon=16\.0&amp;cs=SIA322"/);
    assert.equal((res.body.match(/og:title/g) || []).length, 1);   // reemplaza, no duplica
  } finally {
    globalThis.fetch = realFetch;
  }
});

function htmlRes() {
  return {
    statusCode: 0, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = String(b); },
  };
}

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
}

console.log(`\n${passed} pruebas pasaron.`);
