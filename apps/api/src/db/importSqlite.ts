import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import type { Pool, PoolClient } from 'pg';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { config } from '../config/index.js';
import { assertTransportableGesture } from '../utils/schemas.js';
import { openPostgres, postgresTransaction } from './postgres.js';

const tables = [
  ['users', 'id,email,password_hash,google_sub,created_at,updated_at', 'id'],
  ['gestures', 'id,user_id,name,audio_track,data,created_at,updated_at', 'id'],
  ['profiles', 'id,user_id,revision,gesture_count,created_at,updated_at'],
  ['audio_tracks', 'user_id,track_number,gesture_id,file_path,generated_at'],
  ['sync_sessions', 'sync_id,user_id,profile_id,profile_revision,expected_gesture_count,received_count,status,created_at,updated_at'],
  ['sync_gestures_staging', 'id,sync_id,gesture_index,gesture_id,name,audio_track,data,created_at', 'id'],
] as const;

type Cell = string | number | null;
type Row = Record<string, Cell>;
class ImportError extends Error {}

async function verifySequence(client: PoolClient, table: string, next: number): Promise<void> {
  // Default identity sequence names come from migration 001 and the fixed table list.
  const { rows: [sequence] } = await client.query(`SELECT last_value::text, is_called FROM ${table}_id_seq`);
  if (sequence.last_value !== String(next) || sequence.is_called) {
    throw new ImportError(`Identity verification failed for ${table}`);
  }
}

export async function importSQLite(filename: string, pool: Pool, apply = false) {
  const source = await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  let section = 'SQLite snapshot';
  const counts: Record<string, number> = {};
  const nextIds: Record<string, number> = {};
  try {
    await source.exec('BEGIN');
    const version = await source.get('PRAGMA user_version');
    if (![2, 3].includes(version.user_version)) throw new ImportError('Source must be a backup at SQLite schema version 2 or 3');
    if (version.user_version === 3 && (await source.get('SELECT 1 FROM audio_objects LIMIT 1'))) {
      throw new ImportError('Source has versioned audio objects; use a coordinated database and object backup');
    }
    const integrity = await source.get('PRAGMA integrity_check');
    if (integrity.integrity_check !== 'ok' || (await source.all('PRAGMA foreign_key_check')).length) {
      throw new ImportError('SQLite integrity or foreign key check failed');
    }
    const incompleteTracks = await source.get(`
      SELECT 1 FROM users u
      WHERE (SELECT COUNT(*) FROM audio_tracks a WHERE a.user_id=u.id) <> 50
      UNION ALL
      SELECT 1 FROM gestures g WHERE NOT EXISTS (
        SELECT 1 FROM audio_tracks a
        WHERE a.user_id=g.user_id AND a.track_number=g.audio_track AND a.gesture_id=g.id
      ) LIMIT 1`);
    if (incompleteTracks) throw new ImportError('SQLite audio track inventory or gesture mapping is incomplete');

    section = 'PostgreSQL destination';
    await postgresTransaction(pool, async client => {
      await client.query('LOCK TABLE mitten_schema_migrations IN SHARE MODE');
      const { rows: versions } = await client.query('SELECT version FROM mitten_schema_migrations');
      if (versions.length !== 2 || versions.some(({ version }) => ![1, 2].includes(version))) throw new ImportError('Destination must have PostgreSQL migrations 001 and 002');
      // Hold writers until verification and commit (or rollback in a dry run).
      await client.query(`LOCK TABLE ${tables.map(([table]) => table).join(', ')}, audio_objects IN ACCESS EXCLUSIVE MODE`);
      if ((await client.query('SELECT 1 FROM audio_objects LIMIT 1')).rowCount) throw new ImportError('Destination audio_objects is not empty');
      for (const [table, , identity] of tables) {
        if ((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount) {
          throw new ImportError(`Destination table ${table} is not empty`);
        }
        if (identity) await verifySequence(client, table, 1);
      }

      for (const [table, columns, identity] of tables) {
        section = table;
        const fields = columns.split(',');
        const rows = await source.all<Row[]>(`SELECT ${columns} FROM ${table}`);
        const expected = new Set<string>();
        const placeholders = fields.map((_, index) => '$' + (index + 1)).join(',');
        let maxId = 0;
        for (const row of rows) {
          const values = fields.map(field => row[field]);
          if (values.some(value => value !== null && typeof value !== 'string' && !Number.isSafeInteger(value))) {
            throw new ImportError(`Unsupported value or unsafe integer in ${table}`);
          }
          if (table === 'gestures') assertTransportableGesture({
            id: Number(row.id), name: String(row.name), audioTrack: Number(row.audio_track),
            data: JSON.parse(String(row.data)),
          });
          if (identity) maxId = Math.max(maxId, Number(row[identity]));
          expected.add(JSON.stringify(values));
          await client.query(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, values);
        }
        const restored = await client.query({ text: `SELECT ${columns} FROM ${table}`, rowMode: 'array' });
        if (restored.rows.length !== rows.length ||
            restored.rows.some(row => !expected.delete(JSON.stringify(row))) || expected.size) {
          throw new ImportError(`Row verification failed for ${table}`);
        }
        counts[table] = rows.length;

        if (identity) {
          const sequence = await source.get<{ seq: number }>('SELECT seq FROM sqlite_sequence WHERE name=?', table);
          const previous = sequence?.seq ?? 0;
          const next = Math.max(maxId, previous) + 1;
          if (!Number.isSafeInteger(previous) || previous < 0 || !Number.isSafeInteger(next) ||
              (table === 'gestures' && next > 2147483647)) {
            throw new ImportError(`Identity range exhausted or invalid for ${table}`);
          }
          // ALTER ... RESTART is transactional. setval and nextval would survive rollback.
          await client.query(`ALTER TABLE ${table} ALTER COLUMN ${identity} RESTART WITH ${next}`);
          await verifySequence(client, table, next);
          nextIds[table] = next;
        }
      }
      section = 'transaction completion';
      await source.exec('ROLLBACK');
    }, apply);
    return { mode: apply ? 'applied' : 'dry-run', counts, nextIds };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`Import failed during ${section}`);
  } finally {
    await source.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let pool: Pool | undefined;
  try {
    const [filename, mode, ...extra] = process.argv.slice(2);
    if (!filename || filename.startsWith('--') || (mode && mode !== '--apply') || extra.length || config.dbProvider !== 'postgres') {
      throw new ImportError('Set DB_PROVIDER=postgres and pass <sqlite-backup> [--apply]');
    }
    pool = openPostgres(config.databaseUrl, config.dbTls, config.dbPoolMax, config.nodeEnv === 'production');
    console.log(JSON.stringify(await importSQLite(filename, pool, mode === '--apply'), null, 2));
  } catch (error) {
    console.error(error instanceof ImportError ? error.message : 'Import could not open its source or destination');
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
