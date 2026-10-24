import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { isValidCif, isValidDni, isValidIban } from './validate';
import { numberToWords, parseAmount } from './numberWords';
import { detectVariables } from './detect';
import { createRule } from './learning';
import { buildReplacements, addFromSelection } from './variables';
import { generateDocxBytes, readDocx } from './docx';
import { parseCSV, toCSV } from './csv';
import type { Paragraph } from './types';

const paras = (...texts: string[]): Paragraph[] =>
  texts.map((text, index) => ({ index, part: 'word/document.xml', kind: 'cuerpo', text, inTable: false }));

const CONTRATO = paras(
  'De una parte, D. Carlos Martínez Ruiz, mayor de edad, con DNI 12345678Z, en adelante el ARRENDADOR.',
  'De otra parte, Dña. Laura Gómez Sánchez, mayor de edad, con DNI 87654321X, en adelante la ARRENDATARIA.',
  'La renta mensual será de 850 € (OCHOCIENTOS CINCUENTA EUROS), en la cuenta ES91 2100 0418 4502 0005 1332.',
  'Avalista: D./Dña. ______________________ con DNI ____________.',
  'Fdo.: Carlos Martínez Ruiz\t\tFdo.: Laura Gómez Sánchez',
);

describe('validación', () => {
  it('DNI, CIF e IBAN', () => {
    expect(isValidDni('12345678Z')).toBe(true);
    expect(isValidDni('12345678A')).toBe(false);
    expect(isValidDni('X1234567L')).toBe(true);
    expect(isValidCif('B12345674')).toBe(true);
    expect(isValidIban('ES91 2100 0418 4502 0005 1332')).toBe(true);
    expect(isValidIban('ES91 2100 0418 4502 0005 1333')).toBe(false);
  });
});

describe('números en letras', () => {
  it('convierte importes', () => {
    expect(numberToWords(850)).toBe('ochocientos cincuenta');
    expect(numberToWords(1700)).toBe('mil setecientos');
    expect(numberToWords(21000)).toBe('veintiún mil');
    expect(numberToWords(101)).toBe('ciento uno');
    expect(numberToWords(1_000_000)).toBe('un millón');
    expect(parseAmount('1.700')).toBe(1700);
    expect(parseAmount('1.200,50')).toBe(1200.5);
  });
});

describe('detección', () => {
  const vars = detectVariables(CONTRATO);
  const byOriginal = (s: string) => vars.find((v) => v.original === s);

  it('encuentra los nombres en todas sus apariciones y con su papel', () => {
    const carlos = byOriginal('Carlos Martínez Ruiz')!;
    expect(carlos).toBeTruthy();
    expect(carlos.occurrences.filter((o) => !o.transform)).toHaveLength(2);
    expect(carlos.label).toBe('Nombre (Arrendador)');
    expect(byOriginal('Laura Gómez Sánchez')!.label).toBe('Nombre (Arrendataria)');
  });

  it('encuentra DNI, IBAN e importe con su versión en letras', () => {
    expect(byOriginal('12345678Z')!.label).toBe('DNI/NIE (Arrendador)');
    expect(byOriginal('ES91 2100 0418 4502 0005 1332')!.category).toBe('iban');
    const renta = byOriginal('850')!;
    expect(renta.label).toBe('Importe (Renta)');
    expect(renta.occurrences.some((o) => o.transform === 'letras')).toBe(true);
  });

  it('detecta los huecos en blanco y adivina qué va en ellos', () => {
    const huecos = vars.filter((v) => v.source === 'hueco');
    expect(huecos.map((h) => h.label)).toEqual(['Nombre (Avalista)', 'DNI/NIE (Avalista)']);
  });

  it('respeta los valores ignorados', () => {
    const v2 = detectVariables(CONTRATO, { ignored: ['laura gomez sanchez'] });
    expect(v2.find((v) => v.original === 'Laura Gómez Sánchez')).toBeUndefined();
  });

  it('genera las sustituciones respetando mayúsculas y letras', () => {
    const filled = vars.map((v) => (v.original === '850' ? { ...v, value: '920' } : v));
    const reps = buildReplacements(filled);
    expect(reps.map((r) => r.text)).toEqual(['920', 'NOVECIENTOS VEINTE']);
  });
});

describe('aprendizaje', () => {
  it('reconoce el mismo contexto en otro documento', () => {
    const text = 'Interviene como avalista Pedro López Ruiz, con domicilio en Sevilla.';
    const start = text.indexOf('Pedro');
    const rule = createRule(text, start, start + 'Pedro López Ruiz'.length, 'Nombre del avalista', 'nombre');
    expect(rule.prefix).toBe('Interviene como avalista');
    const vars = detectVariables(paras('Interviene como avalista Marta Ortega Gil, con domicilio en Cádiz.'), { learned: [rule] });
    const v = vars.find((x) => x.label === 'Nombre del avalista');
    expect(v?.original).toBe('Marta Ortega Gil');
  });

  it('marcar a mano busca todas las apariciones', () => {
    const doc = paras('El inmueble Villa Rosa está en la costa.', 'Villa Rosa tiene jardín.');
    const { vars } = addFromSelection([], doc, { para: 0, start: 12, end: 22, text: 'Villa Rosa' }, { label: 'Inmueble', category: 'texto' });
    expect(vars[0].occurrences).toHaveLength(2);
  });
});

describe('docx', () => {
  it('sustituye texto partido en varios trozos y conserva el formato', async () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>` +
        `<w:p><w:r><w:t xml:space="preserve">Hola, D. </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Juan</w:t></w:r>` +
        `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> Pérez</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>` +
        `</w:body></w:document>`,
    );
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const [p] = await readDocx(bytes);
    expect(p.text).toBe('Hola, D. Juan Pérez.');
    const out = await generateDocxBytes(bytes, [{ para: 0, start: 9, end: 19, text: 'Ana Ruiz' }]);
    const [p2] = await readDocx(out);
    expect(p2.text).toBe('Hola, D. Ana Ruiz.');
    const xml = await (await JSZip.loadAsync(out)).file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:b/></w:rPr><w:t xml:space="preserve">Ana Ruiz</w:t>');
  });
});

describe('contrato de ejemplo completo', () => {
  it('detecta, rellena y genera un .docx correcto', async () => {
    const { readFile } = await import('node:fs/promises');
    const bytes = new Uint8Array(await readFile('public/ejemplos/contrato-arrendamiento.docx'));
    const doc = await readDocx(bytes);
    const vars = detectVariables(doc);
    const set = (label: string, value: string) => {
      const v = vars.find((x) => x.label === label);
      expect(v, label).toBeTruthy();
      v!.value = value;
    };
    set('Nombre (Arrendataria)', 'Ana Torres Vidal');
    set('Importe (Renta)', '1.021');
    set('Nombre (Avalista)', 'Pedro López Ruiz');
    expect(vars.find((v) => v.original.startsWith('Calle Mayor'))?.label).toBe('Dirección del inmueble');

    const out = await readDocx(await generateDocxBytes(bytes, buildReplacements(vars)));
    const all = out.map((p) => p.text).join('\n');
    expect(all).not.toContain('Laura');
    expect(all.match(/Ana Torres Vidal/g)).toHaveLength(5);
    expect(all).toContain('1.021 € (MIL VEINTIÚN EUROS)');
    expect(all).toContain('Avalista: D./Dña. Pedro López Ruiz con DNI ____________.');
    expect(out.find((p) => p.kind === 'encabezado')?.text).toBe('Contrato de arrendamiento – Ana Torres Vidal');
  });
});

describe('csv', () => {
  it('ida y vuelta con ; y comillas', () => {
    const rows = [['archivo', 'Nombre'], ['doc 1', 'Pérez; "el bueno"']];
    expect(parseCSV(toCSV(rows))).toEqual(rows);
  });
});

describe('copia de seguridad', () => {
  it('los .docx sobreviven a la conversión a base64', async () => {
    const { toBase64, fromBase64 } = await import('../storage');
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 37) % 256);
    expect(new Uint8Array(fromBase64(toBase64(bytes.buffer)))).toEqual(bytes);
  });
});

describe('copia cifrada', () => {
  it('cifra y descifra con contraseña, y rechaza la incorrecta', async () => {
    const { encryptText, decryptText } = await import('../crypto');
    const enc = await encryptText('{"hola":"mundo"}', 'secreta');
    expect(enc.data).not.toContain('mundo');
    expect(await decryptText(enc, 'secreta')).toBe('{"hola":"mundo"}');
    await expect(decryptText(enc, 'otra')).rejects.toThrow('settings.wrongPassword');
  });
});
