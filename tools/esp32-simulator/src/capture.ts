import {
  CapturePhase,
  GESTURE_DATA_VERSION,
  GESTURE_DIMENSION_ORDER,
  GESTURE_DIMENSIONS,
  GESTURE_UNITS,
  GestureData,
  GestureSample,
  createCaptureProgressEvent,
  type CaptureProgressEvent,
} from '@mitten/contracts';

const DEFAULT_SEED = 42;
const SAMPLE_COUNT = 15;
const CAPTURE_DURATION_MS = 1500;
const SAMPLING_PERIOD_MS = 100;

class SeededGenerator {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0;
  }

  integer(min: number, max: number): number {
    this.value = (Math.imul(this.value, 1664525) + 1013904223) >>> 0;
    return min + (this.value % (max - min + 1));
  }
}

function generateSample(generator: SeededGenerator): GestureSample {
  return [
    generator.integer(0, 4095),
    generator.integer(0, 4095),
    generator.integer(0, 4095),
    generator.integer(0, 4095),
    generator.integer(0, 4095),
    generator.integer(-180, 180),
    generator.integer(-180, 180),
  ] as const;
}

function toSevenNumbers(values: number[]): [number, number, number, number, number, number, number] {
  if (values.length !== GESTURE_DIMENSIONS) {
    throw new Error(`Expected ${GESTURE_DIMENSIONS} gesture dimensions`);
  }
  return values as [number, number, number, number, number, number, number];
}

export function generateGestureData(seed = DEFAULT_SEED): GestureData {
  const generator = new SeededGenerator(seed);
  const samples = Array.from({ length: SAMPLE_COUNT }, () => generateSample(generator));
  const minimums = Array.from({ length: GESTURE_DIMENSIONS }, (_, dimension) =>
    Math.min(...samples.map(sample => sample[dimension])),
  );
  const maximums = Array.from({ length: GESTURE_DIMENSIONS }, (_, dimension) =>
    Math.max(...samples.map(sample => sample[dimension])),
  );
  const means = Array.from({ length: GESTURE_DIMENSIONS }, (_, dimension) =>
    samples.reduce((sum, sample) => sum + sample[dimension], 0) / samples.length,
  );

  return {
    version: GESTURE_DATA_VERSION,
    dimensions: GESTURE_DIMENSIONS,
    dimensionOrder: GESTURE_DIMENSION_ORDER,
    units: GESTURE_UNITS,
    samples,
    summary: {
      min: toSevenNumbers(minimums),
      max: toSevenNumbers(maximums),
      mean: toSevenNumbers(means),
    },
    sampleCount: samples.length,
    captureDurationMs: CAPTURE_DURATION_MS,
    samplingPeriodMs: SAMPLING_PERIOD_MS,
  };
}

export function createCaptureProgressEvents(requestId: string): CaptureProgressEvent[] {
  return [
    createCaptureProgressEvent({ requestId, phase: CapturePhase.PREPARING, progress: 0 }),
    createCaptureProgressEvent({ requestId, phase: CapturePhase.RECORDING, progress: 50 }),
    createCaptureProgressEvent({ requestId, phase: CapturePhase.PROCESSING, progress: 100 }),
  ];
}
