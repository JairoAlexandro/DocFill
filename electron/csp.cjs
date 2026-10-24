// Política de seguridad del contenido (CSP): de dónde puede cargar cosas la página.
// La usan la app de escritorio (main.cjs) y la vista previa de producción (vite.config.ts).
// La misma política está copiada en vercel.json para la web publicada: si se cambia aquí, cambiarla también allí.
//
// - Solo se cargan scripts, estilos, imágenes y fuentes de la propia app.
// - 'wasm-unsafe-eval' es necesario para el OCR (Tesseract funciona con WebAssembly).
// - La única conexión externa es la API de GitHub, para saber si hay un instalador publicado.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://api.github.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

module.exports = { CSP };
