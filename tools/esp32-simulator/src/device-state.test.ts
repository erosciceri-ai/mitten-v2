import { FirmwareState } from '@mitten/contracts';

import { DeviceStateMachine } from './device-state';

describe('DeviceStateMachine', () => {
  test('reports INITIALIZING → CALIBRATING → IDLE during startup', () => {
    const states: FirmwareState[] = [];
    const machine = new DeviceStateMachine(state => states.push(state));

    machine.startup();

    expect(states).toEqual([
      FirmwareState.INITIALIZING,
      FirmwareState.CALIBRATING,
      FirmwareState.IDLE,
    ]);
    expect(machine.current).toBe(FirmwareState.IDLE);
  });

  test('changes IDLE → CAPTURING → IDLE for a capture', () => {
    const states: FirmwareState[] = [];
    const machine = new DeviceStateMachine(state => states.push(state));
    machine.startup();
    states.length = 0;

    expect(machine.startCapture()).toBe(true);
    expect(machine.finishCapture()).toBe(true);

    expect(states).toEqual([FirmwareState.CAPTURING, FirmwareState.IDLE]);
  });
});
