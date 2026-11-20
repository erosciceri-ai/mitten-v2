import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import { config } from '../config/index.js';

const DEVICE_AUDIENCE = 'mitten-device';
const DEVICE_TOKEN_SECONDS = 365 * 86_400;
const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_ATTEMPTS_PER_MINUTE = 20;

interface PendingPairing { userId: number; expires: number }

// Estado en memoria: sirve para una sola instancia del API (plan free de Render).
const pending = new Map<string, PendingPairing>();
const codeByUser = new Map<number, string>();
let attempts: number[] = [];

function purge(now: number): void {
  for (const [code, entry] of pending) {
    if (entry.expires <= now) {
      pending.delete(code);
      if (codeByUser.get(entry.userId) === code) codeByUser.delete(entry.userId);
    }
  }
  attempts = attempts.filter(at => now - at < 60_000);
}

export function createPairingCode(userId: number, now = Date.now()): { code: string; expiresInSeconds: number } {
  purge(now);
  const previous = codeByUser.get(userId);
  if (previous) pending.delete(previous);
  let code: string;
  do { code = String(randomInt(0, 1_000_000)).padStart(6, '0'); } while (pending.has(code));
  pending.set(code, { userId, expires: now + PAIRING_TTL_MS });
  codeByUser.set(userId, code);
  return { code, expiresInSeconds: PAIRING_TTL_MS / 1000 };
}

/** Un código sirve una sola vez. Devuelve el userId o null. */
export function consumePairingCode(code: string, now = Date.now()): number | null {
  purge(now);
  if (!/^[0-9]{6}$/.test(code)) return null;
  const entry = pending.get(code);
  if (!entry) return null;
  pending.delete(code);
  codeByUser.delete(entry.userId);
  return entry.userId;
}

/** Límite global de intentos: con 6 dígitos evita fuerza bruta sostenida. */
export function allowPairingAttempt(now = Date.now()): boolean {
  purge(now);
  if (attempts.length >= PAIRING_ATTEMPTS_PER_MINUTE) return false;
  attempts.push(now);
  return true;
}

export function issueDeviceToken(userId: number): string {
  if (config.jwtSecret.length < 32) throw new Error('Invalid JWT signing configuration');
  return jwt.sign({ sub: String(userId), kind: 'device' }, config.jwtSecret, {
    algorithm: 'HS256', audience: DEVICE_AUDIENCE, expiresIn: DEVICE_TOKEN_SECONDS,
  });
}

/** El token de dispositivo no sirve como token de usuario: no lleva userId ni email. */
export function verifyDeviceToken(token: string): number | null {
  try {
    if (config.jwtSecret.length < 32) return null;
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: DEVICE_AUDIENCE });
    if (typeof payload !== 'object' || payload.kind !== 'device') return null;
    const userId = Number(payload.sub);
    return Number.isSafeInteger(userId) && userId >= 1 ? userId : null;
  } catch {
    return null;
  }
}
