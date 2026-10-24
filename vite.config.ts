import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Versión y enlace de descarga del programa de Windows, sacados de package.json. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  build?: { publish?: { owner?: string; repo?: string }[] };
};
const publish = pkg.build?.publish?.[0];
const configured = !!publish?.owner && !publish.owner.startsWith('CAMBIA');
// Siempre apunta al instalador de la última versión publicada en GitHub Releases.
const downloadUrl = configured ? `https://github.com/${publish!.owner}/${publish!.repo}/releases/latest/download/DocFill-Setup.exe` : null;
// Para comprobar desde la web si ya hay alguna versión publicada (si no, no se muestra el botón de descarga).
// Se pide la lista (y no «latest») porque, sin versiones, «latest» responde 404 y el navegador lo marca como error.
const releasesApi = configured ? `https://api.github.com/repos/${publish!.owner}/${publish!.repo}/releases?per_page=5` : null;

// Misma política de seguridad que la app de escritorio y vercel.json, para probarla con «npm run preview».
const { CSP } = createRequire(import.meta.url)('./electron/csp.cjs') as { CSP: string };

export default defineConfig({
  // Rutas relativas para que la build funcione también dentro de la app de escritorio.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  preview: { headers: { 'Content-Security-Policy': CSP } },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DOWNLOAD_URL__: JSON.stringify(downloadUrl),
    __RELEASES_API__: JSON.stringify(releasesApi),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
