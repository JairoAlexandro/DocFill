import type { OptionalClause, Paragraph, RepeatBlock, Variable } from './types';
import { duplicateParagraphs, formatOf, generateDocument } from './formats';
import { resolveValues } from './formula';
import { buildRepeatReplacements, layoutFor } from './repeat';
import { buildReplacements, removedParas } from './variables';

export interface DocumentInput {
  fileName: string;
  bytes: ArrayBuffer | Uint8Array;
  paragraphs?: Paragraph[];
  optional?: OptionalClause[];
  repeats?: RepeatBlock[];
}

export interface RenderOptions {
  /** PDF: convertir las páginas en imagen para que el texto tapado desaparezca de verdad. */
  flatten?: boolean;
}

/** ¿El documento es un PDF en el que se escribe encima (no un formulario)? */
export function isOverlayDocument(input: Pick<DocumentInput, 'fileName' | 'paragraphs'>): boolean {
  const f = formatOf(input.fileName);
  return (f?.id === 'pdf' || f?.id === 'image') && !!input.paragraphs?.some((p) => p.geo);
}

/** Genera el documento final: copias de las listas, sustituciones y cláusulas opcionales quitadas. */
export async function renderDocument(input: DocumentInput, vars: Variable[], opts: RenderOptions = {}): Promise<Uint8Array> {
  const resolved = resolveValues(vars);
  const layout = layoutFor(input.repeats);
  let bytes = input.bytes;
  if (layout.active.length) {
    bytes = await duplicateParagraphs(
      input.fileName,
      bytes,
      layout.active.map((b) => ({ paras: b.paras, copies: b.entries.length })),
    );
  }
  const reps = layout.active.length ? buildRepeatReplacements(vars, resolved, input.repeats) : buildReplacements(vars, resolved);

  // Un párrafo quitado dentro de una lista se quita también de todas sus copias.
  const removeParas = removedParas(input.optional, vars, resolved).flatMap((para) => {
    const block = layout.active.find((b) => b.paras.includes(para));
    const copies = block ? block.entries.map((_, k) => layout.copyIndex(block, k + 1, para)) : [];
    return [layout.index(para), ...copies];
  });
  const out = await generateDocument(input.fileName, bytes, reps, { removeParas, paragraphs: input.paragraphs });
  if (opts.flatten && formatOf(input.fileName)?.id === 'pdf' && isOverlayDocument(input)) {
    const { flattenPdf } = await import('./pdfText');
    return flattenPdf(out);
  }
  return out;
}
