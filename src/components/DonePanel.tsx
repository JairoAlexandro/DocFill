import { useI18n } from '../i18n';

interface Props {
  fileName: string;
  /** Nombre de la plantilla si el documento ya está guardado como plantilla. */
  templateName?: string;
  onAgain: () => void;
  onAnother: () => void;
  onHome: () => void;
  onTemplates: () => void;
  onSaveTemplate: () => void;
}

/** Lo que se ve al terminar: el documento ya se ha descargado y se ofrecen los siguientes pasos. */
export function DonePanel({ fileName, templateName, onAgain, onAnother, onHome, onTemplates, onSaveTemplate }: Props) {
  const { t } = useI18n();
  return (
    <div className="done-panel">
      <div className="done-icon" aria-hidden="true">✓</div>
      <h3>{t('done.title')}</h3>
      <p className="muted">{t('done.file', { name: fileName })}</p>
      {templateName && <p className="muted small-text">{t('done.savedAs', { name: templateName })}</p>}

      <div className="done-actions">
        <button className="btn primary big" onClick={onAnother}>
          {t('done.another')}
        </button>
        <span className="hint">{t('done.anotherHint')}</span>
        {templateName ? (
          <button className="btn big" onClick={onTemplates}>{t('done.templates')}</button>
        ) : (
          <button className="btn big" onClick={onSaveTemplate}>{t('review.saveTemplate')}</button>
        )}
        <button className="btn big" onClick={onHome}>{t('done.home')}</button>
        <button className="link-btn" onClick={onAgain}>{t('done.again')}</button>
      </div>
    </div>
  );
}
