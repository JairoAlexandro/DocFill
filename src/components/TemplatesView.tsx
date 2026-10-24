import { useState } from 'react';
import { normalizeKey, uid } from '../core/text';
import { useI18n } from '../i18n';
import { errMsg, formatDate, put, remove, type Template } from '../storage';

interface Props {
  templates: Template[];
  onOpen: (t: Template) => void;
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
}

export function TemplatesView({ templates, onOpen, refresh, notify }: Props) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const shown = templates.filter((tpl) => normalizeKey(`${tpl.name} ${tpl.fileName}`).includes(normalizeKey(query)));

  const duplicate = async (tpl: Template) => {
    try {
      await put('templates', { ...tpl, id: uid(), name: `${tpl.name} ${t('templates.copySuffix')}`, createdAt: Date.now(), updatedAt: Date.now() });
      await refresh();
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const del = async (tpl: Template) => {
    if (!window.confirm(t('templates.confirmDelete', { name: tpl.name }))) return;
    try {
      await remove('templates', tpl.id);
      await refresh();
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  return (
    <section className="page">
      <h1>{t('templates.title')}</h1>
      <p className="muted">{t('templates.intro')}</p>
      {templates.length > 0 && (
        <input className="search" type="search" value={query} placeholder={t('templates.search')} onChange={(e) => setQuery(e.target.value)} />
      )}
      {templates.length === 0 ? (
        <div className="empty">{t('templates.empty')}</div>
      ) : shown.length === 0 ? (
        <div className="empty">{t('templates.noResults')}</div>
      ) : (
        <div className="grid">
          {shown.map((tpl) => (
            <article key={tpl.id} className="tile">
              <h3>{tpl.name}</h3>
              <p className="muted">{tpl.fileName}</p>
              <p className="muted">{t('templates.count', { n: tpl.variables.length, date: formatDate(tpl.updatedAt, locale) })}</p>
              <div className="tile-actions">
                <button className="btn primary small" onClick={() => onOpen(tpl)}>{t('templates.use')}</button>
                <button className="btn small" onClick={() => duplicate(tpl)}>{t('templates.duplicate')}</button>
                <button className="btn danger small" onClick={() => del(tpl)}>{t('templates.delete')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
