import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Occurrence, OptionalClause, Paragraph, RepeatBlock, Selection, Variable } from '../core/types';
import type { ReviewIssue } from '../core/review';
import { copyText, joinedText, listOfVars } from '../core/repeat';
import { displayValue, willReplace } from '../core/variables';
import { useI18n } from '../i18n';

export interface FocusTarget {
  id: string;
  para?: number;
  start?: number;
  /** Cambia en cada petición para volver a desplazar aunque el destino sea el mismo. */
  nonce: number;
}

interface Props {
  paragraphs: Paragraph[];
  variables: Variable[];
  values: Map<string, string>;
  /** Datos del paso actual del asistente: son los únicos que se resaltan. */
  stepIds: Set<string>;
  /** Dato que se está escribiendo ahora mismo. */
  activeId: string | null;
  focus: FocusTarget | null;
  /** false = se ve el documento con los valores nuevos ya puestos. */
  showOriginal: boolean;
  showLabels: boolean;
  /** Botones «Opcional» y «Repetir» junto a cada párrafo (solo en el paso de opciones). */
  tools: boolean;
  optional: OptionalClause[];
  removed: Set<number>;
  repeats: RepeatBlock[];
  leftovers: ReviewIssue[];
  onSelectVariable: (id: string) => void;
  onSelectText: (sel: Selection) => void;
  onToggleOptional: (para: number) => void;
  onToggleRepeat: (para: number) => void;
  notify: (msg: string) => void;
}

type Mark = { kind: 'var'; occ: Occurrence; v: Variable } | { kind: 'leftover'; issue: ReviewIssue; v?: Variable };

/** Persona de una lista para la que se dibuja la copia del bloque (null = la normal). */
type Copy = { entry: Record<string, string> } | null;

const start = (m: Mark) => (m.kind === 'var' ? m.occ.start : m.issue.start!);
const end = (m: Mark) => (m.kind === 'var' ? m.occ.end : m.issue.end!);

/**
 * Posición en el texto original de un punto de la selección. Los datos ya rellenos muestran el valor nuevo,
 * así que cada marca guarda la longitud del texto original (data-len) para poder contar bien.
 */
function offsetIn(p: HTMLElement, node: Node, offset: number): number {
  const lenOf = (n: Node) => (n.nodeType === 3 ? (n.textContent ?? '').length : Number((n as HTMLElement).dataset.len ?? n.textContent?.length ?? 0));
  const children = Array.from(p.childNodes);
  if (node === p) return children.slice(0, offset).reduce((a, n) => a + lenOf(n), 0);
  let total = 0;
  for (const child of children) {
    if (child === node || child.contains(node)) {
      if (child.nodeType === 3) return total + offset;
      const el = child as HTMLElement;
      // Dentro de un dato ya cambiado no se puede seleccionar a medias: se toma el dato entero.
      if (el.dataset.replaced) return total + (offset > 0 ? lenOf(el) : 0);
      return total + offset;
    }
    total += lenOf(child);
  }
  return total;
}

function paraOf(node: Node): HTMLElement | null {
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return (el?.closest('[data-para]') as HTMLElement | null) ?? null;
}

export function DocumentPreview(props: Props) {
  const { paragraphs, variables, values, stepIds, activeId, focus, showOriginal, showLabels, tools, optional, removed, repeats, leftovers } = props;
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);

  const marksByPara = useMemo(() => {
    const map = new Map<number, Mark[]>();
    const push = (para: number, m: Mark) => {
      const list = map.get(para) ?? [];
      list.push(m);
      map.set(para, list);
    };
    variables.forEach((v) => v.occurrences.forEach((occ) => push(occ.para, { kind: 'var', occ, v })));
    leftovers.forEach((issue) => push(issue.para!, { kind: 'leftover', issue, v: variables.find((v) => v.id === issue.varId) }));
    map.forEach((l) => l.sort((a, b) => start(a) - start(b)));
    return map;
  }, [variables, leftovers]);

  const optionalParas = useMemo(() => new Set(optional.map((o) => o.para)), [optional]);
  const blockOf = useMemo(() => {
    const map = new Map<number, RepeatBlock>();
    repeats.forEach((b) => b.paras.forEach((p) => map.set(p, b)));
    return map;
  }, [repeats]);
  const listOf = useMemo(() => listOfVars(repeats, variables), [repeats, variables]);

  useEffect(() => {
    if (!focus) return;
    const sel = focus.para !== undefined ? `[data-occ="${focus.para}-${focus.start}"]` : `[data-var="${focus.id}"]`;
    const el = root.current?.querySelector(sel);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.classList.add('flash');
    const id = setTimeout(() => el?.classList.remove('flash'), 1200);
    return () => clearTimeout(id);
  }, [focus]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const pa = paraOf(range.startContainer);
    const pb = paraOf(range.endContainer);
    if (!pa || !root.current?.contains(pa)) return;
    if (pa !== pb) {
      props.notify(t('preview.sameParagraph'));
      return;
    }
    const para = Number(pa.dataset.para);
    const text = paragraphs[para].text;
    let s = offsetIn(pa, range.startContainer, range.startOffset);
    let e = offsetIn(pa, range.endContainer, range.endOffset);
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e - s < 1) return;
    props.onSelectText({ para, start: s, end: e, text: text.slice(s, e) });
    sel.removeAllRanges();
  };

  /** Texto que se ve en una aparición: el original o el valor nuevo (con listas y género). */
  const shownText = (v: Variable, occ: Occurrence, copy: Copy): string | null => {
    if (showOriginal) return null;
    const main = values.get(v.id) ?? '';
    if (copy) return copyText(v, occ, copy.entry);
    const list = listOf.get(v.id);
    if (list && list.joinOutside && !blockOf.has(occ.para) && occ.transform !== 'genero') return joinedText(v, occ, list, main);
    return willReplace(v, occ, main) ? displayValue(v, occ, main) : null;
  };

  const renderMark = (m: Mark, copy: Copy): ReactNode => {
    if (m.kind === 'leftover') {
      if (copy) return m.issue.detail;
      return (
        <mark
          key={`l-${m.issue.para}-${m.issue.start}`}
          className="leftover"
          data-len={m.issue.end! - m.issue.start!}
          title={t('preview.leftover', { label: m.v?.label ?? '' })}
          onClick={(e) => {
            e.stopPropagation();
            if (m.v) props.onSelectVariable(m.v.id);
          }}
        >
          {m.issue.detail}
        </mark>
      );
    }
    const { occ, v } = m;
    const text = shownText(v, occ, copy);
    // Las palabras de género («la ARRENDATARIA») solo se marcan si de verdad cambian.
    if (occ.transform === 'genero' && text === null) return occ.text;
    const cls = [
      'd',
      stepIds.has(v.id) ? 'step' : '',
      v.id === activeId ? 'active' : '',
      text !== null ? 'new' : '',
      !occ.text ? 'empty-field' : '',
    ].join(' ');
    return (
      <mark
        key={`${v.id}-${occ.para}-${occ.start}`}
        data-var={copy ? undefined : v.id}
        data-occ={copy ? undefined : `${occ.para}-${occ.start}`}
        data-len={occ.end - occ.start}
        data-replaced={text !== null ? '1' : undefined}
        data-label={showLabels && occ.transform !== 'genero' ? v.label : undefined}
        className={cls}
        title={v.label}
        onClick={(e) => {
          if (window.getSelection()?.isCollapsed === false) return;
          e.stopPropagation();
          props.onSelectVariable(v.id);
        }}
      >
        {text ?? (occ.text || `⟨${v.label}⟩`)}
      </mark>
    );
  };

  const pieces = (p: Paragraph, copy: Copy = null): ReactNode[] => {
    const out: ReactNode[] = [];
    let pos = 0;
    for (const m of marksByPara.get(p.index) ?? []) {
      if (start(m) < pos) continue;
      if (start(m) > pos) out.push(p.text.slice(pos, start(m)));
      out.push(renderMark(m, copy));
      pos = end(m);
    }
    if (pos < p.text.length) out.push(p.text.slice(pos));
    return out;
  };

  /** Las personas extra de una lista se ven como copias del bloque. */
  const renderCopies = (block: RepeatBlock): ReactNode[] =>
    block.entries.map((entry, k) => (
      <div key={`${block.id}-${k}`} className="repeat-copy" title={t('panel.person', { n: k + 2 })}>
        {block.paras.map((pi) => {
          const p = paragraphs[pi];
          return removed.has(pi) ? null : (
            <p key={pi} className={p.text.trim() ? '' : 'empty'}>
              {pieces(p, { entry })}
            </p>
          );
        })}
      </div>
    ));

  let lastPart = '';
  return (
    <div className={`paper ${showLabels ? 'with-labels' : ''} ${tools ? 'with-tools' : ''}`} ref={root} onMouseUp={onMouseUp}>
      {paragraphs.map((p) => {
        let header = '';
        if (p.part !== lastPart && p.kind !== 'cuerpo') {
          const num = p.part.match(/(\d+)(?:\.xml)?$/)?.[1];
          header = t(`preview.${p.kind}`) + (num && (p.kind === 'diapositiva' || p.kind === 'hoja' || p.kind === 'pagina') ? ` ${num}` : '');
        }
        lastPart = p.part;
        const isOptional = optionalParas.has(p.index);
        const isRemoved = removed.has(p.index) && !showOriginal;
        const block = blockOf.get(p.index);
        const lastOfBlock = block && block.paras[block.paras.length - 1] === p.index;
        const canTool = tools && !!p.text.trim() && p.field === undefined;
        return (
          <div key={p.index}>
            {header && <div className="part-title">{header}</div>}
            <div className={`para-row ${isOptional ? 'optional' : ''} ${isRemoved ? 'removed' : ''} ${block ? 'repeat' : ''}`}>
              {canTool && (
                <div className="para-tools">
                  <button
                    className={`opt-btn ${isOptional ? 'on' : ''}`}
                    title={t('preview.makeOptional')}
                    onClick={() => props.onToggleOptional(p.index)}
                  >
                    {t('preview.optional')}
                  </button>
                  {!p.geo && (
                    <button className={`opt-btn ${block ? 'on' : ''}`} title={t('preview.makeRepeat')} onClick={() => props.onToggleRepeat(p.index)}>
                      {t('preview.repeat')}
                    </button>
                  )}
                </div>
              )}
              <p
                data-para={p.index}
                data-field={p.field}
                className={`${p.inTable ? 'cell' : ''} ${p.text.trim() || p.field !== undefined ? '' : 'empty'} ${p.field !== undefined ? 'field' : ''}`}
              >
                {pieces(p)}
              </p>
            </div>
            {!showOriginal && lastOfBlock && renderCopies(block)}
          </div>
        );
      })}
    </div>
  );
}
