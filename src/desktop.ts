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
