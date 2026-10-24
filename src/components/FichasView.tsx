import { useRef, useState } from 'react';
import { parseCSV } from '../core/csv';
import { normalizeKey, uid } from '../core/text';
import { useI18n } from '../i18n';
import { Select } from './custom';
import { errMsg, put, remove, type Ficha, type FichaKind } from '../storage';

const KINDS: FichaKind[] = ['persona', 'empresa', 'inmueble', 'otro'];

interface Props {
  fichas: Ficha[];
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
}

export function FichasView({ fichas, refresh, notify }: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Ficha | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  /** CSV con una fila por ficha: columna "ficha" (nombre) y una columna por campo. */
  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      const rows = parseCSV(await file.text());
      if (rows.length < 2) throw new Error('batch.needRows');
      const header = rows[0];
      const nameCol = Math.max(0, header.findIndex((h) => ['ficha', 'nombre ficha', 'profile'].includes(normalizeKey(h))));
      let n = 0;
      for (const row of rows.slice(1)) {
        const name = (row[nameCol] ?? '').trim();
        if (!name) continue;
        const fields = header
          .map((key, i) => ({ key: key.trim(), value: (row[i] ?? '').trim() }))
          .filter((f, i) => i !== nameCol && f.key && f.value);
        await put('fichas', { id: uid(), name, kind: 'persona', fields, createdAt: Date.now() });
        n++;
      }
      await refresh();
      notify(t('fichas.imported', { n }));
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    try {
      await put('fichas', { ...editing, name: editing.name.trim(), fields: editing.fields.filter((f) => f.key.trim()) });
      setEditing(null);
      await refresh();
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const del = async (f: Ficha) => {
    if (!window.confirm(t('fichas.confirmDelete', { name: f.name }))) return;
    await remove('fichas', f.id);
    await refresh();
  };

  if (editing) {
    const setField = (i: number, patch: Partial<{ key: string; value: string }>) =>
      setEditing({ ...editing, fields: editing.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
    return (
      <section className="page narrow">
        <h1>{fichas.some((f) => f.id === editing.id) ? t('fichas.editTitle') : t('fichas.newTitle')}</h1>
        <label className="field">
          {t('fichas.name')}
          <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder={t('ficha.namePh')} />
        </label>
        <label className="field">
          {t('ficha.type')}
          <Select<FichaKind>
            ariaLabel={t('ficha.type')}
            value={editing.kind}
            onChange={(kind) => setEditing({ ...editing, kind })}
            options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
          />
        </label>
        <p className="muted">{t('fichas.help')}</p>
        <div className="fields">
          {editing.fields.map((f, i) => (
            <div key={i} className="field-row">
              <input value={f.key} placeholder={t('fichas.field')} onChange={(e) => setField(i, { key: e.target.value })} />
              <input value={f.value} placeholder={t('fichas.value')} onChange={(e) => setField(i, { value: e.target.value })} />
              <button
                className="btn small ghost"
                aria-label={t('fichas.removeField')}
                onClick={() => setEditing({ ...editing, fields: editing.fields.filter((_, j) => j !== i) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button className="btn small" onClick={() => setEditing({ ...editing, fields: [...editing.fields, { key: '', value: '' }] })}>
            {t('fichas.addField')}
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => setEditing(null)}>{t('modal.cancel')}</button>
          <button className="btn primary" disabled={!editing.name.trim()} onClick={save}>{t('ficha.save')}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t('fichas.title')}</h1>
        <div className="row-actions">
        <button className="btn" title={t('fichas.importHelp')} onClick={() => importInput.current?.click()}>
          {t('fichas.import')}
        </button>
        <input ref={importInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = ''; }} />
        <button
          className="btn primary"
          onClick={() =>
            setEditing({
              id: uid(),
              name: '',
              kind: 'persona',
              createdAt: Date.now(),
              fields: [
                { key: t('fichas.defaultName'), value: '' },
                { key: t('fichas.defaultId'), value: '' },
              ],
            })
          }
        >
          {t('fichas.new')}
        </button>
        </div>
      </div>
      <p className="muted">{t('fichas.intro')}</p>
      {fichas.length === 0 ? (
        <div className="empty">{t('fichas.empty')}</div>
      ) : (
        <div className="grid">
          {fichas.map((f) => (
            <article key={f.id} className="tile">
              <h3>{f.name}</h3>
              <p className="muted">{t('fichas.kindCount', { kind: t(`kind.${f.kind}`), n: f.fields.length })}</p>
              <dl className="mini">
                {f.fields.slice(0, 4).map((x, i) => (
                  <div key={i}>
                    <dt>{x.key}</dt>
                    <dd>{x.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="tile-actions">
                <button className="btn small" onClick={() => setEditing(structuredClone(f))}>{t('fichas.edit')}</button>
                <button className="btn small danger" onClick={() => del(f)}>{t('fichas.delete')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
