import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { DeviceProvider, useDevice } from './DeviceContext';
import { FirmwareState, CapturePhase, ProtocolError, ProtocolErrorCode } from '../types';
import type { DeviceInfo, CaptureProgressData, CaptureCompletedData, CaptureFailedData, ActiveProfileInfo, ActiveSyncInfo, RecognitionDetectedData } from '../types';

// Create a mock DeviceService class that properly simulates callbacks
const { mockDeviceServiceInstance, MockDeviceServiceClass, defaultConnectImpl, defaultDisconnectImpl } = vi.hoisted(() => {
  // Store the handlers passed to the constructor
  let currentHandlers: Record<string, Function> = {};
  let currentDeviceInfo: DeviceInfo | null = null;

  // Default connect implementation - defined as a plain function to avoid recursion with vi.fn
  const defaultConnectImpl = async () => {
    currentHandlers.onConnectionStatusChange?.('connecting', null, null);
    currentHandlers.onConnectionStatusChange?.('handshake', null, null);
    
    const deviceInfo: DeviceInfo = {
      device: 'MITTEN',
      firmwareVersion: '2.0.0',
      protocolVersion: 2,
      state: FirmwareState.IDLE,
      capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      activeProfile: null,
      activeSync: null,
    };
    currentDeviceInfo = deviceInfo;
    
    currentHandlers.onConnectionStatusChange?.('connected', deviceInfo, null);
    currentHandlers.onStateChange?.(FirmwareState.IDLE);
    
    return deviceInfo;
  };

  // Default disconnect implementation - defined as a plain function
  const defaultDisconnectImpl = async () => {
    currentDeviceInfo = null;
    currentHandlers.onConnectionStatusChange?.('disconnected', null, null);
    currentHandlers.onStateChange?.(FirmwareState.INITIALIZING);
  };

  // Create mock functions for all methods
  const mockFns = {
    connect: vi.fn(defaultConnectImpl),
    disconnect: vi.fn(defaultDisconnectImpl),
    getStatus: vi.fn(),
    startCapture: vi.fn(),
    startSync: vi.fn(),
    sendGesture: vi.fn(),
    commitSync: vi.fn(),
    abortSync: vi.fn(),
    isConnected: vi.fn(() => currentDeviceInfo !== null),
    isHandshakeValid: vi.fn(() => currentDeviceInfo !== null),
    getDeviceInfo: vi.fn(() => currentDeviceInfo),
    getFirmwareState: vi.fn(() => currentDeviceInfo ? FirmwareState.IDLE : FirmwareState.INITIALIZING),
    getActiveProfile: vi.fn(),
    getActiveSync: vi.fn(),
    getRequestManager: vi.fn(),
    getTransport: vi.fn(),
    setHandlers: vi.fn(),
    // Helper methods to trigger callbacks (not part of real API, for testing only)
    _triggerOnStateChange: vi.fn((state: FirmwareState) => currentHandlers.onStateChange?.(state)),
    _triggerOnConnectionStatusChange: vi.fn((status: 'disconnected' | 'connecting' | 'handshake' | 'connected' | 'error', info: DeviceInfo | null, error: string | null) => 
      currentHandlers.onConnectionStatusChange?.(status, info, error)),
    _triggerOnCaptureProgress: vi.fn((data: CaptureProgressData) => currentHandlers.onCaptureProgress?.(data)),
    _triggerOnCaptureCompleted: vi.fn((data: CaptureCompletedData) => currentHandlers.onCaptureCompleted?.(data)),
    _triggerOnCaptureFailed: vi.fn((data: CaptureFailedData) => currentHandlers.onCaptureFailed?.(data)),
    _triggerOnSyncProgress: vi.fn((sent: number, total: number) => currentHandlers.onSyncProgress?.(sent, total)),
    _triggerOnSyncCompleted: vi.fn((profile: ActiveProfileInfo) => currentHandlers.onSyncCompleted?.(profile)),
    _triggerOnSyncFailed: vi.fn((error: Error) => currentHandlers.onSyncFailed?.(error)),
    _triggerOnRecognitionDetected: vi.fn((data: RecognitionDetectedData) => currentHandlers.onRecognitionDetected?.(data)),
    _triggerOnError: vi.fn((error: Error) => currentHandlers.onError?.(error)),
    _triggerOnDeviceError: vi.fn((code: string, message: string, details?: Record<string, unknown>) => currentHandlers.onDeviceError?.(code, message, details)),
    _resetHandlers: vi.fn(() => { currentHandlers = {}; currentDeviceInfo = null; }),
    _setDeviceInfo: vi.fn((info: DeviceInfo | null) => { currentDeviceInfo = info; }),
  };

  // Create a proper class that stores handlers and returns the mock service instance
  class MockDeviceServiceClass {
    constructor(handlers: Record<string, Function> = {}) {
      currentHandlers = { ...handlers };
      mockFns.setHandlers.mockImplementation((newHandlers: Record<string, Function>) => {
        currentHandlers = { ...currentHandlers, ...newHandlers };
      });
      return mockFns;
    }
  }

  return { mockDeviceServiceInstance: mockFns, MockDeviceServiceClass, defaultConnectImpl, defaultDisconnectImpl };
});

vi.mock('../serial/DeviceService', () => {
  return { DeviceService: MockDeviceServiceClass };
});

describe('DeviceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeviceServiceInstance._resetHandlers();

    // Restore default connect/disconnect implementations (in case tests overrode them)
    mockDeviceServiceInstance.connect.mockImplementation(defaultConnectImpl);
    mockDeviceServiceInstance.disconnect.mockImplementation(defaultDisconnectImpl);

    // Set up default mock implementations
    mockDeviceServiceInstance.getStatus.mockResolvedValue({
      state: FirmwareState.IDLE,
      activeProfile: null,
      activeSync: null,
      error: null,
    });
    mockDeviceServiceInstance.startCapture.mockResolvedValue({ requestId: 'capture-1', operationTimeoutMs: 15000 });
    mockDeviceServiceInstance.startSync.mockResolvedValue({ syncId: 'sync-1', accepted: true });
    mockDeviceServiceInstance.sendGesture.mockResolvedValue({ accepted: true });
    mockDeviceServiceInstance.commitSync.mockResolvedValue({ committed: true });
    mockDeviceServiceInstance.abortSync.mockResolvedValue({ aborted: true, syncId: 'sync-1' });
    mockDeviceServiceInstance.getActiveProfile.mockReturnValue(null);
    mockDeviceServiceInstance.getActiveSync.mockReturnValue(null);
    mockDeviceServiceInstance.getRequestManager.mockReturnValue({ cancelAllRequests: vi.fn() });
    mockDeviceServiceInstance.getTransport.mockReturnValue({ getState: () => 'closed' });
  });

  afterEach(() => {
    cleanup();
  });

  const renderProvider = () => {
    return render(
      <DeviceProvider>
        <TestComponent />
      </DeviceProvider>
    );
  };

  // Test component that uses the context - exposes async functions for proper promise handling in tests
  const TestComponent = () => {
    const device = useDevice();
    // Store reference for test access
    (window as unknown as { __testDevice?: ReturnType<typeof useDevice> }).__testDevice = device;
    return (
      <div>
        <span data-testid="status">{device.connectionStatus}</span>
        <span data-testid="connected">{String(device.isConnected)}</span>
        <span data-testid="handshake">{String(device.isHandshakeValid)}</span>
        <span data-testid="firmware-state">{device.firmwareState}</span>
        <button data-testid="connect-btn" onClick={() => device.connect()}>Connect</button>
        <button data-testid="disconnect-btn" onClick={() => device.disconnect()}>Disconnect</button>
        <button data-testid="status-btn" onClick={() => device.getStatus()}>Status</button>
        <button data-testid="capture-btn" onClick={() => device.startCapture()}>Capture</button>
        <button data-testid="sync-btn" onClick={() => device.startSync('profile-1', 'rev-1', [])}>Sync</button>
        <button data-testid="abort-btn" onClick={() => device.abortSync()}>Abort</button>
        <button data-testid="clear-capture" onClick={() => device.clearCaptureState()}>Clear Capture</button>
        <button data-testid="clear-sync" onClick={() => device.clearSyncState()}>Clear Sync</button>
        <button data-testid="clear-recognition" onClick={() => device.clearRecognition()}>Clear Recognition</button>
        <button data-testid="clear-error" onClick={() => device.clearConnectionError()}>Clear Error</button>
        {device.captureError && <span data-testid="capture-error">{device.captureError}</span>}
        {device.syncError && <span data-testid="sync-error">{device.syncError}</span>}
        {device.connectionError && <span data-testid="connection-error">{device.connectionError}</span>}
        {device.capturedGestureData && <span data-testid="captured-data">data</span>}
      </div>
    );
  };

  // Helper to get the device context for direct async calls in tests
  const getTestDevice = () => {
    return (window as unknown as { __testDevice?: ReturnType<typeof useDevice> }).__testDevice!;
  };

  describe('connection', () => {
    it('should initialize with disconnected state', () => {
      renderProvider();
      expect(screen.getByTestId('status').textContent).toBe('disconnected');
      expect(screen.getByTestId('connected').textContent).toBe('false');
      expect(screen.getByTestId('handshake').textContent).toBe('false');
    });

    it('should connect successfully', async () => {
      renderProvider();

      await act(async () => {
        fireEvent.click(screen.getByTestId('connect-btn'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('connected');
        expect(screen.getByTestId('connected').textContent).toBe('true');
        expect(screen.getByTestId('handshake').textContent).toBe('true');
        expect(screen.getByTestId('firmware-state').textContent).toBe(FirmwareState.IDLE);
      });
    });

    it('should handle connection error', async () => {
      // Override connect to simulate connection error
      let connectPromise: Promise<unknown> = Promise.resolve();
      mockDeviceServiceInstance.connect.mockImplementation(() => {
        connectPromise = (async () => {
          const error = new Error('Port not found');
          mockDeviceServiceInstance._triggerOnConnectionStatusChange('error', null, error.message);
          mockDeviceServiceInstance._triggerOnError(error);
          throw error;
        })();
        return connectPromise as Promise<DeviceInfo>;
      });

      renderProvider();

      // Use direct async call to properly catch the re-thrown error
      const device = getTestDevice();
      await act(async () => {
        try {
          await device.connect();
        } catch (e) {
          // Expected - component re-throws after setting error state
        }
      });

      // Catch the rejected promise to avoid unhandled rejection
      await connectPromise.catch(() => {});

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('error');
        expect(screen.getByTestId('connection-error').textContent).toBe('Port not found');
      });
    });

    it('should disconnect and cleanup state', async () => {
      renderProvider();

      const device = getTestDevice();
      await act(async () => {
        await device.connect();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('connected');
      });

      await act(async () => {
        await device.disconnect();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('disconnected');
        expect(screen.getByTestId('connected').textContent).toBe('false');
        expect(mockDeviceServiceInstance.disconnect).toHaveBeenCalled();
      });
    });
  });

  describe('device status', () => {
    beforeEach(async () => {
      renderProvider();

      const device = getTestDevice();
      await act(async () => {
        await device.connect();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('connected');
      });
    });

    it('should get status and update state', async () => {
      const mockStatus = {
        state: FirmwareState.CAPTURING,
        activeProfile: { profileId: 'p1', profileRevision: 'r1', gestureCount: 2 },
        activeSync: { syncId: 's1', profileId: 'p1', profileRevision: 'r1', expectedGestureCount: 2, receivedCount: 1, nextIndex: 1 },
        error: null,
      };
      mockDeviceServiceInstance.getStatus.mockResolvedValue(mockStatus);

      const device = getTestDevice();
      await act(async () => {
        await device.getStatus();
      });

      await waitFor(() => {
        expect(screen.getByTestId('firmware-state').textContent).toBe(FirmwareState.CAPTURING);
      });
    });
  });

  describe('capture', () => {
    beforeEach(async () => {
      renderProvider();

      const device = getTestDevice();
      await act(async () => {
        await device.connect();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('connected');
      });
    });

    it('should start capture', async () => {
      mockDeviceServiceInstance.startCapture.mockResolvedValue({ requestId: 'capture-1', operationTimeoutMs: 15000 });

      const device = getTestDevice();
      await act(async () => {
        await device.startCapture();
      });

      await waitFor(() => {
        expect(mockDeviceServiceInstance.startCapture).toHaveBeenCalled();
      });
    });

    it('should handle capture error', async () => {
      // Simulate capture failure by triggering the callback (like real DeviceService)
      let capturePromise: Promise<unknown> = Promise.resolve();
      mockDeviceServiceInstance.startCapture.mockImplementation(() => {
        capturePromise = (async () => {
          const error: ProtocolError = { code: ProtocolErrorCode.DEVICE_BUSY, message: 'Device busy' };
          // The real service would emit onCaptureFailed event
          mockDeviceServiceInstance._triggerOnCaptureFailed({ requestId: 'capture-1', error });
          throw new Error('Device busy');
        })();
        return capturePromise;
      });

      const device = getTestDevice();
      await act(async () => {
        try {
          await device.startCapture();
        } catch (e) {
          // Expected - component re-throws after setting error state
        }
      });

      // Catch the rejected promise to avoid unhandled rejection
      await capturePromise.catch(() => {});

      await waitFor(() => {
        expect(screen.getByTestId('capture-error').textContent).toBe('Device busy');
      });
    });

    it('should clear capture state', async () => {
      let capturePromise: Promise<unknown> = Promise.resolve();
      mockDeviceServiceInstance.startCapture.mockImplementation(() => {
        capturePromise = (async () => {
          const error: ProtocolError = { code: ProtocolErrorCode.DEVICE_BUSY, message: 'Device busy' };
          mockDeviceServiceInstance._triggerOnCaptureFailed({ requestId: 'capture-1', error });
          throw new Error('Device busy');
        })();
        return capturePromise;
      });

      const device = getTestDevice();
      await act(async () => {
        try {
          await device.startCapture();
        } catch (e) {
          // Expected - component re-throws after setting error state
        }
      });

      // Catch the rejected promise to avoid unhandled rejection
      await capturePromise.catch(() => {});

      await waitFor(() => {
        expect(screen.getByTestId('capture-error').textContent).toBe('Device busy');
      });

      await act(async () => {
        device.clearCaptureState();
      });

      expect(screen.queryByTestId('capture-error')).toBeNull();
    });
  });

  describe('synchronization', () => {
    beforeEach(async () => {
      renderProvider();

      const device = getTestDevice();
      await act(async () => {
        await device.connect();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('connected');
      });
    });

    it('should start sync', async () => {
      mockDeviceServiceInstance.startSync.mockResolvedValue({ syncId: 'sync-1', accepted: true });

      const device = getTestDevice();
      await act(async () => {
        await device.startSync('profile-1', 'rev-1', []);
      });

      await waitFor(() => {
        expect(mockDeviceServiceInstance.startSync).toHaveBeenCalled();
        const callArgs = mockDeviceServiceInstance.startSync.mock.calls[0];
        expect(callArgs[0]).toMatch(/^sync-/);
        expect(callArgs[1]).toBe('profile-1');
        expect(callArgs[2]).toBe('rev-1');
        expect(callArgs[3]).toBe(0);
      });
    });

    it('should handle a sync failure event without a rejected request masking it', async () => {
      await act(async () => {
        mockDeviceServiceInstance._triggerOnSyncFailed(new Error('Sync failed'));
      });

      expect(screen.getByTestId('sync-error').textContent).toBe('Sync failed');
      expect(getTestDevice().isSyncing).toBe(false);
      expect(getTestDevice().activeSync).toBeNull();
    });

    it('should abort pending gesture upload without sending more gestures or committing', async () => {
      let finishUpload!: (result: { accepted: boolean }) => void;
      mockDeviceServiceInstance.sendGesture.mockImplementationOnce(() => new Promise(resolve => {
        finishUpload = resolve;
      }));

      const device = getTestDevice();
      // Hold the first upload pending so cancellation occurs before commit.
      const testGesture = {
        id: 1,
        name: 'Test',
        audioTrack: 1,
        data: {
          version: 1 as const,
          dimensions: 7 as const,
          dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
          units: { flex: 'adc12', mpu: 'degrees' } as const,
          samples: [[0,0,0,0,0,0,0]] as const,
          summary: { min: [0,0,0,0,0,0,0], max: [0,0,0,0,0,0,0], mean: [0,0,0,0,0,0,0] } as const,
          sampleCount: 1,
          captureDurationMs: 100,
          samplingPeriodMs: 100,
        },
      };
      let synchronization!: Promise<void>;
      await act(async () => {
        synchronization = device.startSync('profile-1', 'rev-1', [testGesture, { ...testGesture, id: 2, audioTrack: 2 }]);
      });
      expect(mockDeviceServiceInstance.sendGesture).toHaveBeenCalledTimes(1);
      expect(mockDeviceServiceInstance.commitSync).not.toHaveBeenCalled();
      const syncId = getTestDevice().activeSync!.syncId;
      expect(getTestDevice().isSyncing).toBe(true);

      await act(async () => {
        await getTestDevice().abortSync();
        finishUpload({ accepted: true });
        await synchronization;
      });

      expect(mockDeviceServiceInstance.abortSync).toHaveBeenCalledExactlyOnceWith(syncId);
      expect(mockDeviceServiceInstance.sendGesture).toHaveBeenCalledTimes(1);
      expect(mockDeviceServiceInstance.commitSync).not.toHaveBeenCalled();
      expect(getTestDevice().isSyncing).toBe(false);
      expect(getTestDevice().activeSync).toBeNull();
      expect(getTestDevice().syncProgress).toEqual({ sent: 0, total: 0 });
      expect(screen.queryByTestId('sync-error')).toBeNull();
    });

    it('should report a rejected sync request, abort it, and clear the error', async () => {
      mockDeviceServiceInstance.startSync.mockRejectedValueOnce(new Error('Sync failed'));
      await act(async () => {
        await expect(getTestDevice().startSync('profile-1', 'rev-1', [])).rejects.toThrow('Sync failed');
      });
      const syncId = mockDeviceServiceInstance.startSync.mock.calls[0][0];
      expect(mockDeviceServiceInstance.abortSync).toHaveBeenCalledExactlyOnceWith(syncId);
      expect(mockDeviceServiceInstance.sendGesture).not.toHaveBeenCalled();
      expect(mockDeviceServiceInstance.commitSync).not.toHaveBeenCalled();
      expect(getTestDevice().isSyncing).toBe(false);
      expect(screen.getByTestId('sync-error').textContent).toBe('Sync failed');

      await act(async () => {
        getTestDevice().clearSyncState();
      });
      expect(screen.queryByTestId('sync-error')).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should clear connection error', async () => {
      // Override connect to simulate connection error
      let connectPromise: Promise<unknown> = Promise.resolve();
      mockDeviceServiceInstance.connect.mockImplementation(() => {
        connectPromise = (async () => {
          const error = new Error('Connection failed');
          mockDeviceServiceInstance._triggerOnConnectionStatusChange('error', null, error.message);
          mockDeviceServiceInstance._triggerOnError(error);
          throw error;
        })();
        return connectPromise as Promise<DeviceInfo>;
      });

      renderProvider();

      const device = getTestDevice();
      await act(async () => {
        try {
          await device.connect();
        } catch (e) {
          // Expected - component re-throws after setting error state
        }
      });

      // Catch the rejected promise to avoid unhandled rejection
      await connectPromise.catch(() => {});

      await waitFor(() => {
        expect(screen.getByTestId('connection-error').textContent).toBe('Connection failed');
      });

      await act(async () => {
        device.clearConnectionError();
      });

      expect(screen.queryByTestId('connection-error')).toBeNull();
    });
  });

  describe('cleanup on unmount', () => {
    it('should disconnect on unmount', async () => {
      const { unmount } = renderProvider();

      const device = getTestDevice();
      await act(async () => {
        await device.connect();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('connected');
      });

      unmount();

      expect(mockDeviceServiceInstance.disconnect).toHaveBeenCalled();
    });
  });
});