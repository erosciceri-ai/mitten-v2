/**
 * Gesture persistence parity tests: real sql.js (SQL) vs in-memory test store.
 *
 * Scope
 * -----
 * These tests exercise the REAL SQL path (sql.js over the local WASM binary)
 * and assert that its observable behaviour matches the in-memory test store used
 * by the unit suites. No network access and no writes to the development DB.
 *
 * Each scenario runs twice - once against SQL, once against the test store - and
 * the normalised snapshots are compared, so any behavioural drift shows up as a
 * diff rather than as two independent expectations.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import type { GestureData } from '../types';

// The DB path must be redirected before ../db (and therefore ../config) loads,
// so the real development database is never opened or written.
const testDbPath = join(tmpdir(), `mitten-api-parity-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'parity-test-secret-key-at-least-32-chars';

// Required lazily (not via static import) so the DB_PATH override above is applied
// before ../db -> ../config reads the environment. The casts keep full type safety.
const dbModule = require('../db') as typeof import('../db');
const { gestureRepository } =
  require('../repositories/gestureRepository') as typeof import('../repositories/gestureRepository');
const { userRepository } =
  require('../repositories/userRepository') as typeof import('../repositories/userRepository');
const { createTestUser } = require('./testStore');

type Sample7 = readonly [number, number, number, number, number, number, number];

function toSample7(values: number[]): Sample7 {
  return [values[0], values[1], values[2], values[3], values[4], values[5], values[6]];
}

/** Canonical GestureData fixture: sampleCount must match samples.length. */
function makeData(sampleCount = 3, samplingPeriodMs = 100, offset = 0): GestureData {
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
    captureDurationMs: sampleCount * samplingPeriodMs,
    samplingPeriodMs,
  };
}

let sqlReady = false;

/** Point the db module at the throwaway SQL database and run real migrations. */
async function enableSql(): Promise<void> {
  if (sqlReady) return;
  await dbModule.getDatabase();
  sqlReady = true;
}

function resetSql(): void {
  const db = dbModule.getDatabaseSync();
  db.exec('DELETE FROM gestures');
  db.exec('DELETE FROM users');
}

function resetTestStore(): void {
  dbModule.disableTestStore();
  dbModule.clearAllTestData();
}

/** Run `fn` with the test store active, then restore the SQL path. */
function withTestStore<T>(fn: () => T): T {
  dbModule.enableTestStore();
  try {
    return fn();
  } finally {
    dbModule.disableTestStore();
  }
}

/**
 * Observable slice of a gesture: identity and audio track must be stable,
 * timestamps are excluded because SQL and the test store format them differently.
 */
function snapshot(gesture: {
  id: number;
  name: string;
  audioTrack: number;
  data: GestureData;
}): unknown {
  return {
    name: gesture.name,
    audioTrack: gesture.audioTrack,
    sampleCount: gesture.data.sampleCount,
    samplingPeriodMs: gesture.data.samplingPeriodMs,
  };
}

function tracksOf(gestures: { audioTrack: number }[]): number[] {
  return gestures.map(g => g.audioTrack).sort((a, b) => a - b);
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

beforeAll(async () => {
  await enableSql();
});

afterAll(() => {
  // Release the sql.js handle and remove the throwaway database file.
  try {
    dbModule.closeDatabase();
  } catch {
    /* already closed */
  }
  sqlReady = false;
  try {
    rmSync(testDbPath, { force: true });
  } catch {
    /* nothing persisted (NODE_ENV=test skips auto-save) */
  }
});

describe('SQL path: gesture creation', () => {
  let alice: number;
  let bob: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
    bob = userRepository.create('bob@test.dev', 'hash').id;
  });

  it('creates a valid gesture and exposes its identity and track', () => {
    const created = gestureRepository.create(alice, 'open palm', makeData());

    expect(created.id).toBeGreaterThan(0);
    expect(created.name).toBe('open palm');
    expect(created.audioTrack).toBe(1);
    expect(created.data.sampleCount).toBe(3);

    // Readable back through the SQL path.
    const found = gestureRepository.findById(created.id, alice);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('open palm');
  });

  it('isolates gestures per user', () => {
    const a = gestureRepository.create(alice, 'alice gesture', makeData());
    gestureRepository.create(bob, 'bob gesture', makeData(3, 100, 5));

    const aliceList = gestureRepository.findAllByUserId(alice);
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0].name).toBe('alice gesture');

    // Cross-user reads must not resolve.
    expect(gestureRepository.findById(a.id, bob)).toBeNull();
    expect(gestureRepository.findAllByUserId(bob).some(g => g.id === a.id)).toBe(false);
  });

  it('lists every gesture of a user, not only the first', () => {
    // Regression: sql.js `getAsObject()` without params re-reads the current row
    // instead of advancing, so iterating with it never terminates. Listing more
    // than one gesture must return them all.
    for (let i = 0; i < 5; i++) {
      gestureRepository.create(alice, `g${i}`, makeData(3, 100, i));
    }

    const list = gestureRepository.findAllByUserId(alice);

    expect(list).toHaveLength(5);
    expect(list.map(g => g.name)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4']);
    expect(tracksOf(list)).toEqual([1, 2, 3, 4, 5]);
  });

  });

describe('SQL path: audioTrack is a per-user pool', () => {
  let alice: number;
  let bob: number;
  let carol: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
    bob = userRepository.create('bob@test.dev', 'hash').id;
    carol = userRepository.create('carol@test.dev', 'hash').id;
  });

  it('gives each user an independent first-fit sequence starting at 1', () => {
    const aliceTracks = [0, 1, 2].map(i => gestureRepository.create(alice, `a${i}`, makeData()).audioTrack);
    const bobTracks = [0, 1, 2].map(i => gestureRepository.create(bob, `b${i}`, makeData(3, 100, i)).audioTrack);

    // Each user walks 1,2,3 on their own; neither pool advances the other.
    expect(aliceTracks).toEqual([1, 2, 3]);
    expect(bobTracks).toEqual([1, 2, 3]);
  });

  it('lets two different users hold the same audioTrack', () => {
    const a = gestureRepository.create(alice, 'alice-gesture', makeData());
    const b = gestureRepository.create(bob, 'bob-gesture', makeData(3, 100, 9));

    expect(a.audioTrack).toBe(1);
    expect(b.audioTrack).toBe(1);
  });

  it('keeps audioTrack unique within a single user', () => {
    const tracks = [0, 1, 2, 3, 4].map(i =>
      gestureRepository.create(alice, `g${i}`, makeData(3, 100, i)).audioTrack,
    );

    expect(tracks).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(tracks).size).toBe(tracks.length);
  });

  it('does not exhaust one user pool because another user is full', () => {
    // A full 50-gesture profile for alice must not consume bob's pool.
    for (let i = 0; i < 50; i++) {
      gestureRepository.create(alice, `a${i}`, makeData());
    }
    expect(gestureRepository.countByUserId(alice)).toBe(50);

    const bobFirst = gestureRepository.create(bob, 'bob-first', makeData());
    const carolFirst = gestureRepository.create(carol, 'carol-first', makeData(3, 100, 7));

    expect(bobFirst.audioTrack).toBe(1);
    expect(carolFirst.audioTrack).toBe(1);
  });

  it('still enforces the 50 gesture limit per user while pools are independent', () => {
    for (let i = 0; i < 50; i++) {
      gestureRepository.create(alice, `a${i}`, makeData());
    }
    expect(captureError(() => gestureRepository.create(alice, 'overflow', makeData())))
      .toMatch(/50 gestures per user/);

    // Bob is unaffected by alice hitting his own limit.
    expect(gestureRepository.create(bob, 'bob-ok', makeData()).audioTrack).toBe(1);
  });

  it('releases a deleted track only for the user that owned it', () => {
    const a1 = gestureRepository.create(alice, 'a1', makeData());
    const a2 = gestureRepository.create(alice, 'a2', makeData());
    const b1 = gestureRepository.create(bob, 'b1', makeData());
    const b2 = gestureRepository.create(bob, 'b2', makeData());
    expect([a1.audioTrack, a2.audioTrack, b1.audioTrack, b2.audioTrack]).toEqual([1, 2, 1, 2]);

    expect(gestureRepository.delete(a1.id, alice)).toBe(true);

    // Alice reclaims her own freed track 1.
    const a3 = gestureRepository.create(alice, 'a3', makeData());
    expect(a3.audioTrack).toBe(1);

    // Bob's pool is untouched: his tracks 1 and 2 are still taken by him.
    const b3 = gestureRepository.create(bob, 'b3', makeData());
    expect(b3.audioTrack).toBe(3);
    expect(tracksOf(gestureRepository.findAllByUserId(bob))).toEqual([1, 2, 3]);
  });
});

describe('per-user audioTrack pool: SQL vs test store parity', () => {
  type Scenario = (ctx: {
    createUser: (email: string) => number;
    repo: typeof gestureRepository;
  }) => unknown;

  async function runBoth(scenario: Scenario): Promise<{ sql: unknown; testStore: unknown }> {
    resetSql();
    const sql = scenario({
      createUser: email => userRepository.create(`${email}+sql`, 'hash').id,
      repo: gestureRepository,
    });

    resetTestStore();
    const testStore = withTestStore(() =>
      scenario({
        createUser: email => createTestUser(`${email}+mem`, 'hash').id,
        repo: gestureRepository,
      }),
    );

    return { sql, testStore };
  }

  it('matches on independent first-fit sequences across three users', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const carol = createUser('carol');

      const aliceTracks = [0, 1, 2].map(i => repo.create(alice, `a${i}`, makeData()).audioTrack);
      const bobTracks = [0, 1, 2].map(i => repo.create(bob, `b${i}`, makeData(3, 100, i)).audioTrack);
      const carolTracks = [0, 1].map(i => repo.create(carol, `c${i}`, makeData(3, 100, i)).audioTrack);

      return { aliceTracks, bobTracks, carolTracks };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on a full pool not starving another user', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const bob = createUser('bob');

      for (let i = 0; i < 50; i++) repo.create(alice, `a${i}`, makeData());
      const bobFirst = repo.create(bob, 'bob-first', makeData());
      const aliceOverflow = captureError(() => repo.create(alice, 'overflow', makeData()));

      return {
        aliceCount: repo.countByUserId(alice),
        bobTrack: bobFirst.audioTrack,
        aliceOverflow,
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on track release being scoped to the owning user', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const bob = createUser('bob');

      const a1 = repo.create(alice, 'a1', makeData());
      repo.create(alice, 'a2', makeData());
      repo.create(bob, 'b1', makeData());
      repo.create(bob, 'b2', makeData());

      const deleted = repo.delete(a1.id, alice);
      const aliceNext = repo.create(alice, 'a3', makeData());
      const bobNext = repo.create(bob, 'b3', makeData());

      return {
        deleted,
        aliceNext: aliceNext.audioTrack,
        bobNext: bobNext.audioTrack,
        aliceTracks: tracksOf(repo.findAllByUserId(alice)),
        bobTracks: tracksOf(repo.findAllByUserId(bob)),
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });
});

describe('SQL path: gesture creation (limits and track reuse)', () => {
  let alice: number;
  let bob: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
    bob = userRepository.create('bob@test.dev', 'hash').id;
  });

  it('assigns audioTrack first-fit in creation order', () => {
    const first = gestureRepository.create(alice, 'g1', makeData());
    const second = gestureRepository.create(alice, 'g2', makeData());
    const third = gestureRepository.create(alice, 'g3', makeData());

    expect([first.audioTrack, second.audioTrack, third.audioTrack]).toEqual([1, 2, 3]);
  });

  it('enforces the 50 gesture per user limit', () => {
    for (let i = 0; i < 50; i++) {
      gestureRepository.create(alice, `g${i}`, makeData());
    }
    expect(gestureRepository.countByUserId(alice)).toBe(50);

    expect(captureError(() => gestureRepository.create(alice, 'overflow', makeData())))
      .toMatch(/50 gestures per user/);
  });

  it('reuses an audioTrack freed by a deletion', () => {
    const first = gestureRepository.create(alice, 'g1', makeData());
    const second = gestureRepository.create(alice, 'g2', makeData());
    expect([first.audioTrack, second.audioTrack]).toEqual([1, 2]);

    expect(gestureRepository.delete(first.id, alice)).toBe(true);

    // first-fit picks the lowest free track, which is the released one.
    const third = gestureRepository.create(alice, 'g3', makeData());
    expect(third.audioTrack).toBe(1);
    expect(tracksOf(gestureRepository.findAllByUserId(alice))).toEqual([1, 2]);
  });
});

describe('SQL path: gesture update', () => {
  let alice: number;
  let bob: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
    bob = userRepository.create('bob@test.dev', 'hash').id;
  });

  it('updates only the name and leaves data untouched', () => {
    const created = gestureRepository.create(alice, 'original', makeData());

    const updated = gestureRepository.update(created.id, alice, { name: 'renamed' });

    expect(updated?.name).toBe('renamed');
    expect(updated?.data).toEqual(created.data);
  });

  it('updates only the data and leaves the name untouched', () => {
    const created = gestureRepository.create(alice, 'keep-me', makeData());
    const replacement = makeData(5, 200, 3);

    const updated = gestureRepository.update(created.id, alice, { data: replacement });

    expect(updated?.name).toBe('keep-me');
    expect(updated?.data).toEqual(replacement);
  });

  it('applies a combined name and data update', () => {
    const created = gestureRepository.create(alice, 'before', makeData());

    const updated = gestureRepository.update(created.id, alice, {
      name: 'after',
      data: makeData(4, 150, 1),
    });

    expect(updated?.name).toBe('after');
    expect(updated?.data.sampleCount).toBe(4);
  });

  it('never changes gesture.id', () => {
    const created = gestureRepository.create(alice, 'stable', makeData());

    const updated = gestureRepository.update(created.id, alice, {
      name: 'renamed',
      data: makeData(5, 200),
    });

    expect(updated?.id).toBe(created.id);
  });

  it('never changes audioTrack', () => {
    const first = gestureRepository.create(alice, 'g1', makeData());
    const second = gestureRepository.create(alice, 'g2', makeData());

    gestureRepository.update(first.id, alice, { name: 'renamed', data: makeData(5, 200) });
    gestureRepository.update(second.id, alice, { name: 'also-renamed' });

    expect(gestureRepository.findById(first.id, alice)?.audioTrack).toBe(first.audioTrack);
    expect(gestureRepository.findById(second.id, alice)?.audioTrack).toBe(second.audioTrack);
  });

  it('does not let a partial update clear omitted fields', () => {
    const created = gestureRepository.create(alice, 'original', makeData());

    gestureRepository.update(created.id, alice, { name: 'only-name' });
    const afterName = gestureRepository.findById(created.id, alice);
    expect(afterName?.data).toEqual(created.data);

    const replacement = makeData(5, 200, 7);
    gestureRepository.update(created.id, alice, { data: replacement });
    const afterData = gestureRepository.findById(created.id, alice);
    expect(afterData?.name).toBe('only-name');
    expect(afterData?.data).toEqual(replacement);
  });

  it('refuses to update a gesture owned by another user', () => {
    const created = gestureRepository.create(alice, 'mine', makeData());

    expect(gestureRepository.update(created.id, bob, { name: 'stolen' })).toBeNull();
    expect(gestureRepository.findById(created.id, alice)?.name).toBe('mine');
  });
});

describe('SQL path: gesture deletion', () => {
  let alice: number;
  let bob: number;

  beforeEach(() => {
    resetSql();
    alice = userRepository.create('alice@test.dev', 'hash').id;
    bob = userRepository.create('bob@test.dev', 'hash').id;
  });

  it('deletes only the gesture owned by the requesting user', () => {
    const mine = gestureRepository.create(alice, 'mine', makeData());
    gestureRepository.create(alice, 'mine-2', makeData(3, 100, 4));

    // Wrong owner is a no-op.
    expect(gestureRepository.delete(mine.id, bob)).toBe(false);
    expect(gestureRepository.countByUserId(alice)).toBe(2);

    expect(gestureRepository.delete(mine.id, alice)).toBe(true);
    expect(gestureRepository.findById(mine.id, alice)).toBeNull();
    expect(gestureRepository.countByUserId(alice)).toBe(1);
  });

  it('frees the audioTrack for reuse', () => {
    const first = gestureRepository.create(alice, 'g1', makeData());
    const second = gestureRepository.create(alice, 'g2', makeData());

    gestureRepository.delete(first.id, alice);
    const third = gestureRepository.create(alice, 'g3', makeData());

    expect(third.audioTrack).toBe(first.audioTrack);
    expect(second.audioTrack).not.toBe(third.audioTrack);
  });

  it('does not affect other users gestures', () => {
    const mine = gestureRepository.create(alice, 'mine', makeData());
    const theirs = gestureRepository.create(bob, 'theirs', makeData(3, 100, 9));

    gestureRepository.delete(mine.id, alice);

    const bobList = gestureRepository.findAllByUserId(bob);
    expect(bobList).toHaveLength(1);
    expect(bobList[0].id).toBe(theirs.id);
    expect(bobList[0].name).toBe('theirs');
  });

  it('reports false for a non-existent gesture', () => {
    expect(gestureRepository.delete(9999, alice)).toBe(false);
  });
});

describe('SQL path vs test store parity', () => {
  type Scenario = (ctx: {
    createUser: (email: string) => number;
    repo: typeof gestureRepository;
  }) => unknown;

  /**
   * Run the same scenario against the real SQL path and against the in-memory
   * test store, then hand both snapshots back so they can be compared directly.
   * Emails are suffixed per run so neither side collides on a unique index.
   */
  async function runBoth(scenario: Scenario): Promise<{ sql: unknown; testStore: unknown }> {
    resetSql();
    const sql = scenario({
      createUser: email => userRepository.create(`${email}+sql`, 'hash').id,
      repo: gestureRepository,
    });

    resetTestStore();
    const testStore = withTestStore(() =>
      scenario({
        createUser: email => createTestUser(`${email}+mem`, 'hash').id,
        repo: gestureRepository,
      }),
    );

    return { sql, testStore };
  }

  it('matches on creation: identity, isolation and first-fit tracks', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const a1 = repo.create(alice, 'g1', makeData());
      const b1 = repo.create(bob, 'g2', makeData(3, 100, 5));
      const a2 = repo.create(alice, 'g3', makeData());

      return {
        first: snapshot(a1),
        second: snapshot(b1),
        third: snapshot(a2),
        aliceTracks: tracksOf(repo.findAllByUserId(alice)),
        bobTracks: tracksOf(repo.findAllByUserId(bob)),
        aliceCount: repo.countByUserId(alice),
        // Normalised to a boolean: the payload shape is compared elsewhere, the
        // timestamps differ between SQL and the test store by design.
        bobSeesA1: repo.findById(a1.id, bob) !== null,
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on the 50 gesture limit error', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      for (let i = 0; i < 50; i++) repo.create(alice, `g${i}`, makeData());
      return captureError(() => repo.create(alice, 'overflow', makeData()));
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on partial updates not clearing omitted fields', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const created = repo.create(alice, 'original', makeData());

      repo.update(created.id, alice, { name: 'only-name' });
      const afterName = repo.findById(created.id, alice);

      const replacement = makeData(5, 200, 7);
      repo.update(created.id, alice, { data: replacement });
      const afterData = repo.findById(created.id, alice);

      return {
        afterName: afterName ? snapshot(afterName) : null,
        afterData: afterData ? snapshot(afterData) : null,
        idUnchanged: afterData?.id === created.id,
        trackUnchanged: afterData?.audioTrack === created.audioTrack,
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on track reuse after deletion', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const first = repo.create(alice, 'g1', makeData());
      const second = repo.create(alice, 'g2', makeData());
      const wrongOwner = repo.delete(first.id, 9999);
      const deleted = repo.delete(first.id, alice);
      const third = repo.create(alice, 'g3', makeData());

      return {
        firstTrack: first.audioTrack,
        secondTrack: second.audioTrack,
        thirdTrack: third.audioTrack,
        wrongOwner,
        deleted,
        remaining: tracksOf(repo.findAllByUserId(alice)),
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on cross-user update and delete being refused', async () => {
    const scenario = ({ createUser, repo }: { createUser: (e: string) => number; repo: typeof gestureRepository }) => {
      const alice = createUser('alice');
      const bob = createUser('bob');
      const mine = repo.create(alice, 'mine', makeData());

      return {
        updateByOtherIsNull: repo.update(mine.id, bob, { name: 'stolen' }) === null,
        deleteByOther: repo.delete(mine.id, bob),
        stillMine: repo.findById(mine.id, alice)?.name,
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });
});