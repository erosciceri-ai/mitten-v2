import { enableTestStore, disableTestStore, clearTestUsers, createTestUser, findTestUserByEmail } from './testStore';
import { userRepository } from '../repositories/userRepository';
import { authService } from '../services/authService';
import bcrypt from 'bcrypt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-32chars';
  process.env.JWT_EXPIRES_IN = '1h';
  enableTestStore();
  clearTestUsers(); // Ensure clean start
});

afterAll(() => {
  disableTestStore();
});

beforeEach(() => {
  clearTestUsers();
});

describe('UserRepository', () => {
  describe('create', () => {
    it('should create a new user', () => {
      const passwordHash = 'hashed-password';
      const user = userRepository.create('test@example.com', passwordHash);
      
      expect(user).toBeDefined();
      expect(user.id).toBeGreaterThan(0);
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBe(passwordHash);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should normalize email to lowercase', () => {
      const user = userRepository.create('TEST@EXAMPLE.COM', 'hash');
      expect(user.email).toBe('test@example.com');
    });

    it('should throw on duplicate email', () => {
      userRepository.create('test@example.com', 'hash1');
      expect(() => userRepository.create('test@example.com', 'hash2')).toThrow();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', () => {
      userRepository.create('test@example.com', 'hash');
      const user = userRepository.findByEmail('test@example.com');
      
      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
    });

    it('should return null for non-existent email', () => {
      const user = userRepository.findByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });

    it('should be case insensitive', () => {
      userRepository.create('test@example.com', 'hash');
      const user = userRepository.findByEmail('TEST@EXAMPLE.COM');
      expect(user).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find user by id', () => {
      const created = userRepository.create('test@example.com', 'hash');
      const user = userRepository.findById(created.id);
      
      expect(user).toBeDefined();
      expect(user?.id).toBe(created.id);
    });

    it('should return null for non-existent id', () => {
      const user = userRepository.findById(999);
      expect(user).toBeNull();
    });
  });

  describe('toPublic', () => {
    it('should return public user without password hash', () => {
      const user = userRepository.create('test@example.com', 'secret-hash');
      const publicUser = userRepository.toPublic(user);
      
      expect(publicUser).toEqual({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      });
      expect(publicUser).not.toHaveProperty('passwordHash');
    });
  });
});

describe('AuthService', () => {
  describe('register', () => {
    it('should register a new user successfully', async () => {
      const result = await authService.register({
        email: 'newuser@example.com',
        password: 'password123',
      });
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('newuser@example.com');
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('should reject duplicate email', async () => {
      await authService.register({
        email: 'duplicate@example.com',
        password: 'password123',
      });
      
      await expect(authService.register({
        email: 'duplicate@example.com',
        password: 'different123',
      })).rejects.toThrow('User with this email already exists');
    });

    it('should reject invalid email format', async () => {
      await expect(authService.register({
        email: 'invalid-email',
        password: 'password123',
      })).rejects.toThrow('Invalid email format');
    });

    it('should reject short password', async () => {
      await expect(authService.register({
        email: 'test@example.com',
        password: 'short',
      })).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should hash password with bcrypt', async () => {
      const result = await authService.register({
        email: 'hash@example.com',
        password: 'password123',
      });
      
      const user = userRepository.findByEmail('hash@example.com');
      expect(user).toBeDefined();
      
      const isValid = await bcrypt.compare('password123', user!.passwordHash);
      expect(isValid).toBe(true);
      
      const isInvalid = await bcrypt.compare('wrongpassword', user!.passwordHash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register({
        email: 'login@example.com',
        password: 'correctpassword',
      });
    });

    it('should login with correct credentials', async () => {
      const result = await authService.login({
        email: 'login@example.com',
        password: 'correctpassword',
      });
      
      expect(result).toBeDefined();
      expect(result.user.email).toBe('login@example.com');
      expect(result.token).toBeDefined();
    });

    it('should reject incorrect password', async () => {
      await expect(authService.login({
        email: 'login@example.com',
        password: 'wrongpassword',
      })).rejects.toThrow('Invalid email or password');
    });

    it('should reject non-existent user with same error', async () => {
      await expect(authService.login({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      })).rejects.toThrow('Invalid email or password');
    });

    it('should be case insensitive for email', async () => {
      const result = await authService.login({
        email: 'LOGIN@EXAMPLE.COM',
        password: 'correctpassword',
      });
      
      expect(result.user.email).toBe('login@example.com');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', async () => {
      const { token } = await authService.register({
        email: 'token@example.com',
        password: 'password123',
      });
      
      const payload = authService.verifyToken(token);
      
      expect(payload.userId).toBeDefined();
      expect(payload.email).toBe('token@example.com');
    });

    it('should reject invalid token', () => {
      expect(() => authService.verifyToken('invalid.token.string')).toThrow('Invalid token');
    });

    it('should reject malformed token', () => {
      expect(() => authService.verifyToken('not.a.jwt')).toThrow('Invalid token');
    });
  });

  describe('getUserById', () => {
    it('should return user public data', async () => {
      const { user } = await authService.register({
        email: 'getbyid@example.com',
        password: 'password123',
      });
      
      const found = await authService.getUserById(user.id);
      
      expect(found).toEqual(user);
    });

    it('should return null for non-existent user', async () => {
      const found = await authService.getUserById(999);
      expect(found).toBeNull();
    });
  });
});