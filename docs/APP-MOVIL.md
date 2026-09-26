# App móvil — lo que queda preparado

La app nativa va a hacer lo mismo que la web contra **la misma API**, igual que `deudas_app` con `deudas`. Este documento deja escritas las decisiones para empezarla sin tener que redescubrirlas.

## Qué ya está listo del lado del servidor

| | |
|---|---|
| ✅ | Contrato de la API documentado en [`API.md`](API.md) |
| ✅ | CORS abierto en `/api/*`: la app (y `flutter run -d chrome`) puede usar producción directamente |
| ✅ | El tipo de vuelo (`kind`) lo calcula el servidor: la app no copia las listas de operadores de carga ni de jets privados |
| ✅ | Historial del vuelo (`/api/trace`) ya recortado al tramo actual |
| ✅ | Enlaces `/vuelo/<hex>` con vista previa, que la app puede generar y abrir |
| ⬜ | `/.well-known/assetlinks.json` para Android App Links: necesita la huella SHA-256 del certificado con que se firme el APK, así que se agrega cuando exista |

## Mismo esquema que deudas_app

- Proyecto aparte: `Escritorio\radar-vuelos-app`, en **Flutter**, con su propio repo.
- Arquitectura MVVM por feature, la de la guía oficial de Flutter (ver `deudas_app/ARQUITECTURA.md`): `domain/models`, `data/services`, `data/repositories`, `ui/<feature>/{view_model,widgets}`, `utils/{result,command}`.
- La dirección del servidor por `--dart-define=API_URL=https://<app>.vercel.app`, y editable en la app.
- `provider` para el estado, `http` para la red, `shared_preferences` para lo que se recuerda (tema, última zona, filtros). Nada de librerías de UI de terceros.

## Paquetes que cambian respecto de deudas

| Necesidad | Paquete | Por qué |
|---|---|---|
| Mapa | `maplibre_gl` | Usa **los mismos estilos de CARTO** que la web (Dark Matter / Positron) y las mismas capas GeoJSON: el mapa se ve igual y las expresiones de estilo (`icon-rotate`, `line-dasharray`…) se copian casi tal cual |
| Ubicación | `geolocator` | Centrar en el usuario al abrir |
| Compartir | `share_plus` | Ya usado en deudas; comparte el texto y el enlace `/vuelo/<hex>` (WhatsApp incluido) |
| Abrir enlaces | `app_links` | Que `/vuelo/<hex>` abra la app si está instalada |

## Pantallas (las mismas piezas que la web)

1. **Mapa** a pantalla completa, con los chips de tipo (Todos, Comerciales, Carga, Privados, Militares, Helicópteros) y el estado inferior (*N vuelos · hace 3 s*).
2. **Hoja de detalle** (bottom sheet arrastrable): foto con crédito, ruta con avance, datos en vivo, perfil de altitud, Seguir, Compartir.
3. **Lista** de la zona, ordenable por cercanía, altitud y velocidad.
4. **Buscador** de lugares y vuelos cargados.
5. **Ajustes**: tema, etiquetas, ocultar en tierra, dirección del servidor.

## Reglas que la app NO recalcula (vienen de la API)

- La **fusión de fuentes** y el formato del avión.
- El **tipo de vuelo** (`kind`).
- El **recorte del historial** al vuelo actual.

## Lo que sí va en `domain/` de la app (y se prueba sin pantalla)

Son cálculos que dependen del tiempo o de la posición en vivo; en la web están en `index.html` y tienen que dar lo mismo:

| Regla | En la web | Detalle |
|---|---|---|
| Posición estimada | `livePos` | avanza la última posición con `gs` y `track`; máximo 60 s |
| Validación de ruta | `checkedRoute` | cerca del círculo máximo, avance entre −8 % y 108 %, y rumbo a menos de 90° del destino (ver `API.md`) |
| Avance del trayecto | `routeFit` | distancia recorrida y restante sobre el círculo máximo |
| Recorrido + vivo | `flightPath` | historial hasta la primera posición en vivo; hueco si pasan más de 5 min |
| Colores de altitud | `ALT_STEPS` | los mismos 7 tramos y colores, más gris en tierra y rojo en emergencia |
| Íconos | `SHAPES` en `index.html` | mismas siluetas (jet, pesado, avioneta, helicóptero); dibujarlas con `CustomPainter` y pasarlas a MapLibre con `addImage` |

**Colores de la ruta seleccionada:** recorrido en ámbar (`--flown`), por recorrer en azul cielo punteado (`--todo`), en los dos temas con los valores de `index.html`.

## Por qué tener app si la web ya se instala

1. **Avisos**: "el vuelo que sigues aterrizó" o "empezó a descender". Con la app se puede revisar en segundo plano; la web solo avisa con la pestaña abierta.
2. **Estar en la Play Store.**
3. **Mapa más fluido** en teléfonos modestos (MapLibre nativo en vez de WebGL en el navegador).
