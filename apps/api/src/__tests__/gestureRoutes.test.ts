import request from 'supertest';
import express from 'express';
import { enableTestStore, disableTestStore, clearAllTestData, createTestUser } from './testStore';
import gestureRoutes from '../routes/gestureRoutes';
import authRoutes from '../routes/authRoutes';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';
import { config } from '../config';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/gestures', gestureRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

let testUserId: number;
let otherUserId: number;
let testToken: string;
let otherToken: string;

beforeAll(() => {
  enableTestStore();
  process.env.JWT_SECRET = config.jwtSecret;
  process.env.JWT_EXPIRES_IN = '1h';
});

afterAll(() => {
  disableTestStore();
});

beforeEach(() => {
  clearAllTestData();
  
  testUserId = createTestUser('test@example.com', 'hash').id;
  otherUserId = createTestUser('other@example.com', 'hash').id;
  
  testToken = jwt.sign({ userId: testUserId, email: 'test@example.com' }, config.jwtSecret, { expiresIn: '1h' });
  otherToken = jwt.sign({ userId: otherUserId, email: 'other@example.com' }, config.jwtSecret, { expiresIn: '1h' });
});

function getValidGestureData() {
  return {
    version: 1 as const,
    dimensions: 7 as const,
    dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
    units: { flex: 'adc12', mpu: 'degrees' },
    samples: [
      [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.3, -5.1],
      [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2],
      [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.1, -5.3],
    ],
    summary: {
      min: [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.1, -5.3],
      max: [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.3, -5.1],
      mean: [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2],
    },
    sampleCount: 3,
    captureDurationMs: 300,
    samplingPeriodMs: 100,
  };
}

describe('POST /api/gestures', () => {
  it('should create a new gesture', async () => {
    const data = getValidGestureData();
    const response = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: 'test gesture',
        data: data,
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('test gesture');
    expect(response.body.audioTrack).toBeGreaterThanOrEqual(1);
    expect(response.body.audioTrack).toBeLessThanOrEqual(50);
    expect(response.body.data).toEqual(data);
    expect(response.body.createdAt).toBeDefined();
    expect(response.body.updatedAt).toBeDefined();
  });

  it('should reject gesture without authentication', async () => {
    const data = getValidGestureData();
    const response = await request(app)
      .post('/api/gestures')
      .send({
        name: 'test gesture',
        data: data,
      })
      .expect(401);

    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('should reject invalid gesture name (too short)', async () => {
    const data = getValidGestureData();
    const response = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: '',
        data: data,
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject gesture name too long', async () => {
    const data = getValidGestureData();
    const response = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: 'a'.repeat(61),
        data: data,
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid gesture data', async () => {
    const response = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: 'test',
        data: { ...getValidGestureData(), version: 2 },
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject when user reaches 50 gestures limit', async () => {
    const data = getValidGestureData();
    
    for (let i = 0; i < 50; i++) {
      await request(app)
        .post('/api/gestures')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: `gesture ${i}`,
          data: data,
        })
        .expect(201);
    }

    const response = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        name: 'gesture 51',
        data: data,
      })
      .expect(409);

    expect(response.body.code).toBe('CONFLICT');
    expect(response.body.message).toBe('Maximum 50 gestures per user reached');
  });
});

describe('GET /api/gestures', () => {
  it('should return empty list for user with no gestures', async () => {
    const response = await request(app)
      .get('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(response.body.gestures).toHaveLength(0);
    expect(response.body.total).toBe(0);
  });

  it('should return all gestures for user', async () => {
    const data = getValidGestureData();
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'gesture 1', data: data })
      .expect(201);
    
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'gesture 2', data: data })
      .expect(201);

    const response = await request(app)
      .get('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(response.body.gestures).toHaveLength(2);
    expect(response.body.total).toBe(2);
  });

  it('should only return gestures for the authenticated user', async () => {
    const data = getValidGestureData();
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'user1', data: data })
      .expect(201);
    
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'user2', data: data })
      .expect(201);

    const response = await request(app)
      .get('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(response.body.gestures).toHaveLength(1);
    expect(response.body.gestures[0].name).toBe('user1');
  });
});

describe('GET /api/gestures/:id', () => {
  it('should return gesture by id for owner', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    const response = await request(app)
      .get(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(response.body.id).toBe(createResponse.body.id);
    expect(response.body.name).toBe('test');
  });

  it('should return 404 for non-existent gesture', async () => {
    const response = await request(app)
      .get('/api/gestures/999')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('should return 404 for gesture belonging to another user', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'other', data: data })
      .expect(201);

    const response = await request(app)
      .get(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('should return 400 for invalid ID format', async () => {
    const response = await request(app)
      .get('/api/gestures/abc')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('PUT /api/gestures/:id', () => {
  it('should update gesture name', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'original', data: data })
      .expect(201);

    const response = await request(app)
      .put(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'updated' })
      .expect(200);

    expect(response.body.name).toBe('updated');
  });

  it('should update gesture data', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    // Create new data with 5 samples to match sampleCount: 5
    const newData = {
      ...getValidGestureData(),
      samples: [
        [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 12.3, -5.1],
        [3190.0, 3110.0, 2945.0, 3295.0, 3055.0, 12.2, -5.2],
        [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.1, -5.3],
        [3210.0, 3130.0, 2955.0, 3305.0, 3065.0, 12.0, -5.4],
        [3220.0, 3140.0, 2960.0, 3310.0, 3070.0, 11.9, -5.5],
      ],
      summary: {
        min: [3180.0, 3100.0, 2940.0, 3290.0, 3050.0, 11.9, -5.5],
        max: [3220.0, 3140.0, 2960.0, 3310.0, 3070.0, 12.3, -5.1],
        mean: [3200.0, 3120.0, 2950.0, 3300.0, 3060.0, 12.1, -5.3],
      },
      sampleCount: 5,
      captureDurationMs: 500,
      samplingPeriodMs: 100,
    };
    const response = await request(app)
      .put(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ data: newData })
      .expect(200);

    expect(response.body.data.sampleCount).toBe(5);
    expect(response.body.data.samplingPeriodMs).toBe(100);
  });

  it('should reject invalid name', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    const response = await request(app)
      .put(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: '' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject name too long', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    const response = await request(app)
      .put(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'a'.repeat(61) })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid gesture data', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    const response = await request(app)
      .put(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ data: { ...getValidGestureData(), version: 2 } })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 for non-existent gesture', async () => {
    const response = await request(app)
      .put('/api/gestures/999')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'new' })
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('should not update gesture belonging to another user', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'other', data: data })
      .expect(201);

    const response = await request(app)
      .put(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'hack' })
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/gestures/:id', () => {
  it('should delete gesture', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    const deleteResponse = await request(app)
      .delete(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(204);

    const getResponse = await request(app)
      .get(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(404);
  });

  it('should return 404 for non-existent gesture', async () => {
    const response = await request(app)
      .delete('/api/gestures/999')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('should not delete gesture belonging to another user', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'other', data: data })
      .expect(201);

    const response = await request(app)
      .delete(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(404);

    expect(response.body.code).toBe('NOT_FOUND');

    // Verify it still exists for the other user
    const getResponse = await request(app)
      .get(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
  });

  it('should free up audio track for reuse', async () => {
    const data = getValidGestureData();
    const createResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'test', data: data })
      .expect(201);

    const track = createResponse.body.audioTrack;
    
    await request(app)
      .delete(`/api/gestures/${createResponse.body.id}`)
      .set('Authorization', `Bearer ${testToken}`)
      .expect(204);

    const newCreateResponse = await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'new', data: data })
      .expect(201);

    expect(newCreateResponse.body.audioTrack).toBe(track);
  });
});

describe('Gesture isolation between users', () => {
  it('should keep gestures isolated between different users', async () => {
    const data = getValidGestureData();
    
    // User 1 creates gestures
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'user1-gesture-1', data: data })
      .expect(201);
    
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ name: 'user1-gesture-2', data: data })
      .expect(201);

    // User 2 creates gestures
    await request(app)
      .post('/api/gestures')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'user2-gesture-1', data: data })
      .expect(201);

    // User 1 should only see their own gestures
    const user1Response = await request(app)
      .get('/api/gestures')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    
    expect(user1Response.body.gestures).toHaveLength(2);
    expect(user1Response.body.gestures.every((g: any) => g.name.startsWith('user1-'))).toBe(true);

    // User 2 should only see their own gestures
    const user2Response = await request(app)
      .get('/api/gestures')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    
    expect(user2Response.body.gestures).toHaveLength(1);
    expect(user2Response.body.gestures[0].name).toBe('user2-gesture-1');
  });
});