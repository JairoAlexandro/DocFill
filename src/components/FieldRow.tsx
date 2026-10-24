import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AmountField, DateField, Segmented, Select, SmartTextField } from './custom';
import { CATEGORIES, type Category, type Gender, type Occurrence, type Variable } from '../core/types';
import { isFormula } from '../core/formula';
import { isBlankText } from '../core/rules';
import { validateValue } from '../core/validate';
import { useI18n } from '../i18n';

interface Props {
  v: Variable;
  variables: Variable[];
  computed: string;
  formulaError?: string;
  active: boolean;
  remembered: boolean;
  autoFocus?: boolean;
  onFocus: () => void;
  /** Muestra en el documento la aparición número `index` del dato. */
  onShow: (occ: Occurrence) => void;
  onChange: (patch: Partial<Variable>) => void;
  onIgnore: () => void;
  onRemember: () => void;
  onMerge: (sourceId: string) => void;
  onEnter: () => void;
}

/** Un dato del asistente: su nombre, el valor actual como pista y la casilla para el nuevo. */
export function FieldRow(props: Props) {
  const { v, variables, computed, formulaError, active, remembered } = props;
  const { t } = useI18n();
  const [menu, setMenu] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);

  const visible = v.occurrences.filter((o) => o.transform !== 'genero');
  const formula = isFormula(v.value);
  const warning = formulaError ?? validateValue(v.category, computed);
  const blank = !v.original.trim() || isBlankText(v.original);

  useEffect(() => {
    if (props.autoFocus) input.current?.focus();
  }, [props.autoFocus]);

  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !row.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  /** Lo común a todas las casillas, sea cual sea su tipo. */
  const inputProps = {
    id: `f-${v.id}`,
    ref: input,
    className: formula ? 'formula' : '',
    placeholder: blank ? t('field.blankPh') : t('field.now', { value: v.original }),
    onFocus: props.onFocus,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && props.onEnter(),
  };

  /** Cada clic en «N veces» lleva a la siguiente aparición en el documento. */
  const showNext = () => {
    if (!visible.length) return;
    props.onShow(visible[cursor % visible.length]);
    setCursor((c) => c + 1);
  };

  return (
    <div ref={row} className={`field-item ${active ? 'active' : ''}`}>
      <div className="field-head">
        <label htmlFor={`f-${v.id}`}>{v.label}</label>
        {visible.length > 0 && (
          <button className="times" onClick={showNext} title={t('field.showInDoc')} aria-label={t('field.showInDoc')}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {/* Tras el primer clic indica en cuál de las apariciones estás: «1 de 4», «2 de 4»… */}
            {cursor > 0
              ? t('field.nOfM', { a: ((cursor - 1) % visible.length) + 1, b: visible.length })
              : visible.length === 1
                ? t('field.once')
                : t('field.times', { n: visible.length })}
          </button>
        )}
        <button className="icon-btn small" aria-label={t('field.more')} title={t('field.more')} onClick={() => setMenu((m) => !m)}>
          ⋯
        </button>
        {menu && (
          <div className="menu" role="menu">
            <label className="field compact">
              {t('field.rename')}
              <input value={v.label} onChange={(e) => props.onChange({ label: e.target.value })} />
            </label>
            <div className="field compact">
              {t('field.type')}
              <Select<Category>
                small
                ariaLabel={t('field.type')}
                value={v.category}
                onChange={(category) => props.onChange({ category })}
                options={CATEGORIES.map((c) => ({ value: c, label: t(`cat.${c}`) }))}
              />
            </div>
            <div className="field compact">
              {t('panel.mergeWith')}
              <Select<string>
                small
                ariaLabel={t('panel.mergeWith')}
                value={null}
                placeholder="—"
                onChange={(id) => {
                  props.onMerge(id);
                  setMenu(false);
                }}
                options={variables.filter((o) => o.id !== v.id).map((o) => ({ value: o.id, label: o.label, hint: o.original || undefined }))}
              />
            </div>
            <button className="menu-item" disabled={remembered || blank} onClick={() => (props.onRemember(), setMenu(false))} title={t('panel.rememberTitle')}>
              {remembered ? `✓ ${t('panel.remembered')}` : t('field.remember')}
            </button>
            <button className="menu-item danger" onClick={() => (props.onIgnore(), setMenu(false))}>
              {t('field.notData')}
            </button>
          </div>
        )}
      </div>
      {v.category === 'fecha' ? (
        <DateField
          {...inputProps}
          value={v.value}
          onChange={(value) => props.onChange({ value })}
          format={v.dateFormat ?? 'keep'}
          onFormatChange={(dateFormat) => props.onChange({ dateFormat })}
          reference={v.original}
          invalid={!!warning}
        />
      ) : v.category === 'importe' ? (
        <AmountField
          {...inputProps}
          value={v.value}
          onChange={(value) => props.onChange({ value })}
          showWords={v.occurrences.some((o) => o.transform === 'letras' || o.transform === 'letras-un')}
          invalid={!!warning}
        />
      ) : (
        <SmartTextField {...inputProps} value={v.value} onChange={(value) => props.onChange({ value })} category={v.category} invalid={!!warning} />
      )}
      {formula && !formulaError && computed && <div className="computed">= {computed}</div>}
      {warning && <div className="warning">{t(warning)}</div>}
      {active && formula && <div className="hint">{t('panel.formulaHint')}</div>}
      {v.originalGender && (
        <div className="gender-row">
          <span className="muted">{t('panel.gender')}</span>
          <Segmented<Gender>
            small
            ariaLabel={t('panel.gender')}
            value={v.gender ?? v.originalGender}
            onChange={(gender) => props.onChange({ gender })}
            options={[
              { value: 'm', label: t('panel.male') },
              { value: 'f', label: t('panel.female') },
            ]}
          />
        </div>
      )}
    </div>
  );
}
