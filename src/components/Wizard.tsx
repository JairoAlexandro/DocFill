import { useState, type ReactNode } from 'react';
import type { Occurrence, OptionalClause, Paragraph, RepeatBlock, Variable } from '../core/types';
import type { Step } from '../core/steps';
import type { Resolved } from '../core/variables';
import { truncate } from '../core/text';
import type { Ficha } from '../storage';
import { useI18n } from '../i18n';
import { FieldRow } from './FieldRow';
import { Select } from './custom';
import { RepeatPanel } from './RepeatPanel';

interface Props {
  steps: Step[];
  current: Step;
  onGo: (stepId: string) => void;
  variables: Variable[];
  paragraphs: Paragraph[];
  resolved: Resolved;
  activeId: string | null;
  autoFocusId: string | null;
  remembered: Set<string>;
  fichas: Ficha[];
  optional: OptionalClause[];
  repeats: RepeatBlock[];
  /** Contenido del último paso (revisión y descarga). */
  review: ReactNode;
  onActivate: (id: string) => void;
  onShowOcc: (id: string, occ: Occurrence) => void;
  onChange: (id: string, patch: Partial<Variable>) => void;
  onIgnore: (v: Variable) => void;
  onRemember: (v: Variable) => void;
  onMerge: (targetId: string, sourceId: string) => void;
  onAccept: (id: string) => void;
  onApplyFicha: (fichaId: string) => void;
  onOptionalChange: (para: number, patch: Partial<OptionalClause> | null) => void;
  onRepeatChange: (id: string, block: RepeatBlock | null) => void;
}

/** Panel derecho: los datos se piden poco a poco, un grupo en cada paso. */
export function Wizard(props: Props) {
  const { steps, current, variables, resolved } = props;
  const { t } = useI18n();
  const [listOpen, setListOpen] = useState(false);
  const index = steps.findIndex((s) => s.id === current.id);
  const title = (s: Step) => (s.translate ? t(s.title) : s.title);
  const varsOf = (s: Step) => s.varIds.map((id) => variables.find((v) => v.id === id)).filter((v): v is Variable => !!v);
  const filledOf = (s: Step) => varsOf(s).filter((v) => (resolved.values.get(v.id) ?? '').trim()).length;
  const prev = steps[index - 1];
  const next = steps[index + 1];
  const go = (s?: Step) => {
    if (!s) return;
    setListOpen(false);
    props.onGo(s.id);
  };

  let body: ReactNode = null;
  if (current.kind === 'intro') {
    const groups = steps.filter((s) => s.kind === 'group' || s.kind === 'suggestions');
    body = (
      <>
        <p>{t('intro.summary', { n: variables.length })}</p>
        <ul className="group-list">
          {groups.map((s) => (
            <li key={s.id}>
              <button onClick={() => go(s)}>
                <span>{title(s)}</span>
                <span className="muted">{t('intro.count', { n: s.varIds.length })}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">{t('intro.missing')}</p>
      </>
    );
  } else if (current.kind === 'group') {
    const vars = varsOf(current);
    body = (
      <>
        <p className="hint">{t('group.help')}</p>
        {props.fichas.length > 0 && (
          <Select<string>
            className="ficha-select"
            ariaLabel={t('group.fillFrom')}
            value={null}
            placeholder={t('group.fillFrom')}
            onChange={props.onApplyFicha}
            options={props.fichas.map((f) => ({ value: f.id, label: f.name, hint: t(`kind.${f.kind}`) }))}
          />
        )}
        <div className="field-list">
          {vars.map((v, i) => (
            <FieldRow
              key={v.id}
              v={v}
              variables={variables}
              computed={resolved.values.get(v.id) ?? ''}
              formulaError={resolved.errors.get(v.id)}
              active={v.id === props.activeId}
              autoFocus={v.id === props.autoFocusId}
              remembered={props.remembered.has(v.id) || v.source === 'aprendido'}
              onFocus={() => props.onActivate(v.id)}
              onShow={(occ) => props.onShowOcc(v.id, occ)}
              onChange={(patch) => props.onChange(v.id, patch)}
              onIgnore={() => props.onIgnore(v)}
              onRemember={() => props.onRemember(v)}
              onMerge={(source) => props.onMerge(v.id, source)}
              onEnter={() => {
                const nextField = vars[i + 1];
                if (nextField) document.getElementById(`f-${nextField.id}`)?.focus();
                else go(next);
              }}
            />
          ))}
        </div>
        <p className="hint">{t('intro.missing')}</p>
      </>
    );
  } else if (current.kind === 'suggestions') {
    const vars = varsOf(current);
    body = (
      <>
        <p className="hint">{t('sugg.help')}</p>
        {vars.length === 0 && <p className="muted">{t('sugg.none')}</p>}
        <ul className="sugg-list">
          {vars.map((v) => (
            <li key={v.id} className={v.id === props.activeId ? 'active' : ''}>
              <button className="sugg-text" onClick={() => props.onActivate(v.id)}>
                «{truncate(v.original, 40)}» <span className="muted">· {t('field.times', { n: v.occurrences.length })}</span>
              </button>
              <div className="sugg-actions">
                <button className="btn small" onClick={() => props.onAccept(v.id)}>{t('sugg.yes')}</button>
                <button className="btn small ghost" onClick={() => props.onIgnore(v)}>{t('sugg.no')}</button>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  } else if (current.kind === 'options') {
    body = (
      <>
        <p className="hint">{t('options.help')}</p>
        <h4>{t('panel.optionalTitle', { n: props.optional.length })}</h4>
        {props.optional.length === 0 && <p className="muted small-text">{t('options.noneOptional')}</p>}
        {props.optional.map((c) => (
          <div key={c.para} className="clause">
            <label className="check">
              <input
                type="checkbox"
                checked={c.include}
                disabled={!!c.dependsOn}
                onChange={(e) => props.onOptionalChange(c.para, { include: e.target.checked })}
              />
              <span className="clause-text">{truncate(props.paragraphs[c.para]?.text.trim() ?? '', 90)}</span>
            </label>
            <div className="clause-actions">
              <Select<string>
                small
                ariaLabel={t('panel.dependsOn')}
                value={c.dependsOn ?? ''}
                onChange={(id) => props.onOptionalChange(c.para, { dependsOn: id || undefined })}
                options={[
                  { value: '', label: t('options.byCheckbox') },
                  ...variables.map((v) => ({ value: v.id, label: t('options.ifFilled', { label: v.label }) })),
                ]}
              />
              <button className="btn small ghost" onClick={() => props.onOptionalChange(c.para, null)}>
                {t('panel.removeOptional')}
              </button>
            </div>
          </div>
        ))}
        <RepeatPanel repeats={props.repeats} variables={variables} paragraphs={props.paragraphs} onChange={props.onRepeatChange} />
      </>
    );
  } else {
    body = (
      <>
        <p className="hint">{t('review.help')}</p>
        {props.review}
      </>
    );
  }

  return (
    <aside className="wizard">
      <div className="wizard-head">
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="wizard-meta">
          <span>{t('steps.progress', { a: index + 1, b: steps.length })}</span>
          <button className="link-btn" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
            {t('steps.all')} {listOpen ? '▴' : '▾'}
          </button>
        </div>
        {listOpen && (
          <ol className="step-list">
            {steps.map((s) => {
              const total = s.varIds.length;
              const done = total > 0 && filledOf(s) === total;
              return (
                <li key={s.id}>
                  <button className={s.id === current.id ? 'current' : ''} onClick={() => go(s)}>
                    <span>{title(s)}</span>
                    {total > 0 && <span className={done ? 'done' : 'muted'}>{done ? '✓' : t('steps.filledOf', { a: filledOf(s), b: total })}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {/* Anterior / Siguiente arriba, junto al título: siempre a mano sin tener que bajar. */}
        <div className="wizard-title">
          <h2>{title(current)}</h2>
          <div className="wizard-nav">
            <button className="btn ghost" disabled={!prev} onClick={() => go(prev)} title={t('steps.prev')} aria-label={t('steps.prev')}>
              ←
            </button>
            {next && (
              <button className="btn primary" onClick={() => go(next)}>
                {current.kind === 'intro' ? t('steps.start') : t('steps.next')} →
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="wizard-body">{body}</div>
    </aside>
  );
}
