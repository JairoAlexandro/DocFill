/** Funciones que solo existen en la app de escritorio (las expone electron/preload.cjs). */
interface DesktopBridge {
  canConvertToPdf: () => Promise<boolean>;
  convertToPdf: (bytes: Uint8Array, ext: string) => Promise<Uint8Array>;
  getVersion: () => Promise<string>;
  /** Busca una versión nueva y pregunta si instalarla. */
  checkUpdates: () => Promise<'continue' | 'installing' | 'quit'>;
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { docfillDesktop?: DesktopBridge }).docfillDesktop ?? null;
}

/** Electron añade "Error invoking remote method '…': Error: clave" al mensaje; nos quedamos con la clave. */
export function desktopError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.match(/(pdf\.[a-zA-Z]+)/)?.[1] ?? msg;
}

export const APP_VERSION = __APP_VERSION__;
/** Enlace al instalador de Windows (null hasta que se configure el repositorio de GitHub). */
export const DOWNLOAD_URL = __DOWNLOAD_URL__;

/** Datos de la última versión publicada del programa de Windows, o null si todavía no hay ninguna. */
export interface PublishedRelease {
  version: string;
  url: string;
}

let releaseCheck: Promise<PublishedRelease | null> | null = null;

/**
 * Pregunta a GitHub (una sola vez por visita) si ya hay un instalador publicado.
 * Así el botón «Descargar para Windows» no aparece mientras el enlace daría error.
 */
export function publishedRelease(): Promise<PublishedRelease | null> {
  if (!__RELEASES_API__ || !DOWNLOAD_URL || desktop()) return Promise.resolve(null);
  releaseCheck ??= fetch(__RELEASES_API__, { headers: { Accept: 'application/vnd.github+json' } })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { tag_name?: string; assets?: { name: string }[] };
      const hasInstaller = data.assets?.some((a) => a.name === 'DocFill-Setup.exe');
      return hasInstaller ? { version: String(data.tag_name ?? '').replace(/^v/, ''), url: DOWNLOAD_URL! } : null;
    })
    .catch(() => null);
  return releaseCheck;
}
