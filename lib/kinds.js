// =============================================================================
//  Tipo de vuelo: comercial, carga, privado, militar o helicoptero.
//
//  ADS-B no trae un campo "comercial": se deduce de lo que el avion transmite.
//  Una aerolinea vuela con su indicativo ICAO (3 letras + numero, como LAN800);
//  una avioneta o un jet privado suelen transmitir su matricula (CC-ABC).
//
//  Se calcula AQUI, en el servidor, y no en cada cliente: la web y la app
//  movil tienen que clasificar igual, y las listas de operadores se corrigen
//  en un solo lugar. Los clientes solo traen los nombres para mostrar.
// =============================================================================

import { looksMilitary } from "./military.js";

export const KIND_IDS = ["airline", "cargo", "private", "mil", "heli"];

// Aerolineas que solo vuelan carga (codigo ICAO del operador).
export const CARGO_OPS = new Set([
  "FDX", "UPS", "GTI", "CLX", "BOX", "ABW", "CKS", "DHK", "BCS", "DAE", "CAO", "CKK", "CSS",
  "MPH", "GEC", "LCO", "TPA", "NCA", "ICV", "TAY", "SWN", "ATN", "ABX", "PAC", "SOO", "AJT",
  "SQC", "KYE", "LMC", "CTJ",
]);

// Operadores de jets ejecutivos: usan indicativo de aerolinea, pero son
// vuelos privados (NetJets, VistaJet, Flexjet...).
export const BIZJET_OPS = new Set(["NJE", "EJA", "VJT", "LXJ", "JTL", "GAC", "XRO", "TWY", "EJM", "FLJ", "LNX"]);

const AIRLINE_CALLSIGN = /^([A-Z]{3})(\d{1,4}[A-Z]{0,2})$/;
const LIGHT_CATEGORY = /^(A1|B[0-9])$/;   // avioneta, planeador, globo, ultraligero, dron

export function kindOf(a) {
  // El bit militar solo lo traen adsb.lol y adsb.fi; si el avion llego solo
  // por OpenSky, el modelo o el indicativo (C17, RCH...) tambien lo delatan.
  if (a.military || looksMilitary(a)) return "mil";
  if (a.cat === "A7") return "heli";
  const m = (a.flight || "").trim().match(AIRLINE_CALLSIGN);
  if (m && !LIGHT_CATEGORY.test(a.cat || "") && !BIZJET_OPS.has(m[1])) {
    return CARGO_OPS.has(m[1]) ? "cargo" : "airline";
  }
  return "private";
}
