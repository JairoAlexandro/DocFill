// App de escritorio de DocFill: abre la misma web, pero sin conexión y con los datos guardados en el equipo.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, session, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { checkUpdates, isCheckingUpdates } = require('./updates.cjs');
const { CSP } = require('./csp.cjs');

const DIST = path.join(__dirname, '..', 'dist');
const APP_ORIGIN = 'app://docfill';
// La dirección de desarrollo solo se acepta mientras se programa, nunca en la app instalada.
const DEV_URL = !app.isPackaged ? process.env.DOCFILL_DEV_URL : undefined;

/** ¿La petición viene de la propia DocFill? (y no de otra página que se hubiera colado en la ventana). */
function trusted(event) {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(APP_ORIGIN + '/') || (!!DEV_URL && url.startsWith(DEV_URL));
}

// Protocolo propio (app://) para que fetch e IndexedDB funcionen igual que en la web.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DocFill',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.loadURL(DEV_URL || `${APP_ORIGIN}/index.html`);
  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // La ventana de DocFill nunca puede pasar a mostrar otra web: tendría acceso a las funciones del programa.
  const stayInApp = (event, url) => {
    if (url.startsWith(APP_ORIGIN + '/') || (DEV_URL && url.startsWith(DEV_URL))) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  };
  win.webContents.on('will-navigate', stayInApp);
  win.webContents.on('will-redirect', stayInApp);
}

// ---------------------------------------------------------------- Exportar a PDF con LibreOffice (gratuito)

function findSoffice() {
  const candidates = [
    process.env.DOCFILL_SOFFICE,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'LibreOffice', 'program', 'soffice.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'LibreOffice', 'program', 'soffice.exe'),
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const ALLOWED_EXT = new Set(['docx', 'odt', 'pptx', 'xlsx', 'txt']);

ipcMain.handle('docfill:can-pdf', (event) => trusted(event) && !!findSoffice());

ipcMain.handle('docfill:to-pdf', async (event, bytes, ext) => {
  if (!trusted(event)) throw new Error('pdf.failed');
  const soffice = findSoffice();
  if (!soffice) throw new Error('pdf.noLibreOffice');
  if (!ALLOWED_EXT.has(String(ext))) throw new Error('pdf.unsupported');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docfill-'));
  try {
    const input = path.join(dir, `documento.${ext}`);
    await fs.promises.writeFile(input, Buffer.from(bytes));
    await new Promise((resolve, reject) => {
      execFile(
        soffice,
        ['--headless', '--norestore', `-env:UserInstallation=${pathToFileURL(path.join(dir, 'perfil')).toString()}`, '--convert-to', 'pdf', '--outdir', dir, input],
        { timeout: 120000, windowsHide: true },
        (err) => (err ? reject(new Error('pdf.failed')) : resolve()),
      );
    });
    return new Uint8Array(await fs.promises.readFile(path.join(dir, 'documento.pdf')));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Versión y actualizaciones (ver updates.cjs)

ipcMain.handle('docfill:version', () => app.getVersion());

/** Botón «Buscar actualizaciones» de Ajustes. */
ipcMain.handle('docfill:check-updates', (event) =>
  trusted(event) ? checkUpdates({ manual: true, parent: BrowserWindow.fromWebContents(event.sender) ?? undefined }) : 'continue',
);

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Antes de abrir la ventana: si hay versión nueva se pregunta (o se exige, si es obligatoria).
  const result = await checkUpdates();
  if (result !== 'continue') return;
  // DocFill no necesita cámara, micrófono, ubicación ni notificaciones: se deniega cualquier permiso.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, relative));
    // Solo archivos de dentro de dist/ (con separador: «dist-otra» no cuenta como dist).
    if (!file.startsWith(DIST + path.sep)) return new Response('No encontrado', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers });
  });
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  // Si se cierra la ventana de progreso de una actualización que ha fallado, la app debe seguir y abrirse.
  if (process.platform !== 'darwin' && !isCheckingUpdates()) app.quit();
});
