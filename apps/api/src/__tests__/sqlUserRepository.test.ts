/**
 * userRepository.updatePassword - SQL path and test-store parity.
 *
 * Regression context: the non-test-store branch used to throw unconditionally
 * ("Production database not available in test environment"), so password
 * updates could never succeed against the real sql.js database. The test store
 * meanwhile always returned false. Both paths are pinned here.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

const testDbPath = join(tmpdir(), `mitten-api-userrepo-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'user-repo-parity-secret-at-least-32-chars';

import { getDatabase, getDatabaseSync, closeDatabase } from '../db';
import { enableTestStore, disableTestStore, clearAllTestData, createTestUser } from './testStore';
const { userRepository } =
  require('../repositories/userRepository') as typeof import('../repositories/userRepository');

function resetSql(): void {
  const db = getDatabaseSync();
  db.exec('DELETE FROM gestures');
  db.exec('DELETE FROM users');
}

function resetTestStore(): void {
  disableTestStore();
  clearAllTestData();
}

function withTestStore<T>(fn: () => T): T {
  enableTestStore();
  try {
    return fn();
  } finally {
    disableTestStore();
  }
}

/**
 * Each run creates users with a per-run suffix (`+sql` / `+mem`) so neither side
 * collides on the unique email index. Strip it before comparing emails across
 * the two paths, otherwise the snapshot would diff on the harness, not behaviour.
 */
function normalizeEmail(email: string | undefined): string | undefined {
  return email?.replace(/\+(sql|mem)$/, '');
}

beforeAll(async () => {
  await getDatabase();
});

afterAll(() => {
  try {
    closeDatabase();
  } catch {
    /* already closed */
  }
  try {
    rmSync(testDbPath, { force: true });
  } catch {
    /* nothing persisted (NODE_ENV=test skips auto-save) */
  }
});

describe('SQL path: updatePassword', () => {
  beforeEach(() => {
    resetSql();
  });

  it('updates the stored password hash', () => {
    const user = userRepository.create('alice@test.dev', 'old-hash');

    const result = userRepository.updatePassword(user.id, 'new-hash');

    expect(result).toBe(true);
    expect(userRepository.findById(user.id)?.passwordHash).toBe('new-hash');
    expect(userRepository.findByEmail('alice@test.dev')?.passwordHash).toBe('new-hash');
  });

  it('returns false for an unknown user instead of throwing', () => {
    expect(userRepository.updatePassword(9999, 'new-hash')).toBe(false);
  });

  it('keeps email and timestamps of other fields intact', () => {
    const user = userRepository.create('alice@test.dev', 'old-hash');

    userRepository.updatePassword(user.id, 'new-hash');
    const reloaded = userRepository.findById(user.id);

    expect(reloaded?.email).toBe('alice@test.dev');
    expect(reloaded?.createdAt).toBe(user.createdAt);
  });

  it('does not affect other users', () => {
    const alice = userRepository.create('alice@test.dev', 'alice-hash');
    const bob = userRepository.create('bob@test.dev', 'bob-hash');

    expect(userRepository.updatePassword(alice.id, 'new-hash')).toBe(true);

    expect(userRepository.findById(bob.id)?.passwordHash).toBe('bob-hash');
  });

  it('allows overwriting a previously updated hash', () => {
    const user = userRepository.create('alice@test.dev', 'hash-1');

    expect(userRepository.updatePassword(user.id, 'hash-2')).toBe(true);
    expect(userRepository.updatePassword(user.id, 'hash-3')).toBe(true);
    expect(userRepository.findById(user.id)?.passwordHash).toBe('hash-3');
  });
});

describe('updatePassword: SQL vs test store parity', () => {
  async function runBoth<T>(scenario: (ctx: {
    createUser: (email: string) => number;
  }) => T): Promise<{ sql: T; testStore: T }> {
    resetSql();
    const sql = scenario({
      createUser: email => userRepository.create(`${email}+sql`, 'hash-1').id,
    });

    resetTestStore();
    const testStore = withTestStore(() =>
      scenario({
        createUser: email => createTestUser(`${email}+mem`, 'hash-1').id,
      }),
    );

    return { sql, testStore };
  }

  it('matches on a successful password update', async () => {
    const scenario = ({ createUser }: { createUser: (email: string) => number }) => {
      const id = createUser('alice');
      const updated = userRepository.updatePassword(id, 'hash-2');
      return { updated, storedHash: userRepository.findById(id)?.passwordHash };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(sql.updated).toBe(true);
    expect(testStore).toEqual(sql);
  });

  it('matches on an unknown user id', async () => {
    const scenario = ({ createUser }: { createUser: (email: string) => number }) => {
      createUser('alice');
      return { updated: userRepository.updatePassword(9999, 'hash-2') };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(sql.updated).toBe(false);
    expect(testStore).toEqual(sql);
  });

  it('matches on repeated updates and on isolation between users', async () => {
    const scenario = ({ createUser }: { createUser: (email: string) => number }) => {
      const alice = createUser('alice');
      const bob = createUser('bob');

      const second = userRepository.updatePassword(alice, 'hash-2');
      const third = userRepository.updatePassword(alice, 'hash-3');

      return {
        second,
        third,
        aliceHash: userRepository.findById(alice)?.passwordHash,
        bobHash: userRepository.findById(bob)?.passwordHash,
        bobEmail: normalizeEmail(userRepository.findById(bob)?.email),
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });

  it('matches on an idempotent update of the same hash', async () => {
    const scenario = ({ createUser }: { createUser: (email: string) => number }) => {
      const id = createUser('alice');
      const first = userRepository.updatePassword(id, 'hash-2');
      const second = userRepository.updatePassword(id, 'hash-2');
      return {
        first,
        second,
        byId: userRepository.findById(id)?.passwordHash,
        byEmail: userRepository.findByEmail(userRepository.findById(id)!.email)?.passwordHash,
        public: normalizeEmail(userRepository.toPublic(userRepository.findById(id)!).email),
      };
    };

    const { sql, testStore } = await runBoth(scenario);
    expect(testStore).toEqual(sql);
  });
});