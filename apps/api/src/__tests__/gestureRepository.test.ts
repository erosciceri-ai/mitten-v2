import { enableTestStore, disableTestStore, clearAllTestData, createTestUser, createTestGesture, getNextAvailableAudioTrack } from './testStore';
import { gestureRepository } from '../repositories/gestureRepository';

describe('GestureRepository', () => {
  let testUserId: number;

  beforeAll(() => {
    enableTestStore();
  });

  afterAll(() => {
    disableTestStore();
  });

  beforeEach(() => {
    clearAllTestData();
    const testUser = createTestUser('test@example.com', 'hash');
    testUserId = testUser.id;
  });

  describe('create', () => {
    it('should create a new gesture with audio track assigned', () => {
      const data = getValidGestureData();
      const gesture = gestureRepository.create(testUserId, 'test gesture', data);
      
      expect(gesture).toBeDefined();
      expect(gesture.id).toBeGreaterThan(0);
      expect(gesture.name).toBe('test gesture');
      expect(gesture.audioTrack).toBeGreaterThanOrEqual(1);
      expect(gesture.audioTrack).toBeLessThanOrEqual(50);
      expect(gesture.data).toEqual(data);
      expect(gesture.createdAt).toBeDefined();
      expect(gesture.updatedAt).toBeDefined();
    });

    it('should assign unique audio tracks to different gestures', () => {
      const data = getValidGestureData();
      const gesture1 = gestureRepository.create(testUserId, 'gesture 1', data);
      const gesture2 = gestureRepository.create(testUserId, 'gesture 2', data);
      
      expect(gesture1.audioTrack).not.toBe(gesture2.audioTrack);
    });

    it('should reuse audio track when gesture is deleted', () => {
      const data = getValidGestureData();
      const gesture1 = gestureRepository.create(testUserId, 'gesture 1', data);
      const track1 = gesture1.audioTrack;
      
      gestureRepository.delete(gesture1.id, testUserId);
      
      const gesture2 = gestureRepository.create(testUserId, 'gesture 2', data);
      expect(gesture2.audioTrack).toBe(track1);
    });

    it('should reject creation when user reaches 50 gestures limit', () => {
      const data = getValidGestureData();
      
      // Create 50 gestures
      for (let i = 0; i < 50; i++) {
        gestureRepository.create(testUserId, `gesture ${i}`, data);
      }
      
      expect(() => gestureRepository.create(testUserId, 'gesture 51', data))
        .toThrow('Maximum 50 gestures per user');
    });
  });

  describe('findById', () => {
    it('should find gesture by id for owner', () => {
      const data = getValidGestureData();
      const created = gestureRepository.create(testUserId, 'test', data);
      const found = gestureRepository.findById(created.id, testUserId);
      
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('test');
    });

    it('should return null for non-existent gesture', () => {
      const found = gestureRepository.findById(999, testUserId);
      expect(found).toBeNull();
    });

    it('should return null when gesture belongs to another user', () => {
      const otherUser = createTestUser('other@example.com', 'hash');
      const data = getValidGestureData();
      const created = gestureRepository.create(otherUser.id, 'other gesture', data);
      
      const found = gestureRepository.findById(created.id, testUserId);
      expect(found).toBeNull();
    });
  });

  describe('findByIdPublic', () => {
    it('should return public gesture data without internal fields', () => {
      const data = getValidGestureData();
      const created = gestureRepository.create(testUserId, 'test', data);
      const found = gestureRepository.findByIdPublic(created.id, testUserId);
      
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('test');
      expect(found?.audioTrack).toBe(created.audioTrack);
      expect(found?.data).toEqual(data);
      expect(found?.createdAt).toBeDefined();
      expect(found?.updatedAt).toBeDefined();
    });
  });

  describe('findAllByUserId', () => {
    it('should return all gestures for a user', () => {
      const data = getValidGestureData();
      gestureRepository.create(testUserId, 'gesture 1', data);
      gestureRepository.create(testUserId, 'gesture 2', data);
      
      const gestures = gestureRepository.findAllByUserId(testUserId);
      expect(gestures).toHaveLength(2);
    });

    it('should return empty array for user with no gestures', () => {
      const gestures = gestureRepository.findAllByUserId(testUserId);
      expect(gestures).toHaveLength(0);
    });

    it('should only return gestures for the specified user', () => {
      const otherUser = createTestUser('other@example.com', 'hash');
      const data = getValidGestureData();
      
      gestureRepository.create(testUserId, 'user 1 gesture', data);
      gestureRepository.create(otherUser.id, 'user 2 gesture', data);
      
      const user1Gestures = gestureRepository.findAllByUserId(testUserId);
      const user2Gestures = gestureRepository.findAllByUserId(otherUser.id);
      
      expect(user1Gestures).toHaveLength(1);
      expect(user2Gestures).toHaveLength(1);
      expect(user1Gestures[0].name).toBe('user 1 gesture');
      expect(user2Gestures[0].name).toBe('user 2 gesture');
    });

    it('should order gestures by id', () => {
      const data = getValidGestureData();
      const g1 = gestureRepository.create(testUserId, 'first', data);
      const g2 = gestureRepository.create(testUserId, 'second', data);
      const g3 = gestureRepository.create(testUserId, 'third', data);
      
      const gestures = gestureRepository.findAllByUserId(testUserId);
      expect(gestures[0].id).toBe(g1.id);
      expect(gestures[1].id).toBe(g2.id);
      expect(gestures[2].id).toBe(g3.id);
    });
  });

  describe('countByUserId', () => {
    it('should return correct count of gestures for user', () => {
      const data = getValidGestureData();
      expect(gestureRepository.countByUserId(testUserId)).toBe(0);
      
      gestureRepository.create(testUserId, 'gesture 1', data);
      expect(gestureRepository.countByUserId(testUserId)).toBe(1);
      
      gestureRepository.create(testUserId, 'gesture 2', data);
      expect(gestureRepository.countByUserId(testUserId)).toBe(2);
    });
  });

  describe('update', () => {
    it('should update gesture name', () => {
      const data = getValidGestureData();
      const created = gestureRepository.create(testUserId, 'original name', data);
      
      const updated = gestureRepository.update(created.id, testUserId, { name: 'new name' });
      
      expect(updated).toBeDefined();
      expect(updated?.name).toBe('new name');
      expect(updated?.data).toEqual(data);
    });

    it('should update gesture data', () => {
      const data = getValidGestureData();
      const created = gestureRepository.create(testUserId, 'test', data);
      
      const newData = getValidGestureData(1500, 100);
      const updated = gestureRepository.update(created.id, testUserId, { data: newData });
      
      expect(updated).toBeDefined();
      // A data-only update must leave the existing name untouched.
      expect(updated?.name).toBe('test');
      expect(updated?.data).toEqual(newData);
    });

    it('should return null for non-existent gesture', () => {
      const updated = gestureRepository.update(999, testUserId, { name: 'new' });
      expect(updated).toBeNull();
    });

    it('should return null when gesture belongs to another user', () => {
      const otherUser = createTestUser('other@example.com', 'hash');
      const data = getValidGestureData();
      const created = gestureRepository.create(otherUser.id, 'other gesture', data);
      
      const updated = gestureRepository.update(created.id, testUserId, { name: 'hack' });
      expect(updated).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete gesture', () => {
      const data = getValidGestureData();
      const created = gestureRepository.create(testUserId, 'test', data);
      
      const deleted = gestureRepository.delete(created.id, testUserId);
      expect(deleted).toBe(true);
      
      const found = gestureRepository.findById(created.id, testUserId);
      expect(found).toBeNull();
    });

    it('should return false for non-existent gesture', () => {
      const deleted = gestureRepository.delete(999, testUserId);
      expect(deleted).toBe(false);
    });

    it('should not delete gesture belonging to another user', () => {
      const otherUser = createTestUser('other@example.com', 'hash');
      const data = getValidGestureData();
      const created = gestureRepository.create(otherUser.id, 'other gesture', data);
      
      const deleted = gestureRepository.delete(created.id, testUserId);
      expect(deleted).toBe(false);
      
      const stillExists = gestureRepository.findById(created.id, otherUser.id);
      expect(stillExists).toBeDefined();
    });

    it('should free up audio track for reuse', () => {
      const data = getValidGestureData();
      const created = gestureRepository.create(testUserId, 'test', data);
      const track = created.audioTrack;
      
      gestureRepository.delete(created.id, testUserId);
      
      const newGesture = gestureRepository.create(testUserId, 'new', data);
      expect(newGesture.audioTrack).toBe(track);
    });
  });
});

/** A gesture sample is a fixed 7-dimension vector (see docs/gesture-format.md). */
type Sample7 = readonly [number, number, number, number, number, number, number];

/** Narrow a plain array to a 7-dimension tuple, as the canonical format requires. */
function toSample7(values: number[]): Sample7 {
  return [values[0], values[1], values[2], values[3], values[4], values[5], values[6]];
}

function getValidGestureData(sampleCount = 3, samplingPeriodMs = 100): GestureData {
  const samples: Sample7[] = [];
  const summaryMin: number[] = [];
  const summaryMax: number[] = [];
  const summaryMean: number[] = [];
  
  for (let i = 0; i < sampleCount; i++) {
    const sample: Sample7 = [
      3180 + i * 10,
      3100 + i * 10,
      2940 + i * 5,
      3290 + i * 5,
      3050 + i * 5,
      12.3 + i * 0.1,
      -5.1 - i * 0.1,
    ];
    samples.push(sample);
    
    if (i === 0) {
      summaryMin.push(...sample);
      summaryMax.push(...sample);
      summaryMean.push(...sample);
    } else {
      for (let d = 0; d < 7; d++) {
        summaryMin[d] = Math.min(summaryMin[d], sample[d]);
        summaryMax[d] = Math.max(summaryMax[d], sample[d]);
        summaryMean[d] += sample[d];
      }
    }
  }
  
  for (let d = 0; d < 7; d++) {
    summaryMean[d] /= sampleCount;
  }
  
  return {
    version: 1,
    dimensions: 7,
    dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
    units: { flex: 'adc12', mpu: 'degrees' },
    samples,
    summary: {
      min: toSample7(summaryMin),
      max: toSample7(summaryMax),
      mean: toSample7(summaryMean),
    },
    sampleCount,
    captureDurationMs: sampleCount * 100,
    samplingPeriodMs,
  };
}

import { GestureData, GestureSummary } from '../types';