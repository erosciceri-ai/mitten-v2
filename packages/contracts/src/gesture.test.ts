import {
  GESTURE_DATA_VERSION,
  GESTURE_DIMENSIONS,
  GESTURE_DIMENSION_ORDER,
  GESTURE_UNITS,
  GESTURE_CONSTRAINTS,
  CAPTURE_INITIAL_PARAMS,
  GestureSample,
  GestureSummary,
  GestureData,
  GestureMetadata,
  Gesture,
  isGestureSample,
  isGestureSummary,
  isGestureData,
  isGestureMetadata,
  isGesture,
  validateGestureData,
  validateGestureMetadata,
  validateGesture,
} from './gesture';

describe('gesture format', () => {
  describe('constants', () => {
    it('should have correct version', () => {
      expect(GESTURE_DATA_VERSION).toBe(1);
    });

    it('should have 7 dimensions', () => {
      expect(GESTURE_DIMENSIONS).toBe(7);
    });

    it('should have correct dimension order', () => {
      expect(GESTURE_DIMENSION_ORDER).toEqual([
        'flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'
      ]);
    });

    it('should have correct units', () => {
      expect(GESTURE_UNITS).toEqual({ flex: 'adc12', mpu: 'degrees' });
    });

    it('should have correct capture initial params', () => {
      expect(CAPTURE_INITIAL_PARAMS.samplingPeriodMs).toBe(100);
      expect(CAPTURE_INITIAL_PARAMS.captureDurationMs).toBe(1500);
      expect(CAPTURE_INITIAL_PARAMS.expectedSampleCount).toBe(15);
    });
  });

  describe('constraints', () => {
    it('should have correct constraints', () => {
      expect(GESTURE_CONSTRAINTS.NAME_MIN_LENGTH).toBe(1);
      expect(GESTURE_CONSTRAINTS.NAME_MAX_LENGTH).toBe(60);
      expect(GESTURE_CONSTRAINTS.GESTURE_ID_MIN).toBe(1);
      expect(GESTURE_CONSTRAINTS.GESTURE_ID_MAX).toBe(2147483647);
      expect(GESTURE_CONSTRAINTS.AUDIO_TRACK_MIN).toBe(1);
      expect(GESTURE_CONSTRAINTS.AUDIO_TRACK_MAX).toBe(50);
      expect(GESTURE_CONSTRAINTS.FLEX_VALUE_MIN).toBe(0);
      expect(GESTURE_CONSTRAINTS.FLEX_VALUE_MAX).toBe(4095);
      expect(GESTURE_CONSTRAINTS.MPU_VALUE_MIN).toBe(-180);
      expect(GESTURE_CONSTRAINTS.MPU_VALUE_MAX).toBe(180);
    });
  });

  describe('isGestureSample', () => {
    it('should return true for valid samples', () => {
      expect(isGestureSample([100, 200, 300, 400, 500, 10.5, -5.5])).toBe(true);
      expect(isGestureSample([0, 0, 0, 0, 0, 0, 0])).toBe(true);
      expect(isGestureSample([4095, 4095, 4095, 4095, 4095, 180, -180])).toBe(true);
    });

    it('should return false for invalid samples', () => {
      expect(isGestureSample([])).toBe(false);
      expect(isGestureSample([1, 2, 3])).toBe(false);
      expect(isGestureSample([1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
      expect(isGestureSample([1, 2, 3, 4, 5, 6, 'a'])).toBe(false);
      expect(isGestureSample([1, 2, 3, 4, 5, 6, NaN])).toBe(false);
      expect(isGestureSample([1, 2, 3, 4, 5, 6, Infinity])).toBe(false);
      expect(isGestureSample(null)).toBe(false);
      expect(isGestureSample('not an array')).toBe(false);
    });
  });

  describe('isGestureSummary', () => {
    it('should return true for valid summary', () => {
      const validSummary = {
        min: [100, 200, 300, 400, 500, 10, -5],
        max: [200, 300, 400, 500, 600, 20, 5],
        mean: [150, 250, 350, 450, 550, 15, 0],
      };
      expect(isGestureSummary(validSummary)).toBe(true);
    });

    it('should return false for invalid summary', () => {
      expect(isGestureSummary({})).toBe(false);
      expect(isGestureSummary({ min: [1, 2], max: [1, 2], mean: [1, 2] })).toBe(false);
      expect(isGestureSummary({ min: [1], max: [1], mean: [1] })).toBe(false);
      // min > mean
      expect(isGestureSummary({
        min: [200, 200, 200, 200, 200, 20, 20],
        max: [100, 100, 100, 100, 100, 10, 10],
        mean: [150, 150, 150, 150, 150, 15, 15],
      })).toBe(false);
      // mean > max
      expect(isGestureSummary({
        min: [100, 100, 100, 100, 100, 10, 10],
        max: [200, 200, 200, 200, 200, 20, 20],
        mean: [250, 250, 250, 250, 250, 25, 25],
      })).toBe(false);
    });
  });

  describe('isGestureData', () => {
    const validGestureData = {
      version: 1,
      dimensions: 7,
      dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'],
      units: { flex: 'adc12', mpu: 'degrees' },
      samples: [
        [100, 200, 300, 400, 500, 10.5, -5.5],
        [110, 210, 310, 410, 510, 10.6, -5.4],
      ],
      summary: {
        min: [100, 200, 300, 400, 500, 10.5, -5.5],
        max: [110, 210, 310, 410, 510, 10.6, -5.4],
        mean: [105, 205, 305, 405, 505, 10.55, -5.45],
      },
      sampleCount: 2,
      captureDurationMs: 1500,
      samplingPeriodMs: 100,
    };

    it('should return true for valid gesture data', () => {
      expect(isGestureData(validGestureData)).toBe(true);
    });

    it('should return false for wrong version', () => {
      expect(isGestureData({ ...validGestureData, version: 2 })).toBe(false);
    });

    it('should return false for wrong dimensions', () => {
      expect(isGestureData({ ...validGestureData, dimensions: 8 })).toBe(false);
    });

    it('should return false for wrong dimensionOrder', () => {
      expect(isGestureData({ ...validGestureData, dimensionOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toBe(false);
    });

    it('should return false for wrong units', () => {
      expect(isGestureData({ ...validGestureData, units: { flex: 'volts', mpu: 'radians' } })).toBe(false);
    });

    it('should return false for mismatched sampleCount', () => {
      expect(isGestureData({ ...validGestureData, sampleCount: 5 })).toBe(false);
    });

    it('should return false for empty samples', () => {
      expect(isGestureData({ ...validGestureData, samples: [], sampleCount: 0 })).toBe(false);
    });

    it('should return false for invalid sample values (flex out of range)', () => {
      const invalid = {
        ...validGestureData,
        samples: [[5000, 200, 300, 400, 500, 10.5, -5.5], validGestureData.samples[1]],
      };
      expect(invalid.samples).toHaveLength(invalid.sampleCount);
      expect(isGestureData(invalid)).toBe(false);
      invalid.samples[0][0] = 100;
      expect(isGestureData(invalid)).toBe(true);
    });

    it('should return false for invalid sample values (MPU out of range)', () => {
      const invalid = {
        ...validGestureData,
        samples: [[100, 200, 300, 400, 500, 200, -5.5], validGestureData.samples[1]],
      };
      expect(invalid.samples).toHaveLength(invalid.sampleCount);
      expect(isGestureData(invalid)).toBe(false);
      invalid.samples[0][5] = 10.5;
      expect(isGestureData(invalid)).toBe(true);
    });

    it('should return false for min > mean', () => {
      const invalid = {
        ...validGestureData,
        summary: {
          min: [200, 200, 200, 200, 200, 20, 20],
          max: [300, 300, 300, 300, 300, 30, 30],
          mean: [150, 150, 150, 150, 150, 15, 15],
        },
      };
      expect(isGestureData(invalid)).toBe(false);
    });

    it('should return false for mean > max', () => {
      const invalid = {
        ...validGestureData,
        summary: {
          min: [100, 100, 100, 100, 100, 10, 10],
          max: [200, 200, 200, 200, 200, 20, 20],
          mean: [250, 250, 250, 250, 250, 25, 25],
        },
      };
      expect(isGestureData(invalid)).toBe(false);
    });

    it('should reject non-integer capture metadata', () => {
      expect(isGestureData({ ...validGestureData, captureDurationMs: 1500.5 })).toBe(false);
      expect(isGestureData({ ...validGestureData, samplingPeriodMs: 100.5 })).toBe(false);
    });

    it('should reject non-finite summary values', () => {
      expect(isGestureData({
        ...validGestureData,
        summary: { ...validGestureData.summary, mean: [105, 205, 305, 405, 505, NaN, -5.45] },
      })).toBe(false);
      expect(isGestureData({
        ...validGestureData,
        summary: { ...validGestureData.summary, max: [110, 210, 310, 410, 510, Infinity, -5.4] },
      })).toBe(false);
    });

    it('should reject summary values outside documented physical ranges', () => {
      expect(isGestureData({
        ...validGestureData,
        summary: {
          min: [100, 200, 300, 400, 500, 10.5, -5.5],
          max: [5000, 210, 310, 410, 510, 10.6, -5.4],
          mean: [105, 205, 305, 405, 505, 10.55, -5.45],
        },
      })).toBe(false);
    });

    it('should reject legacy V1 fields mixed into GestureData V1', () => {
      expect(isGestureData({ ...validGestureData, prom: validGestureData.summary.mean })).toBe(false);
      expect(isGestureData({ ...validGestureData, muestras: validGestureData.sampleCount })).toBe(false);
    });

    it('should not impose an undocumented sample count maximum', () => {
      const sample = [100, 200, 300, 400, 500, 10, -5];
      const samples = Array.from({ length: 201 }, () => [...sample]);
      expect(isGestureData({
        ...validGestureData,
        samples,
        sampleCount: samples.length,
        summary: { min: sample, max: sample, mean: sample },
        captureDurationMs: 201,
        samplingPeriodMs: 1,
      })).toBe(true);
    });
  });

  describe('isGestureMetadata', () => {
    const validMetadata = {
      id: 17,
      name: 'hola',
      audioTrack: 17,
    };

    it('should return true for valid metadata', () => {
      expect(isGestureMetadata(validMetadata)).toBe(true);
    });

    it('should return false for missing id', () => {
      expect(isGestureMetadata({ name: 'hola', audioTrack: 17 })).toBe(false);
    });

    it('should return false for id out of range', () => {
      expect(isGestureMetadata({ id: 0, name: 'hola', audioTrack: 17 })).toBe(false);
      expect(isGestureMetadata({ id: 2147483648, name: 'hola', audioTrack: 17 })).toBe(false);
      expect(isGestureMetadata({ id: 1.5, name: 'hola', audioTrack: 17 })).toBe(false);
    });

    it('should return false for empty name', () => {
      expect(isGestureMetadata({ id: 17, name: '', audioTrack: 17 })).toBe(false);
    });

    it('should return false for name too long', () => {
      expect(isGestureMetadata({ id: 17, name: 'a'.repeat(61), audioTrack: 17 })).toBe(false);
    });

    it('should count gesture names by Unicode code points', () => {
      expect(isGestureMetadata({ id: 17, name: 'a'.repeat(60), audioTrack: 17 })).toBe(true);
      expect(isGestureMetadata({ id: 17, name: 'á'.repeat(60), audioTrack: 17 })).toBe(true);
      expect(isGestureMetadata({ id: 17, name: '😀'.repeat(40), audioTrack: 17 })).toBe(true);
      expect(isGestureMetadata({ id: 17, name: '😀'.repeat(60), audioTrack: 17 })).toBe(true);
      expect(isGestureMetadata({ id: 17, name: '😀'.repeat(61), audioTrack: 17 })).toBe(false);
    });

    it('should return false for name with control characters', () => {
      expect(isGestureMetadata({ id: 17, name: 'hola\n', audioTrack: 17 })).toBe(false);
      expect(isGestureMetadata({ id: 17, name: 'hola\t', audioTrack: 17 })).toBe(false);
    });

    it('should return false for audioTrack out of range', () => {
      expect(isGestureMetadata({ id: 17, name: 'hola', audioTrack: 0 })).toBe(false);
      expect(isGestureMetadata({ id: 17, name: 'hola', audioTrack: 51 })).toBe(false);
      expect(isGestureMetadata({ id: 17, name: 'hola', audioTrack: 1.5 })).toBe(false);
    });
  });

  describe('isGesture', () => {
    const validGesture = {
      id: 17,
      name: 'hola',
      audioTrack: 17,
      data: {
        version: 1,
        dimensions: 7,
        dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'],
        units: { flex: 'adc12', mpu: 'degrees' },
        samples: [
          [100, 200, 300, 400, 500, 10.5, -5.5],
        ],
        summary: {
          min: [100, 200, 300, 400, 500, 10.5, -5.5],
          max: [100, 200, 300, 400, 500, 10.5, -5.5],
          mean: [100, 200, 300, 400, 500, 10.5, -5.5],
        },
        sampleCount: 1,
        captureDurationMs: 100,
        samplingPeriodMs: 100,
      },
    };

    it('should return true for valid gesture', () => {
      expect(isGesture(validGesture)).toBe(true);
    });

    it('should return false for invalid metadata', () => {
      expect(isGesture({ ...validGesture, id: 0 })).toBe(false);
    });

    it('should return false for invalid data', () => {
      expect(isGesture({ ...validGesture, data: { version: 2 } })).toBe(false);
    });

    it('should return false for missing data', () => {
      expect(isGesture({ id: 17, name: 'hola', audioTrack: 17 })).toBe(false);
    });
  });

  describe('validateGestureData', () => {
    const validGestureData = {
      version: 1,
      dimensions: 7,
      dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'],
      units: { flex: 'adc12', mpu: 'degrees' },
      samples: [
        [100, 200, 300, 400, 500, 10.5, -5.5],
        [110, 210, 310, 410, 510, 10.6, -5.4],
      ],
      summary: {
        min: [100, 200, 300, 400, 500, 10.5, -5.5],
        max: [110, 210, 310, 410, 510, 10.6, -5.4],
        mean: [105, 205, 305, 405, 505, 10.55, -5.45],
      },
      sampleCount: 2,
      captureDurationMs: 1500,
      samplingPeriodMs: 100,
    };

    it('should return valid for correct data', () => {
      const result = validateGestureData(validGestureData);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const result = validateGestureData({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for wrong version', () => {
      const result = validateGestureData({ ...validGestureData, version: 2 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('version'))).toBe(true);
    });

    it('should return error for wrong dimensions', () => {
      const result = validateGestureData({ ...validGestureData, dimensions: 8 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('dimensions'))).toBe(true);
    });

    it('should return error for wrong dimensionOrder', () => {
      const result = validateGestureData({ ...validGestureData, dimensionOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('dimensionOrder'))).toBe(true);
    });

    it('should return error for wrong units', () => {
      const result = validateGestureData({ ...validGestureData, units: { flex: 'volts', mpu: 'radians' } });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('units'))).toBe(true);
    });

    it('should return error for mismatched sampleCount', () => {
      const result = validateGestureData({ ...validGestureData, sampleCount: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('sampleCount'))).toBe(true);
    });

    it('should report decimal integer fields as invalid', () => {
      const decimalSampleCount = validateGestureData({ ...validGestureData, sampleCount: 2.5 });
      const decimalDuration = validateGestureData({ ...validGestureData, captureDurationMs: 1500.5 });
      const decimalPeriod = validateGestureData({ ...validGestureData, samplingPeriodMs: 100.5 });

      expect(decimalSampleCount.valid).toBe(false);
      expect(decimalSampleCount.errors.some((error: string) => error.includes('sampleCount') && error.includes('integer'))).toBe(true);
      expect(decimalDuration.valid).toBe(false);
      expect(decimalDuration.errors.some((error: string) => error.includes('captureDurationMs') && error.includes('integer'))).toBe(true);
      expect(decimalPeriod.valid).toBe(false);
      expect(decimalPeriod.errors.some((error: string) => error.includes('samplingPeriodMs') && error.includes('integer'))).toBe(true);
    });

    it('should return error for empty samples', () => {
      const result = validateGestureData({ ...validGestureData, samples: [], sampleCount: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('empty'))).toBe(true);
    });

    it('should return error for flex out of range', () => {
      const invalid = { ...validGestureData, samples: [[5000, 200, 300, 400, 500, 10.5, -5.5]] };
      const result = validateGestureData(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('flex') && e.includes('out of range'))).toBe(true);
    });

    it('should return error for MPU out of range', () => {
      const invalid = { ...validGestureData, samples: [[100, 200, 300, 400, 500, 200, -5.5]] };
      const result = validateGestureData(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('MPU') && e.includes('out of range'))).toBe(true);
    });

    it('should return error for min > mean', () => {
      const invalid = {
        ...validGestureData,
        summary: {
          min: [200, 200, 200, 200, 200, 20, 20],
          max: [300, 300, 300, 300, 300, 30, 30],
          mean: [150, 150, 150, 150, 150, 15, 15],
        },
      };
      const result = validateGestureData(invalid);
      expect(result.valid).toBe(false);
      // The validation fails at isGestureSummary check with generic message
      expect(result.errors.some((e: string) => e.includes('min <='))).toBe(true);
    });

    it('should return error for mean > max', () => {
      const invalid = {
        ...validGestureData,
        summary: {
          min: [100, 100, 100, 100, 100, 10, 10],
          max: [200, 200, 200, 200, 200, 20, 20],
          mean: [250, 250, 250, 250, 250, 25, 25],
        },
      };
      const result = validateGestureData(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('min <='))).toBe(true);
    });
  });

  describe('validateGestureMetadata', () => {
    it('should return valid for correct metadata', () => {
      const result = validateGestureMetadata({ id: 17, name: 'hola', audioTrack: 17 });
      expect(result.valid).toBe(true);
    });

    it('should return error for id out of range', () => {
      const result = validateGestureMetadata({ id: 0, name: 'hola', audioTrack: 17 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('id'))).toBe(true);
    });

    it('should return error for empty name', () => {
      const result = validateGestureMetadata({ id: 17, name: '', audioTrack: 17 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('name'))).toBe(true);
    });

    it('should return error for name too long', () => {
      const result = validateGestureMetadata({ id: 17, name: 'a'.repeat(61), audioTrack: 17 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('name'))).toBe(true);
    });

    it('should return error for name with control characters', () => {
      const result = validateGestureMetadata({ id: 17, name: 'hola\n', audioTrack: 17 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('control'))).toBe(true);
    });

    it('should return error for audioTrack out of range', () => {
      const result = validateGestureMetadata({ id: 17, name: 'hola', audioTrack: 51 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('audioTrack'))).toBe(true);
    });

    it('should accept 40 emojis and reject more than 60 Unicode code points', () => {
      expect(validateGestureMetadata({ id: 17, name: '😀'.repeat(40), audioTrack: 17 }).valid).toBe(true);
      expect(validateGestureMetadata({ id: 17, name: '😀'.repeat(61), audioTrack: 17 }).valid).toBe(false);
    });
  });

  describe('validateGesture', () => {
    const validGesture = {
      id: 17,
      name: 'hola',
      audioTrack: 17,
      data: {
        version: 1,
        dimensions: 7,
        dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'],
        units: { flex: 'adc12', mpu: 'degrees' },
        samples: [[100, 200, 300, 400, 500, 10.5, -5.5]],
        summary: {
          min: [100, 200, 300, 400, 500, 10.5, -5.5],
          max: [100, 200, 300, 400, 500, 10.5, -5.5],
          mean: [100, 200, 300, 400, 500, 10.5, -5.5],
        },
        sampleCount: 1,
        captureDurationMs: 100,
        samplingPeriodMs: 100,
      },
    };

    it('should return valid for correct gesture', () => {
      const result = validateGesture(validGesture);
      expect(result.valid).toBe(true);
    });

    it('should return error for invalid metadata', () => {
      const result = validateGesture({ ...validGesture, id: 0 });
      expect(result.valid).toBe(false);
    });

    it('should return error for invalid data', () => {
      const result = validateGesture({ ...validGesture, data: { version: 2 } });
      expect(result.valid).toBe(false);
    });

    it('should return error for missing data', () => {
      const result = validateGesture({ id: 17, name: 'hola', audioTrack: 17 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('data'))).toBe(true);
    });
  });
});
