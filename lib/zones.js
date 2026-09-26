// =============================================================================
//  Zonas de trafico que se buscan por su nombre en español.
//
//  El buscador (Photon, de OpenStreetMap) no trae nombres en español: "Ormuz"
//  devuelve calles de Australia y "Hormuz" devuelve el estrecho escrito en
//  persa. Para los pasos estrategicos, que son justo lo que se busca en un
//  radar, se responde con esta lista: nombre en español, sus variantes y el
//  rectangulo que conviene mostrar.
//
//  bbox: [oeste, sur, este, norte]
// =============================================================================

export const ZONES = [
  { name: "Estrecho de Ormuz", detail: "Entre Irán y Omán · Golfo Pérsico", aliases: ["ormuz", "hormuz", "hormoz", "estrecho de ormuz", "strait of hormuz"], bbox: [54.8, 25.0, 57.9, 27.6] },
  { name: "Golfo Pérsico", detail: "Irán, Arabia Saudita, EAU, Catar, Kuwait", aliases: ["golfo persico", "persian gulf", "golfo arabigo"], bbox: [47.5, 23.5, 57.5, 30.5] },
  { name: "Golfo de Omán", detail: "Entre Omán e Irán", aliases: ["golfo de oman", "gulf of oman"], bbox: [56.0, 22.0, 62.0, 26.5] },
  { name: "Estrecho de Bab el-Mandeb", detail: "Entre Yemen y Yibuti · Mar Rojo", aliases: ["bab el mandeb", "bab el-mandeb", "babelmandeb", "bab al mandab"], bbox: [42.0, 11.3, 44.6, 13.7] },
  { name: "Mar Rojo", detail: "Entre África y la península arábiga", aliases: ["mar rojo", "red sea"], bbox: [32.0, 12.0, 44.0, 30.0] },
  { name: "Canal de Suez", detail: "Egipto", aliases: ["suez", "canal de suez", "suez canal"], bbox: [31.9, 29.8, 32.8, 31.4] },
  { name: "Estrecho de Malaca", detail: "Entre Malasia e Indonesia", aliases: ["malaca", "malacca", "estrecho de malaca", "strait of malacca"], bbox: [95.5, 0.5, 104.5, 7.0] },
  { name: "Estrecho de Taiwán", detail: "Entre China y Taiwán", aliases: ["estrecho de taiwan", "taiwan strait", "formosa"], bbox: [117.5, 22.0, 122.0, 26.5] },
  { name: "Estrecho de Gibraltar", detail: "Entre España y Marruecos", aliases: ["gibraltar", "estrecho de gibraltar"], bbox: [-6.5, 35.6, -4.8, 36.4] },
  { name: "Bósforo", detail: "Estambul, Turquía", aliases: ["bosforo", "bosporus", "estrecho del bosforo"], bbox: [28.8, 40.9, 29.3, 41.3] },
  { name: "Canal de Panamá", detail: "Panamá", aliases: ["panama", "canal de panama", "panama canal"], bbox: [-80.1, 8.8, -79.4, 9.5] },
  { name: "Canal de la Mancha", detail: "Entre Reino Unido y Francia", aliases: ["canal de la mancha", "la mancha", "english channel"], bbox: [-5.5, 48.5, 2.5, 51.3] },
  { name: "Estrecho de Magallanes", detail: "Chile", aliases: ["magallanes", "estrecho de magallanes", "strait of magellan"], bbox: [-75.5, -54.5, -68.0, -52.0] },
];

// Sin tildes, minusculas, sin signos: "Estrecho de Ormúz" == "estrecho de ormuz".
export const fold = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Las zonas que calzan con lo escrito (desde 3 letras: "orm" ya encuentra Ormuz).
export function matchZones(q) {
  const t = fold(q);
  if (t.length < 3) return [];
  return ZONES.filter((z) => [z.name, ...z.aliases].some((a) => {
    const f = fold(a);
    return f.startsWith(t) || f.split(" ").some((w) => w.length >= 3 && w.startsWith(t)) || t.includes(f);
  }));
}
