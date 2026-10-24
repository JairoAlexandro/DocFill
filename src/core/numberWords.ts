import type { Transform } from './types';

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIECES = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const VEINTES = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function below100(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DIECES[n - 10];
  if (n < 30) return VEINTES[n - 20];
  const u = n % 10;
  return DECENAS[Math.floor(n / 10)] + (u ? ' y ' + UNIDADES[u] : '');
}

function below1000(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  return [CENTENAS[c], r ? below100(r) : ''].filter(Boolean).join(' ');
}

/** "uno" → "un", "veintiuno" → "veintiún" (delante de "mil", "millones", "euros"). */
export function apocopate(words: string): string {
  return words.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
}

/** Número entero a letras en español (hasta 999.999.999). */
export function numberToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'cero';
  if (n >= 1_000_000_000) return String(n);
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const parts: string[] = [];
  if (millones) parts.push(millones === 1 ? 'un millón' : apocopate(below1000(millones)) + ' millones');
  if (miles) parts.push(miles === 1 ? 'mil' : apocopate(below1000(miles)) + ' mil');
  if (resto) parts.push(below1000(resto));
  return parts.join(' ');
}

/** Interpreta importes en formato español: "1.200,50", "1.700", "850". */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  let norm: string;
  if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(?!\d)/.test(t) && !/\.\d{1,2}$/.test(t)) norm = t.replace(/\./g, '');
  else norm = t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export function amountWordVariants(n: number): { words: string; transform: Transform }[] {
  const words = numberToWords(n);
  const out: { words: string; transform: Transform }[] = [{ words, transform: 'letras' }];
  const short = apocopate(words);
  if (short !== words) out.push({ words: short, transform: 'letras-un' });
  return out;
}
