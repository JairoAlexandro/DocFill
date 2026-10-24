import type { Category, Paragraph, Variable } from './types';
import { isBlankText } from './rules';
import { findAll, fold } from './text';
import { validateValue } from './validate';
import type { Resolved } from './variables';

/**
 * Revisión final antes de descargar.
 * - resto: queda en el documento un trozo del dato antiguo que no se va a cambiar ("Laura", "Sr. Gómez").
 * - vacio: un dato sin valor nuevo (se quedará como está).
 * - hueco: un hueco en blanco sin rellenar.
 * - formula / invalido: el valor tiene un error.
 */
export interface ReviewIssue {
  kind: 'resto' | 'vacio' | 'hueco' | 'formula' | 'invalido';
  varId: string;
  para?: number;
  start?: number;
  end?: number;
  /** Para "resto": el trozo encontrado. Para "formula"/"invalido": la clave del mensaje. */
  detail?: string;
}

const WORDY = new Set<Category>(['nombre', 'empresa', 'direccion', 'localidad', 'texto']);
const MINOR = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'calle', 'avenida', 'plaza', 'paseo', 'sl', 'sa', 'slu']);

function fragmentsOf(v: Variable): string[] {
  const original = v.original.trim();
  if (!WORDY.has(v.category)) return [original];
  const words = original.split(/[\s,]+/).map((w) => w.replace(/[.,;:]+$/, '')).filter((w) => w.length >= 4 && !MINOR.has(fold(w)) && !/^\d+$/.test(w));
  return [original, ...words];
}

export function reviewDocument(paragraphs: Paragraph[], vars: Variable[], resolved: Resolved, removed: number[] = []): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const skip = new Set(removed);
  const covered = (para: number, start: number, end: number) =>
    vars.some((v) => v.occurrences.some((o) => o.para === para && o.start < end && start < o.end));

  for (const v of vars) {
    const error = resolved.errors.get(v.id);
    if (error) {
      issues.push({ kind: 'formula', varId: v.id, detail: error });
      continue;
    }
    const value = (resolved.values.get(v.id) ?? '').trim();
    if (!value) {
      const blank = !v.original.trim() || isBlankText(v.original);
      issues.push({ kind: blank ? 'hueco' : 'vacio', varId: v.id });
      continue;
    }
    const invalid = validateValue(v.category, value);
    if (invalid) issues.push({ kind: 'invalido', varId: v.id, detail: invalid });

    if (!v.original.trim() || isBlankText(v.original)) continue;
    const newText = fold(value);
    const seen = new Set<string>();
    for (const frag of fragmentsOf(v)) {
      // Si el trozo también está en el valor nuevo ("Martínez" → "Ana Martínez"), no es un resto.
      if (newText.includes(fold(frag))) continue;
      for (const p of paragraphs) {
        if (skip.has(p.index)) continue;
        for (const pos of findAll(p.text, frag)) {
          const end = pos + frag.length;
          const key = `${p.index}:${pos}`;
          if (seen.has(key) || covered(p.index, pos, end)) continue;
          seen.add(key);
          issues.push({ kind: 'resto', varId: v.id, para: p.index, start: pos, end, detail: p.text.slice(pos, end) });
        }
      }
    }
  }
  return issues;
}
