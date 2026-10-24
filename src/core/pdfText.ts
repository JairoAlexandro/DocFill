import type { Color, PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import type { Paragraph } from './types';
import { groupByPara, type Replacement } from './formats';

/**
 * PDF "normales" (sin formulario) y documentos escaneados.
 * No se puede editar el texto de un PDF como en Word, así que se hace lo mismo que haría una persona:
 * se tapa el texto antiguo con un recuadro blanco y se escribe el nuevo encima, en la misma posición.
 * Para eso cada línea guarda dónde está en la página (Paragraph.geo).
 */

/** Trozo de texto con su posición en la página (puntos PDF, origen abajo a la izquierda). */
export interface PdfItem {
  page: number;
  str: string;
  x: number;
  /** Línea base del texto. */
  y: number;
  width: number;
  size: number;
}

export interface Geo {
  page: number;
  y: number;
  size: number;
  /** Posición x del inicio de cada carácter; el último valor es el final de la línea. */
  xs: number[];
}

/** Anchos de las letras en Helvetica/Arial (milésimas del tamaño de letra), para repartir el ancho de cada palabra. */
const WIDTHS: Record<string, number> = Object.fromEntries(
  [
    [' !,./:;Iijl|', 250],
    ['ft[]', 278],
    ['"\'()-`r*', 333],
    ['Jcksvxyz', 500],
    ['0123456789$#?_abdeghnopqu', 556],
    ['FTZ', 611],
    ['ABEKPSVXY&', 667],
    ['CDHNRUw', 722],
    ['GOQ', 778],
    ['Mm%', 833],
    ['W', 944],
    ['@', 1015],
  ].flatMap(([chars, w]) => [...(chars as string)].map((c) => [c, w as number])),
);

function charWidth(c: string): number {
  return WIDTHS[c] ?? WIDTHS[c.normalize('NFD')[0]] ?? 556;
}

/** Agrupa los trozos en líneas y calcula la posición de cada carácter. */
export function buildLines(items: PdfItem[]): { text: string; geo: Geo }[] {
  const lines: { page: number; y: number; size: number; items: PdfItem[] }[] = [];
  const sorted = items.filter((i) => i.str.length > 0).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  for (const it of sorted) {
    const line = lines.find((l) => l.page === it.page && Math.abs(l.y - it.y) <= Math.max(l.size, it.size) * 0.35);
    if (line) {
      line.items.push(it);
      line.size = Math.max(line.size, it.size);
    } else lines.push({ page: it.page, y: it.y, size: it.size, items: [it] });
  }
  return lines
    .sort((a, b) => a.page - b.page || b.y - a.y)
    .map((l) => {
      l.items.sort((a, b) => a.x - b.x);
      let text = '';
      const xs: number[] = [];
      let lastEnd = l.items[0].x;
      for (const it of l.items) {
        const gap = it.x - lastEnd;
        if (text && gap > l.size * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) {
          xs.push(lastEnd);
          text += ' ';
        }
        // El ancho del trozo se reparte entre sus letras según lo ancha que es cada una ("m" más que "i").
        const ws = [...it.str].map(charWidth);
        const total = ws.reduce((a, b) => a + b, 0) || 1;
        let acc = 0;
        for (let i = 0; i < it.str.length; i++) {
          xs.push(it.x + (it.width * acc) / total);
          acc += ws[i] ?? 556;
        }
        text += it.str;
        lastEnd = it.x + it.width;
      }
      xs.push(lastEnd);
      return { text: text.replace(/\s+$/, (m) => ' '.repeat(m.length)), geo: { page: l.page, y: l.y, size: l.size, xs } };
    })
    .filter((l) => l.text.trim());
}

export function linesToParagraphs(lines: { text: string; geo: Geo }[]): Paragraph[] {
  return lines.map((l, index) => ({ index, part: `pagina-${l.geo.page}`, kind: 'pagina', text: l.text, inTable: false, geo: l.geo }));
}

// ---------------------------------------------------------------- Lectura con pdf.js (gratuito, de Mozilla)

async function pdfjs() {
  if (import.meta.env.MODE === 'test') return import('pdfjs-dist/legacy/build/pdf.mjs');
  const lib = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

export async function openPdfJs(bytes: ArrayBuffer | Uint8Array) {
  const lib = await pdfjs();
  // pdf.js se queda con el buffer: se le pasa una copia.
  const standardFontDataUrl = typeof document !== 'undefined' && import.meta.env.MODE !== 'test' ? new URL('pdfjs/standard_fonts/', document.baseURI).href : undefined;
  return lib.getDocument({ data: new Uint8Array(bytes).slice(), isEvalSupported: false, standardFontDataUrl }).promise;
}

/** Texto de un PDF con posiciones. Si casi no hay texto, el PDF es escaneado (necesita OCR). */
export async function extractPdfItems(bytes: ArrayBuffer | Uint8Array): Promise<PdfItem[]> {
  const doc = await openPdfJs(bytes);
  const items: PdfItem[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!('str' in it) || !it.str) continue;
      const [a, b, c, d, e, f] = it.transform as number[];
      items.push({ page: n, str: it.str, x: e, y: f, width: it.width, size: Math.hypot(c, d) || Math.hypot(a, b) || 10 });
    }
  }
  await doc.destroy();
  return items;
}

/**
 * El texto tapado sigue dentro del PDF (se podría copiar). Para quitarlo de verdad, cada página se
 * convierte en imagen y se crea un PDF nuevo con esas imágenes. Solo en el navegador / app de escritorio.
 */
export async function flattenPdf(bytes: Uint8Array, scale = 2.5): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await openPdfJs(bytes);
  const out = await PDFDocument.create();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('pdf.failed'))), 'image/png'));
    const img = await out.embedPng(await png.arrayBuffer());
    out.addPage([base.width, base.height]).drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
  }
  await doc.destroy();
  return out.save();
}

// ---------------------------------------------------------------- Escritura con pdf-lib

/** Las fuentes estándar de PDF no tienen todos los caracteres: se quitan tildes raras o se sustituyen. */
function safeText(font: PDFFont, s: string): string {
  let out = '';
  for (const ch of s) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      try {
        font.encodeText(base);
        out += base;
      } catch {
        out += '?';
      }
    }
  }
  return out;
}

function cover(page: PDFPage, x0: number, x1: number, geo: Geo, white: Color) {
  page.drawRectangle({ x: x0 - 0.6, y: geo.y - geo.size * 0.28, width: x1 - x0 + 1.2, height: geo.size * 1.2, color: white });
}

/** Tapa el texto antiguo y escribe el nuevo en cada línea afectada. Los párrafos quitados se tapan enteros. */
export async function overlayPdf(pdf: PDFDocument, paragraphs: Paragraph[], reps: Replacement[], removeParas: number[] = []): Promise<void> {
  const { StandardFonts, rgb } = await import('pdf-lib');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const pages = pdf.getPages();

  for (const pi of removeParas) {
    const geo = paragraphs[pi]?.geo;
    if (geo) cover(pages[geo.page - 1], geo.xs[0], geo.xs[geo.xs.length - 1], geo, white);
  }
  const removed = new Set(removeParas);
  for (const [pi, list] of groupByPara(reps)) {
    const geo = paragraphs[pi]?.geo;
    if (!geo || removed.has(pi)) continue;
    const page = pages[geo.page - 1];
    for (const r of list) {
      const x0 = geo.xs[r.start] ?? geo.xs[geo.xs.length - 1];
      const x1 = geo.xs[r.end] ?? geo.xs[geo.xs.length - 1];
      cover(page, x0, x1, geo, white);
      const text = safeText(font, r.text);
      if (!text) continue;
      // Si el texto nuevo es más largo, se reduce un poco la letra para que no pise lo que va detrás.
      const room = Math.max(x1 - x0, geo.size) * 1.1;
      const width = font.widthOfTextAtSize(text, geo.size);
      const size = width > room ? Math.max(geo.size * 0.55, (geo.size * room) / width) : geo.size;
      page.drawText(text, { x: x0, y: geo.y, size, font, color: black });
    }
  }
}
