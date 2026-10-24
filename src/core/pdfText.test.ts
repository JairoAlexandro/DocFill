import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { generateDocument, readDocument } from './formats';
import { detectVariables } from './detect';
import { buildReplacements } from './variables';
import { buildLines, extractPdfItems } from './pdfText';
import { tesseractToItems } from './ocr';

async function textPdf(lines: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 780 - i * 24, size: 12, font }));
  return pdf.save();
}

describe('PDF sin formulario', () => {
  it('agrupa trozos en líneas con la posición de cada carácter', () => {
    const lines = buildLines([
      { page: 1, str: 'Hola', x: 10, y: 100, width: 20, size: 10 },
      { page: 1, str: 'mundo', x: 35, y: 100.5, width: 25, size: 10 },
      { page: 1, str: 'Abajo', x: 10, y: 80, width: 25, size: 10 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['Hola mundo', 'Abajo']);
    expect(lines[0].geo.xs).toHaveLength('Hola mundo'.length + 1);
    expect(lines[0].geo.xs[5]).toBe(35);
  });

  it('lee el texto, detecta los datos y escribe el valor nuevo en su sitio', async () => {
    const bytes = await textPdf(['De una parte, D. Carlos Martinez Ruiz, mayor de edad.', 'Firma: Carlos Martinez Ruiz']);
    const paras = await readDocument('c.pdf', bytes);
    expect(paras.map((p) => p.text)).toEqual(['De una parte, D. Carlos Martinez Ruiz, mayor de edad.', 'Firma: Carlos Martinez Ruiz']);
    const vars = detectVariables(paras);
    const v = vars.find((x) => x.original === 'Carlos Martinez Ruiz')!;
    v.value = 'Ana Torres Vidal';
    const out = await generateDocument('c.pdf', bytes, buildReplacements(vars), { paragraphs: paras });
    const after = await extractPdfItems(out);
    const news = after.filter((i) => i.str.includes('Ana Torres Vidal'));
    expect(news).toHaveLength(2);
    // El texto nuevo empieza justo donde empezaba el antiguo.
    const old = paras[0].geo!;
    expect(news.find((n) => Math.abs(n.y - old.y) < 1)!.x).toBeCloseTo(old.xs[paras[0].text.indexOf('Carlos')], 0);
  });

  it('convierte el resultado del OCR en posiciones de la página', () => {
    const items = tesseractToItems(
      [{ paragraphs: [{ lines: [{ bbox: { x0: 100, y0: 200, x1: 400, y1: 240 }, words: [{ text: 'Laura', bbox: { x0: 100, y0: 200, x1: 200, y1: 240 } }] }] }] }],
      1,
      { heightPt: 842, scale: 2 },
    );
    expect(items[0]).toMatchObject({ str: 'Laura', x: 50, width: 50 });
    expect(items[0].y).toBeCloseTo(842 - (240 - 40 * 0.22) / 2);
  });
});
