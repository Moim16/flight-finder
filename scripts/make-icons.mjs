// =============================================================================
//  Genera los iconos PNG de la app a partir de la misma geometria que icon.svg.
//
//    node scripts/make-icons.mjs
//
//  Chrome en Android NO ofrece instalar la app si el manifest solo trae un SVG:
//  exige al menos un PNG de 192x192. Se dibuja pixel a pixel y se codifica el
//  PNG a mano con zlib, que ya viene en Node: cero dependencias de imagen.
// =============================================================================

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/* ------------------------------- geometria --------------------------------
   Todo en el lienzo de 512x512 de icon.svg: una pantalla de radar con dos
   anillos, el barrido en ambar y un eco (el avion detectado).
-------------------------------------------------------------------------- */
const FONDO = [0x07, 0x0b, 0x12];
const ANILLO = [0x2a, 0x3a, 0x52];
const AMBAR = [0xff, 0xb0, 0x20];
const C = 256;

const dist = (x, y, px, py) => Math.hypot(x - px, y - py);
const mezcla = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));

function enRectRedondeado(x, y, { x: rx, y: ry, w, h, r }) {
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return dist(x, y, cx, cy) <= r
      || (x >= rx && x <= rx + w && y >= ry + r && y <= ry + h - r)
      || (y >= ry && y <= ry + h && x >= rx + r && x <= rx + w - r);
}

// Distancia de un punto al segmento AB.
function aSegmento(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return dist(x, y, ax + t * dx, ay + t * dy);
}

// Color del dibujo en un punto, o null si ahi no hay nada (fuera del icono).
function colorEn(x, y, { sangre }) {
  const dentro = sangre || enRectRedondeado(x, y, { x: 0, y: 0, w: 512, h: 512, r: 96 });
  if (!dentro) return null;
  const d = dist(x, y, C, C);
  // Rumbo desde el centro: 0 arriba, en sentido horario (como una brujula).
  const rumbo = (Math.atan2(x - C, C - y) * 180 / Math.PI + 360) % 360;

  let c = FONDO;
  if (d <= 176 && rumbo <= 60) c = mezcla(c, AMBAR, 0.35);           // barrido
  if (Math.abs(d - 176) <= 8 || Math.abs(d - 96) <= 8) c = ANILLO;   // anillos
  if (aSegmento(x, y, C, C, 408.4, 168) <= 9) c = AMBAR;             // linea
  if (dist(x, y, 318, 170) <= 24) c = AMBAR;                         // eco
  return c;
}

/* ------------------------------- rasterizado ------------------------------ */
const SS = 4;                          // submuestreo, para que no quede dentado

function dibujar(size, { sangre = false, escala = 1 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const off = (512 - 512 * escala) / 2;

  for (let py = 0; py < size; py++) {
    for (let pxx = 0; pxx < size; pxx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((pxx + (sx + 0.5) / SS) / size) * 512;
          const v = ((py + (sy + 0.5) / SS) / size) * 512;
          const c = colorEn((u - off) / escala, (v - off) / escala, { sangre: false });
          const fin = c ?? (sangre ? FONDO : null);
          if (fin) { r += fin[0]; g += fin[1]; b += fin[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (py * size + pxx) * 4;
      const cuenta = a / 255;
      px[i] = cuenta ? Math.round(r / cuenta) : 0;
      px[i + 1] = cuenta ? Math.round(g / cuenta) : 0;
      px[i + 2] = cuenta ? Math.round(b / cuenta) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

/* --------------------------------- PNG ------------------------------------ */
const TABLA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

function png(size, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;      // 8 bits por canal
  ihdr[9] = 6;      // RGBA

  // Cada linea lleva delante su byte de filtro (0 = sin filtro).
  const crudo = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    crudo[y * (size * 4 + 1)] = 0;
    pixeles.copy(crudo, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(crudo, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------- salida --------------------------------- */
const iconos = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  // Maskable: fondo a sangre y dibujo al 64%, dentro de la zona que Android no recorta.
  ["icon-maskable-512.png", 512, { sangre: true, escala: 0.64 }],
];

for (const [nombre, size, opts] of iconos) {
  const buf = png(size, dibujar(size, opts));
  writeFileSync(join(ROOT, nombre), buf);
  console.log(`  ${nombre.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log("\nIconos generados.");
