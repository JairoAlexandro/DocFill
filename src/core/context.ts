import { ROLE_WORDS } from './names';
import { capitalize, fold } from './text';

const ROLE_RES = ROLE_WORDS.map((w) => ({ w, re: new RegExp(`\\b${w}\\b`, 'g') }));

/**
 * Busca el papel de una persona en el texto cercano:
 * "…, en adelante el ARRENDADOR" o "el avalista D. …".
 */
export function detectRole(text: string, start: number, end: number): string | null {
  const after = text.slice(end, end + 250);
  const m = after.match(
    /en\s+adelante,?\s+(?:se\s+(?:le\s+)?denominar[áa]\s+)?(?:el|la|los|las)?\s*["“«'‘]?([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/i,
  );
  if (m) return capitalize(m[1].toLowerCase());

  const before = fold(text.slice(Math.max(0, start - 60), start));
  let best: { i: number; w: string } | null = null;
  for (const { w, re } of ROLE_RES) {
    re.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(before))) if (!best || mm.index > best.i) best = { i: mm.index, w };
  }
  return best ? capitalize(best.w) : null;
}

const AMOUNT_WORDS = [
  'renta', 'fianza', 'precio', 'importe', 'cantidad', 'deposito', 'garantia', 'honorarios', 'salario', 'sueldo',
  'cuota', 'comision', 'pago', 'total', 'indemnizacion', 'penalizacion', 'senal', 'arras', 'alquiler', 'mensualidad',
  'base', 'iva', 'impuesto', 'descuento', 'subtotal', 'entrada', 'hipoteca', 'prestamo', 'interes', 'gastos',
];

/** Qué tipo de importe es ("La fianza asciende a 1.700 €" → "Fianza"). */
export function amountKeyword(text: string, start: number): string | null {
  const before = fold(text.slice(Math.max(0, start - 80), start));
  let best: { i: number; w: string } | null = null;
  for (const w of AMOUNT_WORDS) {
    // Palabra completa: "iva" no debe encontrarse dentro de "privativa".
    const re = new RegExp(`(?<![a-z])${w}(?![a-z])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(before))) if (!best || m.index > best.i) best = { i: m.index, w };
  }
  if (!best) return null;
  const fixes: Record<string, string> = {
    deposito: 'depósito',
    garantia: 'garantía',
    comision: 'comisión',
    indemnizacion: 'indemnización',
    penalizacion: 'penalización',
    senal: 'señal',
    iva: 'IVA',
    prestamo: 'préstamo',
    interes: 'interés',
  };
  return capitalize(fixes[best.w] ?? best.w);
}
