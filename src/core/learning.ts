import type { Candidate, Category, Paragraph } from './types';
import { NAME_SEQ, escapeRegExp, findAll, uid } from './text';
import { isBlankText } from './rules';

/** Forma del dato aprendido: decide cuánto texto se captura detrás del contexto. */
export type Shape = 'palabras' | 'numero' | 'codigo' | 'libre';

/**
 * Regla aprendida de lo que marca el usuario.
 * Guarda el texto que va delante (prefix) y detrás (suffix) del dato para reconocerlo en documentos futuros,
 * y los valores de ejemplo para encontrarlos tal cual.
 */
export interface LearnedRule {
  id: string;
  label: string;
  category: Category;
  prefix: string;
  suffix: string;
  shape: Shape;
  examples: string[];
  createdAt: number;
}

export function inferShape(value: string): Shape {
  const t = value.trim();
  if (isBlankText(t)) return 'libre';
  if (/^[\d.,\s]+$/.test(t)) return 'numero';
  if (/^[A-Za-z0-9\-/.]+$/.test(t) && /\d/.test(t)) return 'codigo';
  if (new RegExp(`^${NAME_SEQ}$`).test(t)) return 'palabras';
  return 'libre';
}

export function createRule(text: string, start: number, end: number, label: string, category: Category): LearnedRule {
  const value = text.slice(start, end).trim();
  const pm = text.slice(Math.max(0, start - 60), start).match(/(?:\S+[ \t ]*){1,3}$/);
  const sm = text.slice(end).match(/^[ \t ]*([^\s\p{L}\p{N}]|[\p{L}\p{N}]+)/u);
  return {
    id: uid(),
    label,
    category,
    prefix: pm ? pm[0].trim().slice(-40) : '',
    suffix: sm ? sm[1] : '',
    shape: inferShape(value),
    examples: isBlankText(value) ? [] : [value],
    createdAt: Date.now(),
  };
}

function flexible(s: string): string {
  return escapeRegExp(s).replace(/\s+/g, '\\s+');
}

function capture(text: string, pos: number, rule: LearnedRule): string | null {
  let value: string | null = null;
  const sticky = (src: string, flags = 'y') => {
    const re = new RegExp(src, flags);
    re.lastIndex = pos;
    return re.exec(text)?.[0] ?? null;
  };
  switch (rule.shape) {
    case 'numero':
      value = sticky('\\d[\\d.,]*')?.replace(/[.,]+$/, '') ?? null;
      break;
    case 'codigo':
      value = sticky('[A-Za-z0-9][A-Za-z0-9\\-/.]*')?.replace(/\.+$/, '') ?? null;
      break;
    case 'palabras':
      value = sticky(NAME_SEQ, 'yu');
      break;
    case 'libre': {
      const rest = text.slice(pos, pos + 120);
      const stop = rule.suffix ? rest.indexOf(rule.suffix) : -1;
      value = stop > 0 ? rest.slice(0, stop) : (rest.match(/^[^,;\n]+/)?.[0] ?? null);
      break;
    }
  }
  const v = value?.trim();
  return v && v.length <= 120 ? v : null;
}

export function matchLearnedRules(p: Paragraph, rules: LearnedRule[]): Candidate[] {
  const out: Candidate[] = [];
  const add = (start: number, text: string, rule: LearnedRule) =>
    out.push({
      para: p.index,
      start,
      end: start + text.length,
      text,
      category: rule.category,
      source: 'aprendido',
      priority: 100,
      confidence: 0.95,
      label: rule.label,
    });

  for (const rule of rules) {
    for (const ex of rule.examples) for (const pos of findAll(p.text, ex)) add(pos, p.text.slice(pos, pos + ex.trim().length), rule);

    if (!rule.prefix) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${flexible(rule.prefix)}[ \\t\\u00A0]*`, 'giu');
    let m: RegExpExecArray | null;
    while ((m = re.exec(p.text))) {
      const pos = m.index + m[0].length;
      const value = capture(p.text, pos, rule);
      if (value) add(pos, value, rule);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  return out;
}
