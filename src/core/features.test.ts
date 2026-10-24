import { describe, expect, it } from 'vitest';
import { detectVariables } from './detect';
import { buildReplacements, removedParas } from './variables';
import { applyToString, groupByPara } from './formats';
import { resolveValues } from './formula';
import { reviewDocument } from './review';
import { parseDate, formatDateLike } from './dates';
import { splitName } from './people';
import { applyRecord, fileNameFromPattern, jsonTemplate, parseBatch, slug } from './batch';
import type { Paragraph, Variable } from './types';

const paras = (...texts: string[]): Paragraph[] =>
  texts.map((text, index) => ({ index, part: 'word/document.xml', kind: 'cuerpo', text, inTable: false }));

/** Aplica los datos y devuelve el texto final de cada párrafo. */
function render(doc: Paragraph[], vars: Variable[]): string[] {
  const byPara = groupByPara(buildReplacements(vars));
  return doc.map((p) => applyToString(p.text, byPara.get(p.index) ?? []));
}

const set = (vars: Variable[], original: string, patch: Partial<Variable>) => {
  const v = vars.find((x) => x.original === original);
  expect(v, original).toBeTruthy();
  Object.assign(v!, patch);
  return v!;
};

describe('formas cortas del nombre', () => {
  it('divide nombres compuestos y con partículas', () => {
    expect(splitName('María José García de la Fuente')).toEqual({ first: 'María José', surnames: 'García de la Fuente', firstSurname: 'García' });
    expect(splitName('Juan de la Fuente López')?.firstSurname).toBe('de la Fuente');
  });

  it('cambia "Sr. Martínez" y "Carlos" junto con el nombre completo', () => {
    const doc = paras(
      'De una parte, D. Carlos Martínez Ruiz, mayor de edad.',
      'El Sr. Martínez entrega las llaves. Carlos firma. Martínez Ruiz recibe copia.',
    );
    const vars = detectVariables(doc);
    set(vars, 'Carlos Martínez Ruiz', { value: 'Pedro Sanz Gil' });
    expect(render(doc, vars)[1]).toBe('El Sr. Sanz entrega las llaves. Pedro firma. Sanz Gil recibe copia.');
  });
});

describe('fechas', () => {
  it('entiende y escribe varios formatos', () => {
    const d = parseDate('quince de marzo de dos mil veinticuatro')!;
    expect(d).toEqual({ d: 15, m: 3, y: 2024 });
    expect(formatDateLike({ d: 5, m: 7, y: 2025 }, 'fecha-num', '15/03/2024')).toBe('05/07/2025');
    expect(formatDateLike({ d: 5, m: 7, y: 2025 }, 'fecha-letras', 'x')).toBe('cinco de julio de dos mil veinticinco');
  });

  it('la misma fecha en otros formatos se cambia a la vez', () => {
    const doc = paras('En Madrid, a 15 de marzo de 2024.', 'Fecha: 15/03/2024', 'Firmado el quince de marzo de dos mil veinticuatro.');
    const vars = detectVariables(doc);
    set(vars, '15 de marzo de 2024', { value: '1/7/2025' });
    expect(render(doc, vars)).toEqual(['En Madrid, a 1 de julio de 2025.', 'Fecha: 01/07/2025', 'Firmado el uno de julio de dos mil veinticinco.']);
  });

  it('con un formato elegido, la fecha se escribe igual en todos los sitios', () => {
    const doc = paras('En Madrid, a 15 de marzo de 2024.', 'Fecha: 15/03/2024');
    const vars = detectVariables(doc);
    set(vars, '15 de marzo de 2024', { value: '02/11/2002', dateFormat: 'larga' });
    expect(render(doc, vars)).toEqual(['En Madrid, a 2 de noviembre de 2002.', 'Fecha: 2 de noviembre de 2002']);
    set(vars, '15 de marzo de 2024', { dateFormat: 'num-short' });
    expect(render(doc, vars)[0]).toBe('En Madrid, a 2/11/2002.');
  });

  it('detecta la localidad de firma', () => {
    const vars = detectVariables(paras('En San Sebastián, a 3 de enero de 2025.'));
    expect(vars.find((v) => v.category === 'localidad')?.original).toBe('San Sebastián');
  });
});

describe('género', () => {
  it('cambia tratamiento, papel con su artículo y adjetivos', () => {
    const doc = paras(
      'De otra parte, Dña. Laura Gómez Sánchez, mayor de edad, vecina de Madrid, en adelante la ARRENDATARIA.',
      'La renta la abonará la ARRENDATARIA. Las obras corren a cargo de la arrendataria.',
    );
    const vars = detectVariables(doc);
    const v = set(vars, 'Laura Gómez Sánchez', { value: 'Pedro Sanz Gil' });
    expect(v.originalGender).toBe('f');
    v.gender = 'm';
    expect(render(doc, vars)).toEqual([
      'De otra parte, D. Pedro Sanz Gil, mayor de edad, vecino de Madrid, en adelante el ARRENDATARIO.',
      'La renta la abonará el ARRENDATARIO. Las obras corren a cargo del arrendatario.',
    ]);
  });
});

describe('fórmulas', () => {
  it('calcula importes y fechas a partir de otros datos', () => {
    const doc = paras('Renta: 850 €. Fianza: 1.700 €. Inicio: 15/03/2024. Fin: 15/03/2025.');
    const vars = detectVariables(doc);
    set(vars, '850', { value: '1.000', label: 'Renta' });
    set(vars, '1.700', { value: '= {Renta} * 2' });
    set(vars, '15/03/2024', { value: '01/02/2025', label: 'Inicio' });
    set(vars, '15/03/2025', { value: '= {Inicio} + 1 año' });
    expect(render(doc, vars)[0]).toBe('Renta: 1.000 €. Fianza: 2.000 €. Inicio: 01/02/2025. Fin: 01/02/2026.');
  });

  it('avisa de referencias desconocidas y ciclos', () => {
    const vars = detectVariables(paras('Uno 10 € y dos 20 €.'));
    vars[0].value = '= {No existe} + 1';
    vars[1].value = '= {' + vars[1].label + '} + 1';
    const r = resolveValues(vars);
    expect(r.errors.get(vars[0].id)).toBe('formula.unknown');
    expect(r.errors.get(vars[1].id)).toBe('formula.cycle');
  });
});

describe('revisión final y cláusulas opcionales', () => {
  it('encuentra restos del dato antiguo y huecos sin rellenar', () => {
    const doc = paras('D. Carlos Martínez Ruiz, mayor de edad.', 'Como dijo el bueno de Martinez.', 'Avalista: ________');
    const vars = detectVariables(doc);
    set(vars, 'Carlos Martínez Ruiz', { value: 'Pedro Sanz Gil' });
    const issues = reviewDocument(doc, vars, resolveValues(vars));
    expect(issues.some((i) => i.kind === 'hueco')).toBe(true);
    // "Martinez" (sin tilde) se reconoce como forma corta del apellido, así que no queda ningún resto.
    expect(issues.filter((i) => i.kind === 'resto').map((i) => i.detail)).toEqual([]);
  });

  it('quita las cláusulas desactivadas o cuyo dato está vacío', () => {
    const doc = paras('Uno', 'Avalista: D. Pedro Sanz Gil, mayor de edad.', 'Tres');
    const vars = detectVariables(doc);
    const aval = vars.find((v) => v.category === 'nombre')!;
    aval.value = '';
    expect(removedParas([{ para: 1, include: true, dependsOn: aval.id }, { para: 2, include: false }], vars)).toEqual([1, 2]);
  });
});

describe('lote', () => {
  const vars = detectVariables(paras('D. Carlos Martínez Ruiz, mayor de edad, en adelante el ARRENDADOR, con DNI 12345678Z.'));

  it('plantilla JSON con claves legibles', () => {
    const t = jsonTemplate(vars, 'contrato.docx') as { campos: Record<string, string>; documentos: Record<string, string>[] };
    expect(Object.keys(t.campos)).toContain('nombre_arrendador');
    expect(t.documentos[0].archivo).toBe('contrato-1');
    expect(slug('DNI/NIE (Arrendador)')).toBe('dni_nie_arrendador');
  });

  it('lee JSON por clave o por nombre y CSV', () => {
    const recs = parseBatch(
      JSON.stringify({ documentos: [{ archivo: 'a', nombre_arrendador: 'Ana Ruiz' }, { 'Nombre (Arrendador)': 'Eva Gil', 'DNI/NIE (Arrendador)': '00000000T' }] }),
      'json',
    );
    expect(recs[0].file).toBe('a');
    expect(applyRecord(vars, recs[0]).vars[0].value).toBe('Ana Ruiz');
    expect(applyRecord(vars, recs[1]).vars.map((v) => v.value)).toEqual(['Eva Gil', '00000000T']);
    const csv = parseBatch('archivo;nombre_arrendador\r\nx;Luis Mora', 'csv');
    expect(applyRecord(vars, csv[0]).missing).toEqual(['DNI/NIE (Arrendador)']);
  });

  it('nombre de archivo desde un patrón', () => {
    const filled = vars.map((v) => ({ ...v, value: v.category === 'nombre' ? 'Ana Ruiz' : '' }));
    expect(fileNameFromPattern('Contrato - {Nombre (Arrendador)} - {dni_nie_arrendador}', filled, 'x')).toBe('Contrato - Ana Ruiz - 12345678Z');
  });
});
