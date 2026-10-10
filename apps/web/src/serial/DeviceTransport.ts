import type { ProtocolEnvelope } from '@mitten/contracts';
import type { ConnectionState } from './SerialTransport';

export interface DeviceTransportHandlers {
  onData: (envelope: ProtocolEnvelope) => void;
  onError: (error: Error) => void;
  onStateChange: (state: ConnectionState) => void;
}

export interface DeviceTransport {
  getState(): ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(envelope: ProtocolEnvelope): Promise<void>;
  updateMaxMessageBytes(maxMessageBytes: number): void;
}

export type DeviceTransportFactory = (handlers: DeviceTransportHandlers) => DeviceTransport;
