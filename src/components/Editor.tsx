import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Occurrence, OptionalClause, RepeatBlock, Selection, Variable } from '../core/types';
import { toggleRepeatPara } from '../core/repeat';
import { createRule } from '../core/learning';
import { isBlankText } from '../core/rules';
import { resolveValues } from '../core/formula';
import { reviewDocument, type ReviewIssue } from '../core/review';
import { buildSteps, stepOfVar } from '../core/steps';
import { normalizeKey, uid } from '../core/text';
import { addFromSelection, applyFields, mergeVariables, removedParas, removeVariable, updateVariable } from '../core/variables';
import { errMsg, put, type AppData, type Session } from '../storage';
import { useI18n } from '../i18n';
import { DocumentPreview, type FocusTarget } from './DocumentPreview';
import { Wizard } from './Wizard';
import { MarkDialog, PromptModal, SaveFichaModal, type MarkResult } from './Modals';
import { BatchModal, DownloadForm } from './OutputModals';
import { DonePanel } from './DonePanel';

interface Props {
  session: Session;
  update: (fn: (s: Session) => Session) => void;
  onClose: () => void;
  /** Abre la pestaña «Mis plantillas». */
  onOpenTemplates: () => void;
  data: AppData;
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
}

type Snapshot = Pick<Session, 'variables' | 'optional' | 'repeats'>;

export function Editor({ session, update, onClose, onOpenTemplates, data, refresh, notify }: Props) {
  const { t } = useI18n();
  const [stepId, setStepId] = useState('intro');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<Selection | null>(null);
  const [modal, setModal] = useState<null | 'plantilla' | 'ficha' | 'lote'>(null);
  const [remembered, setRemembered] = useState<Set<string>>(new Set());
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  /** Nombre del archivo recién descargado: muestra la pantalla de «Documento listo». */
  const [done, setDone] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const vars = session.variables;
  const optional = useMemo(() => session.optional ?? [], [session.optional]);
  const repeats = useMemo(() => session.repeats ?? [], [session.repeats]);
  const resolved = useMemo(() => resolveValues(vars), [vars]);
  const removed = useMemo(() => removedParas(optional, vars, resolved), [optional, vars, resolved]);
  const removedSet = useMemo(() => new Set(removed), [removed]);
  const issues = useMemo(() => reviewDocument(session.paragraphs, vars, resolved, removed), [session.paragraphs, vars, resolved, removed]);
  const leftovers = useMemo(() => issues.filter((i) => i.kind === 'resto'), [issues]);
  const steps = useMemo(() => buildSteps(vars), [vars]);
  const current = steps.find((s) => s.id === stepId) ?? steps[0];
  const stepIds = useMemo(() => new Set(current.varIds), [current]);
  const filled = vars.filter((v) => (resolved.values.get(v.id) ?? '').trim()).length;

  /**
   * Cambiar de paso o rellenar un campo NO mueve el documento (resultaba incómodo):
   * solo se desplaza cuando el usuario lo pide con el botón «N veces» o con «Ver» en la revisión.
   */
  /** Mismo documento, datos vacíos: para rellenar otro igual sin volver a subirlo. */
  const startAnother = () => {
    commit((s) => ({
      ...s,
      variables: s.variables.map((v) => ({ ...v, value: '', gender: v.originalGender })),
      repeats: s.repeats?.map((b) => ({ ...b, entries: [] })),
    }));
    setDone(null);
    goStep('intro');
  };

  const goStep = (id: string) => {
    setDone(null);
    setStepId(id);
    setActiveId(null);
    setAutoFocusId(null);
  };

  /** Ir a un dato: abre su paso y pone el cursor en su casilla. Con `scrollTo`, además lleva el documento hasta él. */
  const goVar = (id: string, scrollTo?: Pick<Occurrence, 'para' | 'start'> | true) => {
    const step = stepOfVar(steps, id);
    if (step) setStepId(step.id);
    setActiveId(id);
    setAutoFocusId(id);
    if (scrollTo) setFocus(scrollTo === true ? { id, nonce: Date.now() } : { id, para: scrollTo.para, start: scrollTo.start, nonce: Date.now() });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  /** Cambios estructurales (unir, quitar, marcar…): se guardan para poder deshacerlos. */
  const commit = (fn: (s: Session) => Session) => {
    setUndoStack((st) => [...st.slice(-49), { variables: session.variables, optional: session.optional, repeats: session.repeats }]);
    update(fn);
  };
  const setVars = (fn: (v: Variable[]) => Variable[]) => commit((s) => ({ ...s, variables: fn(s.variables) }));

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((st) => st.slice(0, -1));
    update((s) => ({ ...s, ...last }));
    notify(t('editor.undone'));
  }, [undoStack, update, notify, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const saveRule = async (v: Variable, label = v.label) => {
    const occ = v.occurrences.find((o) => !o.transform);
    if (!occ) return;
    const rule = createRule(session.paragraphs[occ.para].text, occ.start, occ.end, label, v.category);
    if (!isBlankText(v.original) && v.original.trim() && !rule.examples.includes(v.original)) rule.examples.push(v.original);
    await put('learned', rule);
  };

  const remember = async (v: Variable) => {
    try {
      await saveRule(v);
      setRemembered((s) => new Set(s).add(v.id));
      await refresh();
      notify(t('editor.learned', { label: v.label }));
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const ignore = async (v: Variable) => {
    setVars((all) => removeVariable(all, v.id));
    if (activeId === v.id) setActiveId(null);
    if (isBlankText(v.original) || !v.original.trim()) return;
    try {
      await put('ignored', { id: normalizeKey(v.original), value: v.original, createdAt: Date.now() });
      await refresh();
      notify(t('editor.ignored', { value: v.original }));
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const mark = async (r: MarkResult) => {
    if (!pending) return;
    const sel = pending;
    setPending(null);
    const target = r.mode === 'existing' ? { existingId: r.id } : { label: r.label, category: r.category };
    const res = addFromSelection(vars, session.paragraphs, sel, target);
    setVars(() => res.vars);
    // El paso del dato nuevo se calcula con la lista ya actualizada.
    const step = stepOfVar(buildSteps(res.vars), res.id);
    if (step) setStepId(step.id);
    setActiveId(res.id);
    setAutoFocusId(res.id);
    if (r.mode === 'new' && r.remember) {
      try {
        const v = res.vars.find((x) => x.id === res.id)!;
        const occ = v.occurrences.find((o) => o.para === sel.para && o.start === sel.start) ?? v.occurrences[0];
        await saveRule({ ...v, occurrences: [occ] });
        setRemembered((s) => new Set(s).add(res.id));
        await refresh();
      } catch (e) {
        notify(t(errMsg(e)));
      }
    }
  };

  const toggleOptional = (para: number) =>
    commit((s) => {
      const list = s.optional ?? [];
      return list.some((c) => c.para === para)
        ? { ...s, optional: list.filter((c) => c.para !== para) }
        : { ...s, optional: [...list, { para, include: true }].sort((a, b) => a.para - b.para) };
    });

  const changeOptional = (para: number, patch: Partial<OptionalClause> | null) =>
    (patch === null ? commit : update)((s) => ({
      ...s,
      optional: patch === null ? (s.optional ?? []).filter((c) => c.para !== para) : (s.optional ?? []).map((c) => (c.para === para ? { ...c, ...patch } : c)),
    }));

  const toggleRepeat = (para: number) => commit((s) => ({ ...s, repeats: toggleRepeatPara(s.repeats ?? [], s.paragraphs, para, uid) }));

  const changeRepeat = (id: string, block: RepeatBlock | null) =>
    (block === null ? commit : update)((s) => ({
      ...s,
      repeats: block === null ? (s.repeats ?? []).filter((b) => b.id !== id) : (s.repeats ?? []).map((b) => (b.id === id ? block : b)),
    }));

  // «Ver» en la revisión sí lleva el documento hasta el dato: es lo que se pide al pulsarlo.
  const goToIssue = (i: ReviewIssue) => goVar(i.varId, i.kind === 'resto' ? { para: i.para!, start: i.start! } : true);

  const saveTemplate = async (name: string) => {
    setModal(null);
    try {
      const id = session.templateId ?? uid();
      const existing = data.templates.find((x) => x.id === id);
      await put('templates', {
        id,
        name,
        fileName: session.fileName,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        bytes: session.bytes,
        paragraphs: session.paragraphs.some((p) => p.geo) ? session.paragraphs : undefined,
        variables: vars.map((v) => ({ ...v, value: '', gender: v.originalGender })),
        optional: session.optional,
        repeats: session.repeats?.map((b) => ({ ...b, entries: [] })),
        fileNamePattern: session.fileNamePattern,
      });
      update((s) => ({ ...s, templateId: id, templateName: name }));
      await refresh();
      notify(t('editor.templateSaved', { name }));
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const applyFicha = (id: string) => {
    const ficha = data.fichas.find((f) => f.id === id);
    if (!ficha) return;
    const res = applyFields(vars, ficha.fields);
    setVars(() => res.vars);
    notify(res.count ? t('editor.fichaApplied', { name: ficha.name, n: res.count }) : t('editor.fichaNoMatch'));
  };

  const addHistory = async (count?: number) => {
    await put('history', {
      id: uid(),
      createdAt: Date.now(),
      fileName: session.fileName,
      templateId: session.templateId,
      templateName: session.templateName,
      values: count ? [] : vars.filter((v) => v.value.trim()).map((v) => ({ key: v.label, value: v.value.trim() })),
      ...(count ? { count } : {}),
    });
    await refresh();
  };

  const menuItem = (label: string, action: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        setMenuOpen(false);
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="editor">
      <div className="editor-bar">
        <button className="btn ghost" onClick={onClose} title={t('editor.closeTitle')}>{t('editor.close')}</button>
        <div className="doc-name">
          <strong>{session.templateName ?? session.fileName}</strong>
          <span>{t('editor.filled', { a: filled, b: vars.length })}</span>
        </div>
        <label className="switch" title={t('editor.showOriginalTitle')}>
          <input type="checkbox" checked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />
          <span>{t('editor.showOriginal')}</span>
        </label>
        {undoStack.length > 0 && (
          <button className="btn ghost" onClick={undo} title="Ctrl+Z">
            ↶ {t('editor.undo')}
          </button>
        )}
        <div className="menu-wrap" ref={menuRef}>
          <button className="btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            {t('editor.more')} ▾
          </button>
          {menuOpen && (
            <div className="menu right" role="menu">
              {menuItem(session.templateId ? t('editor.updateTemplate') : t('editor.saveTemplate'), () => setModal('plantilla'))}
              {menuItem(t('editor.saveFicha'), () => setModal('ficha'))}
              {menuItem(t('editor.batch'), () => setModal('lote'))}
              <label className="menu-item check">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                {t('editor.showLabels')}
              </label>
            </div>
          )}
        </div>
        <button className="btn primary" onClick={() => goStep('review')}>{t('editor.download')}</button>
      </div>

      <div className="workspace">
        <DocumentPreview
          paragraphs={session.paragraphs}
          variables={vars}
          values={resolved.values}
          stepIds={stepIds}
          activeId={activeId}
          focus={focus}
          showOriginal={showOriginal}
          showLabels={showLabels}
          tools={current.kind === 'options'}
          optional={optional}
          removed={removedSet}
          repeats={repeats}
          leftovers={current.kind === 'review' ? leftovers : []}
          onSelectVariable={(id) => goVar(id)}
          onSelectText={setPending}
          onToggleOptional={toggleOptional}
          onToggleRepeat={toggleRepeat}
          notify={notify}
        />
        <Wizard
          steps={steps}
          current={current}
          onGo={(id) => goStep(id)}
          variables={vars}
          paragraphs={session.paragraphs}
          resolved={resolved}
          activeId={activeId}
          autoFocusId={autoFocusId}
          remembered={remembered}
          fichas={data.fichas}
          optional={optional}
          repeats={repeats}
          onActivate={(id) => setActiveId(id)}
          onShowOcc={(id, occ) => {
            setActiveId(id);
            setFocus({ id, para: occ.para, start: occ.start, nonce: Date.now() });
          }}
          onChange={(id, patch) => {
            // Escribir valores no se guarda en el historial de deshacer (el propio campo ya permite Ctrl+Z).
            const structural = 'category' in patch || 'gender' in patch;
            (structural ? commit : update)((s) => ({ ...s, variables: updateVariable(s.variables, id, patch) }));
          }}
          onIgnore={ignore}
          onRemember={remember}
          onMerge={(target, source) => {
            setVars((all) => mergeVariables(all, target, source));
            notify(t('editor.merged'));
          }}
          onAccept={(id) => setVars((all) => updateVariable(all, id, { confidence: 1 }))}
          onApplyFicha={applyFicha}
          onOptionalChange={changeOptional}
          onRepeatChange={changeRepeat}
          review={
            done ? (
              <DonePanel
                fileName={done}
                templateName={session.templateId ? session.templateName : undefined}
                onAgain={() => setDone(null)}
                onAnother={startAnother}
                onHome={onClose}
                onTemplates={onOpenTemplates}
                onSaveTemplate={() => setModal('plantilla')}
              />
            ) : (
              <>
                <DownloadForm
                  session={session}
                  vars={vars}
                  removed={removed}
                  issues={issues}
                  onPattern={(fileNamePattern) => update((s) => ({ ...s, fileNamePattern }))}
                  onGoTo={goToIssue}
                  notify={notify}
                  onDone={async (fileName) => {
                    setDone(fileName);
                    try {
                      await addHistory();
                    } catch (e) {
                      notify(t(errMsg(e)));
                    }
                  }}
                />
                <div className="secondary-actions">
                  <button className="btn" onClick={() => setModal('plantilla')}>{t('review.saveTemplate')}</button>
                  <button className="btn" onClick={() => setModal('lote')}>{t('review.batch')}</button>
                </div>
              </>
            )
          }
        />
      </div>

      {pending && <MarkDialog sel={pending} variables={vars} onCancel={() => setPending(null)} onConfirm={mark} />}
      {modal === 'plantilla' && (
        <PromptModal
          title={session.templateId ? t('editor.updateTemplate') : t('editor.saveAsTemplate')}
          label={t('editor.templateName')}
          initial={session.templateName ?? session.fileName.replace(/\.[^.]+$/, '')}
          confirm={t('editor.save')}
          onCancel={() => setModal(null)}
          onConfirm={saveTemplate}
        />
      )}
      {modal === 'ficha' && (
        <SaveFichaModal
          variables={vars}
          onCancel={() => setModal(null)}
          onConfirm={async (name, kind, fields) => {
            setModal(null);
            try {
              await put('fichas', { id: uid(), name, kind, fields, createdAt: Date.now() });
              await refresh();
              notify(t('editor.fichaSaved', { name }));
            } catch (e) {
              notify(t(errMsg(e)));
            }
          }}
        />
      )}
      {modal === 'lote' && (
        <BatchModal
          session={session}
          onClose={() => setModal(null)}
          notify={notify}
          onDone={async (count) => {
            try {
              await addHistory(count);
              notify(t('editor.batchDone', { n: count }));
            } catch (e) {
              notify(t(errMsg(e)));
            }
          }}
        />
      )}
    </div>
  );
}
