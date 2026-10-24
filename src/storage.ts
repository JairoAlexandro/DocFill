import type { OptionalClause, Paragraph, RepeatBlock, Variable } from './core/types';
import type { LearnedRule } from './core/learning';
import { decryptText, encryptText, type EncryptedPayload } from './crypto';

/**
 * Todo se guarda en el propio navegador / app de escritorio (IndexedDB).
 * Nada sale del equipo del usuario.
 */

export interface Template {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  bytes: ArrayBuffer;
  variables: Variable[];
  /** Solo PDF y fotos: texto ya reconocido, para no repetir el OCR al abrir la plantilla. */
  paragraphs?: Paragraph[];
  optional?: OptionalClause[];
  /** Listas que se repiten (varias personas). */
  repeats?: RepeatBlock[];
  fileNamePattern?: string;
}

export interface FichaField {
  key: string;
  value: string;
}

export type FichaKind = 'persona' | 'empresa' | 'inmueble' | 'otro';

export interface Ficha {
  id: string;
  name: string;
  kind: FichaKind;
  fields: FichaField[];
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  fileName: string;
  templateId?: string;
  templateName?: string;
  values: FichaField[];
  count?: number;
}

export interface IgnoredValue {
  id: string;
  value: string;
  createdAt: number;
}

export interface Session {
  fileName: string;
  bytes: ArrayBuffer;
  paragraphs: Paragraph[];
  variables: Variable[];
  templateId?: string;
  templateName?: string;
  /** Cláusulas opcionales marcadas por el usuario. */
  optional?: OptionalClause[];
  /** Listas que se repiten (varias personas). */
  repeats?: RepeatBlock[];
  /** Patrón del nombre del archivo final, p. ej. "Contrato - {Nombre (Arrendataria)}". */
  fileNamePattern?: string;
}

export interface AppData {
  templates: Template[];
  fichas: Ficha[];
  history: HistoryEntry[];
  learned: LearnedRule[];
  ignored: IgnoredValue[];
}

type Stores = {
  templates: Template;
  fichas: Ficha;
  history: HistoryEntry;
  learned: LearnedRule;
  ignored: IgnoredValue;
};
export type StoreName = keyof Stores;
const STORE_NAMES: StoreName[] = ['templates', 'fichas', 'history', 'learned', 'ignored'];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('docfill', 1);
    req.onupgradeneeded = () => {
      for (const name of STORE_NAMES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function getAll<K extends StoreName>(store: K): Promise<Stores[K][]> {
  return run(store, 'readonly', (s) => s.getAll());
}

export function put<K extends StoreName>(store: K, value: Stores[K]): Promise<void> {
  return run(store, 'readwrite', (s) => s.put(value));
}

export function remove(store: StoreName, id: string): Promise<void> {
  return run(store, 'readwrite', (s) => s.delete(id));
}

export async function loadAll(): Promise<AppData> {
  const [templates, fichas, history, learned, ignored] = await Promise.all([
    getAll('templates'),
    getAll('fichas'),
    getAll('history'),
    getAll('learned'),
    getAll('ignored'),
  ]);
  const newest = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;
  return {
    templates: templates.sort((a, b) => b.updatedAt - a.updatedAt),
    fichas: fichas.sort((a, b) => a.name.localeCompare(b.name)),
    history: history.sort(newest),
    learned: learned.sort(newest),
    ignored: ignored.sort(newest),
  };
}

// ---------------------------------------------------------------- Copia de seguridad

const BACKUP_KEY = 'docfill.lastBackup';

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Todo lo guardado en un único JSON (los .docx de las plantillas van en base64). */
/** Si se da una contraseña, la copia se cifra (sin ella no se puede abrir). */
export async function exportBackup(password?: string): Promise<Blob> {
  const data = await loadAll();
  let json = JSON.stringify({
    app: 'DocFill',
    type: 'backup',
    version: 1,
    exportedAt: Date.now(),
    ...data,
    templates: data.templates.map((t) => ({ ...t, bytes: toBase64(t.bytes) })),
  });
  if (password) json = JSON.stringify({ app: 'DocFill', type: 'backup-cifrado', version: 1, ...(await encryptText(json, password)) });
  try {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  } catch {
    /* no es imprescindible */
  }
  return new Blob([json], { type: 'application/json' });
}

export function lastBackupAt(): number | null {
  try {
    const v = Number(localStorage.getItem(BACKUP_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

const hasId = (x: unknown): x is { id: string } => !!x && typeof (x as { id: unknown }).id === 'string';

/** Restaura una copia: añade lo que no existe y sustituye lo que tiene el mismo id. Devuelve cuántos elementos hay de cada tipo. */
export function isEncryptedBackup(text: string): boolean {
  try {
    return (JSON.parse(text) as { type?: string }).type === 'backup-cifrado';
  } catch {
    return false;
  }
}

export async function importBackup(text: string, password?: string): Promise<Record<StoreName, number>> {
  let parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed?.app === 'DocFill' && parsed.type === 'backup-cifrado') {
    if (!password) throw new Error('settings.needPassword');
    parsed = JSON.parse(await decryptText(parsed as unknown as EncryptedPayload, password)) as Record<string, unknown>;
  }
  if (parsed?.app !== 'DocFill' || parsed.type !== 'backup') throw new Error('settings.invalidBackup');
  const list = (k: StoreName) => (Array.isArray(parsed[k]) ? (parsed[k] as unknown[]).filter(hasId) : []);
  const counts = {} as Record<StoreName, number>;
  for (const store of STORE_NAMES) {
    const items = list(store);
    for (const item of items) {
      const value = store === 'templates' ? { ...(item as Template), bytes: fromBase64((item as unknown as { bytes: string }).bytes) } : item;
      await put(store, value as never);
    }
    counts[store] = items.length;
  }
  return counts;
}

// ---------------------------------------------------------------- Almacenamiento persistente

export type PersistState = 'persisted' | 'not-persisted' | 'unsupported';

export async function persistState(): Promise<PersistState> {
  if (!navigator.storage?.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'persisted' : 'not-persisted';
}

/** Pide al navegador que no borre nunca los datos de DocFill aunque falte espacio. */
export async function requestPersist(): Promise<PersistState> {
  if (!navigator.storage?.persist) return 'unsupported';
  return (await navigator.storage.persist()) ? 'persisted' : 'not-persisted';
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

export function formatBytes(n: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.docx$/i, '');
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'documento';
}

export function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
