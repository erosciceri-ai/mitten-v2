import request from 'supertest';
import express from 'express';
import { enableTestStore, disableTestStore, clearTestUsers } from './testStore';
import authRoutes from '../routes/authRoutes';
import healthRoutes from '../routes/healthRoutes';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';
import { config } from '../config';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api', healthRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

beforeAll(() => {
  process.env.JWT_SECRET = config.jwtSecret;
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

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
      })
      .expect(201);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toHaveProperty('id');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body).toHaveProperty('token');
    expect(typeof response.body.token).toBe('string');
  });

  it('should reject duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'password123',
      })
      .expect(201);

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'duplicate@example.com',
        password: 'different123',
      })
      .expect(409);

    expect(response.body.code).toBe('CONFLICT');
    expect(response.body.message).toBe('User with this email already exists');
  }, 10000);

  it('should reject invalid email format', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        password: 'password123',
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject short password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'short',
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject missing fields', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({})
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('should login with correct credentials', async () => {
    // First register a user
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'login@example.com',
        password: 'correctpassword',
      });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login@example.com',
        password: 'correctpassword',
      })
      .expect(200);

    expect(response.body).toHaveProperty('user');
    expect(response.body.user.email).toBe('login@example.com');
    expect(response.body).toHaveProperty('token');
  });

  it('should reject incorrect password', async () => {
    // Register user first
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'login2@example.com',
        password: 'correctpassword',
      });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'login2@example.com',
        password: 'wrongpassword',
      })
      .expect(401);

    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('should reject non-existent user with same error', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      })
      .expect(401);

    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('should reject missing credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({})
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user with valid token', async () => {
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'me@example.com',
        password: 'password123',
      });

    const { token, user } = registerResponse.body;

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.user.id).toBe(user.id);
    expect(response.body.user.email).toBe(user.email);
  });

  it('should reject missing authorization header', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .expect(401);

    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('should reject invalid token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token')
      .expect(401);

    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('should reject malformed authorization header', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'InvalidHeader')
      .expect(401);

    expect(response.body.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/health', () => {
  it('should return health check', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('version');
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/unknown')
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });
});