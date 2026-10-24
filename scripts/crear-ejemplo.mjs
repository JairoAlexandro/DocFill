// Genera public/ejemplos/contrato-arrendamiento.docx: un contrato de prueba con datos repetidos,
// texto partido en varios trozos con formato, una tabla, un encabezado y huecos en blanco.
import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, { b = false } = {}) => `<w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const tab = '<w:r><w:tab/></w:r>';
const p = (runs, { center = false } = {}) => `<w:p>${center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''}${runs.join('')}</w:p>`;
const P = (text, opts = {}) => p([run(text, opts)], opts);
const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
const cell = (text, b = false) => `<w:tc><w:tcPr><w:tcW w:w="4252" w:type="dxa"/></w:tcPr>${P(text, { b })}</w:tc>`;
const table = (rows) =>
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>` +
  `<w:tblGrid><w:gridCol w:w="4252"/><w:gridCol w:w="4252"/></w:tblGrid>` +
  rows.map(([a, b]) => `<w:tr>${cell(a, true)}${cell(b)}</w:tr>`).join('') +
  `</w:tbl>`;

const body = [
  P('CONTRATO DE ARRENDAMIENTO DE VIVIENDA', { b: true, center: true }),
  P('En Madrid, a 15 de marzo de 2024.'),
  P('REUNIDOS', { b: true, center: true }),
  // El nombre está partido en varios trozos con formato distinto, como hace Word a menudo.
  p([
    run('De una parte, D. '),
    run('Carlos Martínez', { b: true }),
    run(' Ruiz', { b: true }),
    run(', mayor de edad, con DNI 12345678Z y domicilio en Calle Alcalá, 45, 2º B, 28014 Madrid, en adelante el ARRENDADOR.'),
  ]),
  P('De otra parte, Dña. Laura Gómez Sánchez, mayor de edad, con DNI 87654321X, en adelante la ARRENDATARIA.'),
  P('EXPONEN', { b: true, center: true }),
  P('Que D. Carlos Martínez Ruiz es propietario de la vivienda situada en Calle Mayor, 12, 3º A, de Madrid, con referencia catastral 9872023VH5797S0001WX.'),
  table([
    ['Arrendador', 'Carlos Martínez Ruiz'],
    ['Arrendataria', 'Laura Gómez Sánchez'],
  ]),
  P('ESTIPULACIONES', { b: true, center: true }),
  P('PRIMERA.- Dña. Laura Gómez Sánchez arrienda la vivienda descrita por un plazo de un año.'),
  P('SEGUNDA.- La renta mensual será de 850 € (OCHOCIENTOS CINCUENTA EUROS), que la ARRENDATARIA abonará en la cuenta ES91 2100 0418 4502 0005 1332 del ARRENDADOR.'),
  P('TERCERA.- La fianza asciende a 1.700 € (MIL SETECIENTOS EUROS).'),
  P('CUARTA.- Para cualquier comunicación: carlos.martinez@email.com y teléfono 600 123 456.'),
  P('QUINTA.- Avalista: D./Dña. ______________________ con DNI ____________.'),
  P('SEXTA.- El contrato se firma el 15/03/2024 y vence el 15/03/2025. A su término, la ARRENDATARIA devolverá las llaves al Sr. Martínez.'),
  P('Y en prueba de conformidad, firman el presente contrato en Madrid, a 15 de marzo de 2024.'),
  p([run('Fdo.: Carlos Martínez Ruiz'), tab, tab, run('Fdo.: Laura Gómez Sánchez')]),
].join('');

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body}` +
  `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
  `</w:body></w:document>`;

const headerXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}">${P('Contrato de arrendamiento – Laura Gómez Sánchez')}</w:hdr>`;

const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
  `<w:sz w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/>` +
  `<w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `</Types>`;

const rootRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const docRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
  `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rootRels);
zip.file('word/document.xml', documentXml);
zip.file('word/header1.xml', headerXml);
zip.file('word/styles.xml', stylesXml);
zip.file('word/_rels/document.xml.rels', docRels);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ejemplos', 'contrato-arrendamiento.docx');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Creado:', out);
