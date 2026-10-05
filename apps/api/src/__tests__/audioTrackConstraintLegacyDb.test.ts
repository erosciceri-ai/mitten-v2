/**
 * The UNIQUE (user_id, audio_track) guarantee must also hold on databases that
 * were created BEFORE the constraint existed.
 *
 * Why this needs its own suite
 * ----------------------------
 * `runMigrations` only ever executes idempotent `CREATE ... IF NOT EXISTS`
 * statements. `CREATE TABLE IF NOT EXISTS` is a no-op on an existing table, so
 * declaring `UNIQUE (user_id, audio_track)` inline in the CREATE TABLE would
 * apply it to freshly created databases only and would silently be missing on
 * every already existing one. The constraint is therefore enforced by a
 * `CREATE UNIQUE INDEX IF NOT EXISTS`, which SQLite applies to an existing
 * table too.
 *
 * These tests simulate a legacy database (old schema, no unique index) and then
 * open it through the real db module so the real migration code runs.
 *
 * The database module is a singleton keyed to DB_PATH, so each open resets the
 * module registry and re-requires it to point at a different file. No network
 * access; the development database is never opened.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, rmSync } from 'fs';
import initSqlJs, { type Database } from 'sql.js';
import { getDatabase, getDatabaseSync, closeDatabase } from '../db';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'audiotrack-legacy-secret-at-least-32-chars';

/**
 * The schema as it was BEFORE the constraint existed: gestures without any
 * unique index. Kept verbatim (minus the unique index) so this file really
 * reproduces the old on-disk shape.
 */
const LEGACY_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE gestures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    audio_track INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX idx_gestures_user_id ON gestures(user_id);
  CREATE INDEX idx_gestures_audio_track ON gestures(audio_track);
`;

const DATA_JSON = JSON.stringify({ version: 1, sampleCount: 1 });

/** Distinct path per scenario so leftovers can never be read by another one. */
function dbPathFor(name: string): string {
  return join(tmpdir(), `mitten-legacy-${name}-${process.pid}-${Date.now()}.db`);
}

async function loadSqlJs() {
  return initSqlJs({ locateFile: fileName => require.resolve(`sql.js/dist/${fileName}`) });
}

/** Build a legacy database file on disk with the given gestures. */
async function seedLegacyDatabase(
  dbPath: string,
  gestures: Array<{ userId: number; name: string; audioTrack: number }>,
): Promise<void> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(LEGACY_SCHEMA);
  db.exec(
    "INSERT INTO users (id, email, password_hash) VALUES (1, 'alice@test.dev', 'h'), (2, 'bob@test.dev', 'h')",
  );

  const stmt = db.prepare(`
    INSERT INTO gestures (user_id, name, audio_track, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  try {
    for (const gesture of gestures) {
      stmt.run([gesture.userId, gesture.name, gesture.audioTrack, DATA_JSON]);
    }
  } finally {
    stmt.free();
  }

  writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
}

/** Read the file straight from disk, bypassing the db module and its migrations. */
async function openRawFile(dbPath: string): Promise<Database> {
  const SQL = await loadSqlJs();
  return new SQL.Database(readFileSync(dbPath));
}

/**
 * Point the real db module at `dbPath` (fresh registry) and run the real
 * migrations by awaiting getDatabase().
 */
async function openWithRealMigrations(dbPath: string): Promise<typeof import('../db')> {
  jest.resetModules();
  process.env.DB_PATH = dbPath;
  const dbModule = require('../db') as typeof import('../db');
  await dbModule.getDatabase();
  return dbModule;
}

/** Columns of every UNIQUE index on gestures, inline table constraints included. */
function uniqueIndexColumns(db: Database): string[][] {
  const indexes = db.exec("PRAGMA index_list('gestures')")[0];
  if (!indexes) return [];
  return indexes.values
    .filter(value => Number(value[2]) === 1)
    .map(value => {
      const name = String(value[1]);
      return db
        .exec(`PRAGMA index_info('${name}')`)[0]
        .values.map(info => String(info[2]));
    });
}

const USER_AUDIO_TRACK_INDEX = ['user_id', 'audio_track'];

function hasUserAudioTrackIndex(db: Database): boolean {
  return uniqueIndexColumns(db).some(
    columns => columns.join(',') === USER_AUDIO_TRACK_INDEX.join(','),
  );
}

function captureError(fn: () => void): string {
  try {
    fn();
    return '<no error>';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Raw INSERT, bypassing the repository: this is what the constraint must block. */
function rawInsert(db: Database, userId: number, name: string, audioTrack: number): void {
  const stmt = db.prepare(`
    INSERT INTO gestures (user_id, name, audio_track, data_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  try {
    stmt.run([userId, name, audioTrack, DATA_JSON]);
  } finally {
    stmt.free();
  }
}

describe('legacy database: the constraint is added by the real migrations', () => {
  let dbPath: string;

  beforeAll(async () => {
    dbPath = dbPathFor('clean');
    // Valid legacy data: one user can never have had two gestures on one track,
    // because the repository has always allocated first-fit per user.
    await seedLegacyDatabase(dbPath, [
      { userId: 1, name: 'alice-1', audioTrack: 1 },
      { userId: 1, name: 'alice-2', audioTrack: 2 },
      { userId: 2, name: 'bob-1', audioTrack: 1 },
    ]);
  });

  afterAll(() => {
    try {
      rmSync(dbPath, { force: true });
    } catch {
      /* nothing persisted (NODE_ENV=test skips auto-save) */
    }
  });

  it('adds the unique index to a table that did not have one', async () => {
    // Baseline: the legacy file on disk genuinely lacks the constraint, so the
    // assertion below can only pass because the migration created it.
    const before = await openRawFile(dbPath);
    expect(hasUserAudioTrackIndex(before)).toBe(false);
    before.close();

    const dbModule = await openWithRealMigrations(dbPath);

    expect(hasUserAudioTrackIndex(dbModule.getDatabaseSync())).toBe(true);
  });

  it('rejects a duplicated (user_id, audio_track) on the legacy table', async () => {
    const dbModule = await openWithRealMigrations(dbPath);
    const db = dbModule.getDatabaseSync();

    // alice already holds track 2.
    const message = captureError(() => rawInsert(db, 1, 'raw-clash', 2));

    expect(message).toMatch(/UNIQUE constraint failed/i);
    expect(message).toMatch(/user_id/);
    expect(message).toMatch(/audio_track/);
  });

  it('still allows two users to share the same audioTrack on the legacy table', async () => {
    const dbModule = await openWithRealMigrations(dbPath);
    const db = dbModule.getDatabaseSync();

    expect(() => rawInsert(db, 1, 'alice-3', 3)).not.toThrow();
    expect(() => rawInsert(db, 2, 'bob-2', 3)).not.toThrow();

    const rows = db
      .exec('SELECT user_id, audio_track FROM gestures WHERE audio_track = 3 ORDER BY user_id')[0]
      .values.map(value => [Number(value[0]), Number(value[1])]);

    expect(rows).toEqual([
      [1, 3],
      [2, 3],
    ]);
  });

  it('preserves the rows that were already stored', async () => {
    const dbModule = await openWithRealMigrations(dbPath);
    const db = dbModule.getDatabaseSync();

    const rows = db.exec('SELECT user_id, name, audio_track FROM gestures ORDER BY id')[0].values;

    expect(rows).toContainEqual([1, 'alice-1', 1]);
    expect(rows).toContainEqual([1, 'alice-2', 2]);
    expect(rows).toContainEqual([2, 'bob-1', 1]);
  });

  it('is idempotent: re-opening the migrated database changes nothing', async () => {
    await openWithRealMigrations(dbPath);
    jest.resetModules();
    process.env.DB_PATH = dbPath;
    const reopened = require('../db') as typeof import('../db');
    await getDatabase();

    const indexes = uniqueIndexColumns(getDatabaseSync()).filter(
      columns => columns.join(',') === USER_AUDIO_TRACK_INDEX.join(','),
    );

    expect(indexes).toHaveLength(1);
  });
});

describe('legacy database with already-duplicated rows', () => {
  let dbPath: string;

  beforeAll(async () => {
    dbPath = dbPathFor('violating');
    await seedLegacyDatabase(dbPath, [
      { userId: 1, name: 'alice-1', audioTrack: 4 },
      // Cannot be produced by the repository, only by out-of-band SQL edits.
      { userId: 1, name: 'alice-2', audioTrack: 4 },
    ]);
  });

  afterAll(() => {
    try {
      rmSync(dbPath, { force: true });
    } catch {
      /* nothing persisted */
    }
  });

  it('refuses to migrate and leaves the data untouched instead of dropping it', async () => {
    jest.resetModules();
    process.env.DB_PATH = dbPath;
    const dbModule = require('../db') as typeof import('../db');

    // The project defines no data-repair policy, so the migration must fail
    // loudly rather than silently delete or reassign a gesture.
    await expect(dbModule.getDatabase()).rejects.toThrow(/UNIQUE constraint failed/i);

    // Nothing was repaired: both rows are still on disk.
    const untouched = await openRawFile(dbPath);
    const rows = untouched.exec('SELECT name, audio_track FROM gestures ORDER BY id')[0].values;
    untouched.close();

    expect(rows).toEqual([
      ['alice-1', 4],
      ['alice-2', 4],
    ]);
  });
});