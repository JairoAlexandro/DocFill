// Puente seguro entre la página y la app de escritorio: conversión a PDF, versión y actualizaciones.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('docfillDesktop', {
  /** ¿Hay LibreOffice instalado para convertir a PDF? */
  canConvertToPdf: () => ipcRenderer.invoke('docfill:can-pdf'),
  /** Convierte un documento (bytes + extensión) a PDF con LibreOffice y devuelve los bytes del PDF. */
  convertToPdf: (bytes, ext) => ipcRenderer.invoke('docfill:to-pdf', bytes, ext),
  /** Versión instalada de la app. */
  getVersion: () => ipcRenderer.invoke('docfill:version'),
  /** Busca una versión nueva y pregunta si instalarla. */
  checkUpdates: () => ipcRenderer.invoke('docfill:check-updates'),
});
