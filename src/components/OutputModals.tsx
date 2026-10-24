import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { formatOf, outputExtension } from '../core/formats';
import { applyRecord, applyRecordToRepeats, fieldKeys, fileNameFromPattern, jsonTemplate, parseBatch } from '../core/batch';
import { toCSV } from '../core/csv';
import { isOverlayDocument, renderDocument } from '../core/produce';
import type { ReviewIssue } from '../core/review';
import type { Variable } from '../core/types';
import { desktop, desktopError } from '../desktop';
import { useI18n } from '../i18n';
import { baseName, downloadBlob, errMsg, safeFileName, type Session } from '../storage';
import { Modal } from './Modals';

export function defaultPattern(session: Session): string {
  return session.fileNamePattern ?? `${baseName(session.fileName)}-relleno`;
}

function extOf(fileName: string): string {
  return outputExtension(fileName);
}

/** Genera el documento final (y lo convierte a PDF si se pide, en la app de escritorio). */
async function produce(session: Session, vars: Variable[], toPdf: boolean, flatten = false): Promise<{ bytes: Uint8Array; ext: string; mime: string }> {
  const bytes = await renderDocument(session, vars, { flatten });
  const ext = extOf(session.fileName);
  if (!toPdf || ext === 'pdf') return { bytes, ext, mime: formatOf(session.fileName)?.mime ?? 'application/octet-stream' };
  const bridge = desktop();
  if (!bridge) throw new Error('download.pdfWebOnly');
  try {
    return { bytes: await bridge.convertToPdf(bytes, ext), ext: 'pdf', mime: 'application/pdf' };
  } catch (e) {
    throw new Error(desktopError(e));
  }
}

function usePdfAvailable(session: Session): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const bridge = desktop();
    if (!bridge || extOf(session.fileName) === 'pdf') return setOk(null);
    bridge.canConvertToPdf().then(setOk).catch(() => setOk(false));
  }, [session.fileName]);
  return ok;
}

function FormatChoice({ session, toPdf, setToPdf }: { session: Session; toPdf: boolean; setToPdf: (v: boolean) => void }) {
  const { t } = useI18n();
  const pdfOk = usePdfAvailable(session);
  const ext = extOf(session.fileName);
  if (ext === 'pdf') return null;
  return (
    <div className="field">
      {t('download.format')}
      <div className="segmented">
        <button className={!toPdf ? 'active' : ''} onClick={() => setToPdf(false)}>{t('download.original', { ext })}</button>
        <button className={toPdf ? 'active' : ''} disabled={!pdfOk} onClick={() => setToPdf(true)}>{t('download.pdf')}</button>
      </div>
      {pdfOk === null && <span className="muted small-text">{t('download.pdfWebOnly')}</span>}
      {pdfOk === false && <span className="muted small-text">{t('download.pdfMissing')}</span>}
    </div>
  );
}

/** Último paso del asistente: avisos de la revisión, nombre del archivo, formato y descarga. */
export function DownloadForm({ session, vars, removed, issues, onPattern, onDone, onGoTo, notify }: {
  session: Session;
  vars: Variable[];
  removed: number[];
  issues: ReviewIssue[];
  onPattern: (pattern: string) => void;
  onDone: (fileName: string) => void;
  onGoTo: (issue: ReviewIssue) => void;
  notify: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [pattern, setPattern] = useState(defaultPattern(session));
  const [toPdf, setToPdf] = useState(false);
  // Activado por defecto: el PDF de partida puede tener datos reales de otra persona.
  const [flatten, setFlatten] = useState(true);
  const [busy, setBusy] = useState(false);
  const overlay = isOverlayDocument(session) && extOf(session.fileName) === 'pdf';
  const label = (id: string) => vars.find((v) => v.id === id)?.label ?? '';
  const name = fileNameFromPattern(pattern, vars, baseName(session.fileName));
  const warnings = issues.filter((i) => i.kind !== 'vacio');
  const empty = issues.filter((i) => i.kind === 'vacio');
  const example = `{${vars.find((v) => v.category === 'nombre')?.label ?? vars[0]?.label ?? 'Dato'}}`;

  const download = async () => {
    setBusy(true);
    onPattern(pattern);
    try {
      const out = await produce(session, vars, toPdf, flatten);
      const fileName = `${safeFileName(name)}.${out.ext}`;
      downloadBlob(new Blob([out.bytes], { type: out.mime }), fileName);
      onDone(fileName);
    } catch (e) {
      notify(t(errMsg(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="download-form">
      <section className="review">
        <h4>{t('download.reviewTitle')}</h4>
        {warnings.length === 0 ? (
          <p className="ok-text">✓ {t('download.reviewOk')}</p>
        ) : (
          <ul>
            {warnings.map((i, n) => (
              <li key={n} className="warn-item">
                <span>{t(`download.issue.${i.kind}`, { label: label(i.varId), text: i.detail ?? '', msg: i.detail ? t(i.detail) : '' })}</span>
                <button className="btn small ghost" onClick={() => onGoTo(i)}>{t('download.goTo')}</button>
              </li>
            ))}
          </ul>
        )}
        {empty.length > 0 && (
          <details className="unchanged">
            <summary>{t('review.unchanged', { n: empty.length })}</summary>
            <ul>
              {empty.map((i, n) => (
                <li key={n}>
                  <button className="link-btn" onClick={() => onGoTo(i)}>{label(i.varId)}</button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {removed.length > 0 && <p className="muted">{t('download.removed', { n: removed.length })}</p>}
      </section>

      <label className="field">
        {t('download.fileName')}
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <span className="muted small-text">→ {safeFileName(name)}.{toPdf ? 'pdf' : extOf(session.fileName)}</span>
        <span className="muted small-text">{t('download.patternHint', { example })}</span>
      </label>
      <FormatChoice session={session} toPdf={toPdf} setToPdf={setToPdf} />
      {overlay && (
        <div className="field">
          <span className="muted small-text">{t('download.overlayNote')}</span>
          <label className="check">
            <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
            {t('download.flatten')}
          </label>
        </div>
      )}
      <button className="btn primary big" disabled={busy} onClick={download}>
        {busy ? (toPdf ? t('download.converting') : t('editor.generating')) : t('review.download')}
      </button>
    </div>
  );
}

export function BatchModal({ session, onClose, onDone, notify }: {
  session: Session;
  onClose: () => void;
  onDone: (count: number) => void;
  notify: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<string | null>(null);
  const [toPdf, setToPdf] = useState(false);
  const base = baseName(session.fileName);
  const keys = useMemo(() => fieldKeys(session.variables), [session.variables]);

  const downloadCsv = () => {
    const header = ['archivo', ...session.variables.map((v) => keys.get(v.id)!)];
    const labels = ['(nombre del archivo)', ...session.variables.map((v) => v.label)];
    const example = [`${base}-1`, ...session.variables.map((v) => v.value)];
    downloadBlob(new Blob([toCSV([header, labels, example])], { type: 'text/csv;charset=utf-8' }), `${base}-datos.csv`);
  };

  const downloadJson = () => {
    const json = JSON.stringify(jsonTemplate(session.variables, session.fileName, session.repeats), null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${base}-datos.json`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const kind = /\.json$/i.test(file.name) ? 'json' : 'csv';
      // La segunda fila de la plantilla CSV solo explica las columnas: se descarta.
      const records = parseBatch(await file.text(), kind).filter((r) => !(r.file ?? '').startsWith('('));
      const zip = new JSZip();
      const used = new Set<string>();
      const missing = new Set<string>();
      const pattern = defaultPattern(session);
      for (let r = 0; r < records.length; r++) {
        setProgress(t('batch.progress', { a: r + 1, b: records.length }));
        const applied = applyRecord(session.variables, records[r]);
        applied.missing.forEach((m) => missing.add(m));
        const repeats = applyRecordToRepeats(session.repeats, session.variables, records[r]);
        const out = await produce({ ...session, repeats }, applied.vars, toPdf);
        let name = safeFileName(records[r].file?.trim() || fileNameFromPattern(pattern, applied.vars, `${base}-${r + 1}`));
        while (used.has(name.toLowerCase())) name += '-b';
        used.add(name.toLowerCase());
        zip.file(`${name}.${out.ext}`, out.bytes);
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${base}-lote.zip`);
      if (missing.size) notify(t('batch.missing', { cols: [...missing].join(', ') }));
      onDone(records.length);
    } catch (e) {
      notify(t(errMsg(e)));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal title={t('batch.title')} onClose={onClose} actions={<button className="btn ghost" onClick={onClose}>{t('modal.close')}</button>}>
      <ol className="steps compact">
        <li>
          {t('batch.step1')}
          <div className="settings-row">
            <button className="btn small" onClick={downloadCsv}>{t('batch.downloadCsv')}</button>
            <button className="btn small" onClick={downloadJson}>{t('batch.downloadJson')}</button>
          </div>
        </li>
        <li>{t('batch.step2')}</li>
        <li>
          {t('batch.step3')}
          <FormatChoice session={session} toPdf={toPdf} setToPdf={setToPdf} />
          <div>
            <label className="btn small primary file-btn">
              {progress ?? t('batch.upload')}
              <input type="file" accept=".csv,.json,text/csv,application/json" hidden disabled={!!progress} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        </li>
      </ol>
    </Modal>
  );
}
