import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { formatOf, generateDocument, readDocument } from './formats';
import { detectVariables } from './detect';
import { buildReplacements } from './variables';

const zipOf = async (files: Record<string, string>) => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array' });
};

/** Detecta, rellena el dato con ese texto original y devuelve los párrafos del documento generado. */
async function fillAndRead(fileName: string, bytes: Uint8Array, original: string, value: string, opts = {}) {
  const paras = await readDocument(fileName, bytes);
  const vars = detectVariables(paras);
  const v = vars.find((x) => x.original === original);
  expect(v, `no se detectó «${original}»`).toBeTruthy();
  v!.value = value;
  const out = await generateDocument(fileName, bytes, buildReplacements(vars), opts);
  return readDocument(fileName, out);
}

describe('formatos', () => {
  it('reconoce las extensiones', () => {
    expect(formatOf('a.DOCX')?.id).toBe('docx');
    expect(formatOf('a.odt')?.id).toBe('odt');
    expect(formatOf('a.md')?.id).toBe('txt');
    expect(formatOf('a.doc')).toBeNull();
  });

  it('LibreOffice .odt (con texto partido y espacios especiales)', async () => {
    const T = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
    const O = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
    const bytes = await zipOf({
      mimetype: 'application/vnd.oasis.opendocument.text',
      'content.xml':
        `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="${O}" xmlns:text="${T}"><office:body><office:text>` +
        `<text:p>De una parte, D. <text:span>Carlos Martínez</text:span> Ruiz,<text:s text:c="2"/>mayor de edad.</text:p>` +
        `<text:p>Firma: Carlos Martínez Ruiz</text:p>` +
        `</office:text></office:body></office:document-content>`,
    });
    const out = await fillAndRead('c.odt', bytes, 'Carlos Martínez Ruiz', 'Ana Ruiz');
    expect(out.map((p) => p.text)).toEqual(['De una parte, D. Ana Ruiz,  mayor de edad.', 'Firma: Ana Ruiz']);
  });

  it('PowerPoint .pptx', async () => {
    const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const bytes = await zipOf({
      'ppt/presentation.xml': '<p:presentation xmlns:p="x"/>',
      'ppt/slides/slide1.xml': `<p:sld xmlns:p="x" xmlns:a="${A}"><a:p><a:r><a:t>Cliente: Dña. Laura Gómez Sánchez</a:t></a:r></a:p></p:sld>`,
    });
    const out = await fillAndRead('p.pptx', bytes, 'Laura Gómez Sánchez', 'Eva Gil Mora');
    expect(out[0].text).toBe('Cliente: Dña. Eva Gil Mora');
  });

  it('Excel .xlsx (textos compartidos)', async () => {
    const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const bytes = await zipOf({
      'xl/workbook.xml': `<workbook xmlns="${S}"/>`,
      'xl/sharedStrings.xml': `<sst xmlns="${S}"><si><t>Concepto</t></si><si><t>ES91 2100 0418 4502 0005 1332</t></si></sst>`,
    });
    const out = await fillAndRead('h.xlsx', bytes, 'ES91 2100 0418 4502 0005 1332', 'ES79 2100 0813 6101 2345 6789');
    expect(out[1].text).toBe('ES79 2100 0813 6101 2345 6789');
  });

  it('texto plano, quitando una línea opcional', async () => {
    const bytes = new TextEncoder().encode('Hola D. Juan Pérez Gil,\r\nLínea opcional\r\nAdiós Juan Pérez Gil');
    const out = await fillAndRead('t.txt', bytes, 'Juan Pérez Gil', 'Ana Sanz', { removeParas: [1] });
    expect(out.map((p) => p.text)).toEqual(['Hola D. Ana Sanz,', 'Adiós Ana Sanz']);
  });

  it('PDF con formulario: rellena campos vacíos y con valor', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const form = pdf.getForm();
    const nombre = form.createTextField('nombre_solicitante');
    nombre.setText('Laura Gómez Sánchez');
    nombre.addToPage(page, { x: 50, y: 700 });
    form.createTextField('dniSolicitante').addToPage(page, { x: 50, y: 650 });
    const bytes = await pdf.save();

    const paras = await readDocument('f.pdf', bytes);
    const vars = detectVariables(paras);
    expect(vars.map((v) => v.label)).toEqual(['Nombre solicitante', 'Dni solicitante']);
    vars[0].value = 'Eva Gil Mora';
    vars[1].value = '12345678Z';
    const out = await readDocument('f.pdf', await generateDocument('f.pdf', bytes, buildReplacements(vars)));
    expect(out.map((p) => p.text)).toEqual(['Eva Gil Mora', '12345678Z']);
  });
});
