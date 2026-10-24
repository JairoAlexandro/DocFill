import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readDocument } from './formats';
import { detectVariables } from './detect';
import { buildSteps } from './steps';
import type { Variable } from './types';

/**
 * Comprueba lo que detecta DocFill en el Word de pruebas (pruebas/contrato-pruebas.docx).
 * Para ver la lista completa: npx vitest run src/core/prueba.test.ts
 */
describe('Word de pruebas', () => {
  let vars: Variable[] = [];
  const find = (original: string) => vars.find((v) => v.original === original);
  const count = (v: Variable | undefined, kind: 'normal' | 'letras' | 'cortas') =>
    (v?.occurrences ?? []).filter((o) =>
      kind === 'normal' ? !o.transform : kind === 'letras' ? o.transform?.startsWith('letras') : ['nombre-pila', 'apellidos', 'apellido1'].includes(o.transform ?? ''),
    ).length;

  beforeAll(async () => {
    const bytes = new Uint8Array(await readFile('pruebas/contrato-pruebas.docx'));
    vars = detectVariables(await readDocument('contrato-pruebas.docx', bytes));
    console.log(
      '\n' +
        vars
          .map((v) => `${v.confidence < 0.5 ? '?' : ' '} ${v.label.padEnd(30)} | ${v.original.slice(0, 36).padEnd(36)} | x${count(v, 'normal')} letras:${count(v, 'letras')} cortas:${count(v, 'cortas')}`)
          .join('\n'),
    );
  });

  it('la empresa no se come la numeración del apartado («I.- Que …»)', () => {
    expect(vars.some((v) => /^I\.-|^Que /.test(v.original))).toBe(false);
    expect(count(find('Inmobiliaria Levante, S.L.'), 'normal')).toBe(6);
  });

  it('«María José» suelto es la forma corta de María José Fernández Ruiz', () => {
    expect(find('María José')).toBeUndefined();
    const v = find('María José Fernández Ruiz');
    expect(v?.occurrences.some((o) => o.transform === 'nombre-pila' && o.text === 'María José')).toBe(true);
    expect(count(v, 'cortas')).toBe(3);
  });

  it('cada importe en letras se enlaza con su cifra completa', () => {
    expect(count(find('1.000'), 'letras')).toBe(0);
    expect(count(find('210'), 'letras')).toBe(0);
    expect(count(find('1.210'), 'letras')).toBe(1);
    expect(count(find('1.900'), 'letras')).toBe(1);
    expect(count(find('950'), 'letras')).toBe(1);
  });

  it('el asistente agrupa los datos en pasos con sentido, en el orden del documento', () => {
    const steps = buildSteps(vars);
    expect(steps.map((s) => s.title)).toEqual([
      'steps.intro',
      'steps.dates',
      'Arrendador',
      'Arrendataria',
      'Testigo',
      'steps.property',
      'steps.blanks',
      'steps.amounts',
      'steps.other',
      'steps.options',
      'steps.review',
    ]);
    // Todos los datos están en algún paso, y solo en uno.
    const all = steps.flatMap((s) => s.varIds);
    expect(new Set(all).size).toBe(vars.length);
    expect(all).toHaveLength(vars.length);
  });

  it('las cantidades de base e IVA tienen su nombre', () => {
    expect(find('1.000')?.label).toBe('Importe (Base)');
    expect(find('210')?.label).toBe('Importe (IVA)');
    expect(find('1.210')?.label).toBe('Importe (Total)');
  });
});
