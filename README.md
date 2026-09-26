# Radar de vuelos

Web para ver **los aviones que están volando ahora mismo** sobre un mapa: dónde van, a qué altura y velocidad, hacia dónde, de qué aerolínea son, su ruta y una foto del avión. Abre centrada en tu ubicación y con el buscador saltas a cualquier ciudad o aeropuerto del mundo.

Mismo stack que `deudas`: un solo `index.html` sin frameworks, funciones serverless de Vercel en `api/` y un servidor local en `scripts/dev.mjs`. No usa base de datos: todo sale en vivo de fuentes públicas y gratuitas.

---

## Qué se ve

| Parte | Qué muestra |
|---|---|
| **Mapa** | Cada avión como un ícono girado según su rumbo y **coloreado por altitud** (naranja cerca del suelo, violeta sobre 40.000 ft, gris en tierra). La forma cambia según el tipo: avioneta, jet, avión pesado o helicóptero. Entre cada actualización los aviones **se mueven con suavidad**: su posición se estima con la velocidad y el rumbo. |
| **Etiquetas** | Con zoom cercano, el número de vuelo y la altitud (`FL350` sobre 10.000 ft). |
| **Detalle** (clic en un avión) | Número de vuelo, aerolínea, modelo, foto, ruta origen → destino con el avance del trayecto, altitud (ft y m), velocidad (kt y km/h), rumbo con brújula, velocidad vertical (subiendo, bajando o nivelado), squawk, posición, matrícula, operador, categoría y de qué fuentes llegó el dato. |
| **Estela y ruta** | Del avión seleccionado se dibuja la trayectoria recorrida (coloreada por altitud) y el arco de círculo máximo hacia el aeropuerto de destino. |
| **Perfil de altitud** | Un gráfico de la altitud desde que empezaste a seguirlo. |
| **Lista** | Todos los vuelos de la zona, ordenables por cercanía, altitud o velocidad. Las emergencias salen primero. |
| **Buscador** | Ciudades y aeropuertos (para mover el mapa) y vuelos ya cargados, por número de vuelo, matrícula, código ICAO o tipo. Atajo: tecla `/`. |
| **Emergencias** | Squawk 7500/7600/7700 o aviso de emergencia ADS-B: ícono rojo, anillo y un aviso en la barra inferior que lleva directo al avión. |

Otras cosas: **Seguir** mantiene el mapa centrado en el avión, **Copiar enlace** comparte la zona y el avión seleccionado (`?lat=..&lon=..&z=..&hex=..`), y hay tema claro, oscuro o el del sistema. Se instala como app (PWA) desde el navegador del teléfono.

---

## De dónde salen los datos

| Dato | Fuente | Llave |
|---|---|---|
| Posiciones en vivo | [adsb.lol](https://adsb.lol) + [adsb.fi](https://adsb.fi) + [OpenSky](https://opensky-network.org), **las tres a la vez** | No (OpenSky opcional) |
| Aeronave y ruta por número de vuelo | [adsbdb](https://www.adsbdb.com) | No |
| Foto | [planespotters.net](https://www.planespotters.net) | No |
| Buscador de lugares | [Photon](https://photon.komoot.io) (OpenStreetMap) | No |
| Mapa base | [CARTO](https://carto.com/basemaps) Dark Matter / Positron | No |

**Por qué tres fuentes de posiciones.** Todas dependen de antenas ADS-B de voluntarios, y cada red tiene huecos distintos. En Sudamérica cada una por separado ve muy poco. El servidor consulta las tres en paralelo y las **funde por el código ICAO** del avión: gana la posición más reciente y los datos que falten (matrícula, tipo) se completan con otra fuente. Si una falla, la respuesta sale igual con las demás, y la lista indica cuántos aviones aportó cada una.

**La ruta se valida antes de mostrarla.** adsbdb la obtiene del *número de vuelo*, no del avión, y los vuelos con escalas comparten número: `LAN800` es Santiago–Auckland–Sídney, pero la base guarda un solo tramo. Por eso la página comprueba que el avión esté cerca del círculo máximo entre origen y destino. Si no lo está, lo avisa y no dibuja la ruta.

**Límites.** Donde no hay receptores no hay aviones, aunque haya vuelos: océanos, zonas rurales y buena parte de Sudamérica. Cada consulta cubre como máximo **250 NM** alrededor del centro. Si la vista es más grande, el mapa dibuja el círculo consultado.

---

## Cómo se corre

Requiere Node 18 o superior. No hay dependencias que instalar.

```bash
npm run dev          # http://localhost:3000
npm test             # pruebas de normalizacion y fusion (sin red)
npm run icons        # regenera los PNG del icono desde la geometria de icon.svg
```

Para usar `.env` (ver `.env.example`):

```bash
node --env-file=.env scripts/dev.mjs
```

| Variable | Para qué |
|---|---|
| `CONTACT_URL` | Contacto que va en el User-Agent. planespotters rechaza peticiones sin él. Por defecto, la URL de este repo. |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | Opcional. Una cuenta gratis de OpenSky sube el límite de 400 a 4000 créditos al día. Sin cuenta, al agotarse los créditos el servidor deja de consultar OpenSky por 10 minutos y sigue con las otras dos fuentes. |

---

## Despliegue en Vercel

1. Importar el repo en Vercel. No necesita build: son archivos estáticos y funciones en `api/`.
2. (Opcional) Cargar `OPENSKY_CLIENT_ID` y `OPENSKY_CLIENT_SECRET` en *Settings → Environment Variables*.

**Caché compartida.** `/api/flights` responde con `s-maxage=4`, y tanto el cliente como el servidor redondean el centro a 0,05° y el radio a escalones fijos. Así, todos los que miran la misma zona reciben **la misma respuesta desde la CDN**, y las fuentes gratuitas reciben una consulta por zona cada pocos segundos, no una por usuario. Rutas, fotos y lugares se cachean por horas.

`vercel.json` fija las cabeceras de seguridad y la CSP, y el servidor local las lee del mismo archivo, así que lo que la CSP bloquea en producción también se bloquea en local. Si agregas un servicio externo nuevo (tiles, imágenes, scripts), hay que sumar su dominio ahí.

---

## Estructura

```
index.html           la app completa: mapa (MapLibre GL), paneles, buscador
api/flights.js       aviones alrededor de un punto (fusion de 3 fuentes)
api/details.js       aeronave, ruta y foto de un avion
api/places.js        buscador de ciudades y aeropuertos
lib/sources.js       cada proveedor normalizado a un solo formato + fusion
lib/geo.js           distancias y cajas sobre la esfera
lib/http.js          fetch con timeout, cache de CDN, utilidades
scripts/dev.mjs      servidor local que imita a Vercel
scripts/smoke.mjs    pruebas
sw.js                service worker (solo el cascaron; los datos nunca se cachean)
```

### Formato de un avión (`/api/flights`)

```json
{ "hex": "e8043d", "flight": "LXP204", "reg": "CC-BAZ", "type": "A320",
  "cat": "A3", "lat": -34.35, "lon": -71.28, "alt": 28075, "geomAlt": 29150,
  "ground": false, "gs": 409.1, "track": 24.2, "vr": -1920, "squawk": "1234",
  "emergency": null, "military": false, "seen": 1.2, "src": ["adsb.lol", "OpenSky"] }
```

Unidades de aviación: `alt` en pies, `gs` en nudos, `vr` en pies por minuto, `track` en grados desde el norte y `seen` en segundos desde la última posición.

### Posición estimada

Entre respuestas (cada 5 s), la página redibuja cada 250 ms moviendo cada avión desde su última posición conocida, según su velocidad y rumbo. No extrapola más allá de 60 s. Un avión sin señal por más de 30 s se ve atenuado, y pasados 90 s el seleccionado se marca como *Sin señal*.

---

## Pendiente / ideas

- Historial completo de la trayectoria al seleccionar (hoy la estela empieza cuando el avión aparece en pantalla).
- Filtro por aerolínea o tipo de avión.
- Buscar un vuelo fuera de la zona visible (requiere consultar por hex a las fuentes).
