import { useRef, useState } from 'react';
import { errMsg } from '../storage';
import { useI18n } from '../i18n';
import { ACCEPT } from '../core/formats';
import { DOWNLOAD_URL, desktop } from '../desktop';
import { DownloadAppButton } from './custom';

interface Props {
  busy: boolean;
  /** Avance del reconocimiento de texto (OCR), de 0 a 1. */
  progress: number | null;
  onFile: (name: string, bytes: ArrayBuffer) => void;
  notify: (msg: string) => void;
}

export function Uploader({ busy, progress, onFile, notify }: Props) {
  const { t } = useI18n();
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined) => {
    if (file) onFile(file.name, await file.arrayBuffer());
  };

  const loadSample = async () => {
    try {
      const res = await fetch('ejemplos/contrato-arrendamiento.docx');
      if (!res.ok) throw new Error('upload.sampleMissing');
      onFile('contrato-arrendamiento.docx', await res.arrayBuffer());
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  return (
    <div className="uploader">
      <div className="hero">
        <h1>{t('upload.title')}</h1>
        <p>{t('upload.subtitle')}</p>
      </div>

      <div
        className={`dropzone ${drag ? 'drag' : ''} ${busy ? 'busy' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files[0]);
        }}
      >
        <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <strong>
          {progress !== null ? t('upload.ocr', { n: Math.round(progress * 100) }) : busy ? t('upload.analyzing') : t('upload.drop')}
        </strong>
        <span>{t('upload.dropHint')}</span>
        <span className="formats">{t('upload.formats')}</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            void handle(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <button className="btn ghost" onClick={loadSample} disabled={busy}>
        {t('upload.sample')}
      </button>

      <ol className="steps">
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <b>{t(`upload.step${n}b`)}</b>
            {t(`upload.step${n}`)}
          </li>
        ))}
      </ol>
      <p className="privacy">{t('upload.privacy')}</p>
      {DOWNLOAD_URL && !desktop() && (
        <div className="get-app">
          <span className="muted">{t('app.getDesktop')}</span>
          <DownloadAppButton compact />
        </div>
      )}
    </div>
  );
}
