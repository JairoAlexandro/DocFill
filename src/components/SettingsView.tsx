import { useEffect, useRef, useState } from 'react';
import { LANGS, useI18n, type Lang } from '../i18n';
import type { ThemePref } from '../theme';
import { canInstall, isInstalled, onInstallChange, promptInstall } from '../pwa';
import { APP_VERSION, desktop } from '../desktop';
import { DESKTOP_DOWNLOAD_ENABLED } from '../config';
import { DownloadAppButton, Select, useReleaseAvailable } from './custom';
import {
  downloadBlob,
  errMsg,
  exportBackup,
  formatBytes,
  formatDate,
  importBackup,
  lastBackupAt,
  persistState,
  requestPersist,
  storageEstimate,
  type AppData,
  type PersistState,
} from '../storage';

interface Props {
  data: AppData;
  theme: ThemePref;
  setTheme: (p: ThemePref) => void;
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
}

export function SettingsView({ data, theme, setTheme, refresh, notify }: Props) {
  const { t, lang, setLang, locale } = useI18n();
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [denied, setDenied] = useState(false);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [lastBackup, setLastBackup] = useState(lastBackupAt);
  const [password, setPassword] = useState('');
  const [installable, setInstallable] = useState(canInstall);
  const [version, setVersion] = useState(APP_VERSION);
  const release = useReleaseAvailable();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    desktop()?.getVersion().then(setVersion).catch(() => undefined);
  }, []);
  /** Escritorio: la propia app pregunta con una ventana si hay versión nueva (o avisa de que está al día). */
  const checkUpdates = async () => {
    setChecking(true);
    try {
      await desktop()?.checkUpdates();
    } catch (e) {
      notify(t(errMsg(e)));
    } finally {
      setChecking(false);
    }
  };
  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    persistState().then(setPersist).catch(() => setPersist('unsupported'));
    storageEstimate().then(setEstimate).catch(() => undefined);
  }, [data]);

  const protect = async () => {
    const s = await requestPersist();
    setPersist(s);
    setDenied(s === 'not-persisted');
  };

  const backup = async () => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      downloadBlob(await exportBackup(password || undefined), `docfill-copia-${day}${password ? '-cifrada' : ''}.json`);
      setLastBackup(lastBackupAt());
      notify(t('settings.backupDone'));
    } catch (e) {
      notify(t(errMsg(e)));
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file || !window.confirm(t('settings.restoreConfirm'))) return;
    try {
      const c = await importBackup(await file.text(), password || undefined);
      await refresh();
      notify(t('settings.restored', { t: c.templates, f: c.fichas, h: c.history, l: c.learned, i: c.ignored }));
    } catch (e) {
      notify(e instanceof SyntaxError ? t('settings.invalidBackup') : t(errMsg(e)));
    }
  };

  return (
    <section className="page narrow">
      <h1>{t('settings.title')}</h1>

      <h2>{t('settings.appearance')}</h2>
      <div className="settings-card">
        <label className="field">
          {t('lang.label')}
          <Select<Lang> ariaLabel={t('lang.label')} value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.name }))} />
        </label>
        <div className="field">
          {t('theme.label')}
          <div className="segmented">
            {(['system', 'light', 'dark'] as ThemePref[]).map((p) => (
              <button key={p} className={theme === p ? 'active' : ''} onClick={() => setTheme(p)}>
                {t(`theme.${p}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h2>{t('settings.versionTitle')}</h2>
      <div className="settings-card">
        <p>{t('settings.version', { v: version })}</p>
        {desktop() ? (
          <div className="settings-row">
            <button className="btn" disabled={checking} onClick={checkUpdates}>
              {checking ? t('settings.checking') : t('settings.checkUpdates')}
            </button>
          </div>
        ) : release ? (
          <>
            <p className="muted">{t('settings.desktopIntro')}</p>
            <div className="settings-row">
              <DownloadAppButton compact release={release} />
            </div>
          </>
        ) : DESKTOP_DOWNLOAD_ENABLED ? (
          <p className="muted small-text">{t('settings.desktopSoon')}</p>
        ) : null}
      </div>

      {!desktop() && (
        <>
          <h2>{t('settings.installTitle')}</h2>
          <div className="settings-card">
            <p className="muted">{t('settings.installIntro')}</p>
            {isInstalled() ? (
              <p className="ok-text">✓ {t('settings.installed')}</p>
            ) : installable ? (
              <div className="settings-row">
                <button className="btn primary" onClick={() => void promptInstall()}>
                  {t('settings.install')}
                </button>
              </div>
            ) : (
              <p className="muted small-text">{t('settings.installManual')}</p>
            )}
          </div>
        </>
      )}

      <h2>{t('settings.backupTitle')}</h2>
      <div className="settings-card">
        <p className="muted">{t('settings.backupIntro')}</p>
        <p>
          {t('settings.summary', { t: data.templates.length, f: data.fichas.length, h: data.history.length, l: data.learned.length })}
        </p>
        <label className="field">
          {t('settings.password')}
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="muted small-text">{t('settings.passwordHint')}</span>
        </label>
        <p className="muted">{lastBackup ? t('settings.lastBackup', { date: formatDate(lastBackup, locale) }) : t('settings.neverBackup')}</p>
        <div className="settings-row">
          <button className="btn primary" onClick={backup}>{t('settings.exportAll')}</button>
          <button className="btn" onClick={() => input.current?.click()}>{t('settings.importAll')}</button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void restore(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <h2>{t('settings.storageTitle')}</h2>
      <div className="settings-card">
        <p className="muted">{t('settings.storageIntro')}</p>
        {persist && (
          <div className={`status ${persist === 'persisted' ? 'ok' : ''}`}>
            <span className="pill" />
            <span>
              {persist === 'persisted' && t('settings.persisted')}
              {persist === 'not-persisted' && t('settings.notPersisted')}
              {persist === 'unsupported' && t('settings.persistUnsupported')}
            </span>
          </div>
        )}
        {persist === 'not-persisted' && (
          <div className="settings-row">
            <button className="btn" onClick={protect}>{t('settings.requestPersist')}</button>
            {denied && <span className="muted">{t('settings.persistDenied')}</span>}
          </div>
        )}
        {estimate && estimate.quota > 0 && (
          <>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${Math.max(1, Math.min(100, (estimate.usage / estimate.quota) * 100))}%` }} />
            </div>
            <p className="muted">
              {t('settings.usage', { used: formatBytes(estimate.usage, locale), quota: formatBytes(estimate.quota, locale) })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
