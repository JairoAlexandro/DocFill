import { useRef } from 'react';
import { BUILTIN_RULES } from '../core/rules';
import type { LearnedRule } from '../core/learning';
import { useI18n } from '../i18n';
import { downloadBlob, errMsg, formatDate, put, remove, type AppData, type IgnoredValue } from '../storage';

interface Props {
  data: AppData;
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
}

const EXTRA_RULES = ['names', 'surnames', 'shortnames', 'companies', 'blanks', 'words', 'dates', 'gender', 'repeated', 'pdftext', 'ocr'];

export function LearningView({ data, refresh, notify }: Props) {
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const json = JSON.stringify({ app: 'DocFill', version: 1, learned: data.learned, ignored: data.ignored }, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), 'docfill-aprendizaje.json');
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { learned?: LearnedRule[]; ignored?: IgnoredValue[] };
      const learned = (parsed.learned ?? []).filter((r) => r && typeof r.id === 'string' && typeof r.label === 'string');
      const ignored = (parsed.ignored ?? []).filter((r) => r && typeof r.id === 'string' && typeof r.value === 'string');
      for (const r of learned) await put('learned', r);
      for (const r of ignored) await put('ignored', r);
      await refresh();
      notify(t('learning.imported', { a: learned.length, b: ignored.length }));
    } catch (e) {
      notify(t('learning.importError', { msg: t(errMsg(e)) }));
    }
  };

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t('learning.title')}</h1>
        <div className="row-actions">
          <button className="btn" onClick={exportJson}>{t('learning.export')}</button>
          <button className="btn" onClick={() => input.current?.click()}>{t('learning.import')}</button>
          <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      <p className="muted">{t('learning.intro')}</p>

      <h2>{t('learning.learnedTitle', { n: data.learned.length })}</h2>
      {data.learned.length === 0 ? (
        <div className="empty">{t('learning.learnedEmpty')}</div>
      ) : (
        <div className="list">
          {data.learned.map((r) => (
            <article key={r.id} className="row">
              <div className="row-main">
                <strong>{r.label}</strong>
                <span className="muted">
                  {t(`cat.${r.category}`)} · {t(`shape.${r.shape}`)} · {formatDate(r.createdAt, locale)}
                </span>
                <span className="rule-context">
                  {r.prefix && <code>{r.prefix}</code>} <em>{t('learning.data')}</em> {r.suffix && <code>{r.suffix}</code>}
                </span>
                {r.examples.length > 0 && <span className="muted">{t('learning.examples', { list: r.examples.join(' · ') })}</span>}
              </div>
              <div className="row-actions">
                <button className="btn small danger" onClick={async () => { await remove('learned', r.id); await refresh(); }}>
                  {t('learning.forget')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2>{t('learning.ignoredTitle', { n: data.ignored.length })}</h2>
      {data.ignored.length === 0 ? (
        <div className="empty">{t('learning.ignoredEmpty')}</div>
      ) : (
        <div className="chips">
          {data.ignored.map((i) => (
            <span key={i.id} className="chip removable">
              {i.value}
              <button aria-label={t('learning.redetect', { v: i.value })} onClick={async () => { await remove('ignored', i.id); await refresh(); }}>✕</button>
            </span>
          ))}
        </div>
      )}

      <h2>{t('learning.builtinTitle')}</h2>
      <div className="rules-table">
        {[...BUILTIN_RULES.map((r) => r.id), ...EXTRA_RULES].map((id) => (
          <div key={id}>
            <strong>{t(`rule.${id}.name`)}</strong>
            <span className="muted">{t(`rule.${id}.desc`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
