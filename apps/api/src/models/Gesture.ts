import { AppError } from '../middleware/errorHandler.js';
import { assertTransportableGesture } from '../utils/schemas.js';
import { getDatabase, runInTransaction, type DatabaseConnection } from '../db/index.js';
import type { Gesture, GestureData } from '@mitten/contracts';
import { generateTTS } from '../services/tts.js';
import { config } from '../config/index.js';
import { alreadyGenerated, findAudioRow, publishAudio, readGestureAudio, retireAudioObject } from '../services/gestureAudio.js';

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

export async function findGestureById(userId: number, id: number, connection?: DatabaseConnection): Promise<GestureWithMeta | null> {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return null;
  const db = connection ?? await getDatabase();
  const row = await db.get('SELECT * FROM gestures WHERE user_id = ? AND id = ?', userId, id) as GestureRow | null;
  return row ? rowToGesture(row) : null;
}

export async function findGestureByAudioTrack(userId: number, audioTrack: number): Promise<GestureWithMeta | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM gestures WHERE user_id = ? AND audio_track = ?', userId, audioTrack) as GestureRow | null;
  return row ? rowToGesture(row) : null;
}

export async function getAvailableAudioTrack(userId: number, connection?: DatabaseConnection): Promise<number | null> {
  const db = connection ?? await getDatabase();
  const row = await db.get(
    'SELECT track_number FROM audio_tracks WHERE user_id = ? AND gesture_id IS NULL ORDER BY track_number LIMIT 1',
    userId
  ) as { track_number: number } | null;
  return row ? row.track_number : null;
}

export async function createGesture(input: CreateGestureInput): Promise<GestureWithMeta> {
  return runInTransaction(async db => {
    await db.lockUser(input.userId);
    const audioTrack = await getAvailableAudioTrack(input.userId, db);

    if (!audioTrack) {
      throw new Error('No available audio tracks (max 50 gestures per user)');
    }

    assertTransportableGesture({ id: 2147483647, name: input.name, audioTrack, data: input.data });
    const dataJson = JSON.stringify(input.data);

    const inserted = await db.get<{ id: number }>(
      'INSERT INTO gestures (user_id, name, audio_track, data) VALUES (?, ?, ?, ?) RETURNING id',
      input.userId, input.name, audioTrack, dataJson
    );
    const gestureId = inserted!.id;

    const assigned = await db.run(
      'UPDATE audio_tracks SET gesture_id = ? WHERE user_id = ? AND track_number = ? AND gesture_id IS NULL',
      gestureId, input.userId, audioTrack
    );
    if (assigned.changes !== 1) throw new Error('Failed to reserve the selected track');

    const result = await findGestureById(input.userId, gestureId, db);
    if (!result) {
      throw new Error('Failed to create gesture');
    }
    return result;
  });
}

export async function updateGesture(userId: number, id: number, input: UpdateGestureInput): Promise<GestureWithMeta | null> {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return null;
  return runInTransaction(async db => {
    await db.lockUser(userId);
    const existing = await findGestureById(userId, id, db);
    if (!existing) return null;
    const updated = { ...existing, name: input.name ?? existing.name, data: input.data ?? existing.data };
    assertTransportableGesture(updated);
    await db.run('UPDATE gestures SET name=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?',
      updated.name, JSON.stringify(updated.data), userId, id);
    if (updated.name !== existing.name) {
      const audio = await findAudioRow(userId, id, db);
      await db.run('UPDATE audio_tracks SET object_key=NULL, file_path=NULL, generated_at=NULL, audio_revision=audio_revision+1 WHERE user_id=? AND gesture_id=?', userId, id);
      await retireAudioObject(db, audio?.object_key);
    }
    return findGestureById(userId, id, db);
  });
}

export async function deleteGesture(userId: number, id: number): Promise<boolean> {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return false;
  return runInTransaction(async db => {
    await db.lockUser(userId);
    const audio = await findAudioRow(userId, id, db);
    await db.run('UPDATE audio_tracks SET gesture_id=NULL, object_key=NULL, file_path=NULL, generated_at=NULL, audio_revision=0 WHERE user_id=? AND gesture_id=?', userId, id);
    await retireAudioObject(db, audio?.object_key);
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

export async function generateGestureAudio(userId: number, id: number, requestKey?: string): Promise<{ filePath: string; trackNumber: number }> {
  const row = await findAudioRow(userId, id);
  if (!row) throw new AppError('Gesture not found', 404);
  const provider = config.audioStorageProvider;
  if (provider !== 's3' && provider !== 'local') throw new Error('Unsupported AUDIO_STORAGE_PROVIDER');
  if (!await alreadyGenerated(userId, id, requestKey)) {
    const result = await generateTTS({ text: row.name });
    await publishAudio(row, result.audio, provider, { requestKey });
  }
  return { filePath: microSDPath(row.track_number), trackNumber: row.track_number };
}

export async function getGestureAudio(userId: number, id: number): Promise<Buffer | null> {
  const row = await findAudioRow(userId, id);
  return row ? readGestureAudio(row) : null;
}

function microSDPath(trackNumber: number): string {
  return '/mp3/' + String(trackNumber).padStart(4, '0') + '.mp3';
}

export async function getGestureAudioInfo(userId: number, id: number): Promise<{ filePath: string | null; trackNumber: number; generatedAt: string | null } | null> {
  const row = await findAudioRow(userId, id);
  if (!row) return null;
  return {
    filePath: await readGestureAudio(row) ? microSDPath(row.track_number) : null,
    trackNumber: row.track_number,
    generatedAt: row.generated_at,
  };
}
