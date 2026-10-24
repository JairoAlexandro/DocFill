import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { applySavedTheme } from './theme';
import './styles.css';

applySavedTheme();

// Web instalable: el service worker guarda la app para usarla sin conexión.
// Solo en la versión publicada (no en desarrollo) y no en la app de escritorio, que ya funciona sin conexión.
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
