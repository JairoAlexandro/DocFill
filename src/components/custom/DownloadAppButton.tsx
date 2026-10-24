import { useEffect, useState } from 'react';
import { publishedRelease, type PublishedRelease } from '../../desktop';
import { useI18n } from '../../i18n';

/** ¿Hay un instalador de Windows publicado? (null mientras se comprueba o si no lo hay). */
export function useReleaseAvailable(): PublishedRelease | null {
  const [release, setRelease] = useState<PublishedRelease | null>(null);
  useEffect(() => {
    let alive = true;
    publishedRelease().then((r) => alive && setRelease(r));
    return () => {
      alive = false;
    };
  }, []);
  return release;
}

/**
 * Botón para descargar el programa de Windows. No aparece dentro del propio programa
 * ni mientras no haya ninguna versión publicada en GitHub.
 */
export function DownloadAppButton({ compact, release }: { compact?: boolean; release: PublishedRelease | null }) {
  const { t } = useI18n();
  if (!release) return null;
  return (
    <a className={`btn ${compact ? '' : 'big'} download-app`} href={release.url} rel="noopener">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
        <path d="M3 5.5 10 4.5v7H3zM11 4.4 21 3v8.5H11zM3 12.5h7v7l-7-1zM11 12.5h10V21l-10-1.4z" />
      </svg>
      {t('app.downloadWindows')}
      {release.version && <span className="muted small-text">v{release.version}</span>}
    </a>
  );
}
