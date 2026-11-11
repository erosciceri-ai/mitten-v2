import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDatabase, runInTransaction, type DatabaseConnection } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { AUDIO_TYPE, audioChecksum, getAudioStorage, readLocalAudio, type AudioProvider } from './audioStorage.js';
import { getAudioFilePath, MAX_MP3_BYTES } from './tts.js';

const RETENTION_MS = 24 * 60 * 60 * 1000;
export interface AudioRow {
  user_id: number;
  gesture_id: number;
  track_number: number;
  name: string;
  file_path: string | null;
  generated_at: string | null;
  audio_revision: number;
  object_key: string | null;
  provider: AudioProvider | null;
  state: string | null;
  size_bytes: number | null;
  content_type: string | null;
  sha256: string | null;
}

export const audioRowsSql = `SELECT a.user_id, a.gesture_id, a.track_number, a.file_path, a.generated_at,
  a.audio_revision, a.object_key, g.name, o.provider, o.state, o.size_bytes, o.content_type, o.sha256
  FROM audio_tracks a JOIN gestures g ON g.id=a.gesture_id AND g.user_id=a.user_id AND g.audio_track=a.track_number
  LEFT JOIN audio_objects o ON o.object_key=a.object_key AND o.user_id=a.user_id AND o.gesture_id=a.gesture_id`;

export async function findAudioRow(userId: number, id: number, db?: DatabaseConnection) {
  return (db ?? await getDatabase()).get<AudioRow>(audioRowsSql + ' WHERE a.user_id=? AND a.gesture_id=?', userId, id);
}

function verified(bytes: Buffer | null, size: number | null, sha256: string | null): Buffer | null {
  if (bytes && (bytes.length !== size || audioChecksum(bytes) !== sha256)) {
    throw new AppError('Stored audio failed integrity verification', 502);
  }
  return bytes;
}

export async function readGestureAudio(row: AudioRow): Promise<Buffer | null> {
  if (row.object_key) {
    const prefix = `audio/v1/${row.user_id}/${row.gesture_id}/`;
    if (!row.provider || row.state !== 'active' || row.content_type !== AUDIO_TYPE ||
        !row.object_key.startsWith(prefix)) throw new AppError('Invalid stored audio reference', 502);
    return verified(await getAudioStorage(row.provider).read(row.object_key), row.size_bytes, row.sha256);
  }
  if (!row.file_path || !Number.isSafeInteger(row.user_id) || row.user_id < 1 ||
      !Number.isInteger(row.track_number) || row.track_number < 1 || row.track_number > 50) return null;
  const expected = getAudioFilePath(row.user_id, row.track_number);
  if (row.file_path !== expected) return null;
  // Do not follow a legacy file or directory symlink outside the configured layout.
  const actual = await realpath(expected).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  return actual === resolve(expected) ? readLocalAudio(expected) : null;
}

export async function retireAudioObject(db: DatabaseConnection, key: string | null | undefined) {
  if (key) await db.run("UPDATE audio_objects SET state='retired', cleanup_after=? WHERE object_key=? AND state='active'",
    Date.now() + RETENTION_MS, key);
}

export async function alreadyGenerated(userId: number, gestureId: number, key?: string, db?: DatabaseConnection) {
  if (!key) return false;
  const row = await (db ?? await getDatabase()).get(`SELECT 1 FROM audio_generation_requests
    WHERE user_id=? AND gesture_id=? AND request_key=? AND expires_at>?`, userId, gestureId, key, Date.now());
  return Boolean(row);
}

export async function publishAudio(
  row: AudioRow, bytes: Buffer, provider: AudioProvider,
  { preserveTimestamp = false, requestKey }: { preserveTimestamp?: boolean; requestKey?: string } = {},
) {
  if (!bytes.length || bytes.length > MAX_MP3_BYTES) throw new AppError('Invalid audio size', 502);
  const storage = getAudioStorage(provider);
  const key = `audio/v1/${row.user_id}/${row.gesture_id}/${randomUUID()}.mp3`;
  const sha256 = audioChecksum(bytes);
  const deadline = Date.now() + RETENTION_MS;
  const db = await getDatabase();
  await db.run(`INSERT INTO audio_objects(object_key, provider, user_id, gesture_id, size_bytes, content_type, sha256, state, cleanup_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`, key, provider, row.user_id, row.gesture_id, bytes.length, AUDIO_TYPE, sha256, deadline);
  // A crash, ambiguous PUT or ambiguous COMMIT leaves the durable record for reconciliation.
  // Never delete here: the commit may have reached the database.
  await storage.put(key, bytes);
  if (!verified(await storage.read(key), bytes.length, sha256)) throw new AppError('Uploaded audio is missing', 502);

  await runInTransaction(async tx => {
    await tx.lockUser(row.user_id);
    if (await alreadyGenerated(row.user_id, row.gesture_id, requestKey, tx)) return;
    const current = await findAudioRow(row.user_id, row.gesture_id, tx);
    if (!current || current.audio_revision !== row.audio_revision || current.name !== row.name ||
        current.track_number !== row.track_number || current.file_path !== row.file_path ||
        current.object_key !== row.object_key) {
      throw new AppError('Gesture audio changed while preparing this version; retry', 409);
    }
    const ready = await tx.run("UPDATE audio_objects SET state='active' WHERE object_key=? AND state='pending' AND cleanup_after>?",
      key, Date.now());
    if (ready.changes !== 1) throw new AppError('Audio publication expired; retry', 409);
    await tx.run(`UPDATE audio_tracks SET object_key=?, file_path=NULL, audio_revision=audio_revision+1,
      generated_at=${preserveTimestamp ? '?' : 'CURRENT_TIMESTAMP'} WHERE user_id=? AND gesture_id=?`,
      key, ...(preserveTimestamp ? [row.generated_at] : []), row.user_id, row.gesture_id);
    if (requestKey) {
      await tx.run('DELETE FROM audio_generation_requests WHERE user_id=? AND expires_at<=?', row.user_id, Date.now());
      await tx.run('INSERT INTO audio_generation_requests(user_id, gesture_id, request_key, expires_at) VALUES (?, ?, ?, ?)',
        row.user_id, row.gesture_id, requestKey, Date.now() + RETENTION_MS);
    }
    if (preserveTimestamp && row.provider === 'local' && row.object_key) {
      await tx.run("UPDATE audio_objects SET state='archived' WHERE object_key=? AND state='active'", row.object_key);
    } else {
      await retireAudioObject(tx, row.object_key);
    }
  });
}

export function findAudioOrphans(db: Pick<DatabaseConnection, 'all'>) {
  return db.all<Array<{ object_key: string; provider: AudioProvider }>>(
    `SELECT o.object_key, o.provider FROM audio_objects o
     WHERE o.state IN ('pending','retired','deleting') AND o.cleanup_after<=?
     AND NOT EXISTS (SELECT 1 FROM audio_tracks a WHERE a.object_key=o.object_key)
     ORDER BY o.cleanup_after LIMIT 100`, Date.now());
}

export async function collectAudioOrphans(db: DatabaseConnection) {
  await db.run('DELETE FROM audio_generation_requests WHERE expires_at<=?', Date.now());
  const results = [];
  for (const candidate of await findAudioOrphans(db)) {
    const claimed = await db.run(`UPDATE audio_objects SET state='deleting'
      WHERE object_key=? AND state IN ('pending','retired','deleting') AND cleanup_after<=?
      AND NOT EXISTS (SELECT 1 FROM audio_tracks WHERE object_key=?)`,
      candidate.object_key, Date.now(), candidate.object_key);
    if (claimed.changes !== 1) continue;
    let status = 'removed';
    try {
      await getAudioStorage(candidate.provider).remove(candidate.object_key);
      await db.run("DELETE FROM audio_objects WHERE object_key=? AND state='deleting'", candidate.object_key);
    } catch { status = 'retry'; }
    results.push({ key: candidate.object_key, provider: candidate.provider, status });
  }
  return results;
}
