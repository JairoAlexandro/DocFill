import { DOWNLOAD_URL, desktop } from '../../desktop';
import { useI18n } from '../../i18n';

/** Botón para descargar el programa de Windows. No aparece dentro del propio programa ni si aún no hay descarga. */
export function DownloadAppButton({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  if (desktop() || !DOWNLOAD_URL) return null;
  return (
    <a className={`btn ${compact ? '' : 'big'} download-app`} href={DOWNLOAD_URL} rel="noopener">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
        <path d="M3 5.5 10 4.5v7H3zM11 4.4 21 3v8.5H11zM3 12.5h7v7l-7-1zM11 12.5h10V21l-10-1.4z" />
      </svg>
      {t('app.downloadWindows')}
    </a>
  );
}
