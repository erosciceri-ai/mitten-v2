import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../config/index.js';

let database: Promise<Database> | null = null;
let transactions: Promise<unknown> = Promise.resolve();
const schema = () => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');

export function getDatabase(): Promise<Database> {
  if (!database) database = (async () => {
    if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
    const db = await open({ filename: config.dbPath, driver: sqlite3.Database });
    try {
      await db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
      await runMigrations(db);
      return db;
    } catch (error) { await db.close(); database = null; throw error; }
  })();
  return database;
}

export async function closeDatabase(): Promise<void> {
  await transactions;
  if (database) { const db = await database; database = null; await db.close(); }
}

// A single SQLite connection must not interleave asynchronous transactions.
export function runInTransaction<T>(action: (db: Database) => Promise<T>): Promise<T> {
  const operation = transactions.then(async () => {
    const db = await getDatabase();
    await db.exec('BEGIN IMMEDIATE');
    try { const result = await action(db); await db.exec('COMMIT'); return result; }
    catch (error) { await db.exec('ROLLBACK'); throw error; }
  });
  transactions = operation.catch(() => undefined);
  return operation;
}

export async function initializeDatabase(db: Database): Promise<void> { await runMigrations(db); }

export async function runMigrations(db: Database): Promise<void> {
  const version = await db.get<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = version?.user_version ?? 0;
  if (currentVersion > 2) throw new Error('Database schema is newer than this API');

  if (currentVersion < 1) {
    const sql = schema();
    await db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try {
      const existing = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='gestures'");
      if (existing) {
        const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(gestures)');
        const dataColumn = columns.some(c => c.name === 'data_json') ? 'data_json' : 'data';
        // Rebuild constraints transactionally without changing gesture identity or tracks.
        const gestureTable = sql.match(/CREATE TABLE IF NOT EXISTS gestures \([\s\S]*?\n\);/)![0];
        const audioTable = sql.match(/CREATE TABLE IF NOT EXISTS audio_tracks \([\s\S]*?\n\);/)![0];
        await db.exec(gestureTable.replace('gestures (', 'gestures_migrated ('));
        await db.exec(`INSERT INTO gestures_migrated(id,user_id,name,audio_track,data,created_at,updated_at)
          SELECT id,user_id,name,audio_track,${dataColumn},created_at,updated_at FROM gestures`);
        await db.exec(audioTable.replace('audio_tracks (', 'audio_tracks_migrated ('));
        const hasAudio = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='audio_tracks'");
        await db.exec(`WITH RECURSIVE tracks(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM tracks WHERE n<50)
          INSERT INTO audio_tracks_migrated(track_number,user_id,gesture_id,file_path,generated_at)
          SELECT t.n,u.id,g.id,${hasAudio ? 'a.file_path,a.generated_at' : 'NULL,NULL'}
          FROM users u CROSS JOIN tracks t
          LEFT JOIN gestures_migrated g ON g.user_id=u.id AND g.audio_track=t.n
          ${hasAudio ? 'LEFT JOIN audio_tracks a ON a.user_id=u.id AND a.track_number=t.n AND a.gesture_id=g.id' : ''}`);
        if (hasAudio) await db.exec('DROP TABLE audio_tracks');
        await db.exec('DROP TABLE gestures; ALTER TABLE gestures_migrated RENAME TO gestures; ALTER TABLE audio_tracks_migrated RENAME TO audio_tracks;');
      }
      // Version 1 also runs against legacy user tables that do not have google_sub yet.
      // The partial index belongs to version 2 and is created after the users migration.
      const migration1Sql = sql.replace(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub[^;]+;\r?\n/,
        ''
      );
      await db.exec(migration1Sql);
      const violations = await db.all('PRAGMA foreign_key_check');
      if (violations.length) throw new Error('Migration would violate foreign keys; original data preserved');
      await db.exec('PRAGMA user_version=1; COMMIT;');
      currentVersion = 1;
    } catch (error) { await db.exec('ROLLBACK'); throw error; }
    finally { await db.exec('PRAGMA foreign_keys=ON;'); }
  }

  if (currentVersion < 2) {
    await db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try {
      const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(users)');
      if (!columns.some(column => column.name === 'google_sub')) {
        await db.exec(`
          CREATE TABLE users_migrated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            google_sub TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            CHECK(password_hash IS NOT NULL OR google_sub IS NOT NULL)
          );
          INSERT INTO users_migrated(id,email,password_hash,google_sub,created_at,updated_at)
            SELECT id,email,password_hash,NULL,created_at,updated_at FROM users;
          DROP TRIGGER IF EXISTS update_users_timestamp;
          DROP TABLE users;
          ALTER TABLE users_migrated RENAME TO users;
        `);
      }
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
        CREATE TRIGGER IF NOT EXISTS update_users_timestamp
        AFTER UPDATE ON users FOR EACH ROW
        BEGIN
          UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;
      `);
      const violations = await db.all('PRAGMA foreign_key_check');
      if (violations.length) throw new Error('Google authentication migration would violate foreign keys; original data preserved');
      await db.exec('PRAGMA user_version=2; COMMIT;');
    } catch (error) { await db.exec('ROLLBACK'); throw error; }
    finally { await db.exec('PRAGMA foreign_keys=ON;'); }
  }
}
