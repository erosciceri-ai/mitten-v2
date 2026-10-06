import type { ProtocolEnvelope, ParseResult, ParseError } from '@mitten/contracts';
import { NdjsonParser, serializeFrame } from '@mitten/contracts';

export type ConnectionState = 'closed' | 'opening' | 'open' | 'closing' | 'error';

export interface SerialTransportOptions {
  baudRate?: number;
  maxMessageBytes?: number;
  onData?: (envelope: ProtocolEnvelope) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: ConnectionState) => void;
}

export class SerialTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private parser: NdjsonParser;
  private readLoopPromise: Promise<void> | null = null;
  private state: ConnectionState = 'closed';
  private readonly options: Required<SerialTransportOptions>;
  private isReading = false;

  constructor(options: SerialTransportOptions = {}) {
    this.options = {
      baudRate: options.baudRate ?? 115200,
      maxMessageBytes: options.maxMessageBytes ?? 8192,
      onData: options.onData ?? (() => {}),
      onError: options.onError ?? (() => {}),
      onStateChange: options.onStateChange ?? (() => {}),
    };
    this.parser = new NdjsonParser({
      maxMessageBytes: this.options.maxMessageBytes,
    });
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange(newState);
    }
  }

  async connect(): Promise<void> {
    if (this.state !== 'closed') {
      throw new Error(`Cannot connect: port is ${this.state}`);
    }

    if (!('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this browser');
    }

    try {
      this.setState('opening');

      // Request port from user
      const port = await (navigator as any).serial.requestPort({});
      
      if (!port) {
        throw new Error('No port selected');
      }

      this.port = port;

      // Open the port
      await port.open({ baudRate: this.options.baudRate });

      // Create reader and writer
      this.reader = port.readable!.getReader();
      this.writer = port.writable!.getWriter();

      this.setState('open');

      // Start reading
      this.startReadLoop();

      // Listen for port disconnect
      port.addEventListener('disconnect', () => {
        this.handleDisconnect();
      });

    } catch (error) {
      this.setState('error');
      this.cleanup();
      throw error;
    }
  }

  private startReadLoop(): void {
    if (!this.reader || this.isReading) return;
    
    this.isReading = true;
    this.readLoopPromise = this.readLoop();
  }

  private async readLoop(): Promise<void> {
    try {
      while (this.reader && this.state === 'open') {
        const { done, value } = await this.reader.read();
        
        if (done) {
          // Stream closed
          break;
        }

        if (value && value.length > 0) {
          const result: ParseResult = this.parser.push(value);
          
          // Handle parsed frames
          for (const frame of result.frames) {
            this.options.onData(frame);
          }

          // Handle parse errors
          for (const error of result.errors) {
            this.handleParseError(error);
          }
        }
      }
    } catch (error) {
      if (this.state === 'open') {
        this.handleError(error as Error);
      }
    } finally {
      this.isReading = false;
      if (this.state === 'open') {
        this.handleDisconnect();
      }
    }
  }

  private handleParseError(error: ParseError): void {
    const errorMessage = `Serial parse error: ${error.message}`;
    console.error(errorMessage, error);
    this.options.onError(new Error(errorMessage));
  }

  private handleError(error: Error): void {
    console.error('Serial transport error:', error);
    this.options.onError(error);
    this.setState('error');
    this.cleanup();
  }

  private handleDisconnect(): void {
    if (this.state !== 'closed' && this.state !== 'closing') {
      console.log('Serial port disconnected');
      this.setState('error');
      this.options.onError(new Error('Serial port disconnected'));
      this.cleanup();
    }
  }

  async send(envelope: ProtocolEnvelope): Promise<void> {
    if (this.state !== 'open' || !this.writer) {
      throw new Error('Port is not open');
    }

    const frame = serializeFrame(envelope);
    const data = new TextEncoder().encode(frame);

    try {
      await this.writer.write(data);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }

    this.setState('closing');
    this.cleanup();
    this.setState('closed');
  }

  private cleanup(): void {
    // Cancel read loop
    if (this.reader) {
      try {
        this.reader.cancel();
      } catch {
        // Ignore cancellation errors
      }
      this.reader = null;
    }

    // Close writer
    if (this.writer) {
      try {
        this.writer.close();
      } catch {
        // Ignore close errors
      }
      this.writer = null;
    }

    // Close port
    if (this.port) {
      try {
        this.port.close();
      } catch {
        // Ignore close errors
      }
      this.port = null;
    }

    // Reset parser
    this.parser.reset();
    this.readLoopPromise = null;
  }

  updateMaxMessageBytes(maxMessageBytes: number): void {
    this.parser = new NdjsonParser({ maxMessageBytes });
  }

  async getPorts(): Promise<SerialPort[]> {
    if (!('serial' in navigator)) {
      return [];
    }
    return (navigator as any).serial.getPorts();
  }

  static isSupported(): boolean {
    return 'serial' in navigator;
  }
}

// Re-export types for convenience
export type { ProtocolEnvelope, ParseResult, ParseError };