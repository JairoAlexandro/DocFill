import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readDocument } from './formats';
import { detectVariables } from './detect';
import { renderDocument } from './produce';
import { genderKey, joinList, toggleRepeatPara } from './repeat';
import type { RepeatBlock } from './types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function docx(paras: string[]) {
  const zip = new JSZip();
  const body = paras.map((t) => `<w:p w14:paraId="1A2B" xmlns:w14="x"><w:bookmarkStart w:id="0" w:name="b"/><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('listas que se repiten', () => {
  it('une nombres en español', () => {
    expect(joinList(['Ana'])).toBe('Ana');
    expect(joinList(['Ana', 'Luis', 'Eva'])).toBe('Ana, Luis y Eva');
  });

  it('crea, amplía y reduce bloques', () => {
    const paras = ['A', 'B', '', 'C', 'D'].map((text, index) => ({ index, part: 'x', kind: 'cuerpo' as const, text, inTable: false }));
    let blocks: RepeatBlock[] = toggleRepeatPara([], paras, 1, () => 'b1');
    blocks = toggleRepeatPara(blocks, paras, 3, () => 'b2'); // salta el párrafo vacío
    expect(blocks.map((b) => b.paras)).toEqual([[1, 2, 3]]);
    blocks = toggleRepeatPara(blocks, paras, 3, () => 'b3');
    expect(blocks[0].paras).toEqual([1, 2]);
  });

  it('copia el bloque por cada persona y junta los nombres fuera de él', async () => {
    const bytes = await docx([
      'REUNIDOS',
      'De otra parte, Dña. Laura Gómez Sánchez, mayor de edad, con DNI 87654321X.',
      'Firman: Laura Gómez Sánchez.',
    ]);
    const paras = await readDocument('c.docx', bytes);
    const vars = detectVariables(paras);
    const nombre = vars.find((v) => v.original === 'Laura Gómez Sánchez')!;
    const dni = vars.find((v) => v.original === '87654321X')!;
    nombre.value = 'Ana Torres Vidal';
    dni.value = '11111111H';
    const block: RepeatBlock = {
      id: 'b',
      paras: [1],
      joinOutside: true,
      entries: [{ [nombre.id]: 'Luis Mora Gil', [dni.id]: '22222222J' }],
    };
    const out = await readDocument('c.docx', await renderDocument({ fileName: 'c.docx', bytes, repeats: [block] }, vars));
    expect(out.map((p) => p.text)).toEqual([
      'REUNIDOS',
      'De otra parte, Dña. Ana Torres Vidal, mayor de edad, con DNI 11111111H.',
      'De otra parte, Dña. Luis Mora Gil, mayor de edad, con DNI 22222222J.',
      'Firman: Ana Torres Vidal y Luis Mora Gil.',
    ]);
    // Las copias no repiten marcadores ni identificadores de párrafo de Word.
    const xml = await (await JSZip.loadAsync(await renderDocument({ fileName: 'c.docx', bytes, repeats: [block] }, vars)))
      .file('word/document.xml')!
      .async('string');
    expect(xml.match(/bookmarkStart/g)).toHaveLength(3);
    expect(xml.match(/paraId/g)).toHaveLength(3);
  });

  it('cada persona de la lista tiene su propio género', async () => {
    const bytes = new TextEncoder().encode('De otra parte, Dña. Laura Gómez Sánchez, vecina de Madrid, en adelante la ARRENDATARIA.');
    const paras = await readDocument('t.txt', bytes);
    const vars = detectVariables(paras);
    const nombre = vars.find((v) => v.original === 'Laura Gómez Sánchez')!;
    nombre.value = 'Ana Torres Vidal';
    const block: RepeatBlock = { id: 'b', paras: [0], joinOutside: true, entries: [{ [nombre.id]: 'Luis Mora Gil', [genderKey(nombre.id)]: 'm' }] };
    const out = new TextDecoder().decode(await renderDocument({ fileName: 't.txt', bytes, repeats: [block] }, vars));
    expect(out.split('\n')).toEqual([
      'De otra parte, Dña. Ana Torres Vidal, vecina de Madrid, en adelante la ARRENDATARIA.',
      'De otra parte, D. Luis Mora Gil, vecino de Madrid, en adelante el ARRENDATARIO.',
    ]);
  });

  it('funciona también con texto plano y con cláusulas opcionales dentro del bloque', async () => {
    const bytes = new TextEncoder().encode('Inquilino: D. Juan Pérez Gil\nNota opcional\nFin');
    const paras = await readDocument('t.txt', bytes);
    const vars = detectVariables(paras);
    vars[0].value = 'Ana Ruiz';
    const block: RepeatBlock = { id: 'b', paras: [0, 1], joinOutside: false, entries: [{ [vars[0].id]: 'Eva Gil' }] };
    const out = await renderDocument({ fileName: 't.txt', bytes, repeats: [block], optional: [{ para: 1, include: false }] }, vars);
    expect(new TextDecoder().decode(out)).toBe('Inquilino: D. Ana Ruiz\nInquilino: D. Eva Gil\nFin');
  });
});
