import type { Category } from './types';
import { parseAmount } from './numberWords';

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function clean(s: string): string {
  return s.toUpperCase().replace(/[\s.\-]/g, '');
}

export function isValidDni(s: string): boolean {
  const v = clean(s);
  let m = v.match(/^(\d{8})([A-Z])$/);
  if (m) return DNI_LETTERS[Number(m[1]) % 23] === m[2];
  m = v.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (m) return DNI_LETTERS[Number('XYZ'.indexOf(m[1]) + m[2]) % 23] === m[3];
  return false;
}

export function isValidCif(s: string): boolean {
  const v = clean(s);
  const m = v.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!m) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(m[2][i]);
    if (i % 2 === 0) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else sum += d;
  }
  const control = (10 - (sum % 10)) % 10;
  const letter = 'JABCDEFGHI'[control];
  const c = m[3];
  if (/[PQRSNW]/.test(m[1])) return c === letter;
  if (/[ABEH]/.test(m[1])) return c === String(control);
  return c === String(control) || c === letter;
}

export function isValidIban(s: string): boolean {
  const v = clean(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  if (v.startsWith('ES') && v.length !== 24) return false;
  const r = v.slice(4) + v.slice(0, 4);
  let rem = 0;
  for (const ch of r) {
    const val = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of val) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export function isValidPhone(s: string): boolean {
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('34')) d = d.slice(2);
  return d.length === 9 && /^[6789]/.test(d);
}

export function isValidEmail(s: string): boolean {
  return /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(s.trim());
}

/** Devuelve la clave de traducción de un aviso si el valor no parece correcto para su tipo, o null si está bien. */
export function validateValue(category: Category, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  switch (category) {
    case 'dni':
      return isValidDni(v) ? null : 'val.dni';
    case 'cif':
      return isValidCif(v) ? null : 'val.cif';
    case 'iban':
      return isValidIban(v) ? null : 'val.iban';
    case 'telefono':
      return isValidPhone(v) ? null : 'val.phone';
    case 'email':
      return isValidEmail(v) ? null : 'val.email';
    case 'importe':
      return parseAmount(v) == null ? 'val.amount' : null;
    case 'codigo_postal':
      return /^\d{5}$/.test(v) ? null : 'val.cp';
    default:
      return null;
  }
}
