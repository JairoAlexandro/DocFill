import { numberToWords } from './numberWords';
import { fold } from './text';
import type { Transform } from './types';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_RE = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

export interface SimpleDate {
  d: number;
  m: number;
  y: number;
}

function valid({ d, m, y }: SimpleDate): boolean {
  if (m < 1 || m > 12 || d < 1 || y < 1000) return false;
  return d <= new Date(y, m, 0).getDate();
}

/** Entiende "15/03/2024", "15-3-24", "15 de marzo de 2024", "2024-03-15" y la fecha en letras. */
export function parseDate(s: string): SimpleDate | null {
  const t = fold(s.trim());
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const r = { d: Number(m[1]), m: Number(m[2]), y };
    return valid(r) ? r : null;
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const r = { d: Number(m[3]), m: Number(m[2]), y: Number(m[1]) };
    return valid(r) ? r : null;
  }
  m = t.match(new RegExp(`^(\\d{1,2})\\s+de\\s+(${MONTH_RE})\\s+(?:de|del)\\s+(\\d{4})$`));
  if (m) {
    const r = { d: Number(m[1]), m: monthIndex(m[2]) + 1, y: Number(m[3]) };
    return valid(r) ? r : null;
  }
  m = t.match(new RegExp(`^(.+?)\\s+de\\s+(${MONTH_RE})\\s+(?:de|del)\\s+(.+)$`));
  if (m) {
    const d = wordsToNumber(m[1]);
    const y = wordsToNumber(m[3]);
    if (d && y) {
      const r = { d, m: monthIndex(m[2]) + 1, y };
      return valid(r) ? r : null;
    }
  }
  return null;
}

function monthIndex(name: string): number {
  return name === 'setiembre' ? 8 : MONTHS.indexOf(name);
}

/** Inversa de numberToWords para días y años (hasta 9999). */
function wordsToNumber(words: string): number | null {
  const w = fold(words).trim().replace(/\s+/g, ' ');
  if (w === 'primero') return 1;
  for (let n = 1; n <= 9999; n++) if (fold(numberToWords(n)) === w) return n;
  return null;
}

/** Formato de una aparición de fecha, deducido de su texto. */
export function dateTransform(sample: string): Transform {
  const t = fold(sample.trim());
  if (/^\d/.test(t) && /[/.-]/.test(t) && !/\sde\s/.test(t)) return 'fecha-num';
  if (/^\d/.test(t)) return 'fecha-larga';
  return 'fecha-letras';
}

/** Escribe la fecha imitando el formato de la muestra (separador, ceros, "de"/"del", mayúsculas). */
export function formatDateLike(date: SimpleDate, transform: Transform, sample: string): string {
  const { d, m, y } = date;
  if (transform === 'fecha-num') {
    const sep = sample.match(/[/.-]/)?.[0] ?? '/';
    const parts = sample.split(/[/.-]/);
    const pad = (n: number, like: string | undefined) => (like && like.length === 2 ? String(n).padStart(2, '0') : String(n));
    const year = parts[2]?.length === 2 ? String(y).slice(-2) : String(y);
    return [pad(d, parts[0]), pad(m, parts[1]), year].join(sep);
  }
  const del = /\sdel\s+\S+$/i.test(sample) ? 'del' : 'de';
  if (transform === 'fecha-larga') return `${d} de ${MONTHS[m - 1]} ${del} ${y}`;
  return `${numberToWords(d)} de ${MONTHS[m - 1]} ${del} ${numberToWords(y)}`;
}

/**
 * Formato de fecha que elige el usuario:
 * - keep: cada sitio del documento conserva su propio formato;
 * - num: 02/11/2002 · num-short: 2/11/2002 · larga: 2 de noviembre de 2002 · letras: dos de noviembre de dos mil dos.
 */
export type DateStyle = 'keep' | 'num' | 'num-short' | 'larga' | 'letras';
export const DATE_STYLES: DateStyle[] = ['keep', 'num', 'num-short', 'larga', 'letras'];

export function formatDateStyle(date: SimpleDate, style: Exclude<DateStyle, 'keep'>): string {
  if (style === 'num') return formatDateLike(date, 'fecha-num', '01/01/2000');
  if (style === 'num-short') return formatDateLike(date, 'fecha-num', '1/1/2000');
  if (style === 'larga') return formatDateLike(date, 'fecha-larga', '');
  return formatDateLike(date, 'fecha-letras', '');
}

/** Todas las formas en que podría aparecer una fecha en el documento. */
export function dateVariants(date: SimpleDate): string[] {
  const { d, m, y } = date;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const out = new Set<string>();
  for (const sep of ['/', '-', '.']) {
    out.add(`${dd}${sep}${mm}${sep}${y}`);
    out.add(`${d}${sep}${m}${sep}${y}`);
  }
  for (const del of ['de', 'del']) {
    out.add(`${d} de ${MONTHS[m - 1]} ${del} ${y}`);
    out.add(`${numberToWords(d)} de ${MONTHS[m - 1]} ${del} ${numberToWords(y)}`);
    if (d === 1) out.add(`primero de ${MONTHS[m - 1]} ${del} ${numberToWords(y)}`);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function addToDate(date: SimpleDate, amount: number, unit: 'd' | 'm' | 'y'): SimpleDate {
  const js = new Date(date.y, date.m - 1, date.d);
  if (unit === 'd') js.setDate(js.getDate() + amount);
  if (unit === 'm' || unit === 'y') {
    const months = unit === 'm' ? amount : amount * 12;
    const day = js.getDate();
    js.setDate(1);
    js.setMonth(js.getMonth() + months);
    js.setDate(Math.min(day, new Date(js.getFullYear(), js.getMonth() + 1, 0).getDate()));
  }
  return { d: js.getDate(), m: js.getMonth() + 1, y: js.getFullYear() };
}
