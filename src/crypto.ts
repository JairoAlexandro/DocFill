/**
 * Cifrado de las copias de seguridad con contraseña (AES-GCM 256, clave derivada con PBKDF2).
 * Usa la Web Crypto API del navegador: no hace falta ninguna librería ni servidor.
 */

const ITERATIONS = 310_000;

export interface EncryptedPayload {
  salt: string;
  iv: string;
  data: string;
  iterations: number;
}

function b64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(text: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  return { salt: b64(salt), iv: b64(iv), data: b64(data), iterations: ITERATIONS };
}

/** Lanza un error si la contraseña no es correcta. */
export async function decryptText(p: EncryptedPayload, password: string): Promise<string> {
  const key = await deriveKey(password, unb64(p.salt), p.iterations || ITERATIONS);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, key, unb64(p.data));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('settings.wrongPassword');
  }
}
