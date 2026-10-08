import { getDatabase, runInTransaction } from '../db/index.js';
import bcrypt from 'bcryptjs';

export interface User {
  id: number;
  email: string;
  password_hash: string;
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
}

const BCRYPT_ROUNDS = 10;

export async function createUser(input: CreateUserInput): Promise<UserResponse> {
  const password_hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  return runInTransaction(async db => {

  const result = await db.run(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    input.email, password_hash
  );

  const userId = result.lastID ?? 0;

  // Initialize audio tracks for new user
  for (let track = 1; track <= 50; track++) {
    await db.run(
      'INSERT INTO audio_tracks (track_number, user_id, gesture_id, file_path, generated_at) VALUES (?, ?, NULL, NULL, NULL)',
      track, userId
    );
  }

  return { id: userId, email: input.email };
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

export function verifyPassword(user: User, password: string): boolean {
  return bcrypt.compareSync(password, user.password_hash);
}