import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { config } from '../config/index.js';
import { closeDatabase, getDatabase, type DatabaseConnection } from '../db/index.js';
import { openPostgres, postgresConnection } from '../db/postgres.js';
import { audioChecksum, getAudioStorage } from './audioStorage.js';
import { audioRowsSql, collectAudioOrphans, findAudioOrphans, publishAudio, readGestureAudio, type AudioRow } from './gestureAudio.js';
import { getAudioFilePath, validateMp3 } from './tts.js';

const legacyRowsSql = `SELECT a.user_id, a.gesture_id, a.track_number, a.file_path, a.generated_at,
  0 AS audio_revision, NULL AS object_key, g.name, NULL AS provider, NULL AS state,
  NULL AS size_bytes, NULL AS content_type, NULL AS sha256
  FROM audio_tracks a JOIN gestures g ON g.id=a.gesture_id AND g.user_id=a.user_id AND g.audio_track=a.track_number`;

async function inspectDatabase<T>(inspect: (db: Pick<DatabaseConnection, 'all'>, migrated: boolean) => Promise<T>): Promise<T> {
  if (config.dbProvider === 'sqlite') {
    const db = await open({ filename: config.dbPath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
    try {
      const version = (await db.get<{ user_version: number }>('PRAGMA user_version'))!.user_version;
      if (version !== 2 && version !== 3) throw new Error('Expected SQLite migration 2 or 3');
      return await inspect(db, version === 3);
    } finally { await db.close(); }
  }
  if (config.dbProvider !== 'postgres') throw new Error('Unsupported DB_PROVIDER');
  const pool = openPostgres(config.databaseUrl, config.dbTls, config.dbPoolMax, config.nodeEnv === 'production');
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const db = postgresConnection(client);
      const version = await db.get<{ version: number }>('SELECT MAX(version) AS version FROM mitten_schema_migrations');
      if (version?.version !== 1 && version?.version !== 2) throw new Error('Expected PostgreSQL migration 001 or 002');
      return await inspect(db, version.version === 2);
    } finally {
      // No writes are permitted. Release even if the read-only transaction fails.
      try { await client.query('ROLLBACK'); client.release(); }
      catch { client.release(true); }
    }
  } finally { await pool.end(); }
}

async function listDirectory(path: string) {
  return readdir(path, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
}

export async function inventoryAudio(db?: DatabaseConnection, apply = false) {
  const rows = db ? await db.all<AudioRow[]>(audioRowsSql) : await inspectDatabase((reader, migrated) => reader.all<AudioRow[]>(migrated ? audioRowsSql : legacyRowsSql));
  const referencedPaths = new Set<string>();
  const results = [];
  for (const row of rows) {
    if (!row.object_key && !row.file_path) continue;
    const identity = { userId: row.user_id, gestureId: row.gesture_id, track: row.track_number,
      path: row.object_key ?? row.file_path };
    try {
      const path = getAudioFilePath(row.user_id, row.track_number);
      if (row.file_path === path) referencedPaths.add(path);
      const bytes = await readGestureAudio(row);
      if (!bytes) { results.push({ ...identity, status: 'missing-or-invalid' }); continue; }
      validateMp3(bytes);
      let status = row.provider === 's3' ? 'already-migrated' : 'ready';
      if (apply && row.provider !== 's3') {
        await publishAudio(row, bytes, 's3', { preserveTimestamp: true });
        status = 'migrated';
      }
      results.push({ ...identity, status, size: bytes.length, sha256: audioChecksum(bytes) });
    } catch { results.push({ ...identity, status: 'verify-or-retry' }); }
  }

  for (const owner of await listDirectory(config.audioDir)) {
    if (!owner.isDirectory() || !/^[1-9]\d*$/.test(owner.name)) continue;
    const directory = join(config.audioDir, owner.name, 'mp3');
    const children = await listDirectory(join(config.audioDir, owner.name));
    if (!children.some(child => child.name === 'mp3' && child.isDirectory())) continue;
    for (const entry of await listDirectory(directory)) {
      const path = join(directory, entry.name);
      if (entry.name.toLowerCase().endsWith('.mp3') && !referencedPaths.has(path)) {
        results.push({ path, status: 'unreferenced-local' });
      }
    }
  }
  for (const entry of await listDirectory(config.audioDir)) {
    if (entry.name.toLowerCase().endsWith('.mp3')) {
      results.push({ path: join(config.audioDir, entry.name), status: 'unreferenced-local' });
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply' && arg !== '--collect')) throw new Error('Usage: audio:maintenance [--apply] [--collect]');
  const apply = args.includes('--apply');
  if (apply && !args.includes('--collect')) getAudioStorage('s3');
  if (args.includes('--collect') && !apply) {
    console.log(JSON.stringify({ apply, results: await inspectDatabase((db, migrated) => migrated ? findAudioOrphans(db) : Promise.resolve([])) }, null, 2));
    return;
  }
  const results = args.includes('--collect')
    ? await collectAudioOrphans(await getDatabase())
    : await inventoryAudio(apply ? await getDatabase() : undefined, apply);
  console.log(JSON.stringify({ apply, results }, null, 2));
  if (results.some(result => ['missing-or-invalid', 'verify-or-retry', 'retry'].includes(result.status))) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await main(); }
  catch { console.error('Audio maintenance failed. Check the selected database, schema and storage configuration.'); process.exitCode = 1; }
  finally { await closeDatabase(); }
}
