import type { GestureData } from '@mitten/contracts';
export const gestureData: GestureData = {
  version: 1, dimensions: 7, dimensionOrder: ['flex1','flex2','flex3','flex4','flex5','mpuX','mpuY'],
  units: { flex: 'adc12', mpu: 'degrees' },
  samples: [[100,100,100,100,100,0,0],[100,100,100,100,100,0,0],[100,100,100,100,100,0,0]] as const,
  summary: { min:[100,100,100,100,100,0,0], max:[100,100,100,100,100,0,0], mean:[100,100,100,100,100,0,0] },
  sampleCount: 3, captureDurationMs: 100, samplingPeriodMs: 50,
};
