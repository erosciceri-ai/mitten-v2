import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CreateBucketCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import app from '../index.js';
import { config } from '../config/index.js';
import { closeDatabase, getDatabase } from '../db/index.js';
import { openPostgres } from '../db/postgres.js';
import { createGesture, generateGestureAudio, getGestureAudio, updateGesture } from '../models/Gesture.js';
import { createUser } from '../models/User.js';
import { gestureData } from '../test/gesture.js';
import { generateToken } from '../utils/jwt.js';
import { audioChecksum, getAudioStorage, S3AudioStorage } from './audioStorage.js';
import { collectAudioOrphans, findAudioRow, publishAudio } from './gestureAudio.js';
import { inventoryAudio } from './audioMaintenance.js';
import { getAudioFilePath } from './tts.js';

const endpoint = process.env.MITTEN_TEST_S3_ENDPOINT;
describe.skipIf(!endpoint)('isolated S3-compatible service', () => {
  const postgresUrl = process.env.MITTEN_TEST_AUDIO_POSTGRES_URL;
  const database = 'mitten_audio_' + randomUUID().replaceAll('-', '');
  let admin: ReturnType<typeof openPostgres> | undefined;
  const bucket = 'mitten-phase4-' + randomUUID();
  const bytes = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(512)]);
  let client: S3Client;
  let server: ReturnType<typeof app.listen>;
  let base: string;
  let owner: number;
  let outsider: number;
  let id: number;
  let path: string;
  let headers: Record<string, string>;
  let otherHeaders: Record<string, string>;

  async function startApi() {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('API did not start');
    base = `http://127.0.0.1:${address.port}/api`;
  }

  async function stopApi() {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
  }

  beforeAll(async () => {
    if (new URL(endpoint!).hostname !== '127.0.0.1') throw new Error('Use a disposable loopback S3 endpoint');
    const accessKeyId = process.env.MITTEN_TEST_S3_KEY ?? '';
    const secretAccessKey = process.env.MITTEN_TEST_S3_SECRET ?? '';
    client = new S3Client({
      endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    const root = await mkdtemp(join(tmpdir(), 'mitten-s3-fixture-'));
    Object.assign(config, {
      dbPath: join(root, 'audio.db'), audioDir: join(root, 'local'),
      audioS3Endpoint: endpoint, audioS3Region: 'us-east-1', audioS3Bucket: bucket,
      audioS3AccessKeyId: accessKeyId, audioS3SecretAccessKey: secretAccessKey,
      audioStorageProvider: 's3', ttsProvider: 'fixture',
    });
    if (postgresUrl) {
      admin = openPostgres(postgresUrl, 'disable', 2, false);
      await admin.query('CREATE DATABASE ' + database);
      const target = new URL(postgresUrl);
      target.pathname = '/' + database;
      Object.assign(config, { dbProvider: 'postgres', databaseUrl: target.href, dbTls: 'disable' });
    }
    const a = await createUser({ email: 'audio-a@fixture.test', password: 'fixture-password' });
    const b = await createUser({ email: 'audio-b@fixture.test', password: 'fixture-password' });
    owner = a.id;
    outsider = b.id;
    headers = { Authorization: 'Bearer ' + generateToken({ userId: a.id, email: a.email }) };
    otherHeaders = { Authorization: 'Bearer ' + generateToken({ userId: b.id, email: b.email }) };
    id = (await createGesture({ userId: owner, name: 'Hola', data: gestureData })).id;
    path = '/gestures/' + id + '/audio/file';
    await startApi();
  });

  afterAll(async () => {
    await stopApi();
    client?.destroy();
    if (admin) {
      try { await admin.query('DROP DATABASE IF EXISTS ' + database); }
      finally { await admin.end(); }
    }
  });

  it('migrates verified legacy bytes once and preserves the original across API restart', async () => {
    const original = getAudioFilePath(owner, 1);
    await mkdir(dirname(original), { recursive: true });
    await writeFile(original, bytes);
    const db = await getDatabase();
    await db.run('UPDATE audio_tracks SET file_path=?, generated_at=? WHERE user_id=? AND gesture_id=?',
      original, '2026-11-11 00:00:00', owner, id);
    expect(await inventoryAudio()).toEqual([expect.objectContaining({ status: 'ready', sha256: audioChecksum(bytes) })]);
    expect((await findAudioRow(owner, id))!.object_key).toBeNull();
    expect(await inventoryAudio(db, true)).toContainEqual(expect.objectContaining({ status: 'migrated', sha256: audioChecksum(bytes) }));
    const row = (await findAudioRow(owner, id))!;
    expect(row).toMatchObject({ sha256: audioChecksum(bytes), size_bytes: bytes.length, content_type: 'audio/mpeg',
      generated_at: '2026-11-11 00:00:00', state: 'active' });
    expect(await inventoryAudio(db, true)).toContainEqual(expect.objectContaining({ status: 'already-migrated' }));
    expect((await findAudioRow(owner, id))!.object_key).toBe(row.object_key);
    expect(await readFile(original)).toEqual(bytes);
    const anonymous = await fetch(endpoint + '/' + bucket + '/' + row.object_key);
    expect(anonymous.status).toBe(403);
    const partial = await client.send(new GetObjectCommand({ Bucket: bucket, Key: row.object_key!, Range: 'bytes=0-2' }));
    expect(Buffer.from(await partial.Body!.transformToByteArray()).toString()).toBe('ID3');

    await stopApi();
    await startApi();
    expect((await fetch(base + path)).status).toBe(401);
    expect((await fetch(base + path, { headers: otherHeaders })).status).toBe(404);
    const full = await fetch(base + path, { headers });
    expect(full.status).toBe(200);
    expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
    const range = await fetch(base + path, { headers: { ...headers, Range: 'bytes=0-2' } });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 0-2/515');
    expect(await range.text()).toBe('ID3');
    const matching = await fetch(base + path, { headers: { ...headers, Range: 'bytes=-3', 'If-Range': full.headers.get('etag')! } });
    expect(matching.status).toBe(206);
    expect(Buffer.from(await matching.arrayBuffer())).toEqual(bytes.subarray(-3));
    const changed = await fetch(base + path, { headers: { ...headers, Range: 'bytes=0-2', 'If-Range': '"old"' } });
    expect(changed.status).toBe(200);
    const head = await fetch(base + path, { method: 'HEAD', headers });
    expect(head.headers.get('content-length')).toBe(String(bytes.length));
    expect((await fetch(base + path, { headers: { ...headers, Range: 'bytes=999-' } })).status).toBe(416);
    const archive = await fetch(base + '/audio/package', { headers });
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    expect(await zip.file('mp3/0001.mp3')!.async('nodebuffer')).toEqual(bytes);
    expect(JSON.parse(await zip.file('manifest.json')!.async('text')).tracks[0]).toMatchObject({ audioTrack: 1, file: 'mp3/0001.mp3' });

    const local = await createGesture({ userId: owner, name: 'Versión local', data: gestureData });
    await publishAudio((await findAudioRow(owner, local.id))!, bytes, 'local');
    const originalObject = (await findAudioRow(owner, local.id))!.object_key!;
    expect(await inventoryAudio(await getDatabase(), true)).toContainEqual(expect.objectContaining({
      gestureId: local.id, status: 'migrated', sha256: audioChecksum(bytes),
    }));
    expect((await findAudioRow(owner, local.id))!.provider).toBe('s3');
    const reopened = await getDatabase();
    await reopened.run('UPDATE audio_objects SET cleanup_after=0 WHERE object_key=?', originalObject);
    expect(await collectAudioOrphans(reopened)).toEqual([]);
    expect(await getAudioStorage('local').read(originalObject)).toEqual(bytes);
  });

  it('keeps the active version on metadata failure and cleans up retryable orphan versions', async () => {
    const gesture = await createGesture({ userId: outsider, name: 'Otra', data: gestureData });
    await generateGestureAudio(outsider, gesture.id);
    const row = (await findAudioRow(outsider, gesture.id))!;
    const db = await getDatabase();
    if (postgresUrl) {
      await db.exec(`CREATE FUNCTION fail_audio_publish() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'simulated metadata failure'; END $$;
        CREATE TRIGGER fail_audio_publish BEFORE UPDATE OF object_key ON audio_tracks
        FOR EACH ROW WHEN (NEW.user_id=${outsider}) EXECUTE FUNCTION fail_audio_publish();`);
    } else {
      await db.exec(`CREATE TRIGGER fail_audio_publish BEFORE UPDATE OF object_key ON audio_tracks
        WHEN NEW.user_id=${outsider} BEGIN SELECT RAISE(ABORT, 'simulated metadata failure'); END;`);
    }
    try { await expect(publishAudio(row, bytes, 's3')).rejects.toThrow('simulated metadata failure'); }
    finally {
      await db.exec(postgresUrl
        ? 'DROP TRIGGER fail_audio_publish ON audio_tracks; DROP FUNCTION fail_audio_publish();'
        : 'DROP TRIGGER fail_audio_publish');
    }
    expect((await findAudioRow(outsider, gesture.id))!.object_key).toBe(row.object_key);
    const pending = await db.get<{ object_key: string }>("SELECT object_key FROM audio_objects WHERE user_id=? AND state='pending'", outsider);
    expect(await getAudioStorage('s3').read(pending!.object_key)).toEqual(bytes);

    const parallel = await Promise.allSettled([publishAudio(row, bytes, 's3'), publishAudio(row, bytes, 's3')]);
    expect(parallel.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const current = (await findAudioRow(outsider, gesture.id))!;
    expect(current.object_key).not.toBe(row.object_key);
    expect(await getAudioStorage('s3').read(row.object_key!)).toEqual(bytes);
    await db.run("UPDATE audio_objects SET cleanup_after=0 WHERE user_id=? AND state<>'active'", outsider);
    expect(await collectAudioOrphans(db)).toHaveLength(3);
    expect(await getAudioStorage('s3').read(pending!.object_key)).toBeNull();
    expect(await collectAudioOrphans(db)).toEqual([]);
    expect(await getGestureAudio(outsider, gesture.id)).toEqual(bytes);
    await updateGesture(outsider, gesture.id, { name: 'Editado' });
    expect(await getGestureAudio(outsider, gesture.id)).toBeNull();
    expect(await getAudioStorage('s3').read(current.object_key!)).toEqual(bytes);
    await generateGestureAudio(outsider, gesture.id);
    expect((await fetch(base + '/gestures/' + gesture.id, { method: 'DELETE', headers: otherHeaders })).status).toBe(204);
    expect(await getGestureAudio(outsider, gesture.id)).toBeNull();
  });

  it('deduplicates concurrent and repeated generation by idempotency key', async () => {
    const gesture = await createGesture({ userId: owner, name: 'Repetido', data: gestureData });
    const url = base + '/gestures/' + gesture.id + '/audio';
    const generate = (key: string) => fetch(url, { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: '{}' });
    const first = await Promise.all([generate('request-1'), generate('request-1')]);
    expect(first.map(response => response.status)).toEqual([200, 200]);
    const active = (await findAudioRow(owner, gesture.id))!;
    expect(active.audio_revision).toBe(1);
    expect((await generate('request-1')).status).toBe(200);
    expect((await findAudioRow(owner, gesture.id))!.object_key).toBe(active.object_key);
    expect((await generate('invalid key')).status).toBe(400);
    expect((await generate('request-2')).status).toBe(200);
    expect((await findAudioRow(owner, gesture.id))!.object_key).not.toBe(active.object_key);
  });

  it('rejects corruption, handles missing objects and reports network failures', async () => {
    const gesture = await createGesture({ userId: outsider, name: 'Checksum', data: gestureData });
    await generateGestureAudio(outsider, gesture.id);
    const row = (await findAudioRow(outsider, gesture.id))!;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: row.object_key!, Body: Buffer.alloc(bytes.length),
      ContentType: 'audio/mpeg' }));
    await expect(getGestureAudio(outsider, gesture.id)).rejects.toMatchObject({ status: 502 });
    await getAudioStorage('s3').remove(row.object_key!);
    expect(await getGestureAudio(outsider, gesture.id)).toBeNull();
    const failingClient = new S3Client({ endpoint: 'http://127.0.0.1:1', region: 'us-east-1', maxAttempts: 1,
      credentials: { accessKeyId: 'fixture', secretAccessKey: 'fixture' }, forcePathStyle: true });
    try { await expect(new S3AudioStorage(failingClient, bucket).read(row.object_key!)).rejects.toThrow(); }
    finally { failingClient.destroy(); }
  });
});
