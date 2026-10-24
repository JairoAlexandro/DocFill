import { CATEGORY_LABELS, type Candidate, type Category, type Paragraph } from './types';
import { LETTERS, UPPER, capitalize, fold, normalizeKey } from './text';
import { clean, isValidIban, isValidPhone } from './validate';

export interface BuiltinRule {
  id: string;
  name: string;
  description: string;
  category: Category;
  regex: RegExp;
  priority: number;
  confidence: number;
  accept?: (match: string) => boolean;
}

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const MONEY_AFTER = '(?=\\s?(?:€|euros?\\b|EUR\\b))';

/** Reglas fijas: datos con una forma reconocible. Prioridad alta = gana si se solapan. */
export const BUILTIN_RULES: BuiltinRule[] = [
  {
    id: 'iban',
    name: 'IBAN',
    description: 'Cuentas bancarias (ES91 2100 0418 …)',
    category: 'iban',
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){4,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g,
    priority: 85,
    confidence: 0.95,
    accept: (m) => isValidIban(m) || /^ES\d{22}$/.test(clean(m)),
  },
  {
    id: 'catastro',
    name: 'Referencia catastral',
    description: '20 caracteres (9872023VH5797S0001WX)',
    category: 'catastro',
    regex: /\b\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2}\b/g,
    priority: 85,
    confidence: 0.95,
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Direcciones de correo',
    category: 'email',
    regex: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
    priority: 85,
    confidence: 0.95,
  },
  {
    id: 'nie',
    name: 'NIE',
    description: 'X1234567L',
    category: 'dni',
    regex: /\b[XYZ][ -]?\d{7}[ -]?[A-Z]\b/g,
    priority: 80,
    confidence: 0.95,
  },
  {
    id: 'dni',
    name: 'DNI',
    description: '12345678Z o 12.345.678-Z',
    category: 'dni',
    regex: /\b\d{1,2}\.?\d{3}\.?\d{3}[ -]?[A-Z]\b/g,
    priority: 80,
    confidence: 0.95,
    accept: (m) => clean(m).length >= 8,
  },
  {
    id: 'cif',
    name: 'CIF',
    description: 'B12345678',
    category: 'cif',
    regex: /\b[ABCDEFGHJNPQRSUVW][ -]?\d{7}[ -]?[0-9A-J]\b/g,
    priority: 80,
    confidence: 0.9,
  },
  {
    id: 'fecha-larga',
    name: 'Fecha en texto',
    description: '15 de marzo de 2024',
    category: 'fecha',
    regex: new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MONTHS})\\s+(?:de|del)\\s+\\d{4}\\b`, 'gi'),
    priority: 75,
    confidence: 0.9,
  },
  {
    id: 'fecha',
    name: 'Fecha',
    description: '15/03/2024',
    category: 'fecha',
    regex: /\b\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})\b/g,
    priority: 75,
    confidence: 0.9,
  },
  {
    id: 'importe',
    name: 'Importe',
    description: 'Cifras seguidas de € o euros (1.200 €)',
    category: 'importe',
    regex: new RegExp(`(?<![\\d.,])\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?${MONEY_AFTER}|(?<![\\d.,])\\d+(?:,\\d{1,2})?${MONEY_AFTER}`, 'gi'),
    priority: 70,
    confidence: 0.9,
  },
  {
    id: 'matricula',
    name: 'Matrícula',
    description: '1234 BCD',
    category: 'matricula',
    regex: /\b\d{4}[ -]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/g,
    priority: 70,
    confidence: 0.85,
  },
  {
    id: 'cp',
    name: 'Código postal',
    description: 'Detrás de "C.P." o "código postal"',
    category: 'codigo_postal',
    regex: /(?<=\b(?:C\.\s?P\.|CP|código postal)\s?:?\s?)\d{5}\b/gi,
    priority: 70,
    confidence: 0.85,
  },
  {
    id: 'localidad',
    name: 'Localidad de firma',
    description: 'En Madrid, a 15 de marzo…',
    category: 'localidad',
    regex: new RegExp(
      `(?<=\\b[Ee]n\\s+)[${UPPER}][${LETTERS}]+(?:\\s+(?:de\\s+|del\\s+|la\\s+)?[${UPPER}][${LETTERS}]+){0,3}(?=,?\\s+a\\s+\\d{1,2}\\s+de\\s)`,
      'g',
    ),
    priority: 60,
    confidence: 0.85,
  },
  {
    id: 'telefono',
    name: 'Teléfono',
    description: '600 123 456 o +34 912 345 678',
    category: 'telefono',
    regex: /(?:\+34[ .]?)?(?<!\d)[6789]\d{2}(?:[ .]?\d{2,3}){2,3}(?!\d)/g,
    priority: 65,
    confidence: 0.85,
    accept: isValidPhone,
  },
  {
    id: 'direccion',
    name: 'Dirección',
    description: 'Calle, Avda., Plaza… con número',
    category: 'direccion',
    regex: new RegExp(
      `(?<![${LETTERS}])(?:C\\/|Calle|Avda\\.?|Avenida|Plaza|Pza\\.?|Paseo|Camino|Carretera|Ctra\\.?|Travesía|Ronda|Glorieta|Urbanización|Urb\\.)\\s*[^,;\\n]{2,50}?,?\\s*(?:n[º°o]\\.?\\s*|número\\s*)?\\d+[A-Za-z]?\\b(?:,?\\s*\\d{1,2}\\s*[º°ª](?:\\s*-?\\s*[A-Z]\\b)?)?`,
      'g',
    ),
    priority: 45,
    confidence: 0.75,
  },
];

export function findRuleCandidates(p: Paragraph): Candidate[] {
  const out: Candidate[] = [];
  for (const rule of BUILTIN_RULES) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(p.text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const text = m[0].trim();
      if (!text || (rule.accept && !rule.accept(text))) continue;
      const start = m.index + m[0].indexOf(text);
      out.push({
        para: p.index,
        start,
        end: start + text.length,
        text,
        category: rule.category,
        source: 'regla',
        priority: rule.priority,
        confidence: rule.confidence,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Huecos en blanco

const BLANK_RE = /_{3,}|\.{5,}|…{2,}|\[[^[\]\n]{1,40}\]|\{\{\s*[^{}\n]{1,40}?\s*\}\}|<<[^<>\n]{1,40}>>/g;

/** Huecos sin rellenar: "_____", "........". */
export function isBlankText(s: string): boolean {
  return /^(?:_{3,}|\.{5,}|…{2,})$/.test(s.trim());
}

/** Adivina qué dato va en un hueco mirando las palabras que tiene delante. */
export function guessFromContext(before: string): { category: Category; base: string } {
  const tail = fold(before.slice(-40));
  const end = (re: string) => new RegExp(`(?:^|[\\s(,;:])(?:${re})\\s*:?\\s*$`).test(tail);
  if (end('d\\.?n\\.?i\\.?|n\\.?i\\.?f\\.?|n\\.?i\\.?e\\.?|documento(?: n[ºo°]\\.?)?|pasaporte')) return { category: 'dni', base: CATEGORY_LABELS.dni };
  if (end('c\\.?i\\.?f\\.?')) return { category: 'cif', base: CATEGORY_LABELS.cif };
  if (end('(?:d\\.?\\s*\\/\\s*)?dn?a\\.?|d\\.|don|dona|sr\\.?|sra\\.?|nombre(?: y apellidos)?|apellidos'))
    return { category: 'nombre', base: CATEGORY_LABELS.nombre };
  if (end('domicilio(?: en)?|direccion|calle|c\\/|vecin[oa] de')) return { category: 'direccion', base: 'Domicilio' };
  if (end('fecha|el dia')) return { category: 'fecha', base: CATEGORY_LABELS.fecha };
  if (end('euros|importe|cantidad|precio|renta|suma de')) return { category: 'importe', base: CATEGORY_LABELS.importe };
  if (end('telefono|tlf\\.?|tel\\.?|movil')) return { category: 'telefono', base: CATEGORY_LABELS.telefono };
  if (end('email|e-mail|correo(?: electronico)?')) return { category: 'email', base: CATEGORY_LABELS.email };
  if (end('iban|cuenta(?: bancaria)?')) return { category: 'iban', base: CATEGORY_LABELS.iban };
  if (end('en|localidad|municipio|ciudad|provincia')) return { category: 'localidad', base: CATEGORY_LABELS.localidad };
  return { category: 'texto', base: 'Hueco' };
}

export function guessFromPlaceholder(inner: string): Category {
  const f = fold(inner);
  if (/dni|nie|nif/.test(f)) return 'dni';
  if (/cif/.test(f)) return 'cif';
  if (/iban|cuenta/.test(f)) return 'iban';
  if (/mail|correo/.test(f)) return 'email';
  if (/telefono|movil/.test(f)) return 'telefono';
  if (/fecha/.test(f)) return 'fecha';
  if (/importe|precio|renta|euros|cantidad|fianza/.test(f)) return 'importe';
  if (/domicilio|direccion|calle/.test(f)) return 'direccion';
  if (/nombre|apellido/.test(f)) return 'nombre';
  return 'texto';
}

/** "NOMBRE_ARRENDATARIO" o "nombreArrendatario" → "Nombre arrendatario". */
export function prettifyName(raw: string): string {
  const spaced = raw.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return capitalize(spaced.toLowerCase());
}

export function findBlanks(p: Paragraph): Candidate[] {
  const out: Candidate[] = [];
  const re = new RegExp(BLANK_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(p.text))) {
    const text = m[0];
    const start = m.index;
    const base = { para: p.index, start, end: start + text.length, text, source: 'hueco' as const, priority: 90 };
    if (isBlankText(text)) {
      const g = guessFromContext(p.text.slice(0, start));
      out.push({ ...base, category: g.category, base: g.base, confidence: 0.9 });
    } else {
      // Marcadores tipo [NOMBRE], {{nombre}} o <<nombre>>: se agrupan por su texto.
      const inner = text.replace(/^[[{<]+\s*|\s*[\]}>]+$/g, '');
      const pretty = prettifyName(inner);
      out.push({ ...base, category: guessFromPlaceholder(inner), base: pretty, confidence: 0.95, key: `ph:${normalizeKey(inner)}` });
    }
  }
  return out;
}
