import { enableTestStore, disableTestStore, clearAllTestData, createTestUser } from './testStore';
import { gestureService } from '../services/gestureService';
import type { GestureData } from '../types';

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

describe('GestureService', () => {
  let testUserId: number;
  let otherUserId: number;

  beforeAll(() => {
    enableTestStore();
  });

  afterAll(() => {
    disableTestStore();
  });

  beforeEach(() => {
    clearAllTestData();
    testUserId = createTestUser('test@example.com', 'hash').id;
    otherUserId = createTestUser('other@example.com', 'hash').id;
  });

  describe('createGesture', () => {
    it('should create a valid gesture', async () => {
      const data = getValidGestureData();
      const result = await gestureService.createGesture(testUserId, { name: 'test gesture', data });
      
      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.name).toBe('test gesture');
      expect(result.audioTrack).toBeGreaterThanOrEqual(1);
      expect(result.audioTrack).toBeLessThanOrEqual(50);
      expect(result.data).toEqual(data);
    });

    it('should reject invalid gesture name (too short)', async () => {
      const data = getValidGestureData();
      await expect(gestureService.createGesture(testUserId, { name: '', data }))
        .rejects.toThrow('Gesture name is required');
    });

    it('should reject gesture name too long', async () => {
      const data = getValidGestureData();
      const longName = 'a'.repeat(61);
      await expect(gestureService.createGesture(testUserId, { name: longName, data }))
        .rejects.toThrow('Gesture name must be between 1 and 60 characters');
    });

    it('should reject gesture name with control characters', async () => {
      const data = getValidGestureData();
      await expect(gestureService.createGesture(testUserId, { name: 'test\u0000', data }))
        .rejects.toThrow('control characters');
    });

    it('should reject invalid gesture data', async () => {
      // Deliberately violates the canonical contract to exercise runtime validation.
      const data = { ...getValidGestureData(), version: 2 } as unknown as GestureData;
      await expect(gestureService.createGesture(testUserId, { name: 'test', data }))
        .rejects.toThrow('Invalid gesture data');
    });

    it('should reject gesture data with wrong dimensions', async () => {
      const invalidData = { ...getValidGestureData(), dimensions: 6 } as unknown as GestureData;
      await expect(gestureService.createGesture(testUserId, { name: 'test', data: invalidData }))
        .rejects.toThrow('Invalid gesture data');
    });

    it('should reject gesture with no samples', async () => {
      const invalidData = { ...getValidGestureData(), samples: [] };
      await expect(gestureService.createGesture(testUserId, { name: 'test', data: invalidData }))
        .rejects.toThrow('Invalid gesture data');
    });

    it('should reject when user reaches 50 gestures limit', async () => {
      const data = getValidGestureData();
      
      for (let i = 0; i < 50; i++) {
        await gestureService.createGesture(testUserId, { name: `gesture ${i}`, data });
      }
      
      await expect(gestureService.createGesture(testUserId, { name: 'gesture 51', data }))
        .rejects.toThrow('Maximum 50 gestures per user reached');
    });

    it('should assign unique audio tracks', async () => {
      const data = getValidGestureData();
      const result1 = await gestureService.createGesture(testUserId, { name: 'gesture 1', data });
      const result2 = await gestureService.createGesture(testUserId, { name: 'gesture 2', data });
      
      expect(result1.audioTrack).not.toBe(result2.audioTrack);
    });

    it('should reuse audio track after deletion', async () => {
      const data = getValidGestureData();
      const result1 = await gestureService.createGesture(testUserId, { name: 'gesture 1', data });
      const track1 = result1.audioTrack;
      
      await gestureService.deleteGesture(testUserId, result1.id);
      
      const result2 = await gestureService.createGesture(testUserId, { name: 'new', data });
      expect(result2.audioTrack).toBe(track1);
    });
  });

  describe('getGestures', () => {
    it('should return empty list for user with no gestures', async () => {
      const result = await gestureService.getGestures(testUserId);
      expect(result.gestures).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should return all gestures for user', async () => {
      const data = getValidGestureData();
      await gestureService.createGesture(testUserId, { name: 'gesture 1', data });
      await gestureService.createGesture(testUserId, { name: 'gesture 2', data });
      
      const result = await gestureService.getGestures(testUserId);
      expect(result.gestures).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should only return gestures for the authenticated user', async () => {
      const otherUserId = createTestUser('other-user@example.com', 'hash').id;
      const data = getValidGestureData();
      
      await gestureService.createGesture(testUserId, { name: 'user1', data });
      await gestureService.createGesture(otherUserId, { name: 'user2', data });
      
      const result = await gestureService.getGestures(testUserId);
      expect(result.gestures).toHaveLength(1);
      expect(result.gestures[0].name).toBe('user1');
    });
  });

  describe('getGestureById', () => {
    it('should return gesture by id for owner', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      
      const result = await gestureService.getGestureById(testUserId, created.id);
      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe('test');
    });

    it('should return null for non-existent gesture', async () => {
      const result = await gestureService.getGestureById(testUserId, 999);
      expect(result).toBeNull();
    });

    it('should return null for gesture belonging to another user', async () => {
      const otherUserId = createTestUser('other-user@example.com', 'hash').id;
      const data = getValidGestureData();
      const created = await gestureService.createGesture(otherUserId, { name: 'other', data });
      
      const result = await gestureService.getGestureById(testUserId, created.id);
      expect(result).toBeNull();
    });
  });

  describe('updateGesture', () => {
    it('should update gesture name', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'original', data });
      
      const result = await gestureService.updateGesture(testUserId, created.id, { name: 'updated' });
      expect(result).toBeDefined();
      expect(result?.name).toBe('updated');
    });

    it('should update gesture data', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      
      // sampleCount must stay consistent with samples.length, so grow the samples too.
      const newData = getValidGestureData(5, 200);
      const result = await gestureService.updateGesture(testUserId, created.id, { data: newData });
      
      expect(result).toBeDefined();
      expect(result?.data.sampleCount).toBe(5);
      expect(result?.data.samplingPeriodMs).toBe(200);
    });

    it('should reject invalid name', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      
      await expect(gestureService.updateGesture(testUserId, created.id, { name: '' }))
        .rejects.toThrow('Gesture name is required');
    });

    it('should reject name too long', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      
      await expect(gestureService.updateGesture(testUserId, created.id, { name: 'a'.repeat(61) }))
        .rejects.toThrow('between 1 and 60 characters');
    });

    it('should reject invalid gesture data', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      const invalidData = { ...getValidGestureData(), version: 2 } as unknown as GestureData;
      
      await expect(gestureService.updateGesture(testUserId, created.id, { data: invalidData }))
        .rejects.toThrow('Invalid gesture data');
    });

    it('should return null for non-existent gesture', async () => {
      const result = await gestureService.updateGesture(testUserId, 999, { name: 'new' });
      expect(result).toBeNull();
    });

    it('should not update gesture belonging to another user', async () => {
      const otherUserId = createTestUser('other-user@example.com', 'hash').id;
      const data = getValidGestureData();
      const created = await gestureService.createGesture(otherUserId, { name: 'other', data });
      
      const result = await gestureService.updateGesture(testUserId, created.id, { name: 'hack' });
      expect(result).toBeNull();
    });
  });

  describe('deleteGesture', () => {
    it('should delete gesture', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      
      const deleted = await gestureService.deleteGesture(testUserId, created.id);
      expect(deleted).toBe(true);
      
      const found = await gestureService.getGestureById(testUserId, created.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent gesture', async () => {
      const deleted = await gestureService.deleteGesture(testUserId, 999);
      expect(deleted).toBe(false);
    });

    it('should not delete gesture belonging to another user', async () => {
      const otherUserId = createTestUser('other-user@example.com', 'hash').id;
      const data = getValidGestureData();
      const created = await gestureService.createGesture(otherUserId, { name: 'other', data });
      
      const deleted = await gestureService.deleteGesture(testUserId, created.id);
      expect(deleted).toBe(false);
      
      const stillExists = await gestureService.getGestureById(otherUserId, created.id);
      expect(stillExists).toBeDefined();
    });

    it('should free up audio track for reuse', async () => {
      const data = getValidGestureData();
      const created = await gestureService.createGesture(testUserId, { name: 'test', data });
      const track = created.audioTrack;
      
      await gestureService.deleteGesture(testUserId, created.id);
      
      const newGesture = await gestureService.createGesture(testUserId, { name: 'new', data });
      expect(newGesture.audioTrack).toBe(track);
    });
  });
});