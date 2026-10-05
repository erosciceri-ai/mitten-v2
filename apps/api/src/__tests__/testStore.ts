/**
 * In-memory test store for unit tests.
 *
 * This is TEST-ONLY infrastructure. It mirrors the SQL behaviour closely enough
 * for fast unit tests, but it is NOT a full SQLite replacement. Tests that need
 * real transactions, constraints, or persistence must use the real sql.js path
 * (see integration.test.ts and sqlGestureParity.test.ts).
 *
 * Invariants maintained (matching SQLite + Protocol Version 2):
 * - max 50 gestures per user
 * - audioTrack 1..50 per user (first-fit allocation)
 * - UNIQUE per (user_id, audio_track) within a single user
 * - different users MAY share the same audioTrack
 * - update never changes audioTrack or gesture.id
 * - delete frees the track for first-fit reuse by the SAME user
 */
import type { Database } from 'sql.js';
import { MAX_GESTURES_PER_USER, MAX_AUDIO_TRACKS } from '../db';

/** Internal test store state */
interface TestUser {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

interface TestGesture {
  id: number;
  user_id: number;
  name: string;
  audio_track: number;
  data_json: string;
  created_at: string;
  updated_at: string;
}

let testUsers: Map<string, TestUser> = new Map();
let testGestures: Map<number, TestGesture> = new Map(); // key: gesture id
let testUserIdCounter = 0;
let testGestureIdCounter = 0;
let useTestStore = false;
let testDb: Database | null = null;

/**
 * Check if a (user_id, audio_track) pair already exists in the test store.
 * Enforces the same UNIQUE constraint as SQLite: per user, not global.
 */
function isAudioTrackTaken(userId: number, audioTrack: number): boolean {
  for (const gesture of testGestures.values()) {
    if (gesture.user_id === userId && gesture.audio_track === audioTrack) {
      return true;
    }
  }
  return false;
}

// --- Test store control ----------------------------------------------------

export function enableTestStore(): void {
  useTestStore = true;
  testUsers.clear();
  testUserIdCounter = 0;
}

export function disableTestStore(): void {
  useTestStore = false;
  testUsers.clear();
  testUserIdCounter = 0;
}

export function isTestStoreEnabled(): boolean {
  return useTestStore;
}

/**
 * setTestDatabase and getTestDatabase are defined in db/index.ts where they
 * operate on the main database connection. They are re-exported from there.
 * The test store does not use a separate database connection.
 */

// --- Users -----------------------------------------------------------------

export function createTestUser(email: string, passwordHash: string): TestUser {
  const normalizedEmail = email.toLowerCase();
  if (testUsers.has(normalizedEmail)) {
    throw new Error('User with this email already exists');
  }
  const now = new Date().toISOString();
  testUserIdCounter++;
  const user: TestUser = {
    id: testUserIdCounter,
    email: normalizedEmail,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };
  testUsers.set(normalizedEmail, user);
  return user;
}

export function findTestUserByEmail(email: string): TestUser | null {
  return testUsers.get(email.toLowerCase()) || null;
}

export function findTestUserById(id: number): TestUser | null {
  for (const user of testUsers.values()) {
    if (user.id === id) return user;
  }
  return null;
}

/** Mirrors the SQL UPDATE: returns false when the user does not exist. */
export function updateTestUserPassword(userId: number, passwordHash: string): boolean {
  const user = findTestUserById(userId);
  if (!user) return false;
  user.password_hash = passwordHash;
  user.updated_at = new Date().toISOString();
  return true;
}

export function clearTestUsers(): void {
  testUsers.clear();
  testUserIdCounter = 0;
}

// --- Gestures --------------------------------------------------------------

export function clearTestGestures(): void {
  testGestures.clear();
  testGestureIdCounter = 0;
}

export function clearAllTestData(): void {
  clearTestUsers();
  clearTestGestures();
}

export function getTestUserCount(): number {
  return testUsers.size;
}

export function getTestGestureCount(): number {
  return testGestures.size;
}

/**
 * Create a gesture in the test store.
 *
 * Enforces:
 * - per-user gesture limit (50)
 * - per-user audioTrack UNIQUE constraint
 * - audioTrack must be in 1..50 range
 */
export function createTestGesture(
  userId: number,
  name: string,
  audioTrack: number,
  dataJson: string
): TestGesture {
  // Per-user limit
  if (countTestGesturesByUserId(userId) >= MAX_GESTURES_PER_USER) {
    throw new Error(`Maximum ${MAX_GESTURES_PER_USER} gestures per user reached`);
  }

  // Per-user audioTrack UNIQUE constraint (matches SQLite unique index)
  if (isAudioTrackTaken(userId, audioTrack)) {
    throw new Error(`UNIQUE constraint failed: gestures.user_id, gestures.audio_track`);
  }

  // Valid track range
  if (audioTrack < 1 || audioTrack > MAX_AUDIO_TRACKS) {
    throw new Error(`audioTrack must be between 1 and ${MAX_AUDIO_TRACKS}`);
  }

  testGestureIdCounter++;
  const now = new Date().toISOString();
  const gesture: TestGesture = {
    id: testGestureIdCounter,
    user_id: userId,
    name,
    audio_track: audioTrack,
    data_json: dataJson,
    created_at: now,
    updated_at: now,
  };
  testGestures.set(gesture.id, gesture);
  return gesture;
}

export function findTestGestureById(id: number): TestGesture | null {
  return testGestures.get(id) || null;
}

export function findTestGesturesByUserId(userId: number): TestGesture[] {
  return Array.from(testGestures.values()).filter(g => g.user_id === userId);
}

/**
 * Partial update, mirroring the SQL implementation: omitted (null/undefined)
 * fields are left untouched, so a partial update cannot wipe an existing value.
 *
 * Never changes audioTrack or gesture.id.
 */
export function updateTestGesture(
  id: number,
  userId: number,
  name: string | null | undefined,
  dataJson: string | null | undefined
): TestGesture | null {
  const gesture = testGestures.get(id);
  if (!gesture || gesture.user_id !== userId) return null;
  if (name !== null && name !== undefined) {
    gesture.name = name;
  }
  if (dataJson !== null && dataJson !== undefined) {
    gesture.data_json = dataJson;
  }
  gesture.updated_at = new Date().toISOString();
  return gesture;
}

export function deleteTestGesture(id: number, userId: number): boolean {
  const gesture = testGestures.get(id);
  if (!gesture || gesture.user_id !== userId) return false;
  return testGestures.delete(id);
}

export function countTestGesturesByUserId(userId: number): number {
  return Array.from(testGestures.values()).filter(g => g.user_id === userId).length;
}

/**
 * First-fit audioTrack allocation over a single user's own gestures.
 *
 * The pool is per-user: each user independently holds tracks 1..50, so two
 * different users may legitimately be assigned the same audioTrack. Uniqueness
 * only has to hold within one user.
 */
export function getNextAvailableAudioTrack(userId: number): number {
  const usedTracks = new Set(
    Array.from(testGestures.values())
      .filter(g => g.user_id === userId)
      .map(g => g.audio_track),
  );
  for (let i = 1; i <= MAX_AUDIO_TRACKS; i++) {
    if (!usedTracks.has(i)) return i;
  }
  throw new Error(`No available audio tracks (max ${MAX_AUDIO_TRACKS})`);
}