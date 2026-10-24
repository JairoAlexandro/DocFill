import { useCallback, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'docfill.theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* sin almacenamiento: se sigue el tema del sistema */
  }
  return 'system';
}

/** "system" sigue el tema de Windows/navegador; "light" y "dark" lo fuerzan. */
export function applyTheme(pref: ThemePref): void {
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

/** Se llama antes de pintar la app para que no haya un parpadeo de tema. */
export function applySavedTheme(): void {
  applyTheme(readPref());
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const set = useCallback((p: ThemePref) => {
    setPref(p);
    applyTheme(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* se mantiene solo en esta sesión */
    }
  }, []);
  return [pref, set];
}
