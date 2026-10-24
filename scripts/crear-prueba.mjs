// Genera pruebas/contrato-pruebas.docx: un contrato pensado para probar a fondo DocFill en la web.
// Cada parte del documento ejercita una función distinta (ver la lista en pruebas/README.md).
import JSZip from 'jszip';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (text, { b = false, i = false } = {}) => {
  const props = `${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};
const tab = '<w:r><w:tab/></w:r>';
const p = (runs, { center = false } = {}) => `<w:p>${center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : ''}${runs.join('')}</w:p>`;
const P = (text, opts = {}) => p([run(text, opts)], opts);
const H = (text) => P(text, { b: true, center: true });
const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
const cell = (text, b = false) => `<w:tc><w:tcPr><w:tcW w:w="4252" w:type="dxa"/></w:tcPr>${P(text, { b })}</w:tc>`;
const table = (rows) =>
  `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>` +
  `<w:tblGrid><w:gridCol w:w="4252"/><w:gridCol w:w="4252"/></w:tblGrid>` +
  rows.map(([a, b]) => `<w:tr>${cell(a, true)}${cell(b)}</w:tr>`).join('') +
  `</w:tbl>`;

const body = [
  H('CONTRATO DE ARRENDAMIENTO DE VIVIENDA CON PLAZA DE GARAJE'),
  P('En Valencia, a 1 de febrero de 2025.'),
  H('REUNIDOS'),

  // Empresa con CIF y representante (DNI con puntos y guion). Nombre partido en trozos con formato distinto.
  p([
    run('De una parte, la mercantil '),
    run('Inmobiliaria Levante, S.L.', { b: true }),
    run(', con CIF B12345674 y domicilio social en Avenida del Puerto, 120, 3º B, C.P. 46023 Valencia, representada por D. '),
    run('Javier Ortega', { b: true }),
    run(' Molina', { b: true, i: true }),
    run(', mayor de edad, con DNI 45.678.912-S, en adelante el ARRENDADOR.'),
  ]),

  // Persona con nombre compuesto: formas cortas, género y tratamiento.
  P('De otra parte, Dña. María José Fernández Ruiz, mayor de edad, vecina de Valencia, provista de DNI 87654321X, con domicilio en Calle Colón, 15, 2º A, teléfono 612 345 678 y correo mjose.fernandez@correo.es, en adelante la ARRENDATARIA.'),

  // Nombre de pila poco común, reconocible por sus apellidos. NIE y teléfono con prefijo.
  P('Y como testigo, Yeray Castillo Navarro, con NIE X1234567L y teléfono +34 911 234 567.'),

  H('EXPONEN'),
  P('I.- Que Inmobiliaria Levante, S.L. es propietaria de la vivienda situada en Calle Ruzafa, 8, 4º C, de Valencia, con referencia catastral 9872023VH5797S0001WX, y de la plaza de garaje número 14 para el vehículo con matrícula 1234 BCD.'),
  P('II.- Que la Sra. Fernández desea arrendar dicha vivienda, y que María José conoce y acepta su estado actual.'),
  P('III.- Que la gestión del contrato la realizará [NOMBRE DEL GESTOR], localizable en el teléfono {{telefono_gestor}}. [NOMBRE DEL GESTOR] entregará copia a ambas partes.'),

  table([
    ['Arrendador', 'Inmobiliaria Levante, S.L.'],
    ['Representante', 'Javier Ortega Molina'],
    ['Arrendataria', 'María José Fernández Ruiz'],
    ['DNI arrendataria', '87654321X'],
  ]),

  H('ESTIPULACIONES'),
  P('PRIMERA. Duración.- El contrato comienza el 01/02/2025 y finaliza el 01/02/2026, es decir, tiene una duración de un año desde el uno de febrero de dos mil veinticinco.'),
  P('SEGUNDA. Renta.- La renta mensual será de 950 € (NOVECIENTOS CINCUENTA EUROS), que la ARRENDATARIA abonará en la cuenta ES91 2100 0418 4502 0005 1332 del ARRENDADOR antes del día 5 de cada mes.'),
  P('TERCERA. Fianza.- La ARRENDATARIA entrega en este acto 1.900 € (MIL NOVECIENTOS EUROS) en concepto de fianza, equivalente a dos mensualidades.'),
  P('CUARTA. Garaje.- Por la plaza de garaje se abonará una base de 1.000 € más IVA de 210 €, en total 1.210 € (MIL DOSCIENTOS DIEZ EUROS) al año.'),
  P('QUINTA. Avalista.- Garantiza el cumplimiento de este contrato D./Dña. ______________________, con NIE ____________ y domicilio en ...................................., quien responde solidariamente con la ARRENDATARIA.'),
  P('SEXTA. Notificaciones.- Las comunicaciones se enviarán a mjose.fernandez@correo.es o al teléfono 612 345 678 de la Sra. Fernández.'),
  P('SÉPTIMA. Mascotas (cláusula opcional).- Se autoriza a la ARRENDATARIA a tener un animal de compañía, siendo responsable de los daños que cause.'),
  P('OCTAVA. Devolución.- Al terminar el contrato, la ARRENDATARIA devolverá las llaves a D. Javier Ortega Molina o a la persona que designe Inmobiliaria Levante, S.L.'),

  P('Y en prueba de conformidad, firman el presente contrato en Valencia, a 1 de febrero de 2025.'),
  p([run('Fdo.: Javier Ortega Molina'), tab, tab, run('Fdo.: MARÍA JOSÉ FERNÁNDEZ RUIZ')]),
  p([run('En representación de Inmobiliaria Levante, S.L.'), tab, run('Arrendataria')]),
].join('');

const headerXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}">${P('Contrato de arrendamiento – María José Fernández Ruiz – Ref. 2025/014')}</w:hdr>`;

const footerXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}">${P('Inmobiliaria Levante, S.L. · CIF B12345674 · Avenida del Puerto, 120, 3º B, Valencia', { center: true })}</w:ftr>`;

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
  `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${body}` +
  `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/>` +
  `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
  `</w:body></w:document>`;

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
  `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
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
  `<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>` +
  `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rootRels);
zip.file('word/document.xml', documentXml);
zip.file('word/header1.xml', headerXml);
zip.file('word/footer1.xml', footerXml);
zip.file('word/styles.xml', stylesXml);
zip.file('word/_rels/document.xml.rels', docRels);

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'pruebas', 'contrato-pruebas.docx');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Creado:', out);
