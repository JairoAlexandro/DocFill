import { useEffect, useState, type ReactNode } from 'react';
import { CATEGORIES, CATEGORY_LABELS, type Category, type Selection, type Variable } from '../core/types';
import { BUILTIN_RULES } from '../core/rules';
import { NAME_SEQ } from '../core/text';
import { useI18n } from '../i18n';
import { Select } from './custom';
import type { FichaField, FichaKind } from '../storage';

export function Modal({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function PromptModal({ title, label, initial, confirm, onCancel, onConfirm }: {
  title: string;
  label: string;
  initial: string;
  confirm: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const ok = () => value.trim() && onConfirm(value.trim());
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn ghost" onClick={onCancel}>{t('modal.cancel')}</button>
          <button className="btn primary" disabled={!value.trim()} onClick={ok}>{confirm}</button>
        </>
      }
    >
      <label className="field">
        {label}
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </label>
    </Modal>
  );
}

/** Adivina el tipo de un texto seleccionado a mano usando las mismas reglas que la detección automática. */
export function guessCategory(text: string): Category {
  for (const r of BUILTIN_RULES) {
    const re = new RegExp(`^(?:${r.regex.source})$`, r.regex.flags.replace('g', ''));
    if (re.test(text)) return r.category;
  }
  if (new RegExp(`^${NAME_SEQ}$`).test(text) && text.includes(' ')) return 'nombre';
  return 'texto';
}

export type MarkResult = { mode: 'new'; label: string; category: Category; remember: boolean } | { mode: 'existing'; id: string };

export function MarkDialog({ sel, variables, onCancel, onConfirm }: {
  sel: Selection;
  variables: Variable[];
  onCancel: () => void;
  onConfirm: (r: MarkResult) => void;
}) {
  const { t } = useI18n();
  const initialCat = guessCategory(sel.text);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [category, setCategory] = useState<Category>(initialCat);
  // El nombre del dato se propone en español porque coincide con el idioma del documento.
  const [label, setLabel] = useState(CATEGORY_LABELS[initialCat]);
  const [remember, setRemember] = useState(true);
  const [existing, setExisting] = useState(variables[0]?.id ?? '');
  const ok = () => {
    if (mode === 'existing' && existing) onConfirm({ mode, id: existing });
    else if (mode === 'new' && label.trim()) onConfirm({ mode, label: label.trim(), category, remember });
  };
  return (
    <Modal
      title={t('mark.title')}
      onClose={onCancel}
      actions={
        <>
          <button className="btn ghost" onClick={onCancel}>{t('modal.cancel')}</button>
          <button className="btn primary" onClick={ok}>{t('mark.confirm')}</button>
        </>
      }
    >
      <p className="selected-text">«{sel.text}»</p>
      {variables.length > 0 && (
        <div className="segmented">
          <button className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>{t('mark.new')}</button>
          <button className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')}>{t('mark.existing')}</button>
        </div>
      )}
      {mode === 'new' ? (
        <>
          <label className="field">
            {t('mark.name')}
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} placeholder={t('mark.namePh')} />
          </label>
          <label className="field">
            {t('mark.type')}
            <Select<Category>
              ariaLabel={t('mark.type')}
              value={category}
              onChange={(c) => {
                if (label === CATEGORY_LABELS[category]) setLabel(CATEGORY_LABELS[c]);
                setCategory(c);
              }}
              options={CATEGORIES.map((c) => ({ value: c, label: t(`cat.${c}`) }))}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('mark.remember')}
          </label>
        </>
      ) : (
        <label className="field">
          {t('mark.existingLabel')}
          <Select<string>
            ariaLabel={t('mark.existingLabel')}
            value={existing}
            onChange={setExisting}
            options={variables.map((v) => ({ value: v.id, label: v.label, hint: v.original || undefined }))}
          />
        </label>
      )}
    </Modal>
  );
}

const KINDS: FichaKind[] = ['persona', 'empresa', 'inmueble', 'otro'];

export function SaveFichaModal({ variables, onCancel, onConfirm }: {
  variables: Variable[];
  onCancel: () => void;
  onConfirm: (name: string, kind: FichaKind, fields: FichaField[]) => void;
}) {
  const { t } = useI18n();
  const withValue = variables.filter((v) => v.value.trim());
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FichaKind>('persona');
  const [chosen, setChosen] = useState(() => new Set(withValue.map((v) => v.id)));
  const ok = () => {
    if (!name.trim() || chosen.size === 0) return;
    onConfirm(name.trim(), kind, withValue.filter((v) => chosen.has(v.id)).map((v) => ({ key: v.label, value: v.value.trim() })));
  };
  return (
    <Modal
      title={t('ficha.saveTitle')}
      onClose={onCancel}
      actions={
        <>
          <button className="btn ghost" onClick={onCancel}>{t('modal.cancel')}</button>
          <button className="btn primary" disabled={!name.trim() || chosen.size === 0} onClick={ok}>{t('ficha.save')}</button>
        </>
      }
    >
      {withValue.length === 0 ? (
        <p>{t('ficha.needValues')}</p>
      ) : (
        <>
          <p className="muted">{t('ficha.intro')}</p>
          <label className="field">
            {t('ficha.name')}
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ficha.namePh')} />
          </label>
          <label className="field">
            {t('ficha.type')}
            <Select<FichaKind> ariaLabel={t('ficha.type')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))} />
          </label>
          <div className="checklist">
            {withValue.map((v) => (
              <label key={v.id} className="check">
                <input
                  type="checkbox"
                  checked={chosen.has(v.id)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(v.id);
                    else next.delete(v.id);
                    setChosen(next);
                  }}
                />
                <b>{v.label}:</b> {v.value}
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

