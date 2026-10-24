import type { PdfItem } from './pdfText';
import { openPdfJs } from './pdfText';

/**
 * Reconocimiento de texto (OCR) para PDF escaneados y fotos de documentos.
 * Usa Tesseract (gratuito) con el modelo de español, todo en el propio equipo: los ficheros
 * están en public/ocr (los copia scripts/copiar-ocr.mjs), así que funciona sin internet.
 */

export type Progress = (fraction: number) => void;

/** Página ya convertida en imagen, con su tamaño en puntos PDF. */
interface PageImage {
  image: HTMLCanvasElement | Blob;
  widthPt: number;
  heightPt: number;
  /** Píxeles de la imagen por cada punto PDF. */
  scale: number;
}

interface TessWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface TessLine {
  bbox: { x0: number; y0: number; x1: number; y1: number };
  baseline?: { x0: number; y0: number; x1: number; y1: number };
  words: TessWord[];
}
interface TessBlock {
  paragraphs: { lines: TessLine[] }[];
}

/** Convierte el resultado de Tesseract (píxeles, origen arriba) en trozos con posición PDF (puntos, origen abajo). */
export function tesseractToItems(blocks: TessBlock[], page: number, img: Pick<PageImage, 'heightPt' | 'scale'>): PdfItem[] {
  const items: PdfItem[] = [];
  for (const block of blocks) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const h = line.bbox.y1 - line.bbox.y0;
        // Tesseract da la línea base; si no, queda algo por encima del borde inferior (por la "p" o la "g").
        const base = line.baseline ? (line.baseline.y0 + line.baseline.y1) / 2 : line.bbox.y1 - h * 0.22;
        const y = img.heightPt - base / img.scale;
        // Desde la línea base hasta lo más alto de las letras hay ~0,72 del tamaño de la letra.
        const size = Math.max(4, (base - line.bbox.y0) / 0.72 / img.scale);
        for (const w of line.words) {
          const str = w.text.trim();
          if (!str) continue;
          items.push({ page, str, x: w.bbox.x0 / img.scale, y, width: (w.bbox.x1 - w.bbox.x0) / img.scale, size });
        }
      }
    }
  }
  return items;
}

async function recognize(pages: PageImage[], onProgress?: Progress): Promise<PdfItem[]> {
  const { createWorker } = await import('tesseract.js');
  const base = new URL('ocr/', document.baseURI).href;
  let current = 0;
  const worker = await createWorker('spa', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.((current + m.progress) / pages.length);
    },
  });
  try {
    const items: PdfItem[] = [];
    for (let i = 0; i < pages.length; i++) {
      current = i;
      const { data } = await worker.recognize(pages[i].image, {}, { blocks: true });
      items.push(...tesseractToItems((data.blocks ?? []) as unknown as TessBlock[], i + 1, pages[i]));
    }
    onProgress?.(1);
    return items;
  } finally {
    await worker.terminate();
  }
}

/** PDF escaneado: cada página se dibuja como imagen y se reconoce. */
export async function ocrPdf(bytes: ArrayBuffer | Uint8Array, onProgress?: Progress): Promise<PdfItem[]> {
  const doc = await openPdfJs(bytes);
  const pages: PageImage[] = [];
  const scale = 2.5;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    pages.push({ image: canvas, widthPt: base.width, heightPt: base.height, scale });
  }
  await doc.destroy();
  return recognize(pages, onProgress);
}

/** Tamaño en puntos de la página PDF que se crea a partir de una foto (96 ppp). */
export const IMAGE_PT_PER_PX = 0.75;

export async function ocrImage(bytes: ArrayBuffer | Uint8Array, mime: string, onProgress?: Progress): Promise<{ items: PdfItem[]; widthPt: number; heightPt: number }> {
  const blob = new Blob([bytes], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const widthPt = bitmap.width * IMAGE_PT_PER_PX;
  const heightPt = bitmap.height * IMAGE_PT_PER_PX;
  bitmap.close();
  const items = await recognize([{ image: blob, widthPt, heightPt, scale: 1 / IMAGE_PT_PER_PX }], onProgress);
  return { items, widthPt, heightPt };
}
