import type { Category, OptionalClause, Occurrence, Paragraph, Selection, Variable } from './types';
import type { Replacement } from './formats';
import { byPosition } from './detect';
import { formatDateLike, formatDateStyle, parseDate } from './dates';
import { resolveValues } from './formula';
import { apocopate, numberToWords, parseAmount } from './numberWords';
import { genderText, namePart } from './people';
import { applyCase, findAll, normalizeKey, overlaps, uid } from './text';

export type Resolved = ReturnType<typeof resolveValues>;

function cleanValue(v: Variable, value: string): string {
  let out = value.trim().replace(/\s*\n\s*/g, ' ');
  if (v.category === 'importe') out = out.replace(/\s*(?:€|euros?|EUR)\s*$/i, '');
  return out;
}

export function genderChanged(v: Variable): boolean {
  return !!v.gender && !!v.originalGender && v.gender !== v.originalGender;
}

/** Texto final que sustituirá a una aparición concreta. `value` es el valor ya calculado (fórmulas resueltas). */
export function displayValue(v: Variable, occ: Occurrence, value: string): string {
  if (occ.transform === 'genero') return genderChanged(v) ? genderText(occ, v.gender!) : occ.text;
  const val = cleanValue(v, value);
  if (!val) return occ.text;
  // Fecha con un formato elegido por el usuario: se escribe igual en todos los sitios.
  if (v.category === 'fecha' && v.dateFormat && v.dateFormat !== 'keep') {
    const d = parseDate(val);
    if (d) return applyCase(occ.text, formatDateStyle(d, v.dateFormat));
  }
  switch (occ.transform) {
    case 'letras':
    case 'letras-un': {
      const n = parseAmount(val);
      // Delante de "euros" siempre va la forma corta: "veintiún euros", "ciento un euros".
      return n == null ? occ.text : applyCase(occ.text, apocopate(numberToWords(Math.floor(n))));
    }
    case 'nombre-pila':
    case 'apellidos':
    case 'apellido1':
      return applyCase(occ.text, namePart(val, occ.transform) ?? val);
    case 'fecha-num':
    case 'fecha-larga':
    case 'fecha-letras': {
      const d = parseDate(val);
      return applyCase(occ.text, d ? formatDateLike(d, occ.transform, occ.text) : val);
    }
    default:
      return applyCase(occ.text, val);
  }
}

/** ¿Se cambiará esta aparición en el documento final? */
export function willReplace(v: Variable, occ: Occurrence, value: string): boolean {
  return occ.transform === 'genero' ? genderChanged(v) : !!cleanValue(v, value);
}

export function buildReplacements(vars: Variable[], resolved: Resolved = resolveValues(vars)): Replacement[] {
  const all: Replacement[] = [];
  for (const v of vars) {
    const value = resolved.values.get(v.id) ?? '';
    for (const o of v.occurrences) {
      if (willReplace(v, o, value)) all.push({ para: o.para, start: o.start, end: o.end, text: displayValue(v, o, value) });
    }
  }
  all.sort(byPosition);
  const out: Replacement[] = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (last && last.para === r.para && overlaps(last, r)) continue;
    out.push(r);
  }
  return out;
}

/** Párrafos que hay que quitar: cláusulas opcionales desactivadas o cuyo dato del que dependen está vacío. */
export function removedParas(optional: OptionalClause[] = [], vars: Variable[], resolved: Resolved = resolveValues(vars)): number[] {
  return optional
    .filter((c) => (c.dependsOn ? !(resolved.values.get(c.dependsOn) ?? '').trim() : !c.include))
    .map((c) => c.para);
}

export function updateVariable(vars: Variable[], id: string, patch: Partial<Variable>): Variable[] {
  return vars.map((v) => (v.id === id ? { ...v, ...patch } : v));
}

export function removeVariable(vars: Variable[], id: string): Variable[] {
  return vars.filter((v) => v.id !== id);
}

export function mergeVariables(vars: Variable[], targetId: string, sourceId: string): Variable[] {
  const source = vars.find((v) => v.id === sourceId);
  if (!source || targetId === sourceId) return vars;
  return vars
    .filter((v) => v.id !== sourceId)
    .map((v) =>
      v.id === targetId
        ? { ...v, value: v.value || source.value, occurrences: [...v.occurrences, ...source.occurrences].sort(byPosition) }
        : v,
    );
}

/**
 * Añade un texto seleccionado a mano: busca todas sus apariciones.
 * La selección exacta tiene prioridad sobre lo que hubiera detectado antes; el resto solo se añade si está libre.
 */
export function addFromSelection(
  vars: Variable[],
  paragraphs: Paragraph[],
  sel: Selection,
  target: { existingId: string } | { label: string; category: Category },
): { vars: Variable[]; id: string } {
  const selected: Occurrence = { para: sel.para, start: sel.start, end: sel.end, text: sel.text };
  let next = vars
    .map((v) => ({ ...v, occurrences: v.occurrences.filter((o) => !(o.para === sel.para && overlaps(o, selected))) }))
    .filter((v) => v.occurrences.length > 0 || ('existingId' in target && v.id === target.existingId));

  const busy = (o: Occurrence) => next.some((v) => v.occurrences.some((x) => x.para === o.para && overlaps(x, o)));
  const found: Occurrence[] = [selected];
  for (const p of paragraphs) {
    for (const pos of findAll(p.text, sel.text)) {
      const o: Occurrence = { para: p.index, start: pos, end: pos + sel.text.length, text: p.text.slice(pos, pos + sel.text.length) };
      if (o.para === selected.para && overlaps(o, selected)) continue;
      if (!busy(o)) found.push(o);
    }
  }

  if ('existingId' in target) {
    next = next.map((v) =>
      v.id === target.existingId ? { ...v, occurrences: [...v.occurrences, ...found].sort(byPosition) } : v,
    );
    return { vars: next, id: target.existingId };
  }
  const v: Variable = {
    id: uid(),
    label: target.label,
    category: target.category,
    original: sel.text,
    source: 'manual',
    confidence: 1,
    occurrences: found.sort(byPosition),
    value: '',
  };
  next = [...next, v].sort((a, b) => byPosition(a.occurrences[0], b.occurrences[0]));
  return { vars: next, id: v.id };
}

/** Rellena los datos cuyo nombre coincide con los campos de una ficha. */
export function applyFields(vars: Variable[], fields: { key: string; value: string }[]): { vars: Variable[]; count: number } {
  let count = 0;
  const baseOf = (label: string) => normalizeKey(label.replace(/\s*\(.*\)\s*\d*$/, ''));
  const next = vars.map((v) => {
    const exact = fields.find((f) => normalizeKey(f.key) === normalizeKey(v.label));
    if (exact) {
      count++;
      return { ...v, value: exact.value };
    }
    return v;
  });
  // Coincidencia aproximada ("Nombre" → "Nombre (Arrendatario)") solo cuando no hay ambigüedad.
  for (const f of fields) {
    if (next.some((v) => normalizeKey(v.label) === normalizeKey(f.key))) continue;
    const matches = next.filter((v) => !v.value && baseOf(v.label) === normalizeKey(f.key));
    if (matches.length === 1) {
      matches[0].value = f.value;
      count++;
    }
  }
  return { vars: next, count };
}
