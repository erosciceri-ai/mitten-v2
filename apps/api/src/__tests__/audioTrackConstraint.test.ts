/**
 * Database-level guarantee for audioTrack uniqueness, per user.
 *
 * Invariant under test
 * --------------------
 * Each user independently owns the audioTrack pool 1..50. Therefore:
 *   - two gestures of the SAME user may never share an audioTrack;
 *   - two gestures of DIFFERENT users may share the same audioTrack.
 *
 * The repository already allocates first-fit per user, so this guarantee is
 * enforced by SQLite itself rather than only by application code. That way the
 * invariant also holds for writes that do not go through GestureRepository.
 *
 * These tests run against REAL sql.js (WASM) over a throwaway database file.
 * No network access and no writes to the development database.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import type { GestureData } from '../types';

// The DB path must be redirected before ../db (and therefore ../config) loads,
// so the real development database is never opened or written.
const testDbPath = join(tmpdir(), `mitten-audiotrack-constraint-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'audiotrack-constraint-secret-at-least-32-chars';

const dbModule = require('../db') as typeof import('../db');
const { gestureRepository } =
  require('../repositories/gestureRepository') as typeof import('../repositories/gestureRepository');
const { userRepository } =
  require('../repositories/userRepository') as typeof import('../repositories/userRepository');

type Sample7 = readonly [number, number, number, number, number, number, number];

function toSample7(values: number[]): Sample7 {
  return [values[0], values[1], values[2], values[3], values[4], values[5], values[6]];
}

/** Canonical GestureData fixture: sampleCount must match samples.length. */
function makeData(sampleCount = 3, offset = 0): GestureData {
  const samples: Sample7[] = [];
  const min: number[] = [];
  const max: number[] = [];
  const mean: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const sample: Sample7 = [
      3180 + i * 10 + offset,
      3100 + i * 10 + offset,
      2940 + i * 5 + offset,
      3290 + i * 5 + offset,
      3050 + i * 5 + offset,
      12.3 + i * 0.1,
      -5.1 - i * 0.1,
    ];
    samples.push(sample);
    if (i === 0) {
      min.push(...sample);
      max.push(...sample);
      mean.push(...sample);
    } else {
      for (let d = 0; d < 7; d++) {
        min[d] = Math.min(min[d], sample[d]);
        max[d] = Math.max(max[d], sample[d]);
        mean[d] += sample[d];
      }
    }
  }
  for (let d = 0; d < 7; d++) mean[d] /= sampleCount;

  return {
    version: 1,
    dimensions: 7,
    dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
    units: { flex: 'adc12', mpu: 'degrees' },
    samples,
    summary: { min: toSample7(min), max: toSample7(max), mean: toSample7(mean) },
    sampleCount,
    captureDurationMs: sampleCount * 100,
    samplingPeriodMs: 100,
  };
}

/** Raw INSERT, bypassing the repository: this is what the constraint must block. */
function insertRawGesture(userId: number, name: string, audioTrack: number): void {
  const db = dbModule.getDatabaseSync();
  const stmt = db.prepare(`
    INSERT INTO gestures (user_id, name, audio_track, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  try {
    stmt.run([userId, name, audioTrack, JSON.stringify(makeData())]);
  } finally {
    stmt.free();
  }
}

function countRawGestures(userId: number): number {
  const db = dbModule.getDatabaseSync();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM gestures WHERE user_id = ?');
  try {
    stmt.bind([userId]);
    return stmt.step() ? Number(stmt.getAsObject().count) : 0;
  } finally {
    stmt.free();
  }
}

/** Capture whatever `fn` throws as a comparable string. */
function captureError(fn: () => void): string {
  try {
    fn();
    return '<no error>';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function resetSql(): void {
  const db = dbModule.getDatabaseSync();
  db.exec('DELETE FROM gestures');
  db.exec('DELETE FROM users');
}

beforeAll(async () => {
  await dbModule.getDatabase();
});

afterAll(() => {
  try {
    dbModule.closeDatabase();
  } catch {
    /* already closed */
  }
  try {
    rmSync(testDbPath, { force: true });
  } catch {
    /* nothing persisted (NODE_ENV=test skips auto-save) */
  }
});

describe('schema: audioTrack uniqueness is enforced per user', () => {
  it('declares UNIQUE on (user_id, audio_track)', () => {
    const db = dbModule.getDatabaseSync();

    // `PRAGMA index_list` reports `unique` for every UNIQUE table constraint too,
    // so this covers both an inline UNIQUE(...) and a unique index.
    const indexes = db.exec("PRAGMA index_list('gestures')")[0];
    const rows = indexes
      ? indexes.values.map(value => ({
          name: String(value[1]),
          unique: Number(value[2]) === 1,
        }))
      : [];

    const uniqueIndexes = rows.filter(row => row.unique).map(row => row.name);
    expect(uniqueIndexes.length).toBeGreaterThan(0);

    // Locate the columns of every unique index to find the (user_id, audio_track) one.
    const uniqueColumns: string[][] = uniqueIndexes.map(name =>
      db.exec(`PRAGMA index_info('${name}')`)[0].values.map(value => String(value[2])),
    );

    expect(uniqueColumns).toContainEqual(['user_id', 'audio_track']);
  });

  it('does NOT declare a global UNIQUE on (audio_track) alone', () => {
    const db = dbModule.getDatabaseSync();

    const indexes = db.exec("PRAGMA index_list('gestures')")[0];
    const uniqueNames = indexes
      ? indexes.values.filter(value => Number(value[2]) === 1).map(value => String(value[1]))
      : [];

    for (const name of uniqueNames) {
      const columns = db
        .exec(`PRAGMA index_info('${name}')`)[0]
        .values.map(value => String(value[2]));

      // A unique index over audio_track alone would forbid two users sharing a
      // track, which contradicts the per-user pool model.
      expect(columns).not.toEqual(['audio_track']);
    }
  });
});

describe('SQLite rejects a duplicated (user_id, audio_track)', () => {
  let alice: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
  });

  it('rejects a raw INSERT reusing a track already held by the same user', () => {
    insertRawGesture(alice, 'first', 7);

    const message = captureError(() => insertRawGesture(alice, 'second', 7));

    expect(message).toMatch(/UNIQUE constraint failed/i);
    expect(message).toMatch(/user_id/);
    expect(message).toMatch(/audio_track/);

    // The rejected row must not be persisted.
    expect(countRawGestures(alice)).toBe(1);
  });

  it('rejects a raw INSERT clashing with a track the repository allocated', () => {
    const created = gestureRepository.create(alice, 'from-repository', makeData());

    const message = captureError(() =>
      insertRawGesture(alice, 'raw-clash', created.audioTrack),
    );

    expect(message).toMatch(/UNIQUE constraint failed/i);
    expect(gestureRepository.countByUserId(alice)).toBe(1);
  });

  it('rejects a raw UPDATE moving a gesture onto another gesture track of the same user', () => {
    const first = gestureRepository.create(alice, 'first', makeData());
    const second = gestureRepository.create(alice, 'second', makeData(3, 1));
    const db = dbModule.getDatabaseSync();

    const message = captureError(() =>
      db.exec(`UPDATE gestures SET audio_track = ${second.audioTrack} WHERE id = ${first.id}`),
    );

    expect(message).toMatch(/UNIQUE constraint failed/i);
    expect(gestureRepository.findById(first.id, alice)?.audioTrack).toBe(first.audioTrack);
  });

  it('rejects a third duplicate once the pair already exists twice', () => {
    insertRawGesture(alice, 'first', 12);

    expect(captureError(() => insertRawGesture(alice, 'second', 12))).toMatch(
      /UNIQUE constraint failed/i,
    );
    expect(captureError(() => insertRawGesture(alice, 'third', 12))).toMatch(
      /UNIQUE constraint failed/i,
    );

    expect(countRawGestures(alice)).toBe(1);
  });
});

describe('two different users may hold the same audioTrack', () => {
  let alice: number;
  let bob: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
    bob = userRepository.create('bob@test.dev', 'hash').id;
  });

  it('accepts a raw INSERT with the same audioTrack for a different user_id', () => {
    insertRawGesture(alice, 'alice-gesture', 3);

    // Must not throw: the constraint is per user, not global.
    expect(() => insertRawGesture(bob, 'bob-gesture', 3)).not.toThrow();

    expect(countRawGestures(alice)).toBe(1);
    expect(countRawGestures(bob)).toBe(1);
  });

  it('accepts a raw UPDATE moving a gesture to another user track number', () => {
    insertRawGesture(alice, 'alice-gesture', 5);
    insertRawGesture(bob, 'bob-gesture', 9);

    const db = dbModule.getDatabaseSync();
    const row = db.exec("SELECT id FROM gestures WHERE user_id = ? AND audio_track = 5", [alice]);
    const aliceId = Number(row[0].values[0][0]);

    expect(() =>
      db.exec(`UPDATE gestures SET audio_track = 9 WHERE id = ${aliceId}`),
    ).not.toThrow();

    const tracks = db
      .exec('SELECT user_id, audio_track FROM gestures ORDER BY user_id')[0]
      .values.map(value => [Number(value[0]), Number(value[1])]);

    expect(tracks).toEqual([
      [alice, 9],
      [bob, 9],
    ]);
  });

  it('gives the same first-fit sequence to two users through the repository', () => {
    const aliceTracks = [0, 1, 2].map(i =>
      gestureRepository.create(alice, `a${i}`, makeData(3, i)).audioTrack,
    );
    const bobTracks = [0, 1, 2].map(i =>
      gestureRepository.create(bob, `b${i}`, makeData(3, i)).audioTrack,
    );

    expect(aliceTracks).toEqual([1, 2, 3]);
    expect(bobTracks).toEqual([1, 2, 3]);
  });
});

describe('repository behaviour is unchanged under the constraint', () => {
  let alice: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
  });

  it('allocates first-fit 1..50 for a full profile', () => {
    const tracks = Array.from({ length: 50 }, (_, i) =>
      gestureRepository.create(alice, `g${i}`, makeData(3, i)).audioTrack,
    );

    expect(tracks).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(new Set(tracks).size).toBe(50);
  });

  it('reuses a track freed by deleting a gesture of the same user', () => {
    const first = gestureRepository.create(alice, 'g1', makeData());
    const second = gestureRepository.create(alice, 'g2', makeData(3, 1));
    expect([first.audioTrack, second.audioTrack]).toEqual([1, 2]);

    expect(gestureRepository.delete(first.id, alice)).toBe(true);

    const third = gestureRepository.create(alice, 'g3', makeData());
    expect(third.audioTrack).toBe(1);
  });

  it('never changes audioTrack on update, so the constraint is never at risk', () => {
    const first = gestureRepository.create(alice, 'g1', makeData());
    const second = gestureRepository.create(alice, 'g2', makeData(3, 1));

    const updated = gestureRepository.update(first.id, alice, {
      name: 'renamed',
      data: makeData(5, 4),
    });

    expect(updated?.audioTrack).toBe(first.audioTrack);
    expect(gestureRepository.findById(second.id, alice)?.audioTrack).toBe(second.audioTrack);
  });
});