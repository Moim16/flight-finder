// =============================================================================
//  Enlace para compartir un avion (por WhatsApp u otra app).
//
//  GET /vuelo/<hex>?lat=..&lon=..&z=..&cs=QFA255   (reescrito a esta funcion
//                                                    por vercel.json)
//
//  Devuelve la MISMA pagina (index.html) con las etiquetas Open Graph del
//  vuelo: WhatsApp no ejecuta JavaScript, lee esas etiquetas para armar la
//  vista previa del enlace. Asi el chat muestra "QFA255 en vivo · SIN → LHR"
//  con la foto del avion en vez de un enlace pelado. Al abrirlo, la pagina lee
//  el hex de la ruta y selecciona el avion.
//
//  Armar esa vista previa exige consultar la ruta y la foto (varios segundos).
//  Solo la necesitan los robots de las apps de mensajeria y redes; a una
//  PERSONA se le entrega la pagina al instante, y la pagina busca el resto.
// =============================================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { lookupDetails, HEX, CALLSIGN } from "../lib/details.js";
import { routeMatches } from "../lib/geo.js";
import { num } from "../lib/http.js";

let template = null;
async function page() {
  template ??= await readFile(join(process.cwd(), "index.html"), "utf8");
  return template;
}

// Los que arman vistas previas de enlaces (no ejecutan JavaScript).
const PREVIEW_BOTS = /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|skypeuripreview|applebot|googlebot|bingbot|pinterest|redditbot|embedly|vkshare|viber|signal|iframely/i;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const html = await page();
  const hex = (req.query.hex || "").toString().toLowerCase();
  const send = (body, cacheable = true) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    // La version para personas no se guarda en la CDN: asi un robot nunca
    // recibe la pagina sin vista previa. La de los robots si (5 min).
    res.setHeader("cache-control", cacheable ? "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" : "no-store");
    res.statusCode = 200;
    res.end(body);
  };
  if (!HEX.test(hex)) return send(html);
  if (!PREVIEW_BOTS.test(String(req.headers["user-agent"] || ""))) return send(html, false);

  const cs = (req.query.cs || "").toString().toUpperCase().trim();
  const lat = num(req.query.lat, -90, 90);
  const lon = num(req.query.lon, -180, 180);
  const trk = num(req.query.trk, 0, 360);
  const { aircraft, route, photo } = await lookupDetails(hex, CALLSIGN.test(cs) ? cs : "");

  const name = CALLSIGN.test(cs) ? cs : aircraft?.registration || hex.toUpperCase();
  const okRoute = route && lat !== null && lon !== null && routeMatches(route, lat, lon, trk);
  const leg = okRoute ? `${route.origin.iata || route.origin.icao} → ${route.destination.iata || route.destination.icao}` : null;
  const title = [`${name} en vivo`, leg].filter(Boolean).join(" · ");
  const model = aircraft ? [aircraft.manufacturer, aircraft.type].filter(Boolean).join(" ") : null;
  const who = okRoute ? route.airline?.name : aircraft?.owner;
  const cities = okRoute ? `De ${route.origin.city || route.origin.name} a ${route.destination.city || route.destination.name}.` : null;
  const description = [[who, model].filter(Boolean).join(" · "), cities, "Míralo moverse en el mapa en tiempo real."]
    .filter(Boolean).join(" ");

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  const image = photo?.src || `${origin}/icon-512.png`;
  // URL canonica del enlace (la funcion recibe la ruta ya reescrita).
  const params = new URLSearchParams();
  for (const k of ["lat", "lon", "z", "cs", "trk"]) if (req.query[k]) params.set(k, String(req.query[k]));
  const url = `${origin}/vuelo/${hex}?${params}`;

  const tags = `
<meta property="og:type" content="website">
<meta property="og:site_name" content="Radar de vuelos">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="${photo ? "summary_large_image" : "summary"}">`;

  // Reemplazos con funcion: un "$&" dentro del texto no se interpreta.
  send(
    html
      .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} · Radar de vuelos</title>`)
      .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${esc(description)}">`)
      .replace(/<!--og-->[\s\S]*?<!--\/og-->/, () => `<!--og-->${tags}\n<!--/og-->`),
  );
}
