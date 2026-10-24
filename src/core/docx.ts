// Atajos para Word (.docx). El motor real, común a todos los formatos, está en formats.ts.
import { generateDocument, readDocument, type GenerateOptions, type Replacement } from './formats';

export type { Replacement } from './formats';

type Bytes = ArrayBuffer | Uint8Array;

export function readDocx(bytes: Bytes) {
  return readDocument('documento.docx', bytes);
}

export function generateDocxBytes(bytes: Bytes, reps: Replacement[], opts?: GenerateOptions) {
  return generateDocument('documento.docx', bytes, reps, opts);
}
