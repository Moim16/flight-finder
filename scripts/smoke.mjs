// =============================================================================
//  Prueba rapida, sin red: normalizacion de cada proveedor, fusion por hex y
//  el handler de /api/flights con un fetch simulado.
//
//    node scripts/smoke.mjs
// =============================================================================

import assert from "node:assert/strict";
import { normalizeReadsb, normalizeOpenSky, merge } from "../lib/sources.js";

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
await test("/api/flights: una fuente caida no tumba la respuesta", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("adsb.lol")) return new Response(JSON.stringify({ ac: [{ hex: "e8043d", flight: "LXP204", lat: -33.4, lon: -70.8, alt_baro: 5000, seen_pos: 1 }] }));
    if (u.includes("adsb.fi")) return new Response("fallo", { status: 503 });
    if (u.includes("opensky")) return new Response(JSON.stringify({ time: 1, states: [["cc1111", "SKU100", "Chile", 1, 1, -70.7, -33.3, 3000, false, 100, 90, 0, null, 3100, null, false, 0, 0]] }));
    throw new Error("url inesperada " + u);
  };
  try {
    const { default: handler } = await import("../api/flights.js");
    const res = fakeRes();
    await handler({ method: "GET", query: { lat: "-33.39", lon: "-70.79", r: "60" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.radius, 80);                        // escalon >= 60
    assert.deepEqual(res.body.center, { lat: -33.4, lon: -70.8 }); // redondeo a 0,05
    assert.equal(res.body.aircraft.length, 2);
    const fi = res.body.sources.find((s) => s.name === "adsb.fi");
    assert.equal(fi.ok, false);
    assert.match(res.headers["cache-control"], /s-maxage=4/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
}

console.log(`\n${passed} pruebas pasaron.`);
