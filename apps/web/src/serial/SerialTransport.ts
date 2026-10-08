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
  private cleanupPromise: Promise<void> | null = null;
  private incompleteTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onDisconnect = () => this.handleDisconnect();

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
    if (this.cleanupPromise) await this.cleanupPromise;
    if (this.state === 'error') this.setState('closed');
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
      port.addEventListener('disconnect', this.onDisconnect);

    } catch (error) {
      this.setState('error');
      await this.cleanup();
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
          let start = 0;
          for (let i = 0; i < value.length; i++) {
            if (value[i] === 10) { this.receivePart(value.subarray(start, i + 1)); start = i + 1; }
          }
          if (start < value.length) this.receivePart(value.subarray(start));
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

  private receivePart(part: Uint8Array): void {
    const result = this.parser.push(part);
    if (this.incompleteTimer) clearTimeout(this.incompleteTimer);
    this.incompleteTimer = null;
    for (const error of result.errors) this.handleParseError(error);
    for (const frame of result.frames) this.options.onData(frame);
    if (result.remaining.length) this.incompleteTimer = setTimeout(() => {
      const error = this.parser.discardIncomplete();
      if (error) this.handleParseError(error);
    }, 5000);
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
    void this.cleanup();
  }

  private handleDisconnect(): void {
    if (this.state !== 'closed' && this.state !== 'closing') {
      console.log('Serial port disconnected');
      this.setState('error');
      this.options.onError(new Error('Serial port disconnected'));
      void this.cleanup();
    }
  }

  async send(envelope: ProtocolEnvelope): Promise<void> {
    if (this.state !== 'open' || !this.writer) {
      throw new Error('Port is not open');
    }

    const frame = serializeFrame(envelope);
    const data = new TextEncoder().encode(frame);
    if (data.byteLength - 1 > this.options.maxMessageBytes) throw new Error('MESSAGE_TOO_LARGE');

    try {
      await this.writer.write(data);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'closed' && !this.cleanupPromise) return;
    this.setState('closing');
    await this.cleanup();
    this.setState('closed');
  }

  private cleanup(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = (async () => {
      if (this.incompleteTimer) clearTimeout(this.incompleteTimer);
      this.incompleteTimer = null;
      const reader = this.reader, writer = this.writer, port = this.port;
      this.reader = null; this.writer = null; this.port = null;
      if (port) port.removeEventListener('disconnect', this.onDisconnect);
      const errors: unknown[] = [];
      if (reader) {
        try { await reader.cancel(); } catch (error) { errors.push(error); }
        if (this.readLoopPromise) await this.readLoopPromise;
        try { reader.releaseLock(); } catch (error) { errors.push(error); }
      }
      if (writer) {
        try { await writer.close(); } catch (error) { errors.push(error); }
        try { writer.releaseLock(); } catch (error) { errors.push(error); }
      }
      if (port) { try { await port.close(); } catch (error) { errors.push(error); } }
      this.parser.reset(); this.readLoopPromise = null; this.isReading = false;
      if (errors.length) this.options.onError(new Error(`Serial cleanup: ${errors.map(String).join('; ')}`));
    })().finally(() => { this.cleanupPromise = null; });
    return this.cleanupPromise;
  }

  updateMaxMessageBytes(maxMessageBytes: number): void {
    if (maxMessageBytes === this.options.maxMessageBytes) return;
    this.parser = new NdjsonParser({ maxMessageBytes });
    this.options.maxMessageBytes = maxMessageBytes;
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