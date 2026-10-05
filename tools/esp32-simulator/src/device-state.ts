import { FirmwareState } from '@mitten/contracts';

type StateListener = (state: FirmwareState) => void;

export class DeviceStateMachine {
  private state = FirmwareState.INITIALIZING;

  constructor(private readonly onStateChange: StateListener = () => undefined) {}

  startup(): void {
    this.emitCurrentState();
    this.transitionTo(FirmwareState.CALIBRATING);
    this.transitionTo(FirmwareState.IDLE);
  }

  startCapture(): boolean {
    if (this.state !== FirmwareState.IDLE) return false;
    this.transitionTo(FirmwareState.CAPTURING);
    return true;
  }

  finishCapture(): boolean {
    if (this.state !== FirmwareState.CAPTURING) return false;
    this.transitionTo(FirmwareState.IDLE);
    return true;
  }

  startSync(): boolean {
    if (this.state !== FirmwareState.IDLE) return false;
    this.transitionTo(FirmwareState.SYNCING);
    return true;
  }

  finishSync(): boolean {
    if (this.state !== FirmwareState.SYNCING) return false;
    this.transitionTo(FirmwareState.IDLE);
    return true;
  }

  get current(): FirmwareState {
    return this.state;
  }

  private transitionTo(state: FirmwareState): void {
    this.state = state;
    this.emitCurrentState();
  }

  private emitCurrentState(): void {
    this.onStateChange(this.state);
  }
}
