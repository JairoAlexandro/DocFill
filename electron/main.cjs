// App de escritorio de DocFill: abre la misma web, pero sin conexión y con los datos guardados en el equipo.
const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { checkUpdates, isCheckingUpdates } = require('./updates.cjs');

const DIST = path.join(__dirname, '..', 'dist');

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
  win.loadURL(process.env.DOCFILL_DEV_URL || 'app://docfill/index.html');
  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
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

ipcMain.handle('docfill:can-pdf', () => !!findSoffice());

ipcMain.handle('docfill:to-pdf', async (_event, bytes, ext) => {
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
ipcMain.handle('docfill:check-updates', (event) => checkUpdates({ manual: true, parent: BrowserWindow.fromWebContents(event.sender) ?? undefined }));

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Antes de abrir la ventana: si hay versión nueva se pregunta (o se exige, si es obligatoria).
  const result = await checkUpdates();
  if (result !== 'continue') return;
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, relative));
    if (!file.startsWith(DIST)) return new Response('No encontrado', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  // Si se cierra la ventana de progreso de una actualización que ha fallado, la app debe seguir y abrirse.
  if (process.platform !== 'darwin' && !isCheckingUpdates()) app.quit();
});
