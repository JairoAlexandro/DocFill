import JSZip from 'jszip';
import type { PDFDocument, PDFTextField as TextField } from 'pdf-lib';
import type { Paragraph, PartKind } from './types';

/**
 * Lectura y escritura de todos los formatos admitidos.
 * Todos se convierten al mismo modelo: una lista de párrafos de texto. Las sustituciones se aplican
 * sobre ese texto y cada formato sabe devolverlas a su sitio sin perder el formato.
 */

export type FormatId = 'docx' | 'odt' | 'pptx' | 'xlsx' | 'txt' | 'pdf' | 'image';

export interface FormatInfo {
  id: FormatId;
  extensions: string[];
  mime: string;
}

export const FORMATS: FormatInfo[] = [
  { id: 'docx', extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'odt', extensions: ['odt'], mime: 'application/vnd.oasis.opendocument.text' },
  { id: 'pptx', extensions: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { id: 'xlsx', extensions: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'txt', extensions: ['txt', 'md'], mime: 'text/plain' },
  { id: 'pdf', extensions: ['pdf'], mime: 'application/pdf' },
  // Fotos o escaneos sueltos: se reconoce el texto y el resultado es un PDF.
  { id: 'image', extensions: ['png', 'jpg', 'jpeg'], mime: 'application/pdf' },
];

export const ACCEPT = FORMATS.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');

/** Extensión del documento final: las imágenes se entregan como PDF. */
export function outputExtension(fileName: string): string {
  const f = formatOf(fileName);
  return f?.id === 'image' ? 'pdf' : (fileName.toLowerCase().split('.').pop() ?? 'docx');
}

export function formatOf(fileName: string): FormatInfo | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return FORMATS.find((f) => f.extensions.includes(ext)) ?? null;
}

export interface Replacement {
  para: number;
  start: number;
  end: number;
  text: string;
}

export interface GenerateOptions {
  /** Párrafos que se eliminan (cláusulas opcionales desactivadas). */
  removeParas?: number[];
  /** Párrafos leídos del documento (los PDF necesitan su posición en la página). */
  paragraphs?: Paragraph[];
}

export interface ReadOptions {
  /** Avance del reconocimiento de texto (OCR), de 0 a 1. */
  onProgress?: (fraction: number) => void;
}

type Bytes = ArrayBuffer | Uint8Array;

export async function readDocument(fileName: string, bytes: Bytes, opts: ReadOptions = {}): Promise<Paragraph[]> {
  const f = formatOf(fileName);
  if (!f) throw new Error('err.unsupported');
  if (f.id === 'txt') return readText(bytes).paragraphs;
  if (f.id === 'pdf') return readAnyPdf(bytes, opts);
  if (f.id === 'image') return readImage(fileName, bytes, opts);
  return (await parseXml(SPECS[f.id], bytes)).paragraphs;
}

export async function generateDocument(fileName: string, bytes: Bytes, reps: Replacement[], opts: GenerateOptions = {}): Promise<Uint8Array> {
  const f = formatOf(fileName);
  if (!f) throw new Error('err.unsupported');
  if (f.id === 'txt') return generateText(bytes, reps, opts);
  if (f.id === 'pdf') return generateAnyPdf(bytes, reps, opts);
  if (f.id === 'image') return generateImage(fileName, bytes, reps, opts);
  return generateXml(SPECS[f.id], bytes, reps, opts);
}

export function groupByPara(reps: Replacement[]): Map<number, Replacement[]> {
  const map = new Map<number, Replacement[]>();
  for (const r of reps) {
    const list = map.get(r.para) ?? [];
    list.push(r);
    map.set(r.para, list);
  }
  // De atrás hacia delante para que las posiciones anteriores sigan siendo válidas.
  map.forEach((l) => l.sort((a, b) => b.start - a.start));
  return map;
}

/** Aplica sustituciones a un texto plano. */
export function applyToString(text: string, reps: Replacement[]): string {
  let out = text;
  for (const r of [...reps].sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + r.text + out.slice(r.end);
  return out;
}

// ---------------------------------------------------------------- Formatos XML dentro de un zip

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  s: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
};
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

interface Piece {
  text: string;
  /** Nodo cuyo texto se puede cambiar; null para tabuladores, saltos o espacios especiales. */
  node: Node | null;
}

interface XmlSpec {
  required: string;
  /** Partes con texto, ya ordenadas. */
  parts: (names: string[]) => string[];
  kindOf: (part: string) => PartKind;
  isPara: (el: Element) => boolean;
  /** Convierte un nodo en un trozo de texto del párrafo, o null si no aporta texto. */
  piece: (node: Node) => Piece | null;
  isCell: (el: Element) => boolean;
  /** Excluir párrafos duplicados (p. ej. el contenido alternativo de los cuadros de texto de Word). */
  skip?: (p: Element) => boolean;
  /** El zip de ODT exige que "mimetype" vaya sin comprimir. */
  storeUncompressed?: string[];
}

const isEl = (n: Node): n is Element => n.nodeType === 1;
const numeric = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const parentLocal = (n: Node) => (n.parentNode && isEl(n.parentNode) ? n.parentNode.localName : '');

function hasAncestor(node: Node, test: (e: Element) => boolean): boolean {
  let n = node.parentNode;
  while (n && isEl(n)) {
    if (test(n)) return true;
    n = n.parentNode;
  }
  return false;
}

const SPECS: Record<'docx' | 'odt' | 'pptx' | 'xlsx', XmlSpec> = {
  docx: {
    required: 'word/document.xml',
    parts: (names) => {
      const order = (n: string) => (n === 'word/document.xml' ? 0 : n.includes('header') ? 1 : n.includes('footer') ? 2 : 3);
      return names.filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n)).sort((a, b) => order(a) - order(b) || numeric(a, b));
    },
    kindOf: (p) => (p === 'word/document.xml' ? 'cuerpo' : p.includes('header') ? 'encabezado' : p.includes('footer') ? 'pie' : 'notas'),
    isPara: (el) => el.namespaceURI === NS.w && el.localName === 'p',
    piece: (n) => {
      if (!isEl(n) || n.namespaceURI !== NS.w) return null;
      switch (n.localName) {
        case 't':
          return { text: n.textContent ?? '', node: n };
        case 'tab':
          return parentLocal(n) === 'r' ? { text: '\t', node: null } : null;
        case 'br':
        case 'cr':
          return parentLocal(n) === 'r' ? { text: '\n', node: null } : null;
        case 'noBreakHyphen':
          return { text: '-', node: null };
        default:
          return null;
      }
    },
    isCell: (el) => el.namespaceURI === NS.w && el.localName === 'tc',
    skip: (p) => hasAncestor(p, (e) => e.localName === 'Fallback'),
  },
  odt: {
    required: 'content.xml',
    parts: (names) => ['content.xml', 'styles.xml'].filter((n) => names.includes(n)),
    kindOf: (p) => (p === 'content.xml' ? 'cuerpo' : 'encabezado'),
    isPara: (el) => el.namespaceURI === NS.text && (el.localName === 'p' || el.localName === 'h'),
    piece: (n) => {
      if (n.nodeType === 3) return { text: n.nodeValue ?? '', node: n };
      if (!isEl(n) || n.namespaceURI !== NS.text) return null;
      if (n.localName === 's') return { text: ' '.repeat(Number(n.getAttributeNS(NS.text, 'c') ?? 1) || 1), node: null };
      if (n.localName === 'tab') return { text: '\t', node: null };
      if (n.localName === 'line-break') return { text: '\n', node: null };
      return null;
    },
    isCell: (el) => el.namespaceURI === NS.table && el.localName === 'table-cell',
    storeUncompressed: ['mimetype'],
  },
  pptx: {
    required: 'ppt/presentation.xml',
    parts: (names) => names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(numeric),
    kindOf: () => 'diapositiva',
    isPara: (el) => el.namespaceURI === NS.a && el.localName === 'p',
    piece: (n) => {
      if (!isEl(n) || n.namespaceURI !== NS.a) return null;
      if (n.localName === 't') return { text: n.textContent ?? '', node: n };
      if (n.localName === 'br') return { text: '\n', node: null };
      return null;
    },
    isCell: (el) => el.namespaceURI === NS.a && el.localName === 'tc',
  },
  xlsx: {
    required: 'xl/workbook.xml',
    parts: (names) => [
      ...names.filter((n) => n === 'xl/sharedStrings.xml'),
      ...names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(numeric),
    ],
    kindOf: (p) => (p.includes('sharedStrings') ? 'celdas' : 'hoja'),
    // Cada texto compartido (<si>) o texto en línea (<is>) es un "párrafo".
    isPara: (el) => el.namespaceURI === NS.s && (el.localName === 'si' || el.localName === 'is'),
    piece: (n) => {
      if (!isEl(n) || n.namespaceURI !== NS.s || n.localName !== 't') return null;
      if (parentLocal(n) === 'rPh') return null;
      return { text: n.textContent ?? '', node: n };
    },
    isCell: () => false,
  },
};

interface Segment {
  node: Node | null;
  start: number;
  end: number;
}

interface ParaRef {
  part: string;
  el: Element;
  segments: Segment[];
}

async function loadZip(bytes: Bytes, spec: XmlSpec): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('err.invalidFile');
  }
  if (!zip.file(spec.required)) throw new Error('err.invalidFile');
  return zip;
}

async function parseXml(spec: XmlSpec, bytes: Bytes) {
  const zip = await loadZip(bytes, spec);
  const parser = new DOMParser();
  const docs = new Map<string, Document>();
  const refs: ParaRef[] = [];
  const paragraphs: Paragraph[] = [];

  for (const name of spec.parts(Object.keys(zip.files))) {
    const doc = parser.parseFromString(await zip.file(name)!.async('string'), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('err.readPart');
    docs.set(name, doc);

    const paraOf = new Map<Element, ParaRef>();
    const texts = new Map<Element, string>();
    const order: Element[] = [];
    const nearestPara = (n: Node): Element | null => {
      let cur = n.parentNode;
      while (cur && isEl(cur)) {
        if (spec.isPara(cur)) return cur;
        cur = cur.parentNode;
      }
      return null;
    };

    // Recorremos todo en orden de documento y asignamos cada trozo de texto a su párrafo más cercano.
    const walker = doc.createTreeWalker(doc.documentElement, 0x1 | 0x4);
    for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
      if (isEl(n) && spec.isPara(n) && !spec.skip?.(n)) {
        paraOf.set(n, { part: name, el: n, segments: [] });
        texts.set(n, '');
        order.push(n);
        continue;
      }
      const piece = spec.piece(n);
      if (!piece) continue;
      const p = nearestPara(n);
      const ref = p && paraOf.get(p);
      if (!ref || !p) continue;
      const cur = texts.get(p)!;
      ref.segments.push({ node: piece.node, start: cur.length, end: cur.length + piece.text.length });
      texts.set(p, cur + piece.text);
    }

    for (const p of order) {
      paragraphs.push({
        index: paragraphs.length,
        part: name,
        kind: spec.kindOf(name),
        text: texts.get(p)!,
        inTable: hasAncestor(p, spec.isCell),
      });
      refs.push(paraOf.get(p)!);
    }
  }
  return { zip, docs, refs, paragraphs };
}

/** Sustituye un rango de texto aunque esté partido en varios trozos con formato distinto. */
function applyOne(ref: ParaRef, r: Replacement): boolean {
  let inserted = false;
  for (const seg of ref.segments) {
    if (!seg.node) continue;
    const touches = r.start === r.end ? seg.start <= r.start && r.start <= seg.end : seg.start < r.end && r.start < seg.end;
    if (!touches) continue;
    const cur = seg.node.textContent ?? '';
    const ls = Math.max(r.start, seg.start) - seg.start;
    const le = Math.min(r.end, seg.end) - seg.start;
    seg.node.textContent = cur.slice(0, ls) + (inserted ? '' : r.text) + cur.slice(le);
    if (isEl(seg.node)) seg.node.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    inserted = true;
  }
  return inserted;
}

/** Quita un párrafo. Si es el único de una celda de tabla, se vacía en vez de borrarlo para no romper la tabla. */
function removeParagraph(spec: XmlSpec, ref: ParaRef): void {
  const parent = ref.el.parentNode;
  if (!parent) return;
  const siblings = Array.from(parent.childNodes).filter((n) => isEl(n) && spec.isPara(n));
  if (isEl(parent) && spec.isCell(parent) && siblings.length <= 1) {
    ref.segments.forEach((s) => s.node && (s.node.textContent = ''));
    return;
  }
  parent.removeChild(ref.el);
}

async function saveXml(spec: XmlSpec, parsed: Awaited<ReturnType<typeof parseXml>>, changed: Set<string>): Promise<Uint8Array> {
  const serializer = new XMLSerializer();
  for (const name of changed) {
    let xml = serializer.serializeToString(parsed.docs.get(name)!);
    if (!xml.startsWith('<?xml')) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + xml;
    parsed.zip.file(name, xml);
  }
  for (const name of spec.storeUncompressed ?? []) {
    const f = parsed.zip.file(name);
    if (f) parsed.zip.file(name, await f.async('uint8array'), { compression: 'STORE' });
  }
  return parsed.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function generateXml(spec: XmlSpec, bytes: Bytes, reps: Replacement[], opts: GenerateOptions): Promise<Uint8Array> {
  const parsed = await parseXml(spec, bytes);
  const changed = new Set<string>();
  for (const [pi, list] of groupByPara(reps)) {
    const ref = parsed.refs[pi];
    if (!ref) continue;
    for (const r of list) if (applyOne(ref, r)) changed.add(ref.part);
  }
  for (const pi of opts.removeParas ?? []) {
    const ref = parsed.refs[pi];
    if (!ref) continue;
    removeParagraph(spec, ref);
    changed.add(ref.part);
  }
  return saveXml(spec, parsed, changed);
}

/** Atributos y elementos que no pueden repetirse en una copia de un párrafo de Word. */
function cleanClone(el: Element): void {
  for (const tag of ['bookmarkStart', 'bookmarkEnd', 'sectPr']) {
    Array.from(el.getElementsByTagNameNS(NS.w, tag)).forEach((n) => n.parentNode?.removeChild(n));
  }
  for (const node of [el, ...Array.from(el.getElementsByTagName('*'))]) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.localName === 'paraId' || attr.localName === 'textId') node.removeAttributeNode(attr);
    }
  }
}

export interface DuplicateGroup {
  /** Párrafos consecutivos del bloque. */
  paras: number[];
  /** Cuántas copias añadir detrás del bloque. */
  copies: number;
}

/** Duplica bloques de párrafos (listas que se repiten). Las copias se insertan justo después de cada bloque. */
export async function duplicateParagraphs(fileName: string, bytes: Bytes, groups: DuplicateGroup[]): Promise<Uint8Array> {
  const f = formatOf(fileName);
  if (!f || f.id === 'pdf' || f.id === 'image') throw new Error('repeat.unsupported');
  if (f.id === 'txt') {
    const { paragraphs, bom, eol } = readText(bytes);
    const extra = new Map<number, string[]>();
    for (const g of groups) {
      const block = g.paras.map((i) => paragraphs[i].text);
      extra.set(g.paras[g.paras.length - 1], Array.from({ length: g.copies }, () => block).flat());
    }
    const lines = paragraphs.flatMap((p) => [p.text, ...(extra.get(p.index) ?? [])]);
    return new TextEncoder().encode((bom ? '\uFEFF' : '') + lines.join(eol));
  }
  const spec = SPECS[f.id];
  const parsed = await parseXml(spec, bytes);
  const changed = new Set<string>();
  for (const g of groups) {
    const refs = g.paras.map((i) => parsed.refs[i]);
    if (refs.some((r) => !r) || new Set(refs.map((r) => r.part)).size !== 1) throw new Error('repeat.unsupported');
    let anchor: Element = refs[refs.length - 1].el;
    for (let k = 0; k < g.copies; k++) {
      for (const ref of refs) {
        const clone = ref.el.cloneNode(true) as Element;
        if (f.id === 'docx') cleanClone(clone);
        anchor.parentNode!.insertBefore(clone, anchor.nextSibling);
        anchor = clone;
      }
    }
    changed.add(refs[0].part);
  }
  return saveXml(spec, parsed, changed);
}

// ---------------------------------------------------------------- Texto plano (.txt, .md)

function readText(bytes: Bytes) {
  const raw = new TextDecoder('utf-8').decode(bytes);
  const bom = raw.startsWith('\uFEFF');
  const text = bom ? raw.slice(1) : raw;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const paragraphs: Paragraph[] = text.split(/\r?\n/).map((line, index) => ({ index, part: 'texto', kind: 'cuerpo', text: line, inTable: false }));
  return { paragraphs, bom, eol };
}

function generateText(bytes: Bytes, reps: Replacement[], opts: GenerateOptions): Uint8Array {
  const { paragraphs, bom, eol } = readText(bytes);
  const byPara = groupByPara(reps);
  const removed = new Set(opts.removeParas ?? []);
  const lines = paragraphs.filter((p) => !removed.has(p.index)).map((p) => applyToString(p.text, byPara.get(p.index) ?? []));
  return new TextEncoder().encode((bom ? '\uFEFF' : '') + lines.join(eol));
}

// ---------------------------------------------------------------- PDF con formulario

// pdf-lib solo se descarga cuando se abre un PDF, para que la app arranque más rápido.
const pdfLib = () => import('pdf-lib');

async function loadPdf(bytes: Bytes): Promise<PDFDocument> {
  const { PDFDocument } = await pdfLib();
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new Error('err.invalidFile');
  }
}

/** Cada campo de texto del formulario es un "párrafo" cuyo texto es su valor actual. */
async function readPdf(bytes: Bytes) {
  const pdf = await loadPdf(bytes);
  const { PDFTextField } = await pdfLib();
  const fields = pdf.getForm().getFields().filter((f): f is TextField => f instanceof PDFTextField);
  if (fields.length === 0) throw new Error('err.pdfNoForm');
  const paragraphs: Paragraph[] = fields.map((f, index) => ({
    index,
    part: 'formulario',
    kind: 'campo',
    text: f.getText() ?? '',
    inTable: false,
    field: f.getName(),
  }));
  return { pdf, fields, paragraphs };
}

async function generatePdf(bytes: Bytes, reps: Replacement[]): Promise<Uint8Array> {
  const { pdf, fields, paragraphs } = await readPdf(bytes);
  for (const [pi, list] of groupByPara(reps)) {
    const field = fields[pi];
    if (!field) continue;
    field.setText(applyToString(paragraphs[pi].text, list));
  }
  pdf.getForm().updateFieldAppearances();
  return pdf.save();
}

// ---------------------------------------------------------------- PDF normales, escaneados e imágenes

/**
 * Un PDF puede ser de tres tipos:
 * - con formulario: se rellenan sus campos;
 * - con texto: se tapa el texto antiguo y se escribe el nuevo encima;
 * - escaneado (solo imagen): primero se reconoce el texto (OCR).
 */
async function readAnyPdf(bytes: Bytes, opts: ReadOptions): Promise<Paragraph[]> {
  const pdf = await loadPdf(bytes);
  const { PDFTextField } = await pdfLib();
  if (pdf.getForm().getFields().some((f) => f instanceof PDFTextField)) return (await readPdf(bytes)).paragraphs;
  const { buildLines, extractPdfItems, linesToParagraphs } = await import('./pdfText');
  let items = await extractPdfItems(bytes);
  if (items.map((i) => i.str).join('').replace(/\s/g, '').length < 15) {
    const { ocrPdf } = await import('./ocr');
    items = await ocrPdf(bytes, opts.onProgress);
  }
  const paragraphs = linesToParagraphs(buildLines(items));
  if (paragraphs.length === 0) throw new Error('err.pdfNoText');
  return paragraphs;
}

async function generateAnyPdf(bytes: Bytes, reps: Replacement[], opts: GenerateOptions): Promise<Uint8Array> {
  if (!opts.paragraphs?.some((p) => p.geo)) return generatePdf(bytes, reps);
  const pdf = await loadPdf(bytes);
  const { overlayPdf } = await import('./pdfText');
  await overlayPdf(pdf, opts.paragraphs, reps, opts.removeParas);
  return pdf.save();
}

function imageMime(fileName: string): string {
  return /\.png$/i.test(fileName) ? 'image/png' : 'image/jpeg';
}

async function readImage(fileName: string, bytes: Bytes, opts: ReadOptions): Promise<Paragraph[]> {
  const { ocrImage } = await import('./ocr');
  const { buildLines, linesToParagraphs } = await import('./pdfText');
  const { items } = await ocrImage(bytes, imageMime(fileName), opts.onProgress);
  const paragraphs = linesToParagraphs(buildLines(items));
  if (paragraphs.length === 0) throw new Error('err.pdfNoText');
  return paragraphs;
}

/** La foto se coloca en una página PDF del mismo tamaño y se escribe encima. */
async function generateImage(fileName: string, bytes: Bytes, reps: Replacement[], opts: GenerateOptions): Promise<Uint8Array> {
  const { PDFDocument } = await pdfLib();
  const { overlayPdf } = await import('./pdfText');
  const { IMAGE_PT_PER_PX } = await import('./ocr');
  const pdf = await PDFDocument.create();
  const img = imageMime(fileName) === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const width = img.width * IMAGE_PT_PER_PX;
  const height = img.height * IMAGE_PT_PER_PX;
  pdf.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
  await overlayPdf(pdf, opts.paragraphs ?? [], reps, opts.removeParas);
  return pdf.save();
}
