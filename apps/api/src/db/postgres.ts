import pg, { type PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import type { DatabaseConnection } from './index.js';

export function openPostgres(connectionString: string, tls: string, max: number, production: boolean) {
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      url.pathname.length < 2 || url.search || url.hash) {
    throw new Error('DATABASE_URL must name a PostgreSQL database and omit connection options');
  }
  if (tls !== 'verify-full' && !(tls === 'disable' && !production &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('PostgreSQL requires verified TLS except for local development and testing');
  }
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error('DB_POOL_MAX must be between 1 and 20');
  const pool = new pg.Pool({
    types: { getTypeParser(oid, format) {
      if (oid !== 20 || format === 'binary') return pg.types.getTypeParser(oid, format);
      return (value: string) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error('PostgreSQL bigint exceeds JavaScript integer precision');
        return number;
      };
    } },
    connectionString, max, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
    statement_timeout: 10000, query_timeout: 12000, idle_in_transaction_session_timeout: 15000,
    ssl: tls === 'disable' ? false : { rejectUnauthorized: true },
  });
  // pg removes failed idle clients. The next operation obtains a fresh connection.
  pool.on('error', () => console.warn('PostgreSQL idle connection lost'));
  return pool;
}

export function postgresConnection(client: Pick<PoolClient, 'query'>): DatabaseConnection {
  // Repository SQL is static and uses ? only for bind parameters.
  function query(sql: string, values: unknown[]) {
    let index = 0;
    return client.query(sql.replace(/\?/g, () => '$' + ++index).replace(/\bCURRENT_TIMESTAMP\b/g, 'mitten_timestamp()'), values);
  }
  return {
    async get<T>(sql: string, ...values: unknown[]) { return (await query(sql, values)).rows[0] as T; },
    async all<T>(sql: string, ...values: unknown[]) { return (await query(sql, values)).rows as T; },
    async run(sql, ...values) { return { changes: (await query(sql, values)).rowCount ?? 0 }; },
    async exec(sql) { await client.query(sql); },
    async lockUser(id) { await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]); },
  };
}

export async function postgresTransaction<T>(
  pool: pg.Pool, action: (client: PoolClient) => Promise<T>, commit = true,
): Promise<T> {
  const client = await pool.connect();
  let connectionError: Error | undefined;
  let discard = false;
  // A checked-out client can disconnect while the callback is between queries.
  const onError = (error: Error) => { connectionError = error; };
  client.on('error', onError);
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await action(client);
    if (connectionError) throw connectionError;
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { discard = true; }
    throw error;
  } finally {
    client.removeListener('error', onError);
    client.release(connectionError ?? discard);
  }
}

const migrations = ['001-initial.sql', '002-audio-storage.sql'] as const;

export async function migratePostgres(pool: pg.Pool): Promise<void> {
  await postgresTransaction(pool, async client => {
    const { rows: [encoding] } = await client.query('SHOW server_encoding');
    if (encoding.server_encoding !== 'UTF8') throw new Error('PostgreSQL database must use UTF-8');
    await client.query('SELECT pg_advisory_xact_lock(1296651348, 1)');
    await client.query('CREATE TABLE IF NOT EXISTS mitten_schema_migrations (version integer PRIMARY KEY)');
    const { rows } = await client.query<{ version: number }>('SELECT version FROM mitten_schema_migrations ORDER BY version');
    if (rows.length > migrations.length || rows.some((row, index) => row.version !== index + 1)) {
      throw new Error('Unsupported PostgreSQL migration history');
    }
    for (let index = rows.length; index < migrations.length; index++) {
      const sql = readFileSync(new URL('postgres/' + migrations[index], import.meta.url), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO mitten_schema_migrations VALUES ($1)', [index + 1]);
    }
  });
}
