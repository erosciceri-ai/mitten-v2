import jwt from 'jsonwebtoken';
import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { getDatabase, runInTransaction } from '../db/index.js';

const DEVICE_AUDIENCE = 'mitten-device';
const DEVICE_TOKEN_SECONDS = 365 * 86_400;
const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_ATTEMPTS_PER_IP_PER_MINUTE = 10;
const PAIRING_ATTEMPTS_GLOBAL_PER_MINUTE = 60;
const DEFAULT_DEVICE_NAME = 'Guante MITTEN';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeviceRecord {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

const perIpAttempts = new Map<string, number[]>();
let globalAttempts: number[] = [];

function hashPairingCode(code: string): string {
  return createHmac('sha256', config.jwtSecret).update('pairing:' + code).digest('hex');
}

function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function prunePairingAttempts(now: number): void {
  globalAttempts = globalAttempts.filter(at => now - at < 60_000);
  for (const [ip, timestamps] of perIpAttempts) {
    const fresh = timestamps.filter(at => now - at < 60_000);
    if (fresh.length === 0) perIpAttempts.delete(ip);
    else perIpAttempts.set(ip, fresh);
  }
}

export function resetPairingRateLimits(): void {
  perIpAttempts.clear();
  globalAttempts = [];
}

/** Per-IP and global sliding-window rate limiter for WebSocket pairing attempts. */
export function allowPairingAttempt(
  clientIp: string,
  now = Date.now(),
  limits?: { perIp?: number; global?: number },
): boolean {
  prunePairingAttempts(now);
  const perIpLimit = limits?.perIp ?? PAIRING_ATTEMPTS_PER_IP_PER_MINUTE;
  const globalLimit = limits?.global ?? PAIRING_ATTEMPTS_GLOBAL_PER_MINUTE;
  const key = clientIp || 'unknown';
  const ipList = perIpAttempts.get(key) ?? [];
  if (ipList.length >= perIpLimit || globalAttempts.length >= globalLimit) {
    return false;
  }
  ipList.push(now);
  perIpAttempts.set(key, ipList);
  globalAttempts.push(now);
  return true;
}

export async function createPairingCode(
  userId: number,
  now = Date.now(),
): Promise<{ code: string; expiresInSeconds: number }> {
  if (config.jwtSecret.length < 32) throw new Error('Invalid JWT signing configuration');
  const expiresAt = now + PAIRING_TTL_MS;
  const code = await runInTransaction(async db => {
    await db.run('DELETE FROM device_pairing_codes WHERE expires_at <= ?', now);
    await db.run('DELETE FROM device_pairing_codes WHERE user_id = ?', userId);
    let candidate: string;
    let codeHash: string;
    do {
      candidate = String(randomInt(0, 1_000_000)).padStart(6, '0');
      codeHash = hashPairingCode(candidate);
    } while (await db.get('SELECT 1 FROM device_pairing_codes WHERE code_hash = ?', codeHash));
    await db.run(
      'INSERT INTO device_pairing_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)',
      codeHash,
      userId,
      expiresAt,
    );
    return candidate;
  });
  return { code, expiresInSeconds: PAIRING_TTL_MS / 1000 };
}

/** Single-use pairing code exchange stored atomically in the database. */
export async function consumePairingCode(code: string, now = Date.now()): Promise<number | null> {
  if (!/^[0-9]{6}$/.test(code) || config.jwtSecret.length < 32) return null;
  const codeHash = hashPairingCode(code);
  return runInTransaction(async db => {
    await db.run('DELETE FROM device_pairing_codes WHERE expires_at <= ?', now);
    const row = await db.get<{ user_id: number }>(
      'SELECT user_id FROM device_pairing_codes WHERE code_hash = ? AND expires_at > ?',
      codeHash,
      now,
    );
    if (!row) return null;
    const deleted = await db.run('DELETE FROM device_pairing_codes WHERE code_hash = ?', codeHash);
    if (!deleted.changes) return null;
    return Number(row.user_id);
  });
}

export async function issueDeviceToken(
  userId: number,
  name = DEFAULT_DEVICE_NAME,
  now = Date.now(),
): Promise<{ deviceId: string; token: string }> {
  if (config.jwtSecret.length < 32) throw new Error('Invalid JWT signing configuration');
  const deviceId = randomUUID();
  const token = jwt.sign({ sub: String(userId), kind: 'device', jti: deviceId }, config.jwtSecret, {
    algorithm: 'HS256',
    audience: DEVICE_AUDIENCE,
    expiresIn: DEVICE_TOKEN_SECONDS,
  });
  const db = await getDatabase();
  await db.run(
    'INSERT INTO devices (id, user_id, name, token_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    deviceId,
    userId,
    name,
    hashDeviceToken(token),
    now,
    now,
  );
  return { deviceId, token };
}

/** Validates device JWT against the devices table and records last_seen_at. */
export async function verifyDeviceToken(
  token: string,
  now = Date.now(),
): Promise<{ userId: number; deviceId: string } | null> {
  try {
    if (config.jwtSecret.length < 32) return null;
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: DEVICE_AUDIENCE });
    if (typeof payload !== 'object' || payload === null || payload.kind !== 'device') return null;
    if (typeof payload.jti !== 'string' || !UUID_RE.test(payload.jti)) return null;
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) return null;

    const db = await getDatabase();
    const row = await db.get<{ id: string }>(
      'SELECT id FROM devices WHERE id = ? AND user_id = ? AND token_hash = ? AND revoked_at IS NULL',
      payload.jti,
      userId,
      hashDeviceToken(token),
    );
    if (!row) return null;
    await db.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', now, payload.jti);
    return { userId, deviceId: payload.jti };
  } catch {
    return null;
  }
}

export async function listUserDevices(userId: number): Promise<DeviceRecord[]> {
  const db = await getDatabase();
  const rows = await db.all<Array<{
    id: string;
    name: string;
    created_at: number;
    last_seen_at: number | null;
    revoked_at: number | null;
  }>>(
    'SELECT id, name, created_at, last_seen_at, revoked_at FROM devices WHERE user_id = ? ORDER BY created_at DESC, id ASC',
    userId,
  );
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(Number(row.created_at)).toISOString(),
    lastSeenAt: row.last_seen_at === null ? null : new Date(Number(row.last_seen_at)).toISOString(),
    revokedAt: row.revoked_at === null ? null : new Date(Number(row.revoked_at)).toISOString(),
  }));
}

export async function revokeUserDevice(
  userId: number,
  deviceId: string,
  now = Date.now(),
): Promise<'revoked' | 'already_revoked' | 'not_found'> {
  if (!UUID_RE.test(deviceId)) return 'not_found';
  const db = await getDatabase();
  const row = await db.get<{ id: string; revoked_at: number | null }>(
    'SELECT id, revoked_at FROM devices WHERE id = ? AND user_id = ?',
    deviceId,
    userId,
  );
  if (!row) return 'not_found';
  if (row.revoked_at !== null) return 'already_revoked';
  await db.run(
    'UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    now,
    deviceId,
    userId,
  );
  return 'revoked';
}
