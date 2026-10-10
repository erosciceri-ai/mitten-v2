import type { ProtocolEnvelope } from '@mitten/contracts';
import { SimulatorDispatcher } from '@mitten/esp32-simulator';
import type { DeviceTransport, DeviceTransportHandlers } from './DeviceTransport';
import type { ConnectionState } from './SerialTransport';

export interface DemoDeviceControls {
  restart(): Promise<void>;
  recognize(gestureId?: number): Promise<boolean>;
}

export class DemoTransport implements DeviceTransport, DemoDeviceControls {
  private state: ConnectionState = 'closed';
  private maxMessageBytes = 8192;
  private readonly dispatcher: SimulatorDispatcher;

  constructor(private readonly handlers: DeviceTransportHandlers) {
    this.dispatcher = new SimulatorDispatcher(
      envelope => queueMicrotask(() => this.handlers.onData(envelope)),
      { captureDelayMs: 35 },
    );
  }

  getState(): ConnectionState { return this.state; }

  async connect(): Promise<void> {
    if (this.state !== 'closed') throw new Error(`Cannot connect: demo device is ${this.state}`);
    this.setState('opening');
    this.dispatcher.startup();
    this.setState('open');
  }

  async disconnect(): Promise<void> {
    if (this.state === 'closed') return;
    this.setState('closing');
    this.setState('closed');
  }

  async send(envelope: ProtocolEnvelope): Promise<void> {
    if (this.state !== 'open') {
      const error = new Error('Demo device is not connected');
      this.handlers.onError(error);
      throw error;
    }
    const encodedBytes = new TextEncoder().encode(`${JSON.stringify(envelope)}\n`).byteLength;
    if (encodedBytes > this.maxMessageBytes) {
      const error = new Error(`Message exceeds demo device limit (${this.maxMessageBytes} bytes)`);
      this.handlers.onError(error);
      throw error;
    }
    try {
      await this.dispatcher.dispatch(envelope);
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.handlers.onError(error);
      throw error;
    }
  }

  updateMaxMessageBytes(maxMessageBytes: number): void {
    if (Number.isSafeInteger(maxMessageBytes) && maxMessageBytes > 0) this.maxMessageBytes = maxMessageBytes;
  }

  async restart(): Promise<void> {
    if (this.state !== 'open' && this.state !== 'closed') throw new Error('Demo device is busy');
    this.dispatcher.restart();
  }

  async recognize(gestureId?: number): Promise<boolean> {
    if (this.state !== 'open') throw new Error('Demo device is not connected');
    return this.dispatcher.recognize(gestureId);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.handlers.onStateChange(state);
  }
}
