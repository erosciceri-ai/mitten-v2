/**
 * MITTEN V2 - Gesture Format Contracts
 * 
 * Defines the canonical gesture data format (data.version = 1)
 * as specified in docs/gesture-format.md
 */

import type { ValidationResult } from './types';

// ============================================================================
// Gesture Data Format (data.version = 1)
// ============================================================================

export const GESTURE_DATA_VERSION = 1;
export const GESTURE_DIMENSIONS = 7;
export const GESTURE_DIMENSION_ORDER = [
  'flex1',
  'flex2', 
  'flex3',
  'flex4',
  'flex5',
  'mpuX',
  'mpuY'
] as const;

export const GESTURE_UNITS = {
  flex: 'adc12',
  mpu: 'degrees'
} as const;

export type DimensionName = typeof GESTURE_DIMENSION_ORDER[number];

export interface GestureSample {
  readonly [index: number]: number;
  readonly length: 7;
}

export interface GestureSummary {
  readonly min: readonly [number, number, number, number, number, number, number];
  readonly max: readonly [number, number, number, number, number, number, number];
  readonly mean: readonly [number, number, number, number, number, number, number];
}

export interface GestureUnits {
  flex: 'adc12';
  mpu: 'degrees';
}

export interface GestureData {
  version: 1;
  dimensions: 7;
  dimensionOrder: readonly ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'];
  units: GestureUnits;
  samples: readonly GestureSample[];
  summary: GestureSummary;
  sampleCount: number;
  captureDurationMs: number;
  samplingPeriodMs: number;
}

// ============================================================================
// Gesture Metadata (separate from data)
// ============================================================================

export interface GestureMetadata {
  id: number;              // 1-2147483647, assigned by backend
  name: string;            // 1-60 Unicode code points, no control chars
  audioTrack: number;      // 1-50 in Protocol Version 2
}

export interface Gesture {
  id: number;
  name: string;
  audioTrack: number;
  data: GestureData;
}

// ============================================================================
// Capture Parameters (initial values, configurable)
// ============================================================================

export const CAPTURE_INITIAL_PARAMS = {
  samplingPeriodMs: 100,
  captureDurationMs: 1500,
  expectedSampleCount: 15, // captureDurationMs / samplingPeriodMs (±1)
} as const;

// ============================================================================
// Validation Constants
// ============================================================================

export const GESTURE_CONSTRAINTS = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 60, // Unicode code points (not UTF-16 code units)
  SAMPLE_COUNT_MIN: 1,
  CAPTURE_DURATION_MIN_MS: 1,
  CAPTURE_DURATION_MAX_MS: 10000,
  SAMPLING_PERIOD_MIN_MS: 1,
  SAMPLING_PERIOD_MAX_MS: 1000,
  GESTURE_ID_MIN: 1,
  GESTURE_ID_MAX: 2147483647,
  AUDIO_TRACK_MIN: 1,
  AUDIO_TRACK_MAX: 50,
  FLEX_VALUE_MIN: 0,
  FLEX_VALUE_MAX: 4095,
  MPU_VALUE_MIN: -180,
  MPU_VALUE_MAX: 180,
  MIN_SAMPLES_FOR_VALID_CAPTURE: 3,
} as const;

const INCOMPATIBLE_GESTURE_DATA_FIELDS = [
  'id',
  'name',
  'audioTrack',
  'nombre',
  'tipo',
  'min',
  'max',
  'prom',
  'muestras',
] as const;

function isValueInDimensionRange(value: number, dimensionIndex: number): boolean {
  if (dimensionIndex < 5) {
    return value >= GESTURE_CONSTRAINTS.FLEX_VALUE_MIN &&
      value <= GESTURE_CONSTRAINTS.FLEX_VALUE_MAX;
  }

  return value >= GESTURE_CONSTRAINTS.MPU_VALUE_MIN &&
    value <= GESTURE_CONSTRAINTS.MPU_VALUE_MAX;
}

// ============================================================================
// Type Guards for GestureData
// ============================================================================

export function isGestureSample(arr: unknown): arr is GestureSample {
  if (!Array.isArray(arr)) return false;
  if (arr.length !== 7) return false;
  return arr.every(v => typeof v === 'number' && Number.isFinite(v));
}

export function isGestureSummary(obj: unknown): obj is GestureSummary {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  
  for (const key of ['min', 'max', 'mean'] as const) {
    if (!Array.isArray(o[key]) || o[key].length !== 7) return false;
    if (!(o[key] as unknown[]).every(v => typeof v === 'number' && Number.isFinite(v))) {
      return false;
    }
  }
  
  // Check min <= mean <= max
  const min = o.min as number[];
  const max = o.max as number[];
  const mean = o.mean as number[];
  for (let i = 0; i < 7; i++) {
    if (!(min[i] <= mean[i] && mean[i] <= max[i])) return false;
  }
  
  return true;
}

export function isGestureData(obj: unknown): obj is GestureData {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;

  if (INCOMPATIBLE_GESTURE_DATA_FIELDS.some(field => field in o)) return false;
  
  if (o.version !== GESTURE_DATA_VERSION) return false;
  if (o.dimensions !== GESTURE_DIMENSIONS) return false;
  if (!Array.isArray(o.dimensionOrder) || o.dimensionOrder.length !== 7) return false;
  if (!o.dimensionOrder.every((v, i) => v === GESTURE_DIMENSION_ORDER[i])) return false;
  if (!o.units || typeof o.units !== 'object') return false;
  const units = o.units as GestureUnits;
  if (units.flex !== 'adc12' || units.mpu !== 'degrees') return false;
  if (!Array.isArray(o.samples)) return false;
  if (o.samples.length !== o.sampleCount) return false;
  if (!o.samples.every(isGestureSample)) return false;
  if (!isGestureSummary(o.summary)) return false;
  if (typeof o.sampleCount !== 'number' || !Number.isInteger(o.sampleCount) || o.sampleCount < 1) return false;
  if (typeof o.captureDurationMs !== 'number' || 
      !Number.isInteger(o.captureDurationMs) ||
      o.captureDurationMs <= 0 || 
      o.captureDurationMs > GESTURE_CONSTRAINTS.CAPTURE_DURATION_MAX_MS) return false;
  if (typeof o.samplingPeriodMs !== 'number' || 
      !Number.isInteger(o.samplingPeriodMs) ||
      o.samplingPeriodMs <= 0 || 
      o.samplingPeriodMs > GESTURE_CONSTRAINTS.SAMPLING_PERIOD_MAX_MS) return false;
  
  // Validate min <= mean <= max
  const { min, max, mean } = o.summary;
  for (let i = 0; i < 7; i++) {
    if (!(min[i] <= mean[i] && mean[i] <= max[i])) return false;
  }
  
  // Validate value ranges
  for (const sample of o.samples) {
    for (let i = 0; i < GESTURE_DIMENSIONS; i++) {
      if (!isValueInDimensionRange(sample[i], i)) return false;
    }
  }

  for (const values of [min, max, mean]) {
    for (let i = 0; i < GESTURE_DIMENSIONS; i++) {
      if (!isValueInDimensionRange(values[i], i)) return false;
    }
  }
  
  return true;
}

export function isGestureMetadata(obj: unknown): obj is GestureMetadata {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  
  if (typeof o.id !== 'number' || 
      o.id < GESTURE_CONSTRAINTS.GESTURE_ID_MIN || 
      o.id > GESTURE_CONSTRAINTS.GESTURE_ID_MAX ||
      !Number.isInteger(o.id)) return false;
  
  if (typeof o.name !== 'string') return false;
  const nameCodePoints = Array.from(o.name).length;
  if (nameCodePoints < GESTURE_CONSTRAINTS.NAME_MIN_LENGTH || 
      nameCodePoints > GESTURE_CONSTRAINTS.NAME_MAX_LENGTH) return false;
  // Check for control characters
  if (/[\u0000-\u001F\u007F]/.test(o.name)) return false;
  
  if (typeof o.audioTrack !== 'number' ||
      o.audioTrack < GESTURE_CONSTRAINTS.AUDIO_TRACK_MIN ||
      o.audioTrack > GESTURE_CONSTRAINTS.AUDIO_TRACK_MAX ||
      !Number.isInteger(o.audioTrack)) return false;
  
  return true;
}

export function isGesture(obj: unknown): obj is Gesture {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  
  if (!isGestureMetadata(o)) return false;
  if (!isGestureData(o.data)) return false;
  
  return true;
}

// ============================================================================
// Validation Functions with Detailed Errors
// ============================================================================

export function validateGestureData(data: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Gesture data must be an object');
    return { valid: false, errors };
  }
  
  const o = data as Record<string, unknown>;

  for (const field of INCOMPATIBLE_GESTURE_DATA_FIELDS) {
    if (field in o) {
      errors.push(`${field} is incompatible with GestureData version 1`);
    }
  }
  
  // version
  if (o.version !== GESTURE_DATA_VERSION) {
    errors.push(`version must be ${GESTURE_DATA_VERSION}, got ${o.version}`);
  }
  
  // dimensions
  if (o.dimensions !== GESTURE_DIMENSIONS) {
    errors.push(`dimensions must be ${GESTURE_DIMENSIONS}, got ${o.dimensions}`);
  }
  
  // dimensionOrder
  if (!Array.isArray(o.dimensionOrder) || o.dimensionOrder.length !== 7) {
    errors.push('dimensionOrder must be an array of 7 strings');
  } else if (!o.dimensionOrder.every((v, i) => v === GESTURE_DIMENSION_ORDER[i])) {
    errors.push('dimensionOrder must match fixed order: flex1,flex2,flex3,flex4,flex5,mpuX,mpuY');
  }
  
  // units
  if (!o.units || typeof o.units !== 'object') {
    errors.push('units must be an object with flex and mpu properties');
  } else {
    const units = o.units as GestureUnits;
    if (units.flex !== 'adc12') errors.push('units.flex must be "adc12"');
    if (units.mpu !== 'degrees') errors.push('units.mpu must be "degrees"');
  }
  
  // samples
  if (!Array.isArray(o.samples)) {
    errors.push('samples must be an array');
  } else {
    if (o.samples.length === 0) {
      errors.push('samples array cannot be empty');
    }
    o.samples.forEach((sample, idx) => {
      if (!Array.isArray(sample) || sample.length !== 7) {
        errors.push(`samples[${idx}] must be an array of 7 numbers`);
      } else {
        sample.forEach((val, dimIdx) => {
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            errors.push(`samples[${idx}][${dimIdx}] must be a finite number`);
          }
        });
      }
    });
  }
  
  // summary
  if (!o.summary || typeof o.summary !== 'object') {
    errors.push('summary must be an object with min, max, mean arrays');
  } else if (!isGestureSummary(o.summary)) {
    errors.push('summary must have min, max, mean arrays of 7 numbers each, with min <= mean <= max');
  }
  
  // sampleCount
  const samplesValue = o.samples as unknown;
  if (typeof o.sampleCount !== 'number' || !Number.isInteger(o.sampleCount) || o.sampleCount < 1) {
    errors.push('sampleCount must be an integer >= 1');
  } else if (Array.isArray(samplesValue) && samplesValue.length !== o.sampleCount) {
    errors.push('sampleCount must match samples.length');
  }
  
  // captureDurationMs
  if (typeof o.captureDurationMs !== 'number' || 
      !Number.isInteger(o.captureDurationMs) ||
      o.captureDurationMs <= 0 || 
      o.captureDurationMs > GESTURE_CONSTRAINTS.CAPTURE_DURATION_MAX_MS) {
    errors.push(`captureDurationMs must be an integer between 1 and ${GESTURE_CONSTRAINTS.CAPTURE_DURATION_MAX_MS}`);
  }
  
  // samplingPeriodMs
  if (typeof o.samplingPeriodMs !== 'number' || 
      !Number.isInteger(o.samplingPeriodMs) ||
      o.samplingPeriodMs <= 0 || 
      o.samplingPeriodMs > GESTURE_CONSTRAINTS.SAMPLING_PERIOD_MAX_MS) {
    errors.push(`samplingPeriodMs must be an integer between 1 and ${GESTURE_CONSTRAINTS.SAMPLING_PERIOD_MAX_MS}`);
  }
  
  // Range validations for samples
  const samplesArr = o.samples as unknown;
  if (Array.isArray(samplesArr)) {
    (samplesArr as unknown[]).forEach((sample, idx) => {
      if (Array.isArray(sample)) {
        sample.forEach((val, dimIdx) => {
          if (typeof val !== 'number' || !Number.isFinite(val)) return;
          if (dimIdx < 5) { // flex
            if (val < GESTURE_CONSTRAINTS.FLEX_VALUE_MIN || val > GESTURE_CONSTRAINTS.FLEX_VALUE_MAX) {
              errors.push(`samples[${idx}][${dimIdx}] (flex) = ${val} out of range [0, 4095]`);
            }
          } else { // MPU
            if (val < GESTURE_CONSTRAINTS.MPU_VALUE_MIN || val > GESTURE_CONSTRAINTS.MPU_VALUE_MAX) {
              errors.push(`samples[${idx}][${dimIdx}] (MPU) = ${val} out of range [-180, 180]`);
            }
          }
        });
      }
    });
  }
  
  // Check min <= mean <= max
  if (o.summary && isGestureSummary(o.summary)) {
    const { min, max, mean } = o.summary as GestureSummary;
    for (let i = 0; i < 7; i++) {
      if (!(min[i] <= mean[i] && mean[i] <= max[i])) {
        errors.push(`summary: min[${i}] <= mean[${i}] <= max[${i}] violated (${min[i]} <= ${mean[i]} <= ${max[i]})`);
      }

      for (const [key, values] of [['min', min], ['max', max], ['mean', mean]] as const) {
        if (!isValueInDimensionRange(values[i], i)) {
          const range = i < 5 ? '[0, 4095]' : '[-180, 180]';
          errors.push(`summary.${key}[${i}] = ${values[i]} out of range ${range}`);
        }
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateGestureMetadata(metadata: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!metadata || typeof metadata !== 'object') {
    errors.push('Gesture metadata must be an object');
    return { valid: false, errors };
  }
  
  const o = metadata as Record<string, unknown>;
  
  // id
  if (typeof o.id !== 'number' || 
      o.id < GESTURE_CONSTRAINTS.GESTURE_ID_MIN || 
      o.id > GESTURE_CONSTRAINTS.GESTURE_ID_MAX ||
      !Number.isInteger(o.id)) {
    errors.push(`id must be an integer between ${GESTURE_CONSTRAINTS.GESTURE_ID_MIN} and ${GESTURE_CONSTRAINTS.GESTURE_ID_MAX}`);
  }
  
  // name
  if (typeof o.name !== 'string') {
    errors.push('name must be a string');
  } else {
    const codePointLength = Array.from(o.name).length;
    if (codePointLength < GESTURE_CONSTRAINTS.NAME_MIN_LENGTH) {
      errors.push(`name must be at least ${GESTURE_CONSTRAINTS.NAME_MIN_LENGTH} character`);
    }
    if (codePointLength > GESTURE_CONSTRAINTS.NAME_MAX_LENGTH) {
      errors.push(`name must be at most ${GESTURE_CONSTRAINTS.NAME_MAX_LENGTH} Unicode code points`);
    }
    if (/[\u0000-\u001F\u007F]/.test(o.name)) {
      errors.push('name must not contain control characters');
    }
  }
  
  // audioTrack
  if (typeof o.audioTrack !== 'number' ||
      o.audioTrack < GESTURE_CONSTRAINTS.AUDIO_TRACK_MIN ||
      o.audioTrack > GESTURE_CONSTRAINTS.AUDIO_TRACK_MAX ||
      !Number.isInteger(o.audioTrack)) {
    errors.push(`audioTrack must be an integer between ${GESTURE_CONSTRAINTS.AUDIO_TRACK_MIN} and ${GESTURE_CONSTRAINTS.AUDIO_TRACK_MAX}`);
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateGesture(gesture: unknown): ValidationResult {
  const errors: string[] = [];
  
  if (!gesture || typeof gesture !== 'object') {
    errors.push('Gesture must be an object');
    return { valid: false, errors };
  }
  
  const o = gesture as Record<string, unknown>;
  
  // Validate metadata
  const metaResult = validateGestureMetadata({
    id: o.id,
    name: o.name,
    audioTrack: o.audioTrack,
  });
  errors.push(...metaResult.errors);
  
  // Validate data
  if (!o.data) {
    errors.push('Gesture must have a data property');
  } else {
    const dataResult = validateGestureData(o.data);
    errors.push(...dataResult.errors);
  }
  
  return { valid: errors.length === 0, errors };
}
