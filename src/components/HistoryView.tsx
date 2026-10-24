import { useI18n } from '../i18n';
import { formatDate, remove, type HistoryEntry, type Template } from '../storage';

interface Props {
  history: HistoryEntry[];
  templates: Template[];
  onOpen: (t: Template, entry: HistoryEntry) => void;
  refresh: () => Promise<void>;
}

export function HistoryView({ history, templates, onOpen, refresh }: Props) {
  const { t, locale } = useI18n();
  return (
    <section className="page">
      <h1>{t('history.title')}</h1>
      <p className="muted">{t('history.intro')}</p>
      {history.length === 0 ? (
        <div className="empty">{t('history.empty')}</div>
      ) : (
        <div className="list">
          {history.map((h) => {
            const tpl = templates.find((x) => x.id === h.templateId);
            return (
              <article key={h.id} className="row">
                <div className="row-main">
                  <strong>{h.templateName ?? h.fileName}</strong>
                  <span className="muted">
                    {formatDate(h.createdAt, locale)}
                    {h.count ? t('history.batchOf', { n: h.count }) : ''}
                  </span>
                  {h.values.length > 0 && (
                    <div className="chips">
                      {h.values.slice(0, 6).map((v) => (
                        <span key={v.key} className="chip" title={v.key}>{v.value}</span>
                      ))}
                      {h.values.length > 6 && <span className="chip">+{h.values.length - 6}</span>}
                    </div>
                  )}
                </div>
                <div className="row-actions">
                  {tpl && h.values.length > 0 && (
                    <button className="btn small" onClick={() => onOpen(tpl, h)} title={t('history.repeatTitle')}>
                      {t('history.repeat')}
                    </button>
                  )}
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      await remove('history', h.id);
                      await refresh();
                    }}
                  >
                    {t('history.remove')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
