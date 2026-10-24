// Copia a public/ocr y public/pdfjs los ficheros del OCR (Tesseract) y de pdf.js, ambos gratuitos,
// para que funcionen sin internet en la web y en la app de escritorio. Se ejecuta solo antes de "dev" y "build".
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const out = (...p) => join(root, 'public', 'ocr', ...p);

const files = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), out('worker.min.js')],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map((f) => [
    nm('tesseract.js-core', f),
    out('core', f),
  ]),
  [nm('@tesseract.js-data', 'spa', '4.0.0_best_int', 'spa.traineddata.gz'), out('lang', 'spa.traineddata.gz')],
];

// Fuentes estándar de PDF que necesita pdf.js para dibujar páginas (aplanar y OCR de escaneados).
const fontsDir = nm('pdfjs-dist', 'standard_fonts');
for (const f of await readdir(fontsDir)) files.push([join(fontsDir, f), join(root, 'public', 'pdfjs', 'standard_fonts', f)]);

for (const [from, to] of files) {
  const exists = await stat(to).catch(() => null);
  const src = await stat(from);
  if (exists && exists.size === src.size) continue;
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  console.log('OCR:', to.replace(root, '.'));
}
