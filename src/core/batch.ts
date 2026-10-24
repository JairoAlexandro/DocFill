import type { RepeatBlock, Variable } from './types';
import { parseCSV } from './csv';
import { blockVars } from './repeat';
import { fold, normalizeKey } from './text';

/**
 * Relleno en lote: un registro por documento, desde CSV (Excel) o JSON.
 * Cada dato se puede identificar por su nombre ("Nombre (Arrendataria)") o por su clave ("nombre_arrendataria").
 */

export interface BatchRecord {
  file?: string;
  values: Map<string, string>;
}

/** "Nombre (Arrendataria)" → "nombre_arrendataria". */
export function slug(label: string): string {
  return fold(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'dato';
}

export function fieldKeys(vars: Variable[]): Map<string, string> {
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  for (const v of vars) {
    let k = slug(v.label);
    const n = (used.get(k) ?? 0) + 1;
    used.set(k, n);
    if (n > 1) k = `${k}_${n}`;
    out.set(v.id, k);
  }
  return out;
}

const FILE_KEYS = new Set(['archivo', 'file', '_archivo']);

export function jsonTemplate(vars: Variable[], fileName: string, repeats: RepeatBlock[] = []): object {
  const keys = fieldKeys(vars);
  const campos: Record<string, string> = {};
  const ejemplo: Record<string, string> = { archivo: `${fileName.replace(/\.[^.]+$/, '')}-1` };
  const vacio: Record<string, string> = { archivo: `${fileName.replace(/\.[^.]+$/, '')}-2` };
  for (const v of vars) {
    const k = keys.get(v.id)!;
    campos[k] = v.label;
    ejemplo[k] = v.value;
    vacio[k] = '';
  }
  // Listas que se repiten: ejemplo de la segunda persona ("nombre_arrendataria_2").
  for (const b of repeats) {
    for (const v of blockVars(b, vars)) {
      const k = `${keys.get(v.id)!}_2`;
      campos[k] = `${v.label} (2)`;
      ejemplo[k] = b.entries[0]?.[v.id] ?? '';
      vacio[k] = '';
    }
  }
  return { plantilla: fileName, campos, documentos: [ejemplo, vacio] };
}

function toRecord(obj: Record<string, unknown>): BatchRecord {
  const values = new Map<string, string>();
  let file: string | undefined;
  for (const [k, raw] of Object.entries(obj)) {
    const value = raw == null ? '' : String(raw);
    if (FILE_KEYS.has(normalizeKey(k))) file = value;
    else values.set(normalizeKey(k), value);
  }
  return { file, values };
}

export function parseBatch(text: string, kind: 'csv' | 'json'): BatchRecord[] {
  if (kind === 'json') {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('batch.badJson');
    }
    const list = Array.isArray(data) ? data : (data as { documentos?: unknown })?.documentos;
    if (!Array.isArray(list) || list.length === 0) throw new Error('batch.badJson');
    return list.filter((x) => x && typeof x === 'object').map((x) => toRecord(x as Record<string, unknown>));
  }
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('batch.needRows');
  const header = rows[0];
  return rows.slice(1).map((row) => toRecord(Object.fromEntries(header.map((h, i) => [h, row[i] ?? '']))));
}

/** Rellena los datos con un registro. Devuelve también los datos que no aparecían en él. */
export function applyRecord(vars: Variable[], rec: BatchRecord): { vars: Variable[]; missing: string[] } {
  const keys = fieldKeys(vars);
  const missing: string[] = [];
  const next = vars.map((v) => {
    const value = rec.values.get(normalizeKey(v.label)) ?? rec.values.get(keys.get(v.id)!);
    if (value === undefined) {
      missing.push(v.label);
      return v;
    }
    return { ...v, value };
  });
  return { vars: next, missing };
}

/**
 * Personas extra de las listas que se repiten: la clave lleva el número de persona,
 * "nombre_arrendataria_2", "nombre_arrendataria_3"… (también vale "Nombre (Arrendataria) 2").
 */
export function applyRecordToRepeats(blocks: RepeatBlock[] = [], vars: Variable[], rec: BatchRecord): RepeatBlock[] {
  const keys = fieldKeys(vars);
  return blocks.map((b) => {
    const inBlock = blockVars(b, vars);
    const entries: Record<string, string>[] = [];
    for (let n = 2; n < 100; n++) {
      const entry: Record<string, string> = {};
      for (const v of inBlock) {
        const value = rec.values.get(`${keys.get(v.id)}_${n}`) ?? rec.values.get(normalizeKey(`${v.label} ${n}`));
        if (value !== undefined) entry[v.id] = value;
      }
      if (Object.keys(entry).length === 0) break;
      entries.push(entry);
    }
    return { ...b, entries };
  });
}

/**
 * Nombre de archivo a partir de un patrón: "Contrato - {Nombre (Arrendataria)} - {fecha}".
 * Las llaves admiten el nombre del dato o su clave. Si un dato está vacío se usa su valor original.
 */
export function fileNameFromPattern(pattern: string, vars: Variable[], fallback: string): string {
  const keys = fieldKeys(vars);
  const find = (k: string) => vars.find((v) => normalizeKey(v.label) === normalizeKey(k) || keys.get(v.id) === normalizeKey(k));
  const out = pattern.replace(/\{([^{}]+)\}/g, (_, k: string) => {
    const v = find(k.trim());
    return v ? (v.value.trim() || v.original.trim()) : '';
  });
  const clean = out.replace(/[\\/:*?"<>|\r\n]+/g, '-').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}
