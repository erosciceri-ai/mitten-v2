import {
  PROTOCOL_VERSION,
  parseFrames,
  serializeFrame,
  serializeFrames,
  validateEnvelope,
  validateProtocolV2Message,
  createRequest,
  createResponse,
  createErrorResponse,
  createEvent,
  createHandshakeRequest,
  createHandshakeResponse,
  createStatusRequest,
  createStatusResponse,
  createCaptureStartRequest,
  createCaptureStartResponse,
  createCaptureProgressEvent,
  createDeviceStateEvent,
  createCaptureCompletedEvent,
  createCaptureFailedEvent,
  createRecognitionDetectedEvent,
  createSyncBeginRequest,
  createSyncBeginResponse,
  createSyncGestureRequest,
  createSyncGestureResponse,
  createSyncCommitRequest,
  createSyncCommitResponse,
  createSyncAbortRequest,
  createSyncAbortResponse,
  createSyncFailedEvent,
  createProtocolErrorEvent,
  validateHandshakeRequestPayload,
  validateHandshakeResponseResult,
  validateResponseForCommand,
  FirmwareState,
  ProtocolEnvelope,
  RequestEnvelope,
  ResponseEnvelope,
  EventEnvelope,
  ProtocolError,
  ProtocolErrorCode,
  isValidFirmwareState,
  CapturePhase,
  CaptureProgressData,
  BOOTSTRAP_MAX_MESSAGE_BYTES,
} from './index';

describe('protocol', () => {
  describe('constants', () => {
    it('should have PROTOCOL_VERSION = 2', () => {
      expect(PROTOCOL_VERSION).toBe(2);
    });
  });

  describe('serializeFrame', () => {
    it('should serialize request envelope with v=2 and LF', () => {
      const req = {
        v: 2,
        type: 'request' as const,
        id: 'req-1',
        command: 'device.status',
        payload: {},
      };
      const serialized = serializeFrame(req);
      expect(serialized).toBe(JSON.stringify(req) + '\n');
    });

    it('should serialize response envelope', () => {
      const res = {
        v: 2,
        type: 'response' as const,
        id: 'req-1',
        ok: true,
        result: { state: 'IDLE' },
      };
      const serialized = serializeFrame(res as ResponseEnvelope);
      expect(serialized).toBe(JSON.stringify(res) + '\n');
    });

    it('should serialize event envelope', () => {
      const evt = {
        v: 2,
        type: 'event' as const,
        event: 'device.state',
        data: { state: 'IDLE' },
      };
      const serialized = serializeFrame(evt);
      expect(serialized).toBe(JSON.stringify(evt) + '\n');
    });

    it('should serialize envelopes returned by typed protocol factories', () => {
      const status = createStatusResponse('status-1', {
        state: FirmwareState.IDLE,
        activeProfile: null,
        activeSync: null,
        error: null,
      });
      const state = createDeviceStateEvent({ state: FirmwareState.IDLE });

      expect(JSON.parse(serializeFrame(status))).toMatchObject({
        type: 'response',
        id: 'status-1',
      });
      expect(JSON.parse(serializeFrame(state))).toMatchObject({
        type: 'event',
        event: 'device.state',
      });
    });
  });

  describe('serializeFrames', () => {
    it('should serialize multiple frames', () => {
      const frames = [
        { v: 2, type: 'request' as const, id: 'req-1', command: 'device.status', payload: {} },
        { v: 2, type: 'response' as const, id: 'req-1', ok: true, result: {} },
      ];
      const serialized = serializeFrames(frames as readonly ProtocolEnvelope[]);
      expect(serialized).toBe(
        JSON.stringify(frames[0]) + '\n' + JSON.stringify(frames[1]) + '\n'
      );
    });
  });

  // Type guard to check if envelope has an id
  function hasId(envelope: ProtocolEnvelope): envelope is RequestEnvelope | ResponseEnvelope {
    return 'id' in envelope;
  }

  describe('parseFrames', () => {
    it('should parse a single valid frame', () => {
      const buffer = '{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].type).toBe('request');
      if (hasId(result.frames[0])) {
        expect(result.frames[0].id).toBe('req-1');
      }
      expect(result.remaining.length).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse multiple frames', () => {
      const buffer = '{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n{"v":2,"type":"response","id":"req-1","ok":true,"result":{}}\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(2);
      expect(result.frames[0].type).toBe('request');
      expect(result.frames[1].type).toBe('response');
    });

    it('should handle CRLF delimiters', () => {
      const buffer = '{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\r\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(1);
    });

    it('should handle mixed LF and CRLF', () => {
      const buffer = '{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n{"v":2,"type":"response","id":"req-1","ok":true,"result":{}}\r\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(2);
    });

    it('should handle fragmented reads', () => {
      const buffer1 = '{"v":2,"type":"request","id":"req-1","command":"device.status"';
      const result1 = parseFrames(new TextEncoder().encode(buffer1));
      expect(result1.frames).toHaveLength(0);
      expect(result1.remaining).toEqual(new TextEncoder().encode(buffer1));

      const buffer2 = new Uint8Array([...result1.remaining, ...new TextEncoder().encode(',"payload":{}}\n')]);
      const result2 = parseFrames(buffer2);
      expect(result2.frames).toHaveLength(1);
      if (hasId(result2.frames[0])) {
        expect(result2.frames[0].id).toBe('req-1');
      }
    });

    it('should handle multiple frames in one read', () => {
      const buffer = '{"v":2,"type":"request","id":"req-1","command":"a","payload":{}}\n{"v":2,"type":"request","id":"req-2","command":"b","payload":{}}\n{"v":2,"type":"request","id":"req-3","command":"c","payload":{}}\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(3);
    });

    it('should skip empty lines', () => {
      const buffer = '\n\n{"v":2,"type":"request","id":"req-1","command":"a","payload":{}}\n\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(1);
    });

    it('should handle invalid JSON', () => {
      const buffer = 'not valid json\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('INVALID_JSON');
    });

    it('should handle envelope with invalid type', () => {
      const buffer = '{"v":2,"type":"invalid","id":"req-1","command":"a","payload":{}}\n';
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('INVALID_MESSAGE');
    });

    it('should handle message too large', () => {
      const largePayload = 'x'.repeat(9000); // Exceeds BOOTSTRAP_MAX_MESSAGE_BYTES (8192)
      const buffer = `{"v":2,"type":"request","id":"req-1","command":"a","payload":{"data":"${largePayload}"}}\n`;
      const result = parseFrames(new TextEncoder().encode(buffer));
      expect(result.frames).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('MESSAGE_TOO_LARGE');
    });
  });

  describe('parseFramesWithLimit', () => {
    it('should respect the explicit maxMessageBytes limit', () => {
      const frame = new TextEncoder().encode(`{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{"data":"${'x'.repeat(100)}"}}\n`);
      const result = parseFrames(frame, { maxMessageBytes: 50 });
      expect(result.frames).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('MESSAGE_TOO_LARGE');
    });

    it('should accept the same frame with a sufficient explicit limit', () => {
      const buffer = '{"v":2,"type":"request","id":"req-1","command":"a","payload":{}}\n';
      const result = parseFrames(new TextEncoder().encode(buffer), { maxMessageBytes: 1000 });
      expect(result.frames).toHaveLength(1);
    });

    it('should use the bootstrap limit only when no explicit limit is provided', () => {
      const frame = new TextEncoder().encode(`{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{"data":"${'x'.repeat(BOOTSTRAP_MAX_MESSAGE_BYTES)}"}}\n`);
      expect(parseFrames(frame).errors[0].type).toBe('MESSAGE_TOO_LARGE');
      expect(parseFrames(frame, { maxMessageBytes: frame.length }).frames).toHaveLength(1);
    });

    it('should preserve a UTF-8 character split between chunks', async () => {
      const parser = new (await import('./protocol')).NdjsonParser();
      const frame = new TextEncoder().encode('{"v":2,"type":"event","event":"diagnostic.log","data":{"message":"señal"}}\n');
      const character = new TextEncoder().encode('ñ');

      const characterStart = frame.findIndex((value, index) => value === character[0] && frame[index + 1] === character[1]);

      const first = parser.push(frame.slice(0, characterStart + 1));
      const second = parser.push(frame.slice(characterStart + 1));

      expect(first.frames).toHaveLength(0);
      expect(first.errors).toHaveLength(0);
      expect(second.errors).toHaveLength(0);
      expect(second.frames).toHaveLength(1);
      expect((second.frames[0] as EventEnvelope).data.message).toBe('señal');
    });

    it('should reject invalid UTF-8', () => {
      const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d, 0x0a]);
      const result = parseFrames(invalidUtf8);

      expect(result.frames).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('INVALID_UTF8');
    });

    it('should retain bytes after LF for the next frame', () => {
      const firstFrame = new TextEncoder().encode('{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n');
      const residual = new TextEncoder().encode('{"v":2,"type":"request"');
      const result = parseFrames(new Uint8Array([...firstFrame, ...residual]));

      expect(result.frames).toHaveLength(1);
      expect(result.remaining).toEqual(residual);
    });

    it('should parse without a runtime Buffer global', () => {
      // Temporarily remove Buffer to test that parseFrames works without it
      const globalBuffer = (globalThis as any).Buffer;
      const previousBuffer = globalBuffer;

      try {
        (globalThis as any).Buffer = undefined;
        const result = parseFrames(new TextEncoder().encode('{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n'));
        expect(result.frames).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
      } finally {
        (globalThis as any).Buffer = previousBuffer;
      }
    });
  });

  describe('envelope validation', () => {
    it('should validate valid request envelope', () => {
      const req = {
        v: 2,
        type: 'request',
        id: 'req-1',
        command: 'device.status',
        payload: {},
      };
      const result = validateEnvelope(req);
      expect(result.valid).toBe(true);
    });

    it('should reject request with missing id', () => {
      const req = { v: 2, type: 'request', command: 'a', payload: {} };
      const result = validateEnvelope(req);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('id'))).toBe(true);
    });

    it('should reject request with invalid id format', () => {
      const req = { v: 2, type: 'request', id: 'invalid@id', command: 'a', payload: {} };
      const result = validateEnvelope(req);
      expect(result.valid).toBe(false);
    });

    it('should reject request with missing command', () => {
      const req = { v: 2, type: 'request', id: 'req-1', payload: {} };
      const result = validateEnvelope(req);
      expect(result.valid).toBe(false);
    });

    it('should reject request with non-object payload', () => {
      const req = { v: 2, type: 'request', id: 'req-1', command: 'a', payload: 'not an object' };
      const result = validateEnvelope(req);
      expect(result.valid).toBe(false);
    });

    it('should validate valid response envelope', () => {
      const res = { v: 2, type: 'response', id: 'req-1', ok: true, result: {} };
      const result = validateEnvelope(res);
      expect(result.valid).toBe(true);
    });

    it('should reject response with non-boolean ok', () => {
      const res = { v: 2, type: 'response', id: 'req-1', ok: 'yes', result: {} };
      const result = validateEnvelope(res);
      expect(result.valid).toBe(false);
    });

    it('should reject successful response without result', () => {
      const res = { v: 2, type: 'response', id: 'req-1', ok: true };
      const result = validateEnvelope(res);
      expect(result.valid).toBe(false);
    });

    it('should reject successful response with error field', () => {
      const res = { v: 2, type: 'response', id: 'req-1', ok: true, result: {}, error: { code: 'X', message: 'y' } };
      const result = validateEnvelope(res);
      expect(result.valid).toBe(false);
    });

    it('should reject error response without error object', () => {
      const res = { v: 2, type: 'response', id: 'req-1', ok: false };
      const result = validateEnvelope(res);
      expect(result.valid).toBe(false);
    });

    it('should reject error response with result field', () => {
      const res = { v: 2, type: 'response', id: 'req-1', ok: false, error: { code: 'X', message: 'y' }, result: {} };
      const result = validateEnvelope(res);
      expect(result.valid).toBe(false);
    });

    it('should validate valid event envelope', () => {
      const evt = { v: 2, type: 'event', event: 'device.state', data: { state: 'IDLE' } };
      const result = validateEnvelope(evt);
      expect(result.valid).toBe(true);
    });

    it('should reject event without event name', () => {
      const evt = { v: 2, type: 'event', data: {} };
      const result = validateEnvelope(evt);
      expect(result.valid).toBe(false);
    });

    it('should reject event without data object', () => {
      const evt = { v: 2, type: 'event', event: 'test', data: 'not an object' };
      const result = validateEnvelope(evt);
      expect(result.valid).toBe(false);
    });

    it('should reject envelope with invalid version (strict V2)', () => {
      const req = { v: 1, type: 'request', id: 'req-1', command: 'a', payload: {} };
      const result = validateProtocolV2Message(req);
      expect(result.valid).toBe(false);
    });

    it('should accept a future-version handshake response structurally during bootstrap', () => {
      const response = {
        v: 3,
        type: 'response',
        id: 'req-1',
        ok: true,
        result: { protocolVersion: 3 },
      };

      // validateEnvelope accepts any positive integer version during bootstrap
      expect(validateEnvelope(response).valid).toBe(true);
      // But validateProtocolV2Message enforces v = 2
      expect(validateProtocolV2Message(response).valid).toBe(false);
    });

    it('should reject envelope with unknown type', () => {
      const env = { v: 2, type: 'unknown', id: 'req-1', command: 'a', payload: {} };
      const result = validateEnvelope(env);
      expect(result.valid).toBe(false);
    });
  });

  describe('factory functions', () => {
    it('should create request', () => {
      const req = createRequest('req-1', 'device.status', {});
      expect(req.type).toBe('request');
      expect(req.id).toBe('req-1');
      expect(req.command).toBe('device.status');
      expect(req.v).toBe(2);
    });

    it('should throw on invalid request id', () => {
      expect(() => createRequest('invalid@id', 'device.status', {})).toThrow('Invalid request id');
    });

    it('should create response', () => {
      const res = createResponse('req-1', { state: 'IDLE' });
      expect(res.type).toBe('response');
      expect(res.ok).toBe(true);
      expect(res.result).toEqual({ state: 'IDLE' });
    });

    it('should create error response', () => {
      const res = createErrorResponse('req-1', 'INVALID_STATE', 'Command not allowed');
      expect(res.ok).toBe(false);
      // Type assertion needed because TypeScript doesn't narrow based on ok field
      const errorRes = res as ResponseEnvelope & { ok: false; error: { code: string; message: string } };
      expect(errorRes.error.code).toBe('INVALID_STATE');
      expect(errorRes.error.message).toBe('Command not allowed');
    });

    it('should create event', () => {
      const evt = createEvent('device.state', { state: 'IDLE' });
      expect(evt.type).toBe('event');
      expect(evt.event).toBe('device.state');
      expect(evt.data.state).toBe('IDLE');
    });

    it('should create handshake request', () => {
      const req = createHandshakeRequest('req-1');
      expect(req.command).toBe('device.handshake');
      expect(req.payload.client).toBe('MITTEN_WEB');
      expect(req.payload.supportedProtocolVersions).toEqual([2]);
    });

    it('should create handshake response', () => {
      const res = createHandshakeResponse('req-1', {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      });
      expect(res.ok).toBe(true);
      // Type assertion needed because TypeScript doesn't narrow based on ok field
      const successRes = res as unknown as ResponseEnvelope & { ok: true; result: Record<string, unknown>; device: string };
      expect(successRes.result.device).toBe('MITTEN');
      expect(successRes.result.protocolVersion).toBe(2);
    });

    it('should create status request', () => {
      const req = createStatusRequest('req-1');
      expect(req.command).toBe('device.status');
      expect(req.payload).toEqual({});
    });

    it('should create capture start request', () => {
      const req = createCaptureStartRequest('req-1');
      expect(req.command).toBe('capture.start');
    });

    it('should create capture progress event', () => {
      const evt = createCaptureProgressEvent({ requestId: 'req-1', phase: CapturePhase.RECORDING, progress: 50 });
      expect(evt.event).toBe('capture.progress');
      expect(evt.data.phase).toBe(CapturePhase.RECORDING);
      expect(evt.data.progress).toBe(50);
    });
  });

  describe('validation functions', () => {
    describe('validateHandshakeRequestPayload', () => {
      it('should validate correct payload', () => {
        const result = validateHandshakeRequestPayload({
          client: 'MITTEN_WEB',
          supportedProtocolVersions: [2],
        });
        expect(result.valid).toBe(true);
      });

      it('should reject missing client', () => {
        const result = validateHandshakeRequestPayload({ supportedProtocolVersions: [2] });
        expect(result.valid).toBe(false);
      });

      it('should reject empty supportedProtocolVersions', () => {
        const result = validateHandshakeRequestPayload({ client: 'MITTEN_WEB', supportedProtocolVersions: [] });
        expect(result.valid).toBe(false);
      });
    });

    describe('validateHandshakeResponseResult', () => {
      it('should validate correct response', () => {
        const result = validateHandshakeResponseResult({
          device: 'MITTEN',
          firmwareVersion: '2.0.0',
          protocolVersion: 2,
          state: FirmwareState.IDLE,
          capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
        });
        expect(result.valid).toBe(true);
      });

      it('should reject non-MITTEN device', () => {
        const result = validateHandshakeResponseResult({
          device: 'OTHER',
          firmwareVersion: '2.0.0',
          protocolVersion: 2,
          state: FirmwareState.IDLE,
          capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
        });
        expect(result.valid).toBe(false);
      });

      it('should reject invalid state', () => {
        const result = validateHandshakeResponseResult({
          device: 'MITTEN',
          firmwareVersion: '2.0.0',
          protocolVersion: 2,
          state: 'UNKNOWN',
          capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
        });
        expect(result.valid).toBe(false);
      });
    });

    describe('validateResponseForCommand', () => {
      it('validates device.status fields inside response.result', () => {
        const response = createStatusResponse('status-1', {
          state: FirmwareState.IDLE,
          activeProfile: null,
          activeSync: null,
          error: null,
        });

        expect(validateResponseForCommand('device.status', response)).toEqual({
          valid: true,
          errors: [],
        });
      });
    });
  });

  describe('frame serialization round-trip', () => {
    it('should serialize and parse back correctly', () => {
      const originalFrames = [
        createRequest('req-1', 'device.status', {}),
        createResponse('req-1', { state: 'IDLE' }),
        createEvent('device.state', { state: 'IDLE' }),
      ];

      const serialized = serializeFrames(originalFrames);
      const parsed = parseFrames(new TextEncoder().encode(serialized));

      expect(parsed.frames).toHaveLength(3);
      expect(parsed.frames[0].type).toBe('request');
      expect(parsed.frames[1].type).toBe('response');
      expect(parsed.frames[2].type).toBe('event');
    });

    it('should preserve request/response correlation', () => {
      const req = createRequest('req-123', 'capture.start', {});
      const res = createResponse('req-123', { accepted: true });

      const serialized = serializeFrames([req, res]);
      const parsed = parseFrames(new TextEncoder().encode(serialized));

      // Use type guard to check for id property
      if (hasId(parsed.frames[0]) && hasId(parsed.frames[1])) {
        expect(parsed.frames[0].id).toBe('req-123');
        expect(parsed.frames[1].id).toBe('req-123');
      }
    });
  });
});
