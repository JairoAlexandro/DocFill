import { useCallback, useEffect, useRef, useState } from 'react';
import { formatOf, readDocument } from './core/formats';
import { detectVariables } from './core/detect';
import { applyFields } from './core/variables';
import { loadAll, errMsg, persistState, requestPersist, type AppData, type Session, type Template, type HistoryEntry } from './storage';
import { LANGS, useI18n, type Lang } from './i18n';
import { useTheme, type ThemePref } from './theme';
import { Uploader } from './components/Uploader';
import { Editor } from './components/Editor';
import { TemplatesView } from './components/TemplatesView';
import { FichasView } from './components/FichasView';
import { LearningView } from './components/LearningView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { onLaunchFiles } from './pwa';
import { Select, useDismiss } from './components/custom';

type View = 'documento' | 'plantillas' | 'fichas' | 'aprendizaje' | 'historial' | 'ajustes';

const TABS: { id: View; key: string }[] = [
  { id: 'documento', key: 'nav.document' },
  { id: 'plantillas', key: 'nav.templates' },
  { id: 'fichas', key: 'nav.fichas' },
  { id: 'aprendizaje', key: 'nav.learning' },
  { id: 'historial', key: 'nav.history' },
  { id: 'ajustes', key: 'nav.settings' },
];

const EMPTY: AppData = { templates: [], fichas: [], history: [], learned: [], ignored: [] };
const NEXT_THEME: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useTheme();
  const [view, setView] = useState<View>('documento');
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuOpen, header, closeMenu);

  const notify = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      setData(await loadAll());
    } catch (e) {
      notify(t('app.storageError', { msg: t(errMsg(e)) }));
    }
  }, [notify, t]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pide al navegador que no borre los datos aunque falte espacio (si ya lo concedió, no hace nada).
  useEffect(() => {
    persistState()
      .then((s) => (s === 'not-persisted' ? requestPersist() : s))
      .catch(() => undefined);
  }, []);

  const openNew = useCallback(
    async (fileName: string, bytes: ArrayBuffer) => {
      if (!formatOf(fileName)) {
        notify(t('err.unsupported'));
        return;
      }
      setBusy(true);
      try {
        const paragraphs = await readDocument(fileName, bytes, { onProgress: setProgress });
        const variables = detectVariables(paragraphs, {
          learned: data.learned,
          ignored: data.ignored.map((i) => i.value),
        });
        setSession({ fileName, bytes, paragraphs, variables });
        setView('documento');
        notify(variables.length ? t('app.found', { n: variables.length }) : t('app.noneFound'));
      } catch (e) {
        notify(t(errMsg(e)));
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [data.learned, data.ignored, notify, t],
  );

  // Con la web instalada, los documentos abiertos desde el explorador de archivos llegan aquí.
  useEffect(() => {
    onLaunchFiles(async (file) => openNew(file.name, await file.arrayBuffer()));
  }, [openNew]);

  const openTemplate = useCallback(
    async (tpl: Template, entry?: HistoryEntry) => {
      try {
        // Los PDF y fotos guardan el texto reconocido para no repetir el OCR.
        const paragraphs = tpl.paragraphs ?? (await readDocument(tpl.fileName, tpl.bytes));
        let variables = tpl.variables.map((v) => ({ ...v, value: '' }));
        if (entry) variables = applyFields(variables, entry.values).vars;
        setSession({
          fileName: tpl.fileName,
          bytes: tpl.bytes,
          paragraphs,
          variables,
          templateId: tpl.id,
          templateName: tpl.name,
          optional: tpl.optional,
          fileNamePattern: tpl.fileNamePattern,
          repeats: tpl.repeats,
        });
        setView('documento');
      } catch (e) {
        notify(t(errMsg(e)));
      }
    },
    [notify, t],
  );

  return (
    <div className="app">
      <header className="topbar" ref={header}>
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="currentColor" opacity=".18" />
            <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          DocFill
        </div>
        {/* En el móvil las pestañas, el idioma y el tema van dentro del menú hamburguesa. */}
        <button
          className="icon-btn menu-toggle"
          aria-label={t('nav.menu')}
          aria-expanded={menuOpen}
          aria-controls="main-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MenuIcon open={menuOpen} />
        </button>
        <div id="main-menu" className={`main-menu${menuOpen ? ' open' : ''}`}>
          <nav className="tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={view === tab.id ? 'active' : ''}
                aria-current={view === tab.id ? 'page' : undefined}
                onClick={() => {
                  setView(tab.id);
                  setMenuOpen(false);
                }}
              >
                {t(tab.key)}
              </button>
            ))}
          </nav>
          <div className="top-controls">
            <Select<Lang> small ariaLabel={t('lang.label')} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.name }))} />
            <button
              className="icon-btn"
              onClick={() => setTheme(NEXT_THEME[theme])}
              title={`${t('theme.label')}: ${t(`theme.${theme}`)}`}
              aria-label={`${t('theme.label')}: ${t(`theme.${theme}`)}`}
            >
              <ThemeIcon pref={theme} />
            </button>
          </div>
        </div>
      </header>
      {menuOpen && <div className="menu-backdrop" aria-hidden="true" />}

      <main className="content">
        {view === 'documento' &&
          (session ? (
            <Editor
              session={session}
              update={(fn) => setSession((s) => (s ? fn(s) : s))}
              onClose={() => setSession(null)}
              onOpenTemplates={() => setView('plantillas')}
              data={data}
              refresh={refresh}
              notify={notify}
            />
          ) : (
            <Uploader busy={busy} progress={progress} onFile={openNew} notify={notify} />
          ))}
        {view === 'plantillas' && <TemplatesView templates={data.templates} onOpen={(tpl) => openTemplate(tpl)} refresh={refresh} notify={notify} />}
        {view === 'fichas' && <FichasView fichas={data.fichas} refresh={refresh} notify={notify} />}
        {view === 'aprendizaje' && <LearningView data={data} refresh={refresh} notify={notify} />}
        {view === 'historial' && (
          <HistoryView history={data.history} templates={data.templates} onOpen={(tpl, e) => openTemplate(tpl, e)} refresh={refresh} />
        )}
        {view === 'ajustes' && <SettingsView data={data} theme={theme} setTheme={setTheme} refresh={refresh} notify={notify} />}
      </main>

      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

function ThemeIcon({ pref }: { pref: ThemePref }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (pref === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (pref === 'dark')
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
