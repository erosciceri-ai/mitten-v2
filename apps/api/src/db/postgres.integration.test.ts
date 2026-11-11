import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import app from '../index.js';
import { config } from '../config/index.js';
import { createGoogleUser, createUser, findUserByGoogleSub, findUserById, verifyPassword } from '../models/User.js';
import { createGesture, deleteGesture, getGestureCount } from '../models/Gesture.js';
import { gestureData } from '../test/gesture.js';
import { closeDatabase, getDatabase, runMigrations } from './index.js';
import { importSQLite } from './importSqlite.js';
import { migratePostgres, openPostgres, postgresTransaction } from './postgres.js';

const adminUrl = process.env.MITTEN_TEST_POSTGRES_URL;
const backupTools = process.env.MITTEN_TEST_PG_BIN;

describe.skipIf(!adminUrl)('PostgreSQL integration', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const appDb = 'mitten_test_app_' + suffix;
  const importDb = 'mitten_test_import_' + suffix;
  const restoreDb = 'mitten_test_restore_' + suffix;
  const databases: string[] = [];
  let admin: ReturnType<typeof openPostgres>;
  let target: ReturnType<typeof openPostgres>;
  let server: ReturnType<typeof app.listen> | undefined;
  let directory: string | undefined;
  let base: string;
  let allocationUserId: number;
  let fixtureHash: string | null;

  function urlFor(database: string) {
    const url = new URL(adminUrl!);
    url.pathname = '/' + database;
    return url.href;
  }

  async function createDatabase(name: string) {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`);
    databases.push(name);
  }

  beforeAll(async () => {
    // Test-only input, separate from DATABASE_URL. Every writable target has a random name.
    admin = openPostgres(adminUrl!, 'disable', 2, false);
    await createDatabase(appDb);
    await createDatabase(importDb);
    Object.assign(config, { dbProvider: 'postgres', databaseUrl: urlFor(appDb), dbTls: 'disable' });
    target = openPostgres(urlFor(importDb), 'disable', 2, false);
    await Promise.all([getDatabase(), migratePostgres(target)]);
    await migratePostgres(target);
    const allocator = await createUser({ email: 'allocator@fixture.test', password: 'fixture-only-password' });
    allocationUserId = allocator.id;
    fixtureHash = (await findUserById(allocator.id))!.password_hash;
    directory = await mkdtemp(join(tmpdir(), 'mitten-pg-fixture-'));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test API did not start');
    base = `http://127.0.0.1:${address.port}/api`;
  }, 20000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
    await target?.end();
    for (const name of databases) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin?.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  }, 20000);

  function request(path: string, method = 'GET', body?: object, token?: string, origin?: string) {
    const headers = new Headers();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (origin) headers.set('Origin', origin);
    if (body) headers.set('Content-Type', 'application/json');
    return fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  }

  it('preserves registration, password login, gesture CRUD, user isolation and Phase 2 headers', async () => {
    const credentials = { email: 'owner@fixture.test', password: 'fixture-only-password' };
    const registration = await request('/auth/register', 'POST', credentials);
    expect(registration.status).toBe(201);
    const login = await request('/auth/login', 'POST', credentials);
    expect(login.status).toBe(200);
    const { token } = await login.json() as { token: string };
    expect((await request('/auth/login', 'POST', { ...credentials, password: 'incorrect' })).status).toBe(401);
    expect((await request('/auth/register', 'POST', credentials)).status).toBe(409);
    const outsider = await (await request('/auth/register', 'POST', { ...credentials, email: 'other@fixture.test' })).json() as { token: string };
    const response = await request('/gestures', 'POST', { name: 'Hola', data: gestureData }, token);
    expect(response.status).toBe(201);
    const gesture = await response.json() as { id: number; createdAt: string };
    expect(gesture).toMatchObject({ name: 'Hola', audioTrack: 1, data: gestureData });
    expect(gesture.createdAt).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    const path = '/gestures/' + gesture.id;
    expect((await request(path, 'GET', undefined, outsider.token)).status).toBe(404);
    expect((await request(path, 'DELETE', undefined, outsider.token)).status).toBe(404);
    expect((await request(path, 'PUT', { name: 'Edited' }, outsider.token)).status).toBe(404);
    expect((await request('/gestures', 'GET', undefined, outsider.token)).status).toBe(200);
    config.ttsProvider = 'fixture';
    try {
      expect((await request(path + '/audio', 'POST', {}, token)).status).toBe(200);
      expect((await request(path + '/audio/file', 'GET', undefined, outsider.token)).status).toBe(404);
      const audio = await request(path + '/audio/file', 'GET', undefined, token);
      expect(audio.status).toBe(200);
      expect((await audio.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      config.ttsProvider = 'mock';
    }
    const updated = await request(path, 'PUT', { name: 'Edited' }, token);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: gesture.id, audioTrack: 1, name: 'Edited' });
    expect((await request(path + '/audio/file', 'GET', undefined, token)).status).toBe(404);
    expect((await request('/gestures/2147483648', 'GET', undefined, token)).status).toBe(404);
    expect((await request(path, 'DELETE', undefined, token)).status).toBe(204);
    expect((await request(path, 'GET', undefined, token)).status).toBe(404);
    const denied = await request('/gestures', 'GET', undefined, token, 'https://blocked.fixture.test');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('x-content-type-options')).toBe('nosniff');
    expect(denied.headers.get('cache-control')).toBe('no-store');
    expect((await request('/gestures')).status).toBe(401);
    expect(await (await request('/ready')).json()).toMatchObject({ services: { postgres: 'ok' } });
  }, 15000);

  it('persists Google-only identity and rolls back duplicate registration', async () => {
    const google = await createGoogleUser('google@fixture.test', 'fixture-google-sub');
    expect(await findUserByGoogleSub('fixture-google-sub')).toMatchObject({ id: google.id, password_hash: null });
    await expect(createGoogleUser('duplicate@fixture.test', 'fixture-google-sub')).rejects.toMatchObject({ code: '23505' });
    const db = await getDatabase();
    expect(await db.get('SELECT COUNT(*) AS count FROM audio_tracks WHERE user_id=?', google.id)).toEqual({ count: 50 });
  });

  it('rolls back after a failed track write, serializes concurrent allocations and reuses first-fit', async () => {
    const db = await getDatabase();
    await db.exec(`
      CREATE FUNCTION test_reject_track() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected track failure'; END; $$;
      CREATE TRIGGER test_reject_track BEFORE UPDATE ON audio_tracks
        FOR EACH ROW EXECUTE FUNCTION test_reject_track();
    `);
    const create = () => createGesture({ userId: allocationUserId, name: 'Hola', data: gestureData });
    try { await expect(create()).rejects.toThrow('injected track failure'); }
    finally { await db.exec('DROP TRIGGER test_reject_track ON audio_tracks; DROP FUNCTION test_reject_track()'); }
    expect(await getGestureCount(allocationUserId)).toBe(0);

    const allocations = await Promise.allSettled(Array.from({ length: 51 }, create));
    const gestures = allocations.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    expect(gestures.map(gesture => gesture.audioTrack).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    const failed = allocations.filter(result => result.status === 'rejected');
    expect(failed).toHaveLength(1);
    expect(failed[0].reason.message).toContain('audio tracks');
    const gesture = gestures.find(value => value.audioTrack === 3)!;
    await expect(db.run('UPDATE gestures SET audio_track=51 WHERE id=?', gesture.id)).rejects.toMatchObject({ code: '23514' });
    await expect(db.run('UPDATE audio_tracks SET gesture_id=? WHERE user_id=? AND track_number=1', gesture.id, allocationUserId)).rejects.toMatchObject({ code: '23503' });
    expect(await deleteGesture(allocationUserId, gesture.id)).toBe(true);
    expect((await create()).audioTrack).toBe(3);
  }, 20000);

  it('imports and verifies all six tables from a consistent SQLite backup', async () => {
    const sourcePath = join(directory!, 'source.db');
    const backupPath = join(directory!, 'backup.db');
    const source = await open({ filename: sourcePath, driver: sqlite3.Database });
    const hash = fixtureHash;
    const badStagingPath = join(directory!, 'invalid-staging.db');
    try {
      await source.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON");
      await runMigrations(source);
      await source.run("INSERT INTO users VALUES (7,'import@fixture.test',?,NULL,'2020-02-03 04:05:06',NULL)", hash);
      await source.exec(`
        INSERT INTO users(id,email,google_sub) VALUES (9,'google-import@fixture.test','imported-sub');
        WITH RECURSIVE tracks(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM tracks WHERE n<50)
        INSERT INTO audio_tracks(user_id,track_number) SELECT id,n FROM users CROSS JOIN tracks;
        INSERT INTO profiles VALUES ('profile',7,'rev',1,'created','updated');
        INSERT INTO sync_sessions VALUES ('sync',7,'profile','rev',1,1,'active','created','updated');
        INSERT INTO sync_gestures_staging VALUES (33,'sync',0,42,'Hola',9,'{}','created');
      `);
      await source.run("INSERT INTO gestures VALUES (42,7,'Hola',9,?,'2020-02-03 04:05:06','2020-02-03 04:05:07')", JSON.stringify(gestureData));
      await source.exec(`
        UPDATE audio_tracks SET gesture_id=42,file_path='synthetic.mp3',generated_at='2020-02-03 04:05:08' WHERE user_id=7 AND track_number=9;
        UPDATE sqlite_sequence SET seq=100 WHERE name='gestures';
      `);
      await source.run('VACUUM INTO ?', backupPath);
      await source.exec("UPDATE sync_gestures_staging SET gesture_index='invalid'");
      await source.run('VACUUM INTO ?', badStagingPath);
      await source.exec("UPDATE audio_tracks SET gesture_id=NULL WHERE user_id=7 AND track_number=9");
    } finally { await source.close(); }

    await expect(importSQLite(sourcePath, target)).rejects.toThrow('mapping is incomplete');
    const report = {
      counts: { users: 2, gestures: 1, profiles: 1, audio_tracks: 100, sync_sessions: 1, sync_gestures_staging: 1 },
      nextIds: { users: 10, gestures: 101, sync_gestures_staging: 34 },
    };
    await expect(importSQLite(badStagingPath, target, true)).rejects.toThrow('sync_gestures_staging');
    expect((await target.query('SELECT COUNT(*) AS count FROM users')).rows[0].count).toBe(0);
    expect((await target.query('SELECT last_value,is_called FROM gestures_id_seq')).rows[0]).toEqual({ last_value: 1, is_called: false });
    expect(await importSQLite(backupPath, target)).toEqual({ mode: 'dry-run', ...report });
    expect((await target.query('SELECT COUNT(*) AS count FROM users')).rows[0].count).toBe(0);
    expect((await target.query('SELECT last_value,is_called FROM gestures_id_seq')).rows[0]).toEqual({ last_value: 1, is_called: false });
    expect(await importSQLite(backupPath, target, true)).toEqual({ mode: 'applied', ...report });
    await expect(importSQLite(backupPath, target, true)).rejects.toThrow('is not empty');
    const { rows: [user] } = await target.query('SELECT * FROM users WHERE id=7');
    expect(user).toMatchObject({ id: 7, password_hash: hash, created_at: '2020-02-03 04:05:06', updated_at: null });
    expect(await verifyPassword(user, 'fixture-only-password')).toBe(true);
    expect((await target.query('SELECT gesture_id,file_path FROM audio_tracks WHERE user_id=7 AND track_number=9')).rows[0])
      .toEqual({ gesture_id: 42, file_path: 'synthetic.mp3' });
    expect((await target.query('SELECT nextval(\'gestures_id_seq\') AS id')).rows[0].id).toBe(101);
  }, 20000);

  it.skipIf(!backupTools)('restores a PostgreSQL custom backup into a separate empty database', async () => {
    await createDatabase(restoreDb);
    const sourceUrl = new URL(urlFor(importDb));
    const archive = join(directory!, 'fixture.dump');
    const extension = process.platform === 'win32' ? '.exe' : '';
    const env = {
      ...process.env, PGHOST: sourceUrl.hostname, PGPORT: sourceUrl.port, PGUSER: decodeURIComponent(sourceUrl.username),
      PGPASSWORD: decodeURIComponent(sourceUrl.password), PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5',
    };
    execFileSync(join(backupTools!, 'pg_dump' + extension), ['-w', '-Fc', '-f', archive, '-d', importDb], { env, timeout: 10000 });
    execFileSync(join(backupTools!, 'pg_restore' + extension), ['-w', '--single-transaction', '--no-owner', '--no-privileges', '-d', restoreDb, archive], { env, timeout: 10000 });
    const restored = openPostgres(urlFor(restoreDb), 'disable', 2, false);
    try {
      for (const [table, order] of [
        ['users', 'id'], ['gestures', 'id'], ['profiles', 'id'], ['audio_tracks', 'user_id,track_number'],
        ['sync_sessions', 'sync_id'], ['sync_gestures_staging', 'id'], ['mitten_schema_migrations', 'version'],
      ]) {
        const sql = `SELECT * FROM ${table} ORDER BY ${order}`;
        expect((await restored.query(sql)).rows).toEqual((await target.query(sql)).rows);
      }
      expect((await restored.query("SELECT nextval('gestures_id_seq') AS id")).rows[0].id).toBe(102);
      await expect(restored.query('UPDATE gestures SET audio_track=51 WHERE id=42')).rejects.toMatchObject({ code: '23514' });
    } finally { await restored.end(); }
  }, 25000);

  it('recovers when a checked-out transaction loses its connection between queries', async () => {
    await expect(postgresTransaction(target, async client => {
      const { rows: [{ pid }] } = await client.query('SELECT pg_backend_pid() AS pid');
      await admin.query('SELECT pg_terminate_backend($1, 3000)', [pid]);
    })).rejects.toThrow();
    expect((await target.query('SELECT 1 AS ok')).rows[0]).toEqual({ ok: 1 });
  });

  it('reports unavailability without exposing connection details and recovers after reconnecting', async () => {
    await admin.query(`ALTER DATABASE ${appDb} WITH ALLOW_CONNECTIONS false`);
    try {
      await admin.query('SELECT pg_terminate_backend(pid, 3000) FROM pg_stat_activity WHERE datname=$1', [appDb]);
      const ready = await request('/ready');
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: 'unavailable' });
      expect((await request('/health')).status).toBe(200);
      const failed = await request('/auth/login', 'POST', { email: 'owner@fixture.test', password: 'fixture-only-password' });
      expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({ message: 'Internal server error', status: 500 });
    } finally { await admin.query(`ALTER DATABASE ${appDb} WITH ALLOW_CONNECTIONS true`); }
    expect((await request('/ready')).status).toBe(200);
  }, 15000);
});
