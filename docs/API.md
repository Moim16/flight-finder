# API

El contrato que usan la web y la futura app móvil. Todas las rutas son `GET`, sin autenticación, y responden JSON (menos `/vuelo/<hex>`, que responde HTML). Desde cualquier origen se pueden llamar (`Access-Control-Allow-Origin: *`), así la app se prueba contra producción sin servidor local.

Los errores responden `{ "error": "mensaje para mostrar" }` con código 4xx/5xx.

**Unidades de aviación en todo el contrato:** altitudes en pies, velocidades en nudos, velocidad vertical en pies por minuto, rumbos en grados desde el norte, distancias de radio en millas náuticas (1 NM = 1,852 km). Convertir es trabajo de la pantalla.

---

## `GET /api/flights` — aviones de un área

| Parámetro | | |
|---|---|---|
| `bbox` | `oeste,sur,este,norte` | el rectángulo visible, en grados. El este puede pasar de 180 si la vista cruza el antimeridiano |
| `lat`, `lon`, `r` | alternativa | un punto y un radio en NM; se convierte en la caja que lo contiene |

El servidor redondea el rectángulo hacia afuera a medio grado (así la CDN comparte la respuesta) y lo reparte entre las fuentes según lo que cada una acepta (`lib/area.js`):

- **OpenSky** recibe la caja completa: una consulta cubre toda la vista, sea una ciudad o un continente.
- **adsb.lol** solo acepta círculos de hasta 250 NM y corta si se le piden muchos seguidos: se consulta en los 2 círculos de una grilla fija más cercanos al centro de la vista.
- **adsb.fi** permite 1 consulta por segundo: solo el círculo del centro.

Si una fuente responde 429 (demasiadas consultas), descansa un minuto y se sigue con las otras. Todo se funde por `hex` y se recorta al rectángulo: cada avión aparece una sola vez.

```json
{
  "now": 1790389117000,
  "bbox": { "w": -72, "s": -34.5, "e": -69.5, "n": -32.5 },
  "cells": 1,
  "partial": false,
  "aircraft": [ /* avion, ver abajo */ ],
  "sources": [
    { "name": "adsb.lol", "ok": true, "count": 13 },
    { "name": "adsb.fi", "ok": false, "count": 0, "error": "HTTP 503 en opendata.adsb.fi" },
    { "name": "OpenSky", "ok": true, "count": 8 }
  ]
}
```

`partial: true` significa que la vista es más grande que los círculos de adsb.lol y adsb.fi: el borde solo lo cubre OpenSky. `count` es cuántos de los aviones del resultado vio cada fuente (uno visto por dos cuenta en las dos).

### Un avión

| Campo | Tipo | |
|---|---|---|
| `hex` | string | código ICAO de 24 bits, en minúsculas. **Es la identidad del avión** en toda la API |
| `flight` | string \| null | indicativo (`LAN800`, `CCABC`) |
| `reg` | string \| null | matrícula |
| `type` | string \| null | código ICAO del modelo (`B789`) |
| `desc` | string \| null | modelo legible (`BOEING 787-9 Dreamliner`) |
| `owner` | string \| null | operador |
| `cat` | string \| null | categoría ADS-B: `A1` avioneta … `A5` pesado, `A7` helicóptero, `B*` planeador/globo/dron |
| `kind` | string | `airline` · `cargo` · `private` · `mil` · `heli`. Lo decide el servidor (`lib/kinds.js`); **los clientes no lo recalculan**. "Militar" sale del bit de la base de adsb.lol/adsb.fi o, si el avión llegó solo por OpenSky, de su modelo o indicativo (`lib/military.js`) |
| `lat`, `lon` | number | última posición reportada |
| `alt` | number \| null | altitud barométrica (0 si está en tierra) |
| `geomAlt` | number \| null | altitud GPS |
| `ground` | bool | en tierra |
| `gs` | number \| null | velocidad respecto del suelo |
| `track` | number \| null | rumbo |
| `vr` | number \| null | velocidad vertical |
| `squawk` | string \| null | código del transpondedor |
| `emergency` | string \| null | `"emergencia"`, `"sin radio"`, `"secuestro"`… o null |
| `military` | bool | según la base de datos de adsb.lol / adsb.fi |
| `seen` | number | segundos desde la última posición |
| `src` | string[] | fuentes que lo vieron |

**Los clientes recuerdan lo descriptivo por avión** (matrícula, modelo, marca militar) y conservan hasta 45 s un avión que falta en una respuesta pero sigue en la vista: no todas las fuentes traen esos datos ni responden todos los ciclos, y sin esto los contadores saltan.

Caché: `s-maxage=4`. Conviene pedir cada 5 s, con un margen de ~4 % alrededor de la vista para que los aviones no aparezcan de golpe en el borde.

---

## `GET /api/details?hex=&callsign=&type=&mil=` — quién es y a dónde va

```json
{
  "aircraft": { "registration": "F-GZNU", "type": "777 328ER", "icaoType": "B77W",
                "manufacturer": "Boeing", "owner": "Air France", "country": "France", "countryIso": "FR" },
  "route": {
    "callsign": "AFR123", "iata": "AF123",
    "airline": { "name": "Air France", "iata": "AF", "icao": "AFR", "country": "France" },
    "origin":      { "iata": "CDG", "icao": "LFPG", "name": "...", "city": "Paris", "country": "France", "countryIso": "FR", "lat": 49.01, "lon": 2.55 },
    "destination": { "iata": "...", "...": "..." }
  },
  "photo": { "src": "https://t.plnspttrs.net/...jpg", "link": "https://www.planespotters.net/photo/...", "photographer": "Nombre" }
}
```

Cualquiera puede venir en `null`. Caché: 1 h.

`military` (de `lib/military.js`) es la ficha del modelo militar y/o quién vuela con ese indicativo:

```json
{ "name": "C-17 Globemaster III", "maker": "Boeing", "role": "transport", "roleLabel": "Transporte",
  "firstFlight": 1991, "crew": "3", "description": "Transporte estratégico: ...",
  "specs": [["Carga máxima", "≈ 77 t"], ["Velocidad de crucero", "≈ 830 km/h"]],
  "operators": "EE. UU., Reino Unido, ...",
  "callsignOperator": "REACH · Mando de Movilidad Aérea de la Fuerza Aérea de EE. UU. (transporte y cisternas)" }
```

Hay que mandar `type` (el modelo que transmite el avión) y `mil=1` si viene marcado como militar: los modelos de doble uso (Gulfstream, King Air, C-130...) solo devuelven ficha si el avión es militar. Datos públicos y aproximados.

- **La foto exige atribución**: mostrar el fotógrafo y enlazar a planespotters.net (sus términos).
- **La ruta hay que validarla contra la posición.** Sale del número de vuelo, y los vuelos con escalas o de ida y vuelta comparten número. La regla (en `routeMatches` de `lib/geo.js` y `checkedRoute` de `index.html`):
  1. el avión está a menos de `max(150 km, 15 % del trayecto)` del círculo máximo origen → destino,
  2. lleva entre −8 % y 108 % del trayecto, y
  3. si está en el aire, a más de 60 kt, y no llegó al 98 %: su rumbo apunta a menos de 90° del destino.

  Si no cumple, se avisa y no se dibuja. Esta regla sí vive en el cliente, porque depende de la posición que cambia cada segundo; está escrita igual en las dos partes y tiene prueba en `scripts/smoke.mjs`.

---

## `GET /api/trace?hex=` — recorrido del vuelo actual

```json
{ "hex": "3965b4", "points": [ [1790307171941, 51.98, -14.97, 37000, 0, 0], "..." ] }
```

Cada punto: `[t_ms, lat, lon, alt, enTierra (0|1), hueco (0|1)]`, del despegue a ahora, máximo 500 puntos. `hueco = 1` significa que antes de ese punto no hubo señal por más de 5 min (océano, zona sin antenas): se dibuja punteado. Sale de la traza diaria de adsb.lol recortada al último tramo. Caché: 20 s.

---

## `GET /api/places?q=` — buscador de lugares

```json
{ "places": [ { "name": "Santiago", "detail": "Región Metropolitana, Chile", "kind": "Ciudad",
                "lat": -33.43, "lon": -70.65, "bbox": [oeste, sur, este, norte] | null, "airport": false } ] }
```

Hasta 6 resultados, en el orden de relevancia de Photon. Se puede llamar mientras se escribe (con debounce). Caché: 1 día.

---

## `GET /vuelo/<hex>?lat=&lon=&z=&cs=&trk=` — enlace para compartir

Devuelve la página con las etiquetas Open Graph del vuelo (título con la ruta validada, foto del avión), que es lo que lee WhatsApp para la vista previa. Al abrirse, la web selecciona ese avión.

La app móvil debería **generar el mismo enlace** (así se puede abrir desde el navegador de quien no tenga la app) y **registrarse para abrirlo** con Android App Links (ver `docs/APP-MOVIL.md`).
