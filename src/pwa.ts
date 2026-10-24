/** Instalación de la web como app (PWA) y apertura de documentos desde el sistema. */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

export function isInstalled(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

interface LaunchParams {
  files: { getFile: () => Promise<File> }[];
}

/** Con la web instalada, "Abrir con DocFill" desde el explorador de archivos llega aquí. */
export function onLaunchFiles(fn: (file: File) => void): void {
  const queue = (window as unknown as { launchQueue?: { setConsumer: (cb: (p: LaunchParams) => void) => void } }).launchQueue;
  queue?.setConsumer(async (params) => {
    const handle = params.files[0];
    if (handle) fn(await handle.getFile());
  });
}
