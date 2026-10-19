import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SerialTransport } from './SerialTransport';
import { PROTOCOL_VERSION } from '@mitten/contracts';

const createMockPort = () => {
  let readResolver: (value: { done: boolean; value?: Uint8Array }) => void;
  const readPromise = new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
    readResolver = resolve;
  });

  // Create the writer mock once
  const writerMock = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };

  const readable = {
    getReader: vi.fn(() => ({
      read: vi.fn(() => readPromise),
      cancel: vi.fn(() => { readResolver({ done: true }); return Promise.resolve(); }),
      releaseLock: vi.fn(),
    })),
  };

  const writable = {
    getWriter: vi.fn(() => writerMock),
  };

  return {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    readable,
    writable,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    _resolveRead: readResolver!,
    _writerMock: writerMock,
  };
};

describe('SerialTransport', () => {
  let transport: SerialTransport;
  let mockPort: ReturnType<typeof createMockPort>;
  const onData = vi.fn();
  const onError = vi.fn();
  const onStateChange = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockPort = createMockPort();
    (navigator as any).serial = {
      requestPort: vi.fn().mockResolvedValue(mockPort),
      getPorts: vi.fn().mockResolvedValue([]),
    };
    transport = new SerialTransport({ onData, onError, onStateChange, baudRate: 115200, maxMessageBytes: 8192 });
  });

  afterEach(async () => { await transport.disconnect(); });

  describe('constructor', () => {
    it('should initialize with default options', () => { expect(new SerialTransport().getState()).toBe('closed'); });
    it('should open the port at the custom baud rate', async () => {
      transport = new SerialTransport({ baudRate: 9600 });
      await transport.connect();
      expect(mockPort.open).toHaveBeenCalledExactlyOnceWith({ baudRate: 9600 });
      expect(transport.getState()).toBe('open');
    });
  });

  describe('connect', () => {
    it('should connect and transition through states', async () => {
      await transport.connect();
      expect(mockPort.open).toHaveBeenCalledExactlyOnceWith({ baudRate: 115200 });
      expect(onStateChange).toHaveBeenCalledWith('opening');
      expect(onStateChange).toHaveBeenCalledWith('open');
      expect(transport.getState()).toBe('open');
    });

    it('should throw if already connected', async () => {
      await transport.connect();
      await expect(transport.connect()).rejects.toThrow('Cannot connect: port is open');
    });

    it('should throw if Web Serial API not supported', async () => {
      delete (navigator as any).serial;
      const t = new SerialTransport({ onError });
      await expect(t.connect()).rejects.toThrow('Web Serial API is not supported');
    });

    it('should handle port selection cancelled', async () => {
      (navigator as any).serial.requestPort.mockResolvedValueOnce(null);
      await expect(transport.connect()).rejects.toThrow('No port selected');
      expect(onStateChange).toHaveBeenCalledWith('error');
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      await transport.connect();
      vi.clearAllMocks();
    });

    it('should serialize and send envelope', async () => {
      const envelope = { v: PROTOCOL_VERSION, type: 'request' as const, id: 'req-1', command: 'device.handshake', payload: { client: 'test' } };
      await transport.send(envelope);
      expect(mockPort._writerMock.write).toHaveBeenCalled();
    });

    it('should throw if not connected', async () => {
      await transport.disconnect();
      await expect(transport.send({ v: PROTOCOL_VERSION, type: 'request', id: 'req-1', command: 'test', payload: {} })).rejects.toThrow('Port is not open');
    });
  });

  describe('disconnect', () => {
    it('should cleanup and transition to closed', async () => {
      await transport.connect();
      vi.clearAllMocks();
      await transport.disconnect();
      expect(onStateChange).toHaveBeenCalledWith('closing');
      expect(onStateChange).toHaveBeenCalledWith('closed');
      expect(transport.getState()).toBe('closed');
    });

    it('should be idempotent', async () => { await transport.disconnect(); await transport.disconnect(); expect(transport.getState()).toBe('closed'); });
  });

  describe('static isSupported', () => {
    it('should return true when Web Serial API exists', () => { expect(SerialTransport.isSupported()).toBe(true); });
    it('should return false when Web Serial API missing', () => { delete (navigator as any).serial; expect(SerialTransport.isSupported()).toBe(false); });
  });

  describe('getPorts', () => {
    it('should return available ports', async () => {
      const ports = [createMockPort(), createMockPort()];
      (navigator as any).serial.getPorts.mockResolvedValue(ports);
      expect(await transport.getPorts()).toHaveLength(2);
    });

    it('should return empty array when API not supported', async () => { delete (navigator as any).serial; expect(await transport.getPorts()).toEqual([]); });
  });
});
