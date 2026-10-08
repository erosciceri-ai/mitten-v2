import { mkdir, writeFile, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';
import { assertTransportableGesture } from '../utils/schemas.js';
import { getDatabase, runInTransaction } from '../db/index.js';
import type { Gesture, GestureData } from '@mitten/contracts';
import { generateTTS, getAudioFilePath } from '../services/tts.js';

export interface GestureRow {
  id: number;
  user_id: number;
  name: string;
  audio_track: number;
  data: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGestureInput {
  userId: number;
  name: string;
  data: GestureData;
}

export interface UpdateGestureInput {
  name?: string;
  data?: GestureData;
}

export interface GestureWithMeta extends Gesture {
  createdAt: string;
  updatedAt: string;
}

function rowToGesture(row: GestureRow): GestureWithMeta {
  return {
    id: row.id,
    name: row.name,
    audioTrack: row.audio_track,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findAllGestures(userId: number): Promise<GestureWithMeta[]> {
  const db = await getDatabase();
  const rows = await db.all('SELECT * FROM gestures WHERE user_id = ? ORDER BY id', userId) as GestureRow[];
  return rows.map(rowToGesture);
}

export async function findGestureById(userId: number, id: number): Promise<GestureWithMeta | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM gestures WHERE user_id = ? AND id = ?', userId, id) as GestureRow | null;
  return row ? rowToGesture(row) : null;
}

export async function findGestureByAudioTrack(userId: number, audioTrack: number): Promise<GestureWithMeta | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM gestures WHERE user_id = ? AND audio_track = ?', userId, audioTrack) as GestureRow | null;
  return row ? rowToGesture(row) : null;
}

export async function getAvailableAudioTrack(userId: number): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT track_number FROM audio_tracks WHERE user_id = ? AND gesture_id IS NULL ORDER BY track_number LIMIT 1',
    userId
  ) as { track_number: number } | null;
  return row ? row.track_number : null;
}

export async function createGesture(input: CreateGestureInput): Promise<GestureWithMeta> {
  return runInTransaction(async db => {
  const audioTrack = await getAvailableAudioTrack(input.userId);

  if (!audioTrack) {
    throw new Error('No available audio tracks (max 50 gestures per user)');
  }

  assertTransportableGesture({ id: 2147483647, name: input.name, audioTrack, data: input.data });
  const dataJson = JSON.stringify(input.data);

  const inserted = await db.run(
    'INSERT INTO gestures (user_id, name, audio_track, data) VALUES (?, ?, ?, ?)',
    input.userId, input.name, audioTrack, dataJson
  );
  const gestureId = inserted.lastID!;

  await db.run(
    'UPDATE audio_tracks SET gesture_id = ? WHERE user_id = ? AND track_number = ?',
    gestureId, input.userId, audioTrack
  );

  const result = await findGestureById(input.userId, gestureId);
  if (!result) {
    throw new Error('Failed to create gesture');
  }
  return result;
  });
}

export async function updateGesture(userId: number, id: number, input: UpdateGestureInput): Promise<GestureWithMeta | null> {
  return runInTransaction(async db => {
    const existing = await findGestureById(userId, id);
    if (!existing) return null;
    const updated = { ...existing, name: input.name ?? existing.name, data: input.data ?? existing.data };
    assertTransportableGesture(updated);
    await db.run('UPDATE gestures SET name=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?',
      updated.name, JSON.stringify(updated.data), userId, id);
    if (updated.name !== existing.name) await db.run('UPDATE audio_tracks SET file_path=NULL, generated_at=NULL WHERE user_id=? AND track_number=?', userId, existing.audioTrack);
    return findGestureById(userId, id);
  });
}

export async function deleteGesture(userId: number, id: number): Promise<boolean> {
  return runInTransaction(async db => {
    await db.run('UPDATE audio_tracks SET gesture_id=NULL, file_path=NULL, generated_at=NULL WHERE user_id=? AND gesture_id=?', userId, id);
    const result = await db.run('DELETE FROM gestures WHERE user_id=? AND id=?', userId, id);
    return (result.changes ?? 0) > 0;
  });
}

export async function getGestureCount(userId: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.get('SELECT COUNT(*) as count FROM gestures WHERE user_id = ?', userId) as { count: number } | null;
  return row?.count ?? 0;
}

export async function validateAudioTrackUnique(userId: number, audioTrack: number, excludeGestureId?: number): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT 1 FROM gestures WHERE user_id = ? AND audio_track = ? AND id != ?',
    userId, audioTrack, excludeGestureId || 0
  );
  return !row;
}

export async function generateGestureAudio(userId: number, id: number): Promise<{ filePath: string; trackNumber: number }> {
  const gesture = await findGestureById(userId, id);
  if (!gesture) throw new AppError('Gesture not found', 404);
  const result = await generateTTS({ text: gesture.name });
  const filePath = getAudioFilePath(userId, gesture.audioTrack);
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(temporary, result.audio, { flag: 'wx' });
    await runInTransaction(async db => {
      const current = await findGestureById(userId, id);
      if (!current || current.name !== gesture.name || current.audioTrack !== gesture.audioTrack) {
        throw new AppError('Gesture changed while audio was being generated; retry', 409);
      }
      await rename(temporary, filePath);
      await db.run('UPDATE audio_tracks SET file_path=?, generated_at=CURRENT_TIMESTAMP WHERE user_id=? AND gesture_id=?', filePath, userId, id);
    });
  } finally {
    await rm(temporary, { force: true });
  }
  return { filePath: `/mp3/${String(gesture.audioTrack).padStart(4, '0')}.mp3`, trackNumber: gesture.audioTrack };
}

export async function getGestureAudioFile(userId: number, id: number): Promise<string | null> {
  const gesture = await findGestureById(userId, id);
  if (!gesture) return null;
  const db = await getDatabase();
  const row = await db.get<{file_path: string | null}>('SELECT file_path FROM audio_tracks WHERE user_id=? AND gesture_id=?', userId, id);
  const expected = getAudioFilePath(userId, gesture.audioTrack);
  // Never serve historical global files or arbitrary paths from metadata.
  if (row?.file_path !== expected) return null;
  try { return (await stat(expected)).isFile() ? expected : null; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export async function getGestureAudioInfo(userId: number, id: number): Promise<{ filePath: string | null; trackNumber: number; generatedAt: string | null } | null> {
  const db = await getDatabase();
  const gesture = await findGestureById(userId, id);
  if (!gesture) return null;

  const row = await db.get(
    'SELECT file_path, generated_at FROM audio_tracks WHERE user_id = ? AND track_number = ?',
    userId, gesture.audioTrack
  ) as { file_path: string | null; generated_at: string | null } | null;

  return {
    filePath: await getGestureAudioFile(userId, id) ? `/mp3/${String(gesture.audioTrack).padStart(4, '0')}.mp3` : null,
    trackNumber: gesture.audioTrack,
    generatedAt: row?.generated_at ?? null,
  };
}