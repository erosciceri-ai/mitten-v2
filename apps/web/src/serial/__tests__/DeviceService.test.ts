import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PROTOCOL_VERSION,
  FirmwareState,
  CapturePhase,
  ProtocolErrorCode,
  createHandshakeResponse,
  createStatusResponse,
  createCaptureStartResponse,
  createCaptureProgressEvent,
  createCaptureCompletedEvent,
  createCaptureFailedEvent,
  createSyncBeginResponse,
  createSyncGestureResponse,
  createSyncCommitResponse,
  createSyncAbortResponse,
  createSyncFailedEvent,
  createDeviceStateEvent,
} from '@mitten/contracts';

// Create a mock transport that we can control
const createMockTransport = () => {
  let state: 'closed' | 'opening' | 'open' | 'closing' | 'error' = 'closed';
  let onData: ((envelope: any) => void) | null = null;
  let onError: ((error: Error) => void) | null = null;
  let onStateChange: ((state: string) => void) | null = null;
  let lastSentEnvelope: any = null;

  return {
    connect: vi.fn().mockImplementation(async () => {
      state = 'open';
      onStateChange?.('open');
    }),
    disconnect: vi.fn().mockImplementation(async () => {
      state = 'closed';
      onStateChange?.('closed');
    }),
    send: vi.fn().mockImplementation(async (envelope: any) => {
      lastSentEnvelope = envelope;
    }),
    getState: vi.fn(() => state),
    updateMaxMessageBytes: vi.fn(),
    // Test helpers
    _simulateData: (envelope: any) => onData?.(envelope),
    _simulateError: (error: Error) => onError?.(error),
    _simulateStateChange: (newState: 'closed' | 'opening' | 'open' | 'closing' | 'error') => {
      state = newState;
      onStateChange?.(newState);
    },
    _setHandlers: (handlers: { onData?: any; onError?: any; onStateChange?: any }) => {
      if (handlers.onData) onData = handlers.onData;
      if (handlers.onError) onError = handlers.onError;
      if (handlers.onStateChange) onStateChange = handlers.onStateChange;
    },
    _getLastSentEnvelope: () => lastSentEnvelope,
  };
};

describe('DeviceService', () => {
  let service: any;
  let mockTransport: ReturnType<typeof createMockTransport>;
  let handlers: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    mockTransport = createMockTransport();
    handlers = {
      onStateChange: vi.fn(),
      onConnectionStatusChange: vi.fn(),
      onCaptureProgress: vi.fn(),
      onCaptureCompleted: vi.fn(),
      onCaptureFailed: vi.fn(),
      onSyncProgress: vi.fn(),
      onSyncCompleted: vi.fn(),
      onSyncFailed: vi.fn(),
      onRecognitionDetected: vi.fn(),
      onError: vi.fn(),
      onDeviceError: vi.fn(),
    };

    // Mock SerialTransport before importing DeviceService
    vi.doMock('../SerialTransport', () => ({
      SerialTransport: vi.fn().mockImplementation((options: any) => {
        mockTransport._setHandlers(options);
        return mockTransport;
      }),
    }));

    const { DeviceService } = await import('../DeviceService');
    service = new DeviceService(handlers);
  });

  afterEach(async () => {
    await service.disconnect();
    vi.useRealTimers();
  });

  it('uses the announced sync idle timeout and aborts instead of waiting forever', async () => {
    const pending=service.startSync('s1','p1','r1',0);
    const id=mockTransport._getLastSentEnvelope().id;
    mockTransport._simulateData(createSyncBeginResponse(id,{accepted:true,syncId:'s1',expectedGestureCount:0,receivedCount:0,nextIndex:0,idleTimeoutMs:2000}));
    await pending;
    await vi.advanceTimersByTimeAsync(2499);
    expect(handlers.onSyncFailed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(handlers.onSyncFailed).toHaveBeenCalledWith(expect.objectContaining({message:'Synchronization idle timeout'}));
    const abort=mockTransport._getLastSentEnvelope(); expect(abort.command).toBe('sync.abort');
    mockTransport._simulateData(createSyncAbortResponse(abort.id,{aborted:true,syncId:'s1'}));
  });

  it('times out capture acceptance after 5000ms, independently of its terminal event', async () => {
    const pending=service.startCapture().catch((error: Error)=>error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual(expect.objectContaining({message:expect.stringContaining('5000ms')}));
  });

  describe('connect + handshake', () => {
    it('should connect and perform handshake successfully', async () => {
      const connectPromise = service.connect();

      // Get the request ID that was sent
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      expect(sentEnvelope).toBeDefined();
      expect(sentEnvelope.command).toBe('device.handshake');
      const requestId = sentEnvelope.id;

      // Respond with that request ID
      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));

      const deviceInfo = await connectPromise;

      expect(deviceInfo.device).toBe('MITTEN');
      expect(deviceInfo.protocolVersion).toBe(2);
      expect(handlers.onConnectionStatusChange).toHaveBeenCalledWith('connected', expect.any(Object), null);
      expect(handlers.onStateChange).toHaveBeenCalledWith(FirmwareState.IDLE);
    });

    it('should reject handshake from non-MITTEN device', async () => {
      const connectPromise = service.connect();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'OTHER' as 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));

      await expect(connectPromise).rejects.toThrow('device must be "MITTEN"');
      expect(handlers.onConnectionStatusChange).toHaveBeenCalledWith('error', null, expect.any(String));
    });

    it('should reject handshake with incompatible protocol version', async () => {
      const connectPromise = service.connect();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 99,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));

      await expect(connectPromise).rejects.toThrow('Protocol version incompatible');
    });

    it('should update transport maxMessageBytes from handshake', async () => {
      const connectPromise = service.connect();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 4096 },
      }));

      await connectPromise;
      expect(mockTransport.updateMaxMessageBytes).toHaveBeenCalledWith(4096);
    });
  });

  describe('device.status', () => {
    beforeEach(async () => {
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;
      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));
      await connectPromise;
      vi.clearAllMocks();
    });

    it('should get device status and update internal state', async () => {
      const statusPromise = service.getStatus();
      
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;
      
      mockTransport._simulateData(createStatusResponse(requestId, {
        state: FirmwareState.IDLE,
        activeProfile: null,
        activeSync: null,
        error: null,
      }));

      const status = await statusPromise;

      expect(mockTransport.send).toHaveBeenCalled();
      expect(status.state).toBe(FirmwareState.IDLE);
      expect(handlers.onStateChange).toHaveBeenCalledWith(FirmwareState.IDLE);
    });
  });

  describe('capture.start', () => {
    beforeEach(async () => {
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;
      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));
      await connectPromise;
      vi.clearAllMocks();
    });

    it('should send capture.start and return requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      const result = await capturePromise;

      expect(result.requestId).toBe(requestId);
      expect(result.operationTimeoutMs).toBe(15000);
      expect(mockTransport.send).toHaveBeenCalledWith(expect.objectContaining({
        command: 'capture.start',
      }));
    });

    it('should track pending capture requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      mockTransport._simulateData(createCaptureProgressEvent({
        requestId,
        phase: CapturePhase.RECORDING,
        progress: 50,
      }));

      expect(handlers.onCaptureProgress).toHaveBeenCalledWith(expect.objectContaining({
        requestId,
        phase: CapturePhase.RECORDING,
      }));
    });

    it('should ignore progress with wrong requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      // Send progress with different requestId
      mockTransport._simulateData(createCaptureProgressEvent({
        requestId: 'capture-wrong',
        phase: CapturePhase.RECORDING,
        progress: 50,
      }));

      expect(handlers.onCaptureProgress).not.toHaveBeenCalled();
    });

    it('should handle capture.completed with correct requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      const gestureData = {
        version: 1 as const,
        dimensions: 7 as const,
        dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
        units: { flex: 'adc12', mpu: 'degrees' } as const,
        samples: [[1,2,3,4,5,10,20]] as const,
        summary: { min: [1,2,3,4,5,10,20], max: [1,2,3,4,5,10,20], mean: [1,2,3,4,5,10,20] } as const,
        sampleCount: 1,
        captureDurationMs: 100,
        samplingPeriodMs: 100,
      };

      mockTransport._simulateData(createCaptureCompletedEvent({
        requestId,
        data: gestureData,
      }));

      expect(handlers.onCaptureCompleted).toHaveBeenCalledWith(expect.objectContaining({
        requestId,
      }));
    });

    it('should ignore capture.completed with wrong requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      const gestureData = {
        version: 1 as const,
        dimensions: 7 as const,
        dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
        units: { flex: 'adc12', mpu: 'degrees' } as const,
        samples: [[1,2,3,4,5,10,20]] as const,
        summary: { min: [1,2,3,4,5,10,20], max: [1,2,3,4,5,10,20], mean: [1,2,3,4,5,10,20] } as const,
        sampleCount: 1,
        captureDurationMs: 100,
        samplingPeriodMs: 100,
      };

      mockTransport._simulateData(createCaptureCompletedEvent({
        requestId: 'capture-wrong',
        data: gestureData,
      }));

      expect(handlers.onCaptureCompleted).not.toHaveBeenCalled();
    });

    it('should handle capture.failed with correct requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      mockTransport._simulateData(createCaptureFailedEvent({
        requestId,
        error: { code: ProtocolErrorCode.SENSOR_ERROR, message: 'Sensor read failed' },
      }));

      expect(handlers.onCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
        requestId,
        error: expect.objectContaining({ code: ProtocolErrorCode.SENSOR_ERROR }),
      }));
    });

    it('should ignore capture.failed with wrong requestId', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      mockTransport._simulateData(createCaptureFailedEvent({
        requestId: 'capture-wrong',
        error: { code: ProtocolErrorCode.SENSOR_ERROR, message: 'Sensor read failed' },
      }));

      expect(handlers.onCaptureFailed).not.toHaveBeenCalled();
    });

    it('should timeout on response', async () => {
      const capturePromise = service.startCapture();
      
      // Attach catch handler before advancing timers
      const errorPromise = capturePromise.then(
        () => ({ rejected: false }),
        (e: Error) => ({ rejected: true, message: e.message })
      );
      
      await vi.advanceTimersByTimeAsync(16000);
      const result = await errorPromise;
      
      expect(result.rejected).toBe(true);
      expect(result.message).toContain('timeout');
    });

    it('should timeout on operation terminal event', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      await vi.advanceTimersByTimeAsync(16000);

      expect(handlers.onCaptureFailed).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: 'OPERATION_TIMEOUT' }),
      }));
      expect(handlers.onError).toHaveBeenCalled();
    });

    it('should not accept late terminal event after timeout', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      await vi.advanceTimersByTimeAsync(16000);

      vi.clearAllMocks();

      const gestureData = {
        version: 1 as const,
        dimensions: 7 as const,
        dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
        units: { flex: 'adc12', mpu: 'degrees' } as const,
        samples: [[1,2,3,4,5,10,20]] as const,
        summary: { min: [1,2,3,4,5,10,20], max: [1,2,3,4,5,10,20], mean: [1,2,3,4,5,10,20] } as const,
        sampleCount: 1,
        captureDurationMs: 100,
        samplingPeriodMs: 100,
      };

      mockTransport._simulateData(createCaptureCompletedEvent({
        requestId,
        data: gestureData,
      }));

      expect(handlers.onCaptureCompleted).not.toHaveBeenCalled();
      expect(handlers.onCaptureFailed).not.toHaveBeenCalled();
    });

    it('should cleanup on disconnect during capture', async () => {
      const capturePromise = service.startCapture();

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createCaptureStartResponse(requestId, {
        accepted: true,
        operationTimeoutMs: 15000,
      }));

      await capturePromise;

      mockTransport._simulateStateChange('closed');

      expect(handlers.onError).toHaveBeenCalled();
      expect(service.isConnected()).toBe(false);
    });
  });

  describe('synchronization', () => {
    beforeEach(async () => {
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;
      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));
      await connectPromise;
      vi.clearAllMocks();
    });

    it('should start sync transaction', async () => {
      const syncPromise = service.startSync('sync-1', 'profile-1', 'rev-1', 2);

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createSyncBeginResponse(requestId, {
        accepted: true,
        syncId: 'sync-1',
        expectedGestureCount: 2,
        receivedCount: 0,
        nextIndex: 0,
        idleTimeoutMs: 10000,
      }));

      const result = await syncPromise;

      expect(result.syncId).toBe('sync-1');
      expect(result.accepted).toBe(true);
      expect(service.getActiveSync()?.syncId).toBe('sync-1');
    });

    it('should send gestures in sync', async () => {
      const syncPromise = service.startSync('sync-2', 'profile-1', 'rev-1', 2);

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createSyncBeginResponse(requestId, {
        accepted: true,
        syncId: 'sync-2',
        expectedGestureCount: 2,
        receivedCount: 0,
        nextIndex: 0,
        idleTimeoutMs: 10000,
      }));

      await syncPromise;

      const gesture = {
        id: 1,
        name: 'test',
        audioTrack: 1,
        data: {
          version: 1 as const,
          dimensions: 7 as const,
          dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
          units: { flex: 'adc12', mpu: 'degrees' } as const,
          samples: [[1,2,3,4,5,10,20]] as const,
          summary: { min: [1,2,3,4,5,10,20], max: [1,2,3,4,5,10,20], mean: [1,2,3,4,5,10,20] } as const,
          sampleCount: 1,
          captureDurationMs: 100,
          samplingPeriodMs: 100,
        },
      };

      const gesturePromise = service.sendGesture('sync-2', 0, gesture);

      await vi.advanceTimersByTimeAsync(10);
      const gestureSentEnvelope = mockTransport._getLastSentEnvelope();
      const gestureRequestId = gestureSentEnvelope.id;

      mockTransport._simulateData(createSyncGestureResponse(gestureRequestId, {
        syncId: 'sync-2',
        receivedCount: 1,
        nextIndex: 1,
      }));

      const result = await gesturePromise;

      expect(result.receivedCount).toBe(1);
      expect(result.nextIndex).toBe(1);
      expect(handlers.onSyncProgress).toHaveBeenCalledWith(1, 2);
    });

    it('should commit sync', async () => {
      const syncPromise = service.startSync('sync-3', 'profile-1', 'rev-1', 1);

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createSyncBeginResponse(requestId, {
        accepted: true,
        syncId: 'sync-3',
        expectedGestureCount: 1,
        receivedCount: 0,
        nextIndex: 0,
        idleTimeoutMs: 10000,
      }));

      await syncPromise;

      const gesture = {
        id: 1,
        name: 'test',
        audioTrack: 1,
        data: {
          version: 1 as const,
          dimensions: 7 as const,
          dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
          units: { flex: 'adc12', mpu: 'degrees' } as const,
          samples: [[1,2,3,4,5,10,20]] as const,
          summary: { min: [1,2,3,4,5,10,20], max: [1,2,3,4,5,10,20], mean: [1,2,3,4,5,10,20] } as const,
          sampleCount: 1,
          captureDurationMs: 100,
          samplingPeriodMs: 100,
        },
      };

      const gesturePromise = service.sendGesture('sync-3', 0, gesture);

      await vi.advanceTimersByTimeAsync(10);
      const gestureSentEnvelope = mockTransport._getLastSentEnvelope();
      const gestureRequestId = gestureSentEnvelope.id;

      mockTransport._simulateData(createSyncGestureResponse(gestureRequestId, {
        syncId: 'sync-3',
        receivedCount: 1,
        nextIndex: 1,
      }));

      await gesturePromise;

      const commitPromise = service.commitSync('sync-3');

      await vi.advanceTimersByTimeAsync(10);
      const commitSentEnvelope = mockTransport._getLastSentEnvelope();
      const commitRequestId = commitSentEnvelope.id;

      mockTransport._simulateData(createSyncCommitResponse(commitRequestId, {
        committed: true,
        syncId: 'sync-3',
        activeProfile: { profileId: 'profile-1', profileRevision: 'rev-1', gestureCount: 1 },
      }));

      const result = await commitPromise;

      expect(result.committed).toBe(true);
      expect(handlers.onSyncCompleted).toHaveBeenCalled();
      expect(service.getActiveSync()).toBeNull();
    }, 10000);

    it('should abort sync', async () => {
      const syncPromise = service.startSync('sync-4', 'profile-1', 'rev-1', 2);

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createSyncBeginResponse(requestId, {
        accepted: true,
        syncId: 'sync-4',
        expectedGestureCount: 2,
        receivedCount: 0,
        nextIndex: 0,
        idleTimeoutMs: 10000,
      }));

      await syncPromise;

      const abortPromise = service.abortSync('sync-4');

      await vi.advanceTimersByTimeAsync(10);
      const abortSentEnvelope = mockTransport._getLastSentEnvelope();
      const abortRequestId = abortSentEnvelope.id;

      mockTransport._simulateData(createSyncAbortResponse(abortRequestId, {
        aborted: true,
        syncId: 'sync-4',
      }));

      const result = await abortPromise;

      expect(result.aborted).toBe(true);
      expect(service.getActiveSync()).toBeNull();
    });

    it('should handle sync.failed with correct syncId', async () => {
      const syncPromise = service.startSync('sync-5', 'profile-1', 'rev-1', 2);

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createSyncBeginResponse(requestId, {
        accepted: true,
        syncId: 'sync-5',
        expectedGestureCount: 2,
        receivedCount: 0,
        nextIndex: 0,
        idleTimeoutMs: 10000,
      }));

      await syncPromise;

      mockTransport._simulateData(createSyncFailedEvent({
        syncId: 'sync-5',
        error: { code: ProtocolErrorCode.SYNC_TIMEOUT, message: 'Sync timed out' },
      }));

      expect(handlers.onSyncFailed).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Sync timed out',
      }));
      expect(service.getActiveSync()).toBeNull();
    });

    it('should ignore sync.failed with wrong syncId', async () => {
      const syncPromise = service.startSync('sync-6', 'profile-1', 'rev-1', 2);

      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;

      mockTransport._simulateData(createSyncBeginResponse(requestId, {
        accepted: true,
        syncId: 'sync-6',
        expectedGestureCount: 2,
        receivedCount: 0,
        nextIndex: 0,
        idleTimeoutMs: 10000,
      }));

      await syncPromise;

      vi.clearAllMocks();

      mockTransport._simulateData(createSyncFailedEvent({
        syncId: 'sync-wrong',
        error: { code: ProtocolErrorCode.SYNC_TIMEOUT, message: 'Sync timed out' },
      }));

      expect(handlers.onSyncFailed).not.toHaveBeenCalled();
      expect(service.getActiveSync()?.syncId).toBe('sync-6');
    });
  });

  describe('protocol/device errors', () => {
    beforeEach(async () => {
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;
      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));
      await connectPromise;
      vi.clearAllMocks();
    });

    it('should handle device.state events', () => {
      mockTransport._simulateData(createDeviceStateEvent({ state: FirmwareState.CAPTURING }));
      expect(handlers.onStateChange).toHaveBeenCalledWith(FirmwareState.CAPTURING);

      mockTransport._simulateData(createDeviceStateEvent({ state: FirmwareState.IDLE }));
      expect(handlers.onStateChange).toHaveBeenCalledWith(FirmwareState.IDLE);
    });

    it('should handle protocol.error events', () => {
      mockTransport._simulateData({
        v: 2,
        type: 'event',
        event: 'protocol.error',
        data: { error: { code: ProtocolErrorCode.INVALID_STATE, message: 'Invalid state', details: {} } },
      });

      expect(handlers.onDeviceError).toHaveBeenCalledWith(
        ProtocolErrorCode.INVALID_STATE,
        'Invalid state',
        {}
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup all state on disconnect', async () => {
      const connectPromise = service.connect();
      await vi.advanceTimersByTimeAsync(10);
      const sentEnvelope = mockTransport._getLastSentEnvelope();
      const requestId = sentEnvelope.id;
      mockTransport._simulateData(createHandshakeResponse(requestId, {
        device: 'MITTEN',
        firmwareVersion: '2.0.0',
        protocolVersion: 2,
        state: FirmwareState.IDLE,
        capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      }));
      await connectPromise;

      await service.disconnect();

      expect(service.isConnected()).toBe(false);
      expect(service.getDeviceInfo()).toBeNull();
      expect(service.getFirmwareState()).toBe(FirmwareState.INITIALIZING);
      expect(service.getActiveProfile()).toBeNull();
      expect(service.getActiveSync()).toBeNull();
    });
  });
});
