import type { Gender, Occurrence, Paragraph, RepeatBlock, Variable } from './types';
import { genderText } from './people';
import type { Replacement } from './formats';
import { byPosition } from './detect';
import { displayValue, willReplace, type Resolved } from './variables';
import { overlaps } from './text';

/**
 * Listas que se repiten: un bloque de párrafos (p. ej. la presentación de un inquilino) se copia
 * una vez por cada persona extra. Las copias se insertan justo detrás del bloque, así que hay que
 * recalcular la posición de cada párrafo en el documento final.
 */

export interface RepeatLayout {
  /** Posición final de un párrafo del documento original. */
  index: (para: number) => number;
  /** Posición final del párrafo `para` dentro de la copia número `copy` (1 = segunda persona). */
  copyIndex: (block: RepeatBlock, copy: number, para: number) => number;
  /** Bloques que de verdad se copian (tienen personas extra). */
  active: RepeatBlock[];
}

export function activeBlocks(blocks: RepeatBlock[] = []): RepeatBlock[] {
  return blocks.filter((b) => b.paras.length > 0 && b.entries.length > 0).sort((a, b) => a.paras[0] - b.paras[0]);
}

export function layoutFor(blocks: RepeatBlock[] = []): RepeatLayout {
  const active = activeBlocks(blocks);
  const index = (para: number) => {
    let shift = 0;
    for (const b of active) if (b.paras[b.paras.length - 1] < para) shift += b.paras.length * b.entries.length;
    return para + shift;
  };
  const copyIndex = (b: RepeatBlock, copy: number, para: number) =>
    index(b.paras[b.paras.length - 1]) + (copy - 1) * b.paras.length + (para - b.paras[0]) + 1;
  return { index, copyIndex, active };
}

/** Datos que aparecen dentro del bloque: son los que cambian en cada persona. */
export function blockVars(block: RepeatBlock, vars: Variable[]): Variable[] {
  const inside = new Set(block.paras);
  return vars.filter((v) => v.occurrences.some((o) => inside.has(o.para) && o.transform !== 'genero'));
}

/** "Ana", "Ana y Luis", "Ana, Luis y Eva". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Añade o quita un párrafo de una lista. Un párrafo junto a un bloque lo amplía; uno del borde lo quita. */
export function toggleRepeatPara(blocks: RepeatBlock[], paragraphs: Paragraph[], para: number, newId: () => string): RepeatBlock[] {
  const owner = blocks.find((b) => b.paras.includes(para));
  if (owner) {
    const first = owner.paras[0];
    const last = owner.paras[owner.paras.length - 1];
    if (para !== first && para !== last) return blocks;
    const paras = owner.paras.filter((p) => p !== para);
    return paras.length ? blocks.map((b) => (b === owner ? { ...b, paras } : b)) : blocks.filter((b) => b !== owner);
  }
  const part = paragraphs[para]?.part;
  const near = blocks.find((b) => {
    const first = b.paras[0];
    const last = b.paras[b.paras.length - 1];
    // Se permiten párrafos vacíos entre medias: también se copian.
    const gapOk = (from: number, to: number) => paragraphs.slice(from, to).every((p) => !p.text.trim());
    return paragraphs[first]?.part === part && ((para > last && gapOk(last + 1, para)) || (para < first && gapOk(para + 1, first)));
  });
  if (near) {
    const lo = Math.min(para, near.paras[0]);
    const hi = Math.max(para, near.paras[near.paras.length - 1]);
    const paras = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return blocks.map((b) => (b === near ? { ...b, paras } : b));
  }
  return [...blocks, { id: newId(), paras: [para], entries: [], joinOutside: true }].sort((a, b) => a.paras[0] - b.paras[0]);
}

/** Clave de una entrada de la lista donde se guarda el género de esa persona. */
export const genderKey = (varId: string) => `__genero:${varId}`;

/** Texto de una aparición dentro de la copia de una persona extra (o null si no cambia). */
export function copyText(v: Variable, o: Occurrence, entry: Record<string, string>): string | null {
  if (o.transform === 'genero') {
    const g = (entry[genderKey(v.id)] as Gender | undefined) ?? v.gender;
    if (!g || !v.originalGender || g === v.originalGender) return null;
    return genderText(o, g);
  }
  const value = entry[v.id] ?? '';
  return willReplace(v, o, value) ? displayValue(v, o, value) : null;
}

/** Fuera del bloque, todas las personas juntas: "Ana Torres Vidal y Luis Mora Gil". */
export function joinedText(v: Variable, o: Occurrence, block: RepeatBlock, main: string): string | null {
  const values = [main, ...block.entries.map((e) => e[v.id] ?? '')].filter((x) => x.trim());
  return values.length ? joinList(values.map((x) => displayValue(v, o, x))) : null;
}

/** Bloque de lista al que pertenece cada dato (el primero en el que aparece). */
export function listOfVars(blocks: RepeatBlock[], vars: Variable[]): Map<string, RepeatBlock> {
  const map = new Map<string, RepeatBlock>();
  for (const b of activeBlocks(blocks)) for (const v of blockVars(b, vars)) if (!map.has(v.id)) map.set(v.id, b);
  return map;
}

/**
 * Sustituciones para el documento con las copias ya insertadas.
 * - Dentro del bloque: la persona 1 usa el valor normal y cada copia el de su entrada (y su género).
 * - Fuera del bloque (si joinOutside): todos los valores juntos, "Ana Torres y Luis Mora".
 */
export function buildRepeatReplacements(vars: Variable[], resolved: Resolved, blocks: RepeatBlock[] = []): Replacement[] {
  const layout = layoutFor(blocks);
  const blockOf = (para: number) => layout.active.find((b) => b.paras.includes(para));
  const listOf = listOfVars(blocks, vars);

  const all: Replacement[] = [];
  const push = (para: number, o: Occurrence, text: string) => all.push({ para, start: o.start, end: o.end, text });

  for (const v of vars) {
    const main = resolved.values.get(v.id) ?? '';
    const list = listOf.get(v.id);
    for (const o of v.occurrences) {
      const block = blockOf(o.para);
      if (block) {
        if (willReplace(v, o, main)) push(layout.index(o.para), o, displayValue(v, o, main));
        block.entries.forEach((entry, k) => {
          const text = copyText(v, o, entry);
          if (text !== null) push(layout.copyIndex(block, k + 1, o.para), o, text);
        });
        continue;
      }
      if (list && list.joinOutside && o.transform !== 'genero') {
        const text = joinedText(v, o, list, main);
        if (text !== null) push(layout.index(o.para), o, text);
        continue;
      }
      if (willReplace(v, o, main)) push(layout.index(o.para), o, displayValue(v, o, main));
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
