import type { Variable } from './types';
import { addToDate, parseDate, type SimpleDate } from './dates';
import { parseAmount } from './numberWords';
import { normalizeKey } from './text';

/**
 * Campos calculados. Un valor que empieza por "=" se calcula a partir de otros datos:
 *   = {Importe (Renta)} * 2
 *   = {Importe (Renta)} * 21%
 *   = {Fecha} + 1 año        (también "meses", "días")
 * Los datos se nombran entre llaves con su nombre tal cual aparece en el panel.
 */

type Val = { kind: 'num'; n: number } | { kind: 'date'; d: SimpleDate } | { kind: 'dur'; n: number; unit: 'd' | 'm' | 'y' };

export class FormulaError extends Error {}

const UNITS: Record<string, 'd' | 'm' | 'y'> = {
  dia: 'd', dias: 'd', día: 'd', días: 'd',
  mes: 'm', meses: 'm',
  ano: 'y', anos: 'y', año: 'y', años: 'y',
  day: 'd', days: 'd', month: 'm', months: 'm', year: 'y', years: 'y',
};

export function isFormula(value: string): boolean {
  return value.trim().startsWith('=');
}

/** Formato español fijo: 1.234,50 (no depende del navegador). */
export function formatNumber(n: number): string {
  const neg = n < 0;
  const cents = Math.round(Math.abs(n) * 100);
  const int = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = cents % 100;
  return (neg ? '-' : '') + int + (dec ? ',' + String(dec).padStart(2, '0') : '');
}

function formatValue(v: Val): string {
  if (v.kind === 'num') return formatNumber(v.n);
  if (v.kind === 'date') return `${String(v.d.d).padStart(2, '0')}/${String(v.d.m).padStart(2, '0')}/${v.d.y}`;
  throw new FormulaError('formula.onlyDuration');
}

/** Calcula los valores finales de todos los datos (resolviendo fórmulas). Los errores se devuelven aparte. */
export function resolveValues(vars: Variable[]): { values: Map<string, string>; errors: Map<string, string> } {
  const values = new Map<string, string>();
  const errors = new Map<string, string>();
  const byName = new Map(vars.map((v) => [normalizeKey(v.label), v]));
  const visiting = new Set<string>();

  const raw = (v: Variable): string => {
    if (values.has(v.id)) return values.get(v.id)!;
    if (!isFormula(v.value)) {
      values.set(v.id, v.value);
      return v.value;
    }
    if (visiting.has(v.id)) throw new FormulaError('formula.cycle');
    visiting.add(v.id);
    try {
      const out = formatValue(evaluate(v.value.trim().slice(1)));
      values.set(v.id, out);
      return out;
    } finally {
      visiting.delete(v.id);
    }
  };

  const ref = (name: string): Val => {
    const v = byName.get(normalizeKey(name));
    if (!v) throw new FormulaError('formula.unknown');
    const s = raw(v).trim();
    if (!s) throw new FormulaError('formula.empty');
    const d = v.category === 'fecha' || /[/-]|\sde\s/.test(s) ? parseDate(s) : null;
    if (d) return { kind: 'date', d };
    const n = parseAmount(s);
    if (n == null) throw new FormulaError('formula.notNumber');
    return { kind: 'num', n };
  };

  const evaluate = (expr: string): Val => {
    const tokens = expr.match(/\{[^{}]+\}|\d[\d.,]*|[A-Za-zÁÉÍÓÚáéíóúñÑ]+|[-+*/%()]/g) ?? [];
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];

    const primary = (): Val => {
      const t = next();
      if (t === undefined) throw new FormulaError('formula.syntax');
      if (t === '(') {
        const v = sum();
        if (next() !== ')') throw new FormulaError('formula.syntax');
        return v;
      }
      if (t === '-') {
        const v = primary();
        if (v.kind === 'date') throw new FormulaError('formula.syntax');
        return { ...v, n: -v.n };
      }
      if (t.startsWith('{')) return ref(t.slice(1, -1).trim());
      if (/^\d/.test(t)) {
        const n = parseAmount(t);
        if (n == null) throw new FormulaError('formula.syntax');
        if (peek() === '%') {
          next();
          return { kind: 'num', n: n / 100 };
        }
        const unit = peek() && UNITS[peek()!.toLowerCase()];
        if (unit) {
          next();
          return { kind: 'dur', n, unit };
        }
        return { kind: 'num', n };
      }
      throw new FormulaError('formula.syntax');
    };

    const product = (): Val => {
      let left = primary();
      while (peek() === '*' || peek() === '/') {
        const op = next();
        const right = primary();
        if (left.kind !== 'num' || right.kind !== 'num') throw new FormulaError('formula.syntax');
        if (op === '/' && right.n === 0) throw new FormulaError('formula.syntax');
        left = { kind: 'num', n: op === '*' ? left.n * right.n : left.n / right.n };
      }
      return left;
    };

    const sum = (): Val => {
      let left = product();
      while (peek() === '+' || peek() === '-') {
        const sign = next() === '+' ? 1 : -1;
        const right = product();
        if (left.kind === 'num' && right.kind === 'num') left = { kind: 'num', n: left.n + sign * right.n };
        else if (left.kind === 'date' && right.kind === 'dur') left = { kind: 'date', d: addToDate(left.d, sign * right.n, right.unit) };
        else throw new FormulaError('formula.syntax');
      }
      return left;
    };

    const v = sum();
    if (i < tokens.length) throw new FormulaError('formula.syntax');
    return v;
  };

  for (const v of vars) {
    try {
      raw(v);
    } catch (e) {
      values.set(v.id, '');
      errors.set(v.id, e instanceof FormulaError ? e.message : 'formula.syntax');
    }
  }
  return { values, errors };
}
