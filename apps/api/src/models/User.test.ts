import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../db/index.js';
import { createUser, findUserByEmail, verifyPassword } from '../models/User.js';
import { 
  createGesture, 
  findAllGestures, 
  findGestureById, 
  updateGesture, 
  deleteGesture,
  generateGestureAudio,
  getGestureAudioInfo,
} from '../models/Gesture.js';
import type { GestureData } from '@mitten/contracts';

const db = await getDatabase();

// Create a properly typed sample gesture data
const createSampleGestureData = (): GestureData => ({
  version: 1,
  dimensions: 7,
  dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
  units: { flex: 'adc12', mpu: 'degrees' },
  samples: [
    [100, 200, 300, 400, 500, 10.0, -5.0] as const,
    [110, 210, 310, 410, 510, 11.0, -4.0] as const,
    [120, 220, 320, 420, 520, 12.0, -3.0] as const,
  ],
  summary: {
    min: [100, 200, 300, 400, 500, 10.0, -5.0] as const,
    max: [120, 220, 320, 420, 520, 12.0, -3.0] as const,
    mean: [110, 210, 310, 410, 510, 11.0, -4.0] as const,
  },
  sampleCount: 3,
  captureDurationMs: 200,
  samplingPeriodMs: 100,
});

async function clearDatabase(): Promise<void> {
  await db.exec('DELETE FROM sync_gestures_staging');
  await db.exec('DELETE FROM sync_sessions');
  await db.exec('DELETE FROM audio_tracks');
  await db.exec('DELETE FROM gestures');
  await db.exec('DELETE FROM profiles');
  await db.exec('DELETE FROM users');
  // Reset auto-increment sequences
  await db.exec('DELETE FROM sqlite_sequence WHERE name IN (\'users\', \'gestures\', \'sync_gestures_staging\')');
}

describe('User Model', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should create a user with audio tracks', async () => {
    const user = await createUser({ email: 'test@example.com', password: 'password123' });
    expect(user.id).toBe(1);
    expect(user.email).toBe('test@example.com');

    // Verify audio tracks were created
    const tracks = await db.all('SELECT * FROM audio_tracks WHERE user_id = ?', user.id);
    expect(tracks).toHaveLength(50);
  });

  it('should find user by email', async () => {
    const user = await createUser({ email: 'test@example.com', password: 'password123' });
    const found = await findUserByEmail('test@example.com');
    expect(found).not.toBeNull();
    expect(found?.email).toBe('test@example.com');
  });

  it('should verify password', async () => {
    const user = await createUser({ email: 'test@example.com', password: 'password123' });
    const found = await findUserByEmail('test@example.com');
    expect(found).not.toBeNull();
    if (found) {
      expect(verifyPassword(found, 'password123')).toBe(true);
      expect(verifyPassword(found, 'wrong')).toBe(false);
    }
  });

  it('should not allow duplicate emails', async () => {
    await createUser({ email: 'test@example.com', password: 'password123' });
    await expect(createUser({ email: 'test@example.com', password: 'other' })).rejects.toThrow();
  });
});

describe('Gesture Model', () => {
  let userId: number;

  beforeEach(async () => {
    await clearDatabase();
    const user = await createUser({ email: 'gesture-test@example.com', password: 'password123' });
    userId = user.id;
  });

  it('should create a gesture with auto-assigned audio track', async () => {
    const sampleGestureData = createSampleGestureData();
    const gesture = await createGesture({ userId, name: 'Hello', data: sampleGestureData });

    expect(gesture.id).toBe(1);
    expect(gesture.name).toBe('Hello');
    expect(gesture.audioTrack).toBe(1);
    expect(gesture.data).toEqual(sampleGestureData);
    expect(gesture.createdAt).toBeDefined();
    expect(gesture.updatedAt).toBeDefined();
  });

  it('should create multiple gestures with sequential audio tracks', async () => {
    const sampleGestureData = createSampleGestureData();
    const g1 = await createGesture({ userId, name: 'One', data: sampleGestureData });
    const g2 = await createGesture({ userId, name: 'Two', data: sampleGestureData });
    const g3 = await createGesture({ userId, name: 'Three', data: sampleGestureData });

    expect(g1.audioTrack).toBe(1);
    expect(g2.audioTrack).toBe(2);
    expect(g3.audioTrack).toBe(3);
  });

  it('should find all gestures for user', async () => {
    const sampleGestureData = createSampleGestureData();
    await createGesture({ userId, name: 'One', data: sampleGestureData });
    await createGesture({ userId, name: 'Two', data: sampleGestureData });

    const gestures = await findAllGestures(userId);
    expect(gestures).toHaveLength(2);
    expect(gestures[0].name).toBe('One');
    expect(gestures[1].name).toBe('Two');
  });

  it('should find gesture by id', async () => {
    const sampleGestureData = createSampleGestureData();
    const created = await createGesture({ userId, name: 'Test', data: sampleGestureData });
    const found = await findGestureById(userId, created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe('Test');
  });

  it('should return null for non-existent gesture', async () => {
    const found = await findGestureById(userId, 999);
    expect(found).toBeNull();
  });

  it('should update gesture name', async () => {
    const sampleGestureData = createSampleGestureData();
    const created = await createGesture({ userId, name: 'Original', data: sampleGestureData });
    const updated = await updateGesture(userId, created.id, { name: 'Updated' });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Updated');
    expect(updated?.audioTrack).toBe(created.audioTrack);
  });

  it('should update gesture data', async () => {
    const sampleGestureData = createSampleGestureData();
    const created = await createGesture({ userId, name: 'Test', data: sampleGestureData });
    const newData = { ...sampleGestureData, captureDurationMs: 300 };
    const updated = await updateGesture(userId, created.id, { data: newData });

    expect(updated).not.toBeNull();
    expect(updated?.data.captureDurationMs).toBe(300);
  });

  it('should delete gesture and free audio track', async () => {
    const sampleGestureData = createSampleGestureData();
    const g1 = await createGesture({ userId, name: 'One', data: sampleGestureData });
    const g2 = await createGesture({ userId, name: 'Two', data: sampleGestureData });
    const track1 = g1.audioTrack;

    const deleted = await deleteGesture(userId, g1.id);
    expect(deleted).toBe(true);

    const remaining = await findAllGestures(userId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(g2.id);

    // Next gesture should reuse freed track
    const g3 = await createGesture({ userId, name: 'Three', data: sampleGestureData });
    expect(g3.audioTrack).toBe(track1);
  });

  it('should enforce max 50 gestures per user', async () => {
    const sampleGestureData = createSampleGestureData();
    // Create 50 gestures
    for (let i = 1; i <= 50; i++) {
      await createGesture({ userId, name: `Gesture ${i}`, data: sampleGestureData });
    }

    // 51st should fail
    await expect(createGesture({ userId, name: 'Overflow', data: sampleGestureData }))
      .rejects.toThrow('No available audio tracks');
  });

  it('mock explicitly reports unavailable audio and never marks a file ready', async () => {
    const gesture = await createGesture({ userId, name: 'Hola', data: createSampleGestureData() });
    await expect(generateGestureAudio(userId, gesture.id)).rejects.toMatchObject({ status: 503 });
    expect(await getGestureAudioInfo(userId, gesture.id)).toEqual({
      filePath: null, trackNumber: gesture.audioTrack, generatedAt: null,
    });
  });

  it('should throw for non-existent gesture audio generation', async () => {
    await expect(generateGestureAudio(userId, 999))
      .rejects.toThrow('Gesture not found');
  });
});