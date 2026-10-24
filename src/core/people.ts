import type { Gender, Occurrence, Paragraph, Transform, Variable } from './types';
import { isFirstName } from './names';
import { applyCase, findAll, fold } from './text';

// ---------------------------------------------------------------- Formas cortas del nombre

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'da', 'do', 'dos', 'das', 'van', 'von', 'di']);

export interface NameParts {
  first: string;
  surnames: string;
  firstSurname: string;
}

/** "María José García de la Fuente" → nombre "María José", apellidos "García de la Fuente", primer apellido "García". */
export function splitName(full: string): NameParts | null {
  const words = full.trim().split(/\s+/);
  const real = words.filter((w) => !PARTICLES.has(fold(w)));
  if (real.length < 2) return null;
  let firstCount = 1;
  if (real.length >= 3 && isFirstName(words[1])) firstCount = 2;
  const first = words.slice(0, firstCount).join(' ');
  const rest = words.slice(firstCount);
  // El primer apellido incluye sus partículas: "de la Fuente".
  let i = 0;
  while (i < rest.length - 1 && PARTICLES.has(fold(rest[i]))) i++;
  return { first, surnames: rest.join(' '), firstSurname: rest.slice(0, i + 1).join(' ') };
}

export function namePart(full: string, t: Transform): string | null {
  const p = splitName(full);
  if (!p) return null;
  if (t === 'nombre-pila') return p.first;
  if (t === 'apellidos') return p.surnames;
  if (t === 'apellido1') return p.firstSurname;
  return null;
}

export type Claim = (para: number, start: number, end: number) => boolean;

/** Busca "Martínez Ruiz", "Sr. Martínez" o "Carlos" sueltos y los enlaza al nombre completo. */
export function linkShortNames(v: Variable, paragraphs: Paragraph[], free: Claim, claim: (o: Occurrence) => void): void {
  const parts = splitName(v.original);
  if (!parts) return;
  const forms: [string, Transform][] = [
    [parts.surnames, 'apellidos'],
    [parts.firstSurname, 'apellido1'],
    [parts.first, 'nombre-pila'],
  ];
  const seen = new Set<string>();
  for (const [text, transform] of forms) {
    const key = fold(text);
    if (seen.has(key) || text.length < 3) continue;
    seen.add(key);
    for (const p of paragraphs) {
      for (const pos of findAll(p.text, text)) {
        const end = pos + text.length;
        // Un nombre de pila suelto solo cuenta si no va seguido de otra palabra en mayúscula (sería otra persona).
        if (transform === 'nombre-pila' && /^\s+\p{Lu}/u.test(p.text.slice(end))) continue;
        if (!free(p.index, pos, end)) continue;
        const o: Occurrence = { para: p.index, start: pos, end, text: p.text.slice(pos, end), transform };
        v.occurrences.push(o);
        claim(o);
      }
    }
  }
}

// ---------------------------------------------------------------- Género

/** Pares masculino/femenino de los papeles habituales en contratos. */
const ROLE_PAIRS: [string, string][] = [
  ['arrendador', 'arrendadora'], ['arrendatario', 'arrendataria'], ['fiador', 'fiadora'], ['comprador', 'compradora'],
  ['vendedor', 'vendedora'], ['propietario', 'propietaria'], ['inquilino', 'inquilina'], ['trabajador', 'trabajadora'],
  ['empleador', 'empleadora'], ['prestador', 'prestadora'], ['prestatario', 'prestataria'], ['cesionario', 'cesionaria'],
  ['apoderado', 'apoderada'], ['mandatario', 'mandataria'], ['donatario', 'donataria'], ['heredero', 'heredera'],
  ['socio', 'socia'], ['administrador', 'administradora'], ['deudor', 'deudora'], ['acreedor', 'acreedora'],
  ['interesado', 'interesada'], ['alumno', 'alumna'], ['tutor', 'tutora'], ['contratista', 'contratista'],
];

/** Adjetivos que acompañan a la persona en su presentación ("vecino de Madrid", "provisto de DNI"). */
const ADJ_PAIRS: [string, string][] = [
  ['vecino', 'vecina'], ['provisto', 'provista'], ['nacido', 'nacida'], ['domiciliado', 'domiciliada'],
  ['casado', 'casada'], ['soltero', 'soltera'], ['divorciado', 'divorciada'], ['viudo', 'viuda'],
  ['jubilado', 'jubilada'], ['empleado', 'empleada'], ['separado', 'separada'],
];

const TITLES: [RegExp, Record<Gender, string>][] = [
  [/(?:^|[^\p{L}])(Doña|Don)\s*$/u, { m: 'Don', f: 'Doña' }],
  [/(?:^|[^\p{L}])(DOÑA|DON)\s*$/u, { m: 'DON', f: 'DOÑA' }],
  [/(?:^|[^\p{L}])(Dña\.|Dª|D\.ª|D\.)\s*$/u, { m: 'D.', f: 'Dña.' }],
  [/(?:^|[^\p{L}])(Sra\.|Sr\.)\s*$/u, { m: 'Sr.', f: 'Sra.' }],
];

const ARTICLES: [RegExp, Record<Gender, string>][] = [
  [/(?:^|[^\p{L}])(de la|del)\s+$/iu, { m: 'del', f: 'de la' }],
  [/(?:^|[^\p{L}])(a la|al)\s+$/iu, { m: 'al', f: 'a la' }],
  [/(?:^|[^\p{L}])(el|la)\s+$/iu, { m: 'el', f: 'la' }],
];

function roleOf(label: string): [string, string] | null {
  const m = fold(label).match(/\(([^)]+)\)/);
  if (!m) return null;
  return ROLE_PAIRS.find(([a, b]) => a !== b && (a === m[1].trim() || b === m[1].trim())) ?? null;
}

/**
 * Prepara el cambio de género de una persona: tratamiento (D./Dña.), su papel con el artículo
 * ("el ARRENDATARIO" ↔ "la ARRENDATARIA") y los adjetivos de su presentación.
 */
export function linkGender(v: Variable, paragraphs: Paragraph[], free: Claim, claim: (o: Occurrence) => void): void {
  if (v.category !== 'nombre') return;
  const add = (para: number, start: number, end: number, alt: Record<Gender, string>) => {
    if (!free(para, start, end)) return;
    const o: Occurrence = { para, start, end, text: paragraphs[para].text.slice(start, end), transform: 'genero', alt };
    v.occurrences.push(o);
    claim(o);
  };
  let gender: Gender | undefined;

  // 1) Tratamiento delante del nombre y adjetivos de la presentación.
  for (const o of v.occurrences.filter((x) => !x.transform)) {
    const text = paragraphs[o.para].text;
    const before = text.slice(0, o.start);
    for (const [re, alt] of TITLES) {
      const m = before.match(re);
      if (!m) continue;
      const start = before.length - m[0].length + m[0].indexOf(m[1]);
      gender ??= fold(m[1]) === fold(alt.f) || /^(dª|d\.ª)$/i.test(m[1]) ? 'f' : 'm';
      add(o.para, start, start + m[1].length, alt);
      break;
    }
    const after = text.slice(o.end, o.end + 200);
    const stop = after.search(/en\s+adelante|;/i);
    const window = stop >= 0 ? after.slice(0, stop) : after;
    for (const [mw, fw] of ADJ_PAIRS) {
      const re = new RegExp(`(?<![\\p{L}])(${mw}|${fw})(?![\\p{L}])`, 'giu');
      let m: RegExpExecArray | null;
      while ((m = re.exec(window))) add(o.para, o.end + m.index, o.end + m.index + m[0].length, { m: mw, f: fw });
    }
  }

  // 2) Su papel en todo el documento, con el artículo de delante.
  const pair = roleOf(v.label);
  if (pair) {
    const [mw, fw] = pair;
    for (const p of paragraphs) {
      const re = new RegExp(`(?<![\\p{L}])(${mw}|${fw})(?![\\p{L}])`, 'giu');
      let m: RegExpExecArray | null;
      while ((m = re.exec(p.text))) {
        gender ??= fold(m[1]) === fw ? 'f' : 'm';
        const before = p.text.slice(0, m.index);
        for (const [are, alt] of ARTICLES) {
          const am = before.match(are);
          if (!am) continue;
          const start = before.length - am[0].length + am[0].indexOf(am[1]);
          add(p.index, start, start + am[1].length, alt);
          break;
        }
        add(p.index, m.index, m.index + m[1].length, { m: mw, f: fw });
      }
    }
  }

  if (gender && v.occurrences.some((o) => o.transform === 'genero')) {
    v.originalGender = gender;
    v.gender = gender;
  } else {
    v.occurrences = v.occurrences.filter((o) => o.transform !== 'genero');
  }
}

export function genderText(o: Occurrence, g: Gender): string {
  return o.alt ? applyCase(o.text, o.alt[g]) : o.text;
}
