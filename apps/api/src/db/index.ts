import initSqlJs, { Database } from 'sql.js';
import { config } from '../config';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';

// Re-export test store utilities (defined in __tests__/testStore.ts)
// This keeps the production db module compatible with existing repository imports
// while moving test-only code out of production source.
export {
  enableTestStore,
  disableTestStore,
  isTestStoreEnabled,
  createTestUser,
  findTestUserByEmail,
  findTestUserById,
  updateTestUserPassword,
  clearTestUsers,
  clearTestGestures,
  clearAllTestData,
  getTestUserCount,
  getTestGestureCount,
  createTestGesture,
  findTestGestureById,
  findTestGesturesByUserId,
  updateTestGesture,
  deleteTestGesture,
  countTestGesturesByUserId,
  getNextAvailableAudioTrack,
} from '../__tests__/testStore';

/** Protocol Version 2 caps a profile at 50 gestures. */
export const MAX_GESTURES_PER_USER = 50;

/** Each user owns an independent audioTrack pool of 1..50. */
export const MAX_AUDIO_TRACKS = 50;

let db: Database | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let dbInitialized = false;

/**
 * Resolve sql.js runtime assets (e.g. sql-wasm.wasm) from the installed package.
 *
 * The asset is resolved locally so the API starts without network access.
 * sql.js exposes "./dist/*" via its package.json "exports", so require.resolve
 * works for both the WASM binary and the asm.js builds.
 */
function resolveSqlJsAsset(fileName: string): string {
  return require.resolve(`sql.js/dist/${fileName}`);
}

async function initializeDatabase(): Promise<Database> {
  if (dbInitialized && db) return db;

  const SQL = await initSqlJs({
    locateFile: resolveSqlJsAsset,
  });

  const dbPath = resolve(config.dbPath);
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  let sqlDb: Database;

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    sqlDb = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    sqlDb = new SQL.Database();
  }

  // Enable foreign keys
  sqlDb.exec('PRAGMA foreign_keys = ON');

  // Run migrations
  runMigrations(sqlDb);

  db = sqlDb;
  dbInitialized = true;

  // Auto-save to disk periodically
  if (config.nodeEnv !== 'test') {
    saveTimer = setInterval(() => {
      saveDatabase();
    }, 5000);
  }

  return db;
}

function runMigrations(database: Database): void {
  // Create users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create index on email for faster lookups
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  `);

  // Create gestures table
  database.exec(`
    CREATE TABLE IF NOT EXISTS gestures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      audio_track INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for gestures
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_gestures_user_id ON gestures(user_id)
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_gestures_audio_track ON gestures(audio_track)
  `);

  // Each user owns an independent audioTrack pool of 1..50, so audioTrack must
  // be unique per user, NOT globally: two different users may legitimately hold
  // the same track, a single user may never hold it twice.
  //
  // Enforced as a UNIQUE index rather than an inline `UNIQUE (user_id,
  // audio_track)` table constraint because `CREATE TABLE IF NOT EXISTS` is a
  // no-op on an existing database: an inline constraint would only apply to
  // freshly created files and would silently be missing everywhere else. A
  // unique index is enforced identically (same UNIQUE constraint error) and,
  // being idempotent, is applied to already existing databases too.
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gestures_user_id_audio_track
    ON gestures(user_id, audio_track)
  `);
}

function saveDatabase(): void {
  if (!db) return;
  
  // Don't save to disk in test environment
  if (process.env.NODE_ENV === 'test') return;
  
  try {
    const data = db.export();
    const dbPath = resolve(config.dbPath);
    writeFileSync(dbPath, Buffer.from(data));
  } catch (error) {
    console.error('Failed to save database:', error);
  }
}

export async function getDatabase(): Promise<Database> {
  if (!dbInitialized) {
    await initializeDatabase();
  }
  return db!;
}

export function getDatabaseSync(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call getDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
  saveDatabase();
  db = null;
  dbInitialized = false;
}

export function runInTransaction<T>(fn: (database: Database) => T): T {
  const database = getDatabaseSync();
  try {
    database.exec('BEGIN TRANSACTION');
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function setTestDatabase(database: Database): void {
  db = database;
  dbInitialized = true;
}

export function getTestDatabase(): Database | null {
  return db;
}