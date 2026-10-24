import { readFileSync } from 'node:fs';
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

export default defineConfig({
  // Rutas relativas para que la build funcione también dentro de la app de escritorio.
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DOWNLOAD_URL__: JSON.stringify(downloadUrl),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
