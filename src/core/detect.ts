import { CATEGORY_LABELS, type Candidate, type Category, type Occurrence, type Paragraph, type Transform, type Variable } from './types';
import { dateTransform, dateVariants, parseDate } from './dates';
import { linkGender, linkShortNames } from './people';
import { findBlanks, findRuleCandidates, guessFromPlaceholder, isBlankText, prettifyName } from './rules';
import { findCompanyCandidates, findNameCandidates, findRepeated } from './names';
import { matchLearnedRules, type LearnedRule } from './learning';
import { amountKeyword, detectRole } from './context';
import { amountWordVariants, parseAmount } from './numberWords';
import { compactKey, findAll, fold, normalizeKey, overlaps, truncate, uid } from './text';

const ID_CATEGORIES = new Set<Category>(['dni', 'cif', 'iban', 'telefono', 'matricula', 'catastro']);
const ROLE_CATEGORIES = new Set<Category>(['nombre', 'empresa', 'dni', 'cif', 'direccion', 'email', 'telefono']);
/** "la vivienda situada en Calle Mayor…" → es la dirección del inmueble, no el domicilio de una persona. */
const PROPERTY_RE = /\b(?:vivienda|inmueble|finca|local|piso|nave|parcela|plaza de garaje)\b[^.]{0,30}\b(?:situad[oa]s?|ubicad[oa]s?|sit[oa]s?)\s+en\s*$/;

export interface DetectOptions {
  learned?: LearnedRule[];
  /** Valores que el usuario marcó como "no es un dato". */
  ignored?: string[];
}

interface Group {
  v: Variable;
  priority: number;
  base?: string;
  fixed: boolean;
}

export function byPosition(a: { para: number; start: number }, b: { para: number; start: number }): number {
  return a.para - b.para || a.start - b.start;
}

/** Analiza el documento y devuelve los datos encontrados, cada uno con todas sus apariciones. */
export function detectVariables(paragraphs: Paragraph[], opts: DetectOptions = {}): Variable[] {
  const ignored = new Set((opts.ignored ?? []).map(normalizeKey));
  const cands: Candidate[] = [];
  for (const p of paragraphs) {
    if (p.field !== undefined && !p.text.trim()) {
      // Campo vacío de un PDF con formulario: es un hueco con el nombre del campo.
      cands.push({
        para: p.index,
        start: 0,
        end: 0,
        text: '',
        category: guessFromPlaceholder(p.field),
        source: 'hueco',
        priority: 90,
        confidence: 0.9,
        base: prettifyName(p.field),
        key: `field:${p.index}`,
      });
      continue;
    }
    if (!p.text.trim()) continue;
    cands.push(...matchLearnedRules(p, opts.learned ?? []));
    cands.push(...findBlanks(p));
    cands.push(...findRuleCandidates(p));
    cands.push(...findCompanyCandidates(p));
    cands.push(...findNameCandidates(p));
  }
  cands.push(...findRepeated(paragraphs));

  const allowed = cands.filter((c) => c.source === 'aprendido' || !ignored.has(normalizeKey(c.text)));
  const groups = group(resolveOverlaps(allowed));
  const claims = new Claims(groups.map((g) => g.v));
  expand(groups, paragraphs, claims);
  groups.forEach((g) => g.v.occurrences.sort(byPosition));
  assignLabels(groups, paragraphs);
  linkPeople(groups, paragraphs, claims);
  groups.forEach((g) => g.v.occurrences.sort(byPosition));
  return groups.map((g) => g.v);
}

function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = [...cands].sort(
    (a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || byPosition(a, b),
  );
  const taken = new Map<number, Candidate[]>();
  const out: Candidate[] = [];
  for (const c of sorted) {
    const list = taken.get(c.para) ?? [];
    if (list.some((o) => overlaps(o, c))) continue;
    list.push(c);
    taken.set(c.para, list);
    out.push(c);
  }
  return out.sort(byPosition);
}

function keyFor(c: Candidate): string {
  if (c.key) return c.key;
  if (isBlankText(c.text)) {
    return c.source === 'aprendido' && c.label ? `learned:${normalizeKey(c.label)}` : `blank:${c.para}:${c.start}`;
  }
  if (c.category === 'fecha') {
    // "15/03/2024" y "15 de marzo de 2024" son la misma fecha: un solo dato.
    const d = parseDate(c.text);
    if (d) return `date:${d.y}-${d.m}-${d.d}`;
  }
  return ID_CATEGORIES.has(c.category) ? `id:${compactKey(c.text)}` : `t:${normalizeKey(c.text)}`;
}

function group(cands: Candidate[]): Group[] {
  const map = new Map<string, Group>();
  for (const c of cands) {
    const k = keyFor(c);
    const occ: Occurrence = { para: c.para, start: c.start, end: c.end, text: c.text };
    const g = map.get(k);
    if (!g) {
      const fixed = c.source === 'aprendido' && !!c.label;
      map.set(k, {
        v: {
          id: uid(),
          label: fixed ? c.label! : '',
          category: c.category,
          original: c.text,
          source: c.source,
          confidence: c.confidence,
          occurrences: [occ],
          value: '',
        },
        priority: c.priority,
        base: c.base,
        fixed,
      });
      continue;
    }
    g.v.occurrences.push(occ);
    g.v.confidence = Math.max(g.v.confidence, c.confidence);
    if (c.priority > g.priority) {
      g.priority = c.priority;
      g.v.category = c.category;
      g.v.source = c.source;
      if (c.source === 'aprendido' && c.label) {
        g.v.label = c.label;
        g.fixed = true;
      } else if (c.base) g.base = c.base;
    }
  }
  return [...map.values()];
}

/**
 * Texto alrededor de un párrafo para deducir papeles ("en adelante la ARRENDATARIA").
 * En PDF y fotos cada línea es un párrafo y las frases quedan cortadas, así que se juntan las líneas vecinas.
 */
function contextOf(paragraphs: Paragraph[], para: number): { text: string; offset: number } {
  const p = paragraphs[para];
  if (!p.geo) return { text: p.text, offset: 0 };
  const samePage = (q?: Paragraph) => q?.geo && q.geo.page === p.geo!.page;
  const prev = samePage(paragraphs[para - 1]) ? paragraphs[para - 1].text + ' ' : '';
  const next = [paragraphs[para + 1], paragraphs[para + 2]].filter(samePage).map((q) => q!.text);
  return { text: [prev + p.text, ...next].join(' '), offset: prev.length };
}

/** Registro de los trozos de texto ya asignados a algún dato, para no asignarlos dos veces. */
export class Claims {
  private map = new Map<number, { start: number; end: number }[]>();
  constructor(vars: Variable[] = []) {
    vars.forEach((v) => v.occurrences.forEach((o) => this.claim(o)));
  }
  claim = (o: { para: number; start: number; end: number }) => {
    const l = this.map.get(o.para) ?? [];
    l.push(o);
    this.map.set(o.para, l);
  };
  free = (para: number, start: number, end: number) =>
    !(this.map.get(para) ?? []).some((o) => (start === end ? o.start < start && start < o.end : o.start < end && start < o.end));
}

/** Palabras que forman parte de un número escrito en letras. */
const NUMBER_WORDS = new Set(
  `cero un uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete
  dieciocho diecinueve veinte veintiun veintiuno veintidos veintitres veinticuatro veinticinco veintiseis veintisiete
  veintiocho veintinueve treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento doscientos trescientos
  cuatrocientos quinientos seiscientos setecientos ochocientos novecientos mil millon millones y`.split(/\s+/),
);

/**
 * Un importe en letras solo cuenta si está completo: "mil" (1.000) no debe encontrarse dentro de
 * "MIL NOVECIENTOS" (1.900), ni "doscientos diez" (210) dentro de "MIL DOSCIENTOS DIEZ" (1.210).
 */
function wholeAmountWords(text: string, start: number, end: number): boolean {
  const before = fold(text.slice(0, start)).match(/([a-z]+)\s*$/)?.[1];
  const after = fold(text.slice(end)).match(/^\s*([a-z]+)/)?.[1];
  return !(before && NUMBER_WORDS.has(before)) && !(after && NUMBER_WORDS.has(after));
}

function addFound(
  v: Variable,
  paragraphs: Paragraph[],
  needle: string,
  claims: Claims,
  transform?: Transform,
  accept?: (text: string, start: number, end: number) => boolean,
): void {
  for (const p of paragraphs) {
    for (const pos of findAll(p.text, needle)) {
      const end = pos + needle.length;
      if (!claims.free(p.index, pos, end)) continue;
      if (accept && !accept(p.text, pos, end)) continue;
      const o: Occurrence = { para: p.index, start: pos, end, text: p.text.slice(pos, end), ...(transform ? { transform } : {}) };
      v.occurrences.push(o);
      claims.claim(o);
    }
  }
}

/**
 * Busca cada valor en todo el documento (también en tablas, encabezados y pies),
 * los importes escritos en letras y la misma fecha escrita de otras formas.
 */
function expand(groups: Group[], paragraphs: Paragraph[], claims: Claims): void {
  const ordered = [...groups].sort((a, b) => b.v.original.length - a.v.original.length);
  for (const { v } of ordered) {
    const needle = v.original.trim();
    if (isBlankText(needle) || needle.length < 2) continue;
    // La localidad de firma no se busca en todo el texto: "Madrid" también puede ser parte de un domicilio.
    if (v.category === 'localidad') continue;
    addFound(v, paragraphs, needle, claims);
  }

  for (const { v } of ordered) {
    if (v.category === 'importe') {
      const n = parseAmount(v.original);
      if (n == null || n < 1) continue;
      for (const variant of amountWordVariants(Math.floor(n))) addFound(v, paragraphs, variant.words, claims, variant.transform, wholeAmountWords);
    }
    if (v.category === 'fecha') {
      const date = parseDate(v.original);
      if (!date) continue;
      for (const variant of dateVariants(date)) addFound(v, paragraphs, variant, claims);
      // Cada aparición recuerda su formato para escribir la fecha nueva igual.
      v.occurrences = v.occurrences.map((o) => ({ ...o, transform: dateTransform(o.text) }));
    }
  }
}

/** Formas cortas de los nombres ("Sr. Martínez", "Carlos") y palabras que cambian con el género. */
function linkPeople(groups: Group[], paragraphs: Paragraph[], claims: Claims): void {
  const people = groups.filter((g) => g.v.category === 'nombre' && g.v.source !== 'hueco' && g.v.source !== 'repetido');
  for (const { v } of people) linkShortNames(v, paragraphs, claims.free, claims.claim);
  for (const { v } of people) linkGender(v, paragraphs, claims.free, claims.claim);
}

function assignLabels(groups: Group[], paragraphs: Paragraph[]): void {
  for (const g of groups) {
    const v = g.v;
    if (g.fixed) continue;
    let base = g.base ?? (v.source === 'repetido' ? truncate(v.original, 40) : CATEGORY_LABELS[v.category]);
    // En un PDF con formulario, si el dato ocupa todo el campo, el nombre del campo es la mejor etiqueta.
    const whole = v.occurrences.find((o) => paragraphs[o.para].field && paragraphs[o.para].text.trim() === o.text);
    if (whole && !g.base) {
      v.label = prettifyName(paragraphs[whole.para].field!);
      continue;
    }
    if (v.category === 'importe' && !g.base) {
      for (const o of v.occurrences) {
        if (o.transform) continue;
        const ctx = contextOf(paragraphs, o.para);
        const kw = amountKeyword(ctx.text, o.start + ctx.offset);
        if (kw) {
          base = `${CATEGORY_LABELS.importe} (${kw})`;
          break;
        }
      }
    }
    let role: string | null = null;
    const first = v.occurrences[0];
    if (v.category === 'direccion' && !g.base && PROPERTY_RE.test(fold(paragraphs[first.para].text.slice(Math.max(0, first.start - 60), first.start)))) {
      v.label = 'Dirección del inmueble';
      continue;
    }
    if (ROLE_CATEGORIES.has(v.category) || v.source === 'hueco') {
      for (const o of v.occurrences) {
        const ctx = contextOf(paragraphs, o.para);
        role = detectRole(ctx.text, o.start + ctx.offset, o.end + ctx.offset);
        if (role) break;
      }
    }
    v.label = role ? `${base} (${role})` : base;
  }

  groups.sort((a, b) => byPosition(a.v.occurrences[0], b.v.occurrences[0]));
  const seen = new Map<string, number>();
  for (const { v } of groups) {
    const k = normalizeKey(v.label);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) v.label = `${v.label} ${n}`;
  }
}
