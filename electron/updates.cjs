// Actualizaciones de la app de escritorio (GitHub Releases, gratuito).
//
// Al abrir DocFill se comprueba si hay una versión nueva ANTES de mostrar la ventana:
// - Actualización normal: «Actualizar ahora» o «Continuar sin actualizar».
// - Actualización obligatoria (las notas de la versión contienen #obligatoria): «Actualizar ahora» o «Salir».
// Si no hay conexión o tarda demasiado, la app se abre con normalidad.
const { app, BrowserWindow, dialog } = require('electron');

const MANDATORY_RE = /#obligatoria|#mandatory/i;
const CHECK_TIMEOUT_MS = 8000;

/** true mientras se comprueba o descarga una actualización. */
let checking = false;
const isCheckingUpdates = () => checking;

const TEXTS = {
  es: {
    title: 'Actualización de DocFill',
    available: (v) => `Hay una nueva versión de DocFill (${v}).`,
    mandatory: (v) => `Actualización obligatoria: versión ${v}.`,
    availableDetail: (cur) => `Puedes actualizar ahora o seguir usando tu versión actual (${cur}).`,
    mandatoryDetail: 'Esta actualización es necesaria para seguir usando DocFill.',
    notes: 'Novedades:',
    update: 'Actualizar ahora',
    later: 'Continuar sin actualizar',
    quit: 'Salir',
    downloading: 'Descargando la actualización…',
    upToDate: (cur) => `Ya tienes la última versión (${cur}).`,
    failed: 'No se pudo descargar la actualización. Comprueba tu conexión e inténtalo de nuevo.',
  },
  en: {
    title: 'DocFill update',
    available: (v) => `A new version of DocFill is available (${v}).`,
    mandatory: (v) => `Required update: version ${v}.`,
    availableDetail: (cur) => `You can update now or keep using your current version (${cur}).`,
    mandatoryDetail: 'This update is required to keep using DocFill.',
    notes: 'What is new:',
    update: 'Update now',
    later: 'Continue without updating',
    quit: 'Quit',
    downloading: 'Downloading the update…',
    upToDate: (cur) => `You already have the latest version (${cur}).`,
    failed: 'The update could not be downloaded. Check your connection and try again.',
  },
};

/** El diálogo va encima de la ventana de DocFill si ya está abierta. */
const box = (parent, opts) => (parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts));

const tx = () => (app.getLocale().toLowerCase().startsWith('es') ? TEXTS.es : TEXTS.en);

/** ¿Está configurado el repositorio donde se publican las versiones? */
function isConfigured() {
  const publish = require('../package.json').build?.publish?.[0];
  return !!publish && !String(publish.owner).startsWith('CAMBIA');
}

/** 1.2.10 > 1.2.9 */
function isNewer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** Texto plano de las notas de la versión (pueden venir como texto, HTML o lista por versión). */
function notesOf(info) {
  const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note ?? '').join('\n') : String(info.releaseNotes ?? '');
  return `${info.releaseName ?? ''}\n${raw}`
    .replace(/<[^>]+>/g, '')
    .replace(MANDATORY_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function progressWindow(text) {
  const win = new BrowserWindow({
    width: 420,
    height: 150,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'DocFill',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const html = `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;margin:24px;color:#1c2230">
    <p>${text}</p><div style="height:8px;background:#e3e6ec;border-radius:99px;overflow:hidden">
    <div id="b" style="height:100%;width:0;background:#2f5bea;transition:width .2s"></div></div>
    <p id="p" style="color:#667085;font-size:13px">0%</p>
    <script>window.set=(n)=>{document.getElementById('b').style.width=n+'%';document.getElementById('p').textContent=Math.round(n)+'%'}</script>`;
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return win;
}

async function download(autoUpdater, t) {
  const win = progressWindow(t.downloading);
  const onProgress = (p) => {
    win.setProgressBar(p.percent / 100);
    win.webContents.executeJavaScript(`window.set && window.set(${Number(p.percent) || 0})`).catch(() => undefined);
  };
  autoUpdater.on('download-progress', onProgress);
  try {
    await autoUpdater.downloadUpdate();
    // Instala en silencio y vuelve a abrir DocFill ya actualizado.
    autoUpdater.quitAndInstall(true, true);
    return true;
  } catch {
    if (!win.isDestroyed()) win.close();
    dialog.showErrorBox(t.title, t.failed);
    return false;
  } finally {
    autoUpdater.removeListener('download-progress', onProgress);
  }
}

/**
 * Comprueba si hay versión nueva y pregunta qué hacer.
 * Devuelve 'continue' (abrir/seguir con la app), 'installing' (se cerrará para instalar) o 'quit'.
 * Con `manual` (botón «Buscar actualizaciones») también avisa cuando ya está al día.
 */
async function checkUpdates(opts = {}) {
  if (!app.isPackaged || !isConfigured()) return 'continue';
  checking = true;
  try {
    return await runCheck(opts);
  } finally {
    checking = false;
  }
}

async function runCheck({ manual = false, parent } = {}) {
  const t = tx();
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return 'continue';
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  let info = null;
  try {
    const result = await Promise.race([autoUpdater.checkForUpdates(), new Promise((r) => setTimeout(() => r(null), CHECK_TIMEOUT_MS))]);
    info = result?.updateInfo ?? null;
  } catch {
    info = null;
  }
  const current = app.getVersion();
  if (!info || !isNewer(info.version, current)) {
    if (manual) await box(parent, { type: 'info', title: t.title, message: t.upToDate(current), buttons: ['OK'] });
    return 'continue';
  }

  const rawNotes = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note ?? '').join('\n') : String(info.releaseNotes ?? '');
  const mandatory = MANDATORY_RE.test(`${info.releaseName ?? ''}\n${rawNotes}`);
  const notes = notesOf(info).slice(0, 700);

  const { response } = await box(parent, {
    type: mandatory ? 'warning' : 'info',
    title: t.title,
    message: mandatory ? t.mandatory(info.version) : t.available(info.version),
    detail: `${mandatory ? t.mandatoryDetail : t.availableDetail(current)}${notes ? `\n\n${t.notes}\n${notes}` : ''}`,
    buttons: [t.update, mandatory ? t.quit : t.later],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (response === 1) {
    if (mandatory) {
      app.quit();
      return 'quit';
    }
    return 'continue';
  }
  const ok = await download(autoUpdater, t);
  if (ok) return 'installing';
  if (mandatory) {
    app.quit();
    return 'quit';
  }
  return 'continue';
}

module.exports = { checkUpdates, isCheckingUpdates, isNewer };
