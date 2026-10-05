import {
  CapturePhase,
  validateCaptureProgressData,
  validateGestureData,
} from '@mitten/contracts';

import { createCaptureProgressEvents, generateGestureData } from './capture';

describe('capture simulation', () => {
  test('generates deterministic GestureData accepted by contracts', () => {
    const first = generateGestureData();
    const second = generateGestureData();

    expect(second).toEqual(first);
    expect(validateGestureData(first)).toEqual({ valid: true, errors: [] });
  });

  test('emits official capture phases in order with monotonic progress', () => {
    const events = createCaptureProgressEvents('capture-1');

    expect(events.map(event => event.data.phase)).toEqual([
      CapturePhase.PREPARING,
      CapturePhase.RECORDING,
      CapturePhase.PROCESSING,
    ]);
    expect(events.map(event => event.data.progress)).toEqual([0, 50, 100]);
    expect(events.every(event => validateCaptureProgressData(event.data).valid)).toBe(true);
  });
});
