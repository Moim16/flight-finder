// =============================================================================
//  Utilidades comunes de las funciones serverless.
// =============================================================================

// Algunos proveedores (planespotters) rechazan las peticiones cuyo User-Agent
// no trae un contacto. Se configura con CONTACT_URL (la URL del repo sirve).
const CONTACT = process.env.CONTACT_URL || "https://github.com/Moim16/flight-finder";
export const USER_AGENT = `RadarVuelos/1.0 (+${CONTACT})`;

// GET que devuelve el JSON o lanza. Con timeout: un proveedor lento no puede
// dejar colgada la funcion (Vercel la corta a los 10 s y se pierden los demas).
export async function fetchJson(url, { timeout = 6000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
    });
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} en ${new URL(url).host}`);
      err.status = r.status;
      throw err;
    }
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Numero dentro de un rango, o null si no es un numero valido.
export function num(v, min = -Infinity, max = Infinity) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// Texto limpio y acotado; null si queda vacio.
export function clean(v, max = 80) {
  const s = (v ?? "").toString().trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
}

// Cache en la CDN de Vercel. Con `s-maxage` todos los que miran la misma zona
// comparten la misma respuesta, y los proveedores reciben una peticion por
// zona cada pocos segundos en vez de una por usuario.
export function cacheFor(res, seconds, stale = seconds) {
  res.setHeader("cache-control", `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${stale}`);
}

export function fail(res, code, error) {
  res.setHeader("cache-control", "no-store");
  return res.status(code).json({ error });
}

// Cuerpo JSON de un POST, tolerando que Vercel ya lo haya parseado (objeto) o
// no (stream, como en el servidor local). Con tope de tamaño: 2 MB.
export async function readJson(req, maxBytes = 2_000_000) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  if (typeof req?.[Symbol.asyncIterator] !== "function") return null;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) return null;
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { return null; }
}
