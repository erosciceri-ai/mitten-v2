import { getDatabase, runInTransaction } from '../db/index.js';
import bcrypt from 'bcryptjs';

export interface User {
  id: number;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
}

export interface UserResponse {
  id: number;
  email: string;
  googleLinked: boolean;
}

const BCRYPT_ROUNDS = 10;

async function initializeAudioTracks(db: Awaited<ReturnType<typeof getDatabase>>, userId: number): Promise<void> {
  await db.run(
    'WITH RECURSIVE tracks(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM tracks WHERE n < 50) ' +
    'INSERT INTO audio_tracks (track_number, user_id) SELECT n, CAST(? AS BIGINT) FROM tracks',
    userId,
  );
}

export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  return runInTransaction(async db => {
    const result = await db.get<{ id: number }>(
      'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
      input.email, password_hash
    );

    const userId = result!.id;

    await initializeAudioTracks(db, userId);

    return { id: userId, email: input.email, googleLinked: false };
  });
}

export async function createGoogleUser(email: string, googleSub: string): Promise<UserResponse> {
  return runInTransaction(async db => {
    const result = await db.get<{ id: number }>(
      'INSERT INTO users (email, password_hash, google_sub) VALUES (?, NULL, ?) RETURNING id',
      email, googleSub
    );
    const userId = result!.id;
    await initializeAudioTracks(db, userId);
    return { id: userId, email, googleLinked: true };
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM users WHERE email = ?', email);
  return row as User | null;
}

export async function findUserById(id: number): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM users WHERE id = ?', id);
  return row as User | null;
}

export async function findUserByGoogleSub(googleSub: string): Promise<User | null> {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM users WHERE google_sub = ?', googleSub);
  return row as User | null;
}

export async function linkGoogleIdentity(userId: number, googleSub: string): Promise<void> {
  const db = await getDatabase();
  const result = await db.run(
    'UPDATE users SET google_sub = ? WHERE id = ? AND google_sub IS NULL',
    googleSub, userId
  );
  if (result.changes !== 1) throw new Error('Google identity could not be linked');
}

export function toPublicUser(user: Pick<User, 'id' | 'email' | 'google_sub'>): UserResponse {
  return { id: user.id, email: user.email, googleLinked: Boolean(user.google_sub) };
}

// A fixed, non-secret bcrypt hash equalizes work for absent and Google-only accounts.
const DUMMY_HASH = '$2a$10$' + '.'.repeat(53);

export async function verifyPassword(user: User | null, password: string): Promise<boolean> {
  const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  return Boolean(user?.password_hash && matches);
}
