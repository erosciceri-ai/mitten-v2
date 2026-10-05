import { 
  getDatabaseSync, 
  runInTransaction, 
  isTestStoreEnabled,
  createTestGesture,
  findTestGestureById,
  findTestGesturesByUserId,
  updateTestGesture,
  deleteTestGesture,
  countTestGesturesByUserId,
  getNextAvailableAudioTrack,
  MAX_AUDIO_TRACKS,
  MAX_GESTURES_PER_USER,
} from '../db';
import type { BindParams, Statement, Database } from 'sql.js';
import { Gesture, GestureData, GestureResponse } from '../types';

/** Shared limit error so the SQL path and the test store report it identically. */
const GESTURE_LIMIT_ERROR = `Maximum ${MAX_GESTURES_PER_USER} gestures per user reached`;

export class GestureRepository {
  private getDb() {
    return getDatabaseSync();
  }

  /**
   * Collect every row produced by a prepared statement and release it.
   *
   * sql.js cursor semantics: `stmt.getAsObject(params)` binds AND steps, but
   * `stmt.getAsObject()` without params only re-reads the row the cursor is
   * already on - it never advances. Iterating with it therefore loops on the
   * first row forever, so the cursor must be advanced explicitly via `step()`.
   */
  private collectRows(stmt: Statement, params?: BindParams): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    try {
      if (params) {
        stmt.bind(params);
      }
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
    } finally {
      stmt.free();
    }
    return rows;
  }

  findById(id: number, userId: number): Gesture | null {
    if (isTestStoreEnabled()) {
      const testGesture = findTestGestureById(id);
      if (!testGesture || testGesture.user_id !== userId) return null;
      return this.mapTestGestureToGesture(testGesture);
    }
    const db = getDatabaseSync();
    const stmt = db.prepare('SELECT * FROM gestures WHERE id = ? AND user_id = ?');
    const row = this.collectRows(stmt, [id, userId])[0];
    return row ? this.mapRowToGesture(row) : null;
  }

  findByIdPublic(id: number, userId: number): GestureResponse | null {
    const gesture = this.findById(id, userId);
    return gesture ? this.toResponse(gesture) : null;
  }

  findAllByUserId(userId: number): GestureResponse[] {
    if (isTestStoreEnabled()) {
      const testGestures = findTestGesturesByUserId(userId);
      return testGestures.map(g => this.toResponse(this.mapTestGestureToGesture(g)));
    }
    const db = getDatabaseSync();
    const stmt = db.prepare('SELECT * FROM gestures WHERE user_id = ? ORDER BY id');
    return this.collectRows(stmt, [userId]).map(row => this.toResponse(this.mapRowToGesture(row)));
  }

  countByUserId(userId: number): number {
    if (isTestStoreEnabled()) {
      return countTestGesturesByUserId(userId);
    }
    const db = getDatabaseSync();
    const stmt = db.prepare('SELECT COUNT(*) as count FROM gestures WHERE user_id = ?');
    const row = this.collectRows(stmt, [userId])[0];
    return (row?.count as number) || 0;
  }

  create(userId: number, name: string, data: GestureData): Gesture {
    if (isTestStoreEnabled()) {
      // Enforce the per-user limit before allocating a track, so a full profile
      // reports the same conflict as the SQL path instead of an audio-track error.
      if (countTestGesturesByUserId(userId) >= MAX_GESTURES_PER_USER) {
        throw new Error(GESTURE_LIMIT_ERROR);
      }
      // Get next available audio track within this user's own pool
      const audioTrack = getNextAvailableAudioTrack(userId);
      const dataJson = JSON.stringify(data);
      const testGesture = createTestGesture(userId, name, audioTrack, dataJson);
      return this.mapTestGestureToGesture(testGesture);
    }

    return runInTransaction((db) => {
      // Check the per-user limit BEFORE allocating a track. The track pool is
      // shared across users, so doing it the other way round would report a
      // misleading audio-track error once a user reaches their own limit.
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM gestures WHERE user_id = ?');
      const countRow = this.collectRows(countStmt, [userId])[0];
      if (((countRow?.count as number) ?? 0) >= MAX_GESTURES_PER_USER) {
        throw new Error(GESTURE_LIMIT_ERROR);
      }

      // Get next available audio track (first-fit) within THIS user's pool.
      // The pool is per-user, so other users' tracks are irrelevant and two
      // users may hold the same audioTrack.
      const audioTrackStmt = db.prepare(
        'SELECT audio_track FROM gestures WHERE user_id = ? ORDER BY audio_track',
      );
      const usedTracks = new Set<number>();
      for (const row of this.collectRows(audioTrackStmt, [userId])) {
        usedTracks.add(Number(row.audio_track));
      }

      let audioTrack = 1;
      while (usedTracks.has(audioTrack) && audioTrack <= MAX_AUDIO_TRACKS) {
        audioTrack++;
      }
      if (audioTrack > MAX_AUDIO_TRACKS) {
        throw new Error(`No available audio tracks (max ${MAX_AUDIO_TRACKS})`);
      }

      const dataJson = JSON.stringify(data);
      const stmt = db.prepare(`
        INSERT INTO gestures (user_id, name, audio_track, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      try {
        stmt.run([userId, name, audioTrack, dataJson]);
      } finally {
        stmt.free();
      }

      // Get the last inserted row ID
      const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
      const lastId = lastIdResult[0]?.values[0]?.[0] as number;

      const gesture = this.findById(lastId, userId);
      if (!gesture) {
        throw new Error('Failed to create gesture');
      }
      return gesture;
    });
  }

  update(id: number, userId: number, updates: { name?: string; data?: GestureData }): Gesture | null {
    if (isTestStoreEnabled()) {
      // Pass through as-is: null/undefined means "leave unchanged", matching the SQL path.
      const dataJson = updates.data ? JSON.stringify(updates.data) : undefined;
      const testGesture = updateTestGesture(id, userId, updates.name, dataJson);
      return testGesture ? this.mapTestGestureToGesture(testGesture) : null;
    }

    return runInTransaction((db) => {
      const gesture = this.findById(id, userId);
      if (!gesture) return null;

      const name = updates.name ?? gesture.name;
      const dataJson = updates.data ? JSON.stringify(updates.data) : JSON.stringify(gesture.data);

      const stmt = db.prepare(`
        UPDATE gestures SET name = ?, data_json = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `);
      try {
        stmt.run([name, dataJson, id, userId]);
      } finally {
        stmt.free();
      }

      return this.findById(id, userId);
    });
  }

  delete(id: number, userId: number): boolean {
    if (isTestStoreEnabled()) {
      return deleteTestGesture(id, userId);
    }

    const db = getDatabaseSync();
    const stmt = db.prepare('DELETE FROM gestures WHERE id = ? AND user_id = ?');
    try {
      stmt.run([id, userId]);
    } finally {
      stmt.free();
    }
    return this.getChanges(db) > 0;
  }

  toResponse(gesture: Gesture): GestureResponse {
    return {
      id: gesture.id,
      name: gesture.name,
      audioTrack: gesture.audioTrack,
      data: gesture.data,
      createdAt: gesture.createdAt,
      updatedAt: gesture.updatedAt,
    };
  }

  private mapRowToGesture(row: Record<string, unknown>): Gesture {
    return {
      id: row.id as number,
      name: row.name as string,
      audioTrack: row.audio_track as number,
      data: JSON.parse(row.data_json as string),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapTestGestureToGesture(testGesture: { id: number; user_id: number; name: string; audio_track: number; data_json: string; created_at: string; updated_at: string }): Gesture {
    return {
      id: testGesture.id,
      name: testGesture.name,
      audioTrack: testGesture.audio_track,
      data: JSON.parse(testGesture.data_json),
      createdAt: testGesture.created_at,
      updatedAt: testGesture.updated_at,
    };
  }

  private getChanges(db: Database): number {
    const result = db.exec('SELECT changes() as changes');
    return (result[0]?.values[0]?.[0] as number) || 0;
  }
}

export const gestureRepository = new GestureRepository();