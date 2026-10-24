import type { Paragraph, Variable } from './types';
import { byPosition } from './detect';
import { normalizeKey } from './text';

/**
 * El asistente pide los datos poco a poco, en grupos que tengan sentido para el usuario:
 * cada persona o empresa (según su papel), el inmueble, los importes, la fecha y el lugar…
 */

export type StepKind = 'intro' | 'group' | 'suggestions' | 'options' | 'review';

export interface Step {
  id: string;
  kind: StepKind;
  /** Título ya escrito (papeles: "Arrendataria") o clave de traducción (grupos fijos: "steps.amounts"). */
  title: string;
  translate: boolean;
  varIds: string[];
}

/** Papel que lleva el nombre del dato: "Nombre (Arrendataria)" → "Arrendataria". */
export function roleOfLabel(label: string): string | null {
  return label.match(/\(([^)]+)\)(?:\s+\d+)?$/)?.[1]?.trim() ?? null;
}

const SUGGESTION = 0.5;

function groupOf(v: Variable): { key: string; title: string; translate: boolean } {
  if (v.confidence < SUGGESTION) return { key: 'suggestions', title: 'steps.suggestions', translate: true };
  if (v.category === 'fecha' || v.category === 'localidad') return { key: 'dates', title: 'steps.dates', translate: true };
  if (v.category === 'importe') return { key: 'amounts', title: 'steps.amounts', translate: true };
  if (v.category === 'catastro' || v.category === 'matricula' || /inmueble/i.test(v.label)) {
    return { key: 'property', title: 'steps.property', translate: true };
  }
  const role = roleOfLabel(v.label);
  if (role && v.category !== 'texto') return { key: `role:${normalizeKey(role)}`, title: role, translate: false };
  if (v.source === 'hueco') return { key: 'blanks', title: 'steps.blanks', translate: true };
  return { key: 'other', title: 'steps.other', translate: true };
}

export function buildSteps(vars: Variable[]): Step[] {
  const groups = new Map<string, { step: Step; first: { para: number; start: number } }>();
  for (const v of vars) {
    const g = groupOf(v);
    const first = [...v.occurrences].sort(byPosition)[0] ?? { para: Number.MAX_SAFE_INTEGER, start: 0 };
    const existing = groups.get(g.key);
    if (existing) {
      existing.step.varIds.push(v.id);
      if (byPosition(first, existing.first) < 0) existing.first = first;
    } else {
      groups.set(g.key, { step: { id: g.key, kind: g.key === 'suggestions' ? 'suggestions' : 'group', title: g.title, translate: g.translate, varIds: [v.id] }, first });
    }
  }
  // Orden del documento, pero "otros datos" y las sugerencias siempre al final.
  const late: Record<string, number> = { other: 1, suggestions: 2 };
  const ordered = [...groups.values()].sort((a, b) => (late[a.step.id] ?? 0) - (late[b.step.id] ?? 0) || byPosition(a.first, b.first));
  return [
    { id: 'intro', kind: 'intro', title: 'steps.intro', translate: true, varIds: [] },
    ...ordered.map((g) => g.step),
    { id: 'options', kind: 'options', title: 'steps.options', translate: true, varIds: [] },
    { id: 'review', kind: 'review', title: 'steps.review', translate: true, varIds: [] },
  ];
}

/** Paso en el que está un dato. */
export function stepOfVar(steps: Step[], varId: string): Step | undefined {
  return steps.find((s) => s.varIds.includes(varId));
}

/** Para los papeles detectados en el texto se puede mostrar el párrafo de la persona como ayuda. */
export function firstParagraphOf(step: Step, vars: Variable[], paragraphs: Paragraph[]): Paragraph | undefined {
  const occ = vars
    .filter((v) => step.varIds.includes(v.id))
    .flatMap((v) => v.occurrences)
    .sort(byPosition)[0];
  return occ ? paragraphs[occ.para] : undefined;
}
