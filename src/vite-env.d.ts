/// <reference types="vite/client" />

/** Versión de package.json (la pone vite.config.ts). */
declare const __APP_VERSION__: string;
/** Enlace al instalador de Windows más reciente, o null si aún no está configurado el repositorio. */
declare const __DOWNLOAD_URL__: string | null;
/** API de GitHub con las últimas versiones publicadas, o null si no está configurado el repositorio. */
declare const __RELEASES_API__: string | null;
