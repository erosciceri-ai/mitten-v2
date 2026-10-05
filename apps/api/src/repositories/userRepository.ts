import { 
  getDatabaseSync, 
  runInTransaction, 
  enableTestStore, 
  disableTestStore,
  createTestUser,
  findTestUserByEmail,
  findTestUserById,
  clearTestUsers,
  isTestStoreEnabled,
  updateTestUserPassword
} from '../db';
import { User, UserPublic } from '../types';

export class UserRepository {
  private getDb(): Database {
    return getDatabaseSync();
  }

  findById(id: number): User | null {
    if (isTestStoreEnabled()) {
      const testUser = findTestUserById(id);
      return testUser ? this.mapTestUserToUser(testUser) : null;
    }
    const db = getDatabaseSync();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const result = stmt.getAsObject([id]);
    return result ? this.mapRowToUser(result) : null;
  }

  findByEmail(email: string): User | null {
    if (isTestStoreEnabled()) {
      const testUser = findTestUserByEmail(email);
      return testUser ? this.mapTestUserToUser(testUser) : null;
    }
    const db = getDatabaseSync();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const result = stmt.getAsObject([email.toLowerCase()]);
    return result ? this.mapRowToUser(result) : null;
  }

  findByEmailPublic(email: string): UserPublic | null {
    if (isTestStoreEnabled()) {
      const testUser = findTestUserByEmail(email);
      if (!testUser) return null;
      return {
        id: testUser.id,
        email: testUser.email,
        createdAt: testUser.created_at,
      };
    }
    const db = getDatabaseSync();
    const stmt = db.prepare('SELECT id, email, created_at as createdAt FROM users WHERE email = ?');
    const result = stmt.getAsObject([email.toLowerCase()]);
    if (!result) return null;
    return {
      id: result.id as number,
      email: result.email as string,
      createdAt: result.createdAt as string,
    };
  }

  create(email: string, passwordHash: string): User {
    if (isTestStoreEnabled()) {
      const testUser = createTestUser(email, passwordHash);
      return this.mapTestUserToUser(testUser);
    }
    
    return runInTransaction((db) => {
      const stmt = db.prepare(`
        INSERT INTO users (email, password_hash, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `);
      try {
        stmt.run([email.toLowerCase(), passwordHash]);
        stmt.free();
      } catch (error) {
        // Check for UNIQUE constraint violation on email
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed: users.email')) {
          throw new Error('User with this email already exists');
        }
        throw error;
      }
      
      // Get the last inserted row ID
      const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
      const lastId = lastIdResult[0]?.values[0]?.[0] as number;
      
      const user = this.findById(lastId);
      if (!user) {
        throw new Error('Failed to create user');
      }
      return user;
    });
  }

  /**
   * Replace a user's stored password hash.
   *
   * Returns true when a row was updated, false when the user does not exist.
   * This is the sql.js/production path; the test store mirrors it exactly.
   */
  updatePassword(userId: number, passwordHash: string): boolean {
    if (isTestStoreEnabled()) {
      return updateTestUserPassword(userId, passwordHash);
    }
    const db = getDatabaseSync();
    const stmt = db.prepare(`
      UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
    `);
    try {
      stmt.run([passwordHash, userId]);
    } finally {
      stmt.free();
    }
    return this.getChanges(db) > 0;
  }

  toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  private getChanges(db: Database): number {
    const result = db.exec('SELECT changes() as changes');
    return (result[0]?.values[0]?.[0] as number) || 0;
  }

  private mapRowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as number,
      email: row.email as string,
      passwordHash: row.password_hash as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapTestUserToUser(testUser: { id: number; email: string; password_hash: string; created_at: string; updated_at: string }): User {
    return {
      id: testUser.id,
      email: testUser.email,
      passwordHash: testUser.password_hash,
      createdAt: testUser.created_at,
      updatedAt: testUser.updated_at,
    };
  }
}

import { Database } from 'sql.js';

export const userRepository = new UserRepository();