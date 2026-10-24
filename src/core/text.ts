export const UPPER = 'A-ZÁÉÍÓÚÜÑÀÈÌÒÙÇ';
export const LETTERS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñÀÈÌÒÙàèìòùÇç';

const WORD = `[${UPPER}][${LETTERS}'’-]*[${LETTERS}]`;
const PARTICLE = '(?:de(?:l|[ \\u00A0]la|[ \\u00A0]las|[ \\u00A0]los)?|y|i|da|do|dos|das|van|von|di)';
/** Secuencia de palabras que empiezan por mayúscula, con partículas ("de la", "y"…). Solo espacios, nunca tabuladores. */
export const NAME_SEQ = `${WORD}(?:[ \\u00A0]+(?:${PARTICLE}[ \\u00A0]+)?${WORD}){0,5}`;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Quita tildes y pasa a minúsculas manteniendo la longitud del texto (para poder mapear posiciones). */
export function foldChar(c: string): string {
  const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const r = base.length === c.length ? base : c;
  const low = r.toLowerCase();
  return low.length === r.length ? low : r;
}

export function fold(s: string): string {
  let out = '';
  for (const c of s) out += foldChar(c);
  return out;
}

export function normalizeKey(s: string): string {
  return fold(s).replace(/\s+/g, ' ').trim();
}

/** Clave para identificadores: sin espacios, puntos ni guiones. */
export function compactKey(s: string): string {
  return fold(s).replace(/[\s.\-]/g, '');
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
export function isWordChar(c: string | undefined): boolean {
  return !!c && WORD_CHAR.test(c);
}

/** Todas las posiciones de `needle` en `haystack`, sin distinguir mayúsculas ni tildes y respetando límites de palabra. */
export function findAll(haystack: string, needle: string): number[] {
  const n = needle.trim();
  if (!n) return [];
  const h = fold(haystack);
  const f = fold(n);
  const checkStart = isWordChar(n[0]);
  const checkEnd = isWordChar(n[n.length - 1]);
  const res: number[] = [];
  let from = 0;
  for (;;) {
    const i = h.indexOf(f, from);
    if (i < 0) break;
    const okStart = !checkStart || !isWordChar(haystack[i - 1]);
    const okEnd = !checkEnd || !isWordChar(haystack[i + f.length]);
    if (okStart && okEnd) res.push(i);
    from = i + 1;
  }
  return res;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Adapta el valor nuevo al estilo del texto original (TODO MAYÚSCULAS, inicial mayúscula). */
export function applyCase(sample: string, value: string): string {
  const letters = sample.replace(/[^\p{L}]/gu, '');
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return value.toUpperCase();
  }
  const first = sample.match(/\p{L}/u)?.[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    const vFirst = value.match(/\p{L}/u)?.[0];
    if (vFirst && vFirst === vFirst.toLowerCase() && value.indexOf(vFirst) === 0) return capitalize(value);
  }
  return value;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
