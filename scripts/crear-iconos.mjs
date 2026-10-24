// Dibuja el icono de DocFill (un documento sobre fondo azul) y lo guarda como PNG en varios tamaños:
// public/icons (web instalable) y build/icon.png (app de escritorio). Sin dependencias: PNG hecho a mano.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const BLUE = [47, 91, 234];
const WHITE = [255, 255, 255];
const LINE = [175, 192, 245];

/** Color de un punto en coordenadas 0..1. `maskable` deja más margen (Android recorta el borde). */
function colorAt(x, y, maskable) {
  const r = 0.22;
  const inRounded = (px, py) => {
    const cx = Math.min(Math.max(px, r), 1 - r);
    const cy = Math.min(Math.max(py, r), 1 - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
  if (!maskable && !inRounded(x, y)) return null;
  const s = maskable ? 0.62 : 0.7;
  const u = (x - (1 - s) / 2) / s;
  const v = (y - (1 - s) / 2) / s;
  // Hoja con la esquina doblada.
  const left = 0.2, right = 0.8, top = 0.08, bottom = 0.92, fold = 0.2;
  const inPage = u >= left && u <= right && v >= top && v <= bottom && !(u > right - fold && v < top + fold && u - (right - fold) > v - top);
  if (inPage) {
    const inFold = u > right - fold && v < top + fold;
    if (inFold) return LINE;
    for (const [ly, lw] of [[0.42, 0.46], [0.56, 0.46], [0.7, 0.3]]) {
      if (v >= ly && v <= ly + 0.06 && u >= left + 0.1 && u <= left + 0.1 + lw) return BLUE;
    }
    return WHITE;
  }
  return BLUE;
}

function draw(size, maskable = false) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, maskable);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const cov = a / 255;
      buf[i] = cov ? Math.round(r / cov) : 0;
      buf[i + 1] = cov ? Math.round(g / cov) : 0;
      buf[i + 2] = cov ? Math.round(b / cov) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return png(size, buf);
}

const outputs = [
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/maskable-512.png', 512, true],
  ['public/icons/apple-touch-icon.png', 180, true],
  ['public/favicon.png', 64, false],
  ['build/icon.png', 512, false],
];
for (const [rel, size, maskable] of outputs) {
  const file = join(root, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, draw(size, maskable));
  console.log('Icono:', rel);
}
