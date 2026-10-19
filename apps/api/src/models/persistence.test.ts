import { beforeEach, expect, it } from 'vitest';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { getDatabase, runMigrations } from '../db/index.js';
import { config } from '../config/index.js';
import { createUser } from './User.js';
import { createGesture, deleteGesture, findGestureById, updateGesture } from './Gesture.js';
import { gestureData } from '../test/gesture.js';
import { createGestureSchema } from '../utils/schemas.js';

beforeEach(async () => {
  const db = await getDatabase();
  await db.exec('DELETE FROM audio_tracks; DELETE FROM gestures; DELETE FROM users;');
});
const user = (name: string) => createUser({ email: `${name}@test.local`, password: 'password123' });

it('allocates all 50 tracks independently for two users and keeps global IDs unique', async () => {
  const a = await user('a'), b = await user('b');
  const ids = new Set<number>();
  for (let track=1; track<=50; track++) {
    for (const u of [a,b]) {
      const g = await createGesture({ userId:u.id, name:'Hola', data:gestureData });
      expect(g.audioTrack).toBe(track); ids.add(g.id);
    }
  }
  expect(ids.size).toBe(100);
  await expect(createGesture({ userId:a.id, name:'51', data:gestureData })).rejects.toThrow('No available audio tracks');
});

it('uses first-fit after deletion and preserves track and id during edits', async () => {
  const u = await user('fit');
  const create = () => createGesture({ userId:u.id, name:'Hola', data:gestureData });
  const a=await create(), b=await create();
  await deleteGesture(u.id,a.id);
  const c=await create(); expect(c.audioTrack).toBe(1); expect(c.id).not.toBe(a.id);
  const updated=await updateGesture(u.id,b.id,{name:'Adiós'});
  expect([updated?.id,updated?.audioTrack]).toEqual([b.id,b.audioTrack]);
  expect(await findGestureById(u.id+1,b.id)).toBeNull();
});

it('rejects invalid data and oversized frames at the persistence boundary', async () => {
  const u=await user('invalid');
  for (const data of [{version:1}, {...gestureData,sampleCount:4}, {...gestureData,units:{flex:'volts',mpu:'degrees'}}]) {
    expect(createGestureSchema.safeParse({name:'Hola',data}).success).toBe(false);
  }
  await expect(createGesture({userId:u.id,name:'Hola',data:{...gestureData,sampleCount:4}})).rejects.toThrow();
  const samples=Array.from({length:500},()=>gestureData.samples[0]);
  await expect(createGesture({userId:u.id,name:'Hola',data:{...gestureData,samples,sampleCount:500}})).rejects.toThrow('message limit');
  expect(createGestureSchema.safeParse({name:'😀'.repeat(60),data:gestureData}).success).toBe(true);
});

it('rolls back the gesture and track allocation if the second write fails', async () => {
  const u=await user('rollback'), db=await getDatabase();
  await db.exec("CREATE TEMP TRIGGER injected_failure BEFORE UPDATE ON audio_tracks BEGIN SELECT RAISE(ABORT,'injected'); END;");
  try { await expect(createGesture({userId:u.id,name:'Hola',data:gestureData})).rejects.toThrow('injected'); }
  finally { await db.exec('DROP TRIGGER injected_failure'); }
  expect((await db.get('SELECT COUNT(*) AS n FROM gestures')).n).toBe(0);
  expect((await createGesture({userId:u.id,name:'Hola',data:gestureData})).audioTrack).toBe(1);
});

it('serializes concurrent first-fit allocations and enforces SQL constraints', async () => {
  const u=await user('parallel'), db=await getDatabase();
  const gestures=await Promise.all([1,2,3].map(()=>createGesture({userId:u.id,name:'Hola',data:gestureData})));
  expect(gestures.map(g=>g.audioTrack)).toEqual([1,2,3]);
  await expect(db.run('UPDATE gestures SET audio_track=51 WHERE id=?',gestures[0].id)).rejects.toThrow();
  await expect(db.run('UPDATE gestures SET audio_track=2 WHERE id=?',gestures[0].id)).rejects.toThrow();
});

it('migrates legacy data_json without changing IDs, tracks or data', async () => {
  const db=await open({filename:':memory:',driver:sqlite3.Database});
  try {
    await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,created_at TEXT,updated_at TEXT); INSERT INTO users VALUES(7,'legacy','hash','a','b'); CREATE TABLE gestures(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT,audio_track INTEGER,data_json TEXT,created_at TEXT,updated_at TEXT);");
    await db.run('INSERT INTO gestures VALUES(42,7,?,?,?, ?,?)','Hola',9,JSON.stringify(gestureData),'a','b');
    await runMigrations(db); await runMigrations(db);
    expect(await db.get('SELECT id,audio_track,data FROM gestures')).toEqual({id:42,audio_track:9,data:JSON.stringify(gestureData)});
    expect((await db.get('SELECT COUNT(*) AS n FROM audio_tracks WHERE user_id=7')).n).toBe(50);
    expect((await db.get('SELECT gesture_id FROM audio_tracks WHERE user_id=7 AND track_number=9')).gesture_id).toBe(42);
  } finally { await db.close(); }
});

it('rolls back incompatible legacy migrations without altering the original table', async () => {
  const db=await open({filename:':memory:',driver:sqlite3.Database});
  try {
    await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,password_hash TEXT,created_at TEXT,updated_at TEXT); INSERT INTO users VALUES(1,'legacy','hash','a','b'); CREATE TABLE gestures(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT,audio_track INTEGER,data_json TEXT,created_at TEXT,updated_at TEXT); INSERT INTO gestures VALUES(1,1,'Bad',99,'{}','a','b');");
    await expect(runMigrations(db)).rejects.toThrow();
    expect((await db.get('SELECT audio_track,data_json FROM gestures')).audio_track).toBe(99);
    expect((await db.get('PRAGMA user_version')).user_version).toBe(0);
  } finally { await db.close(); }
});

it('migrates version 1 users for optional Google identities without losing passwords', async () => {
  const db=await open({filename:':memory:',driver:sqlite3.Database});
  try {
    await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TEXT,updated_at TEXT); INSERT INTO users VALUES(4,'legacy@test.local','hash','a','b'); PRAGMA user_version=1;");
    await runMigrations(db);
    const columns = await db.all<Array<{name:string;notnull:number}>>('PRAGMA table_info(users)');
    expect(columns.some(column => column.name === 'google_sub')).toBe(true);
    expect(columns.find(column => column.name === 'password_hash')?.notnull).toBe(0);
    expect(await db.get('SELECT id,email,password_hash,google_sub FROM users')).toEqual({id:4,email:'legacy@test.local',password_hash:'hash',google_sub:null});
    expect((await db.get('PRAGMA user_version')).user_version).toBe(2);
  } finally { await db.close(); }
});

it('always uses a private in-memory database under the test runner', async () => {
  expect(config.dbPath).toBe(':memory:');
  expect((await (await getDatabase()).get('PRAGMA database_list')).file).toBe('');
});
