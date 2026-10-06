import type {
  ProtocolEnvelope,
  DeviceInfo,
  DeviceStatusResult,
  HandshakeResponseResult,
  CaptureProgressData,
  CaptureCompletedData,
  CaptureFailedData,
  CaptureStartResult,
  SyncBeginPayload,
  SyncBeginResult,
  SyncGesturePayload,
  SyncGestureResult,
  SyncCommitPayload,
  SyncCommitResult,
  SyncAbortPayload,
  SyncAbortResult,
  RecognitionDetectedData,
  ActiveProfileInfo,
  ActiveSyncInfo,
  DeviceStateData,
} from '@mitten/contracts';
import {
  PROTOCOL_VERSION,
  FirmwareState,
  CapturePhase,
  ProtocolErrorCode,
  isProtocolVersionCompatible,
  validateHandshakeResponseResult,
  validateDeviceStatusResult,
  validateCaptureStartResult,
  validateSyncBeginResult,
  validateSyncGestureResult,
  validateSyncCommitResult,
  validateSyncAbortResult,
} from '@mitten/contracts';
import { SerialTransport } from './SerialTransport';
import { RequestManager } from './RequestManager';
import type { Gesture, GestureData } from '../types';

export interface DeviceServiceEvents {
  onStateChange: (state: FirmwareState) => void;
  onConnectionStatusChange: (status: 'disconnected' | 'connecting' | 'handshake' | 'connected' | 'error', deviceInfo: DeviceInfo | null, error: string | null) => void;
  onCaptureProgress: (data: CaptureProgressData) => void;
  onCaptureCompleted: (data: CaptureCompletedData) => void;
  onCaptureFailed: (data: CaptureFailedData) => void;
  onSyncProgress: (sent: number, total: number) => void;
  onSyncCompleted: (profile: ActiveProfileInfo) => void;
  onSyncFailed: (error: Error) => void;
  onRecognitionDetected: (data: RecognitionDetectedData) => void;
  onError: (error: Error) => void;
  onDeviceError: (error: ProtocolErrorCode, message: string, details?: Record<string, unknown>) => void;
}

type EventHandlers = Partial<DeviceServiceEvents>;

export class DeviceService {
  private transport: SerialTransport;
  private requestManager: RequestManager;
  private handlers: EventHandlers = {};
  private deviceInfo: DeviceInfo | null = null;
  private isHandshakeComplete = false;
  private activeProfile: ActiveProfileInfo | null = null;
  private activeSync: ActiveSyncInfo | null = null;
  private currentFirmwareState: FirmwareState = FirmwareState.INITIALIZING;
  private handshakeTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private pendingCaptureRequestId: string | null = null;
  private currentSyncId: string | null = null;

  constructor(handlers: EventHandlers = {}) {
    this.handlers = handlers;

    this.transport = new SerialTransport({
      baudRate: 115200,
      maxMessageBytes: 8192,
      onData: (envelope) => this.handleIncomingMessage(envelope),
      onError: (error) => this.handleTransportError(error),
      onStateChange: (state) => this.handleTransportStateChange(state),
    });

    this.requestManager = new RequestManager(
      (envelope) => this.transport.send(envelope),
      {
        defaultTimeout: 5000,
        handshakeTimeout: 5000,
        captureTimeout: 15000,
        syncIdleTimeout: 10000,
        syncCommitTimeout: 10000,
      }
    );
  }

  getTransport(): SerialTransport {
    return this.transport;
  }

  getRequestManager(): RequestManager {
    return this.requestManager;
  }

  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  getFirmwareState(): FirmwareState {
    return this.currentFirmwareState;
  }

  getActiveProfile(): ActiveProfileInfo | null {
    return this.activeProfile;
  }

  getActiveSync(): ActiveSyncInfo | null {
    return this.activeSync;
  }

  isConnected(): boolean {
    return this.transport.getState() === 'open' && this.isHandshakeComplete;
  }

  isHandshakeValid(): boolean {
    return this.isHandshakeComplete;
  }

  // Event handler setters
  setHandlers(handlers: EventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  async connect(): Promise<DeviceInfo> {
    if (this.transport.getState() !== 'closed') {
      throw new Error('Already connected or connecting');
    }

    this.setConnectionStatus('connecting', null, null);

    try {
      await this.transport.connect();
      this.setConnectionStatus('handshake', null, null);

      // Perform handshake
      const deviceInfo = await this.performHandshake();
      this.deviceInfo = deviceInfo;
      this.isHandshakeComplete = true;
      this.currentFirmwareState = deviceInfo.state;
      this.activeProfile = deviceInfo.activeProfile as ActiveProfileInfo | null;
      this.activeSync = deviceInfo.activeSync as ActiveSyncInfo | null;

      this.setConnectionStatus('connected', deviceInfo, null);
      this.handlers.onStateChange?.(this.currentFirmwareState);
      
      return deviceInfo;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.setConnectionStatus('error', null, message);
      this.handlers.onError?.(error instanceof Error ? error : new Error(message));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.clearHandshakeTimeout();
    this.clearCaptureOperationTimeout();
    this.requestManager.cancelAllRequests('Disconnected');
    await this.transport.disconnect();
    this.deviceInfo = null;
    this.isHandshakeComplete = false;
    this.currentFirmwareState = FirmwareState.INITIALIZING;
    this.activeProfile = null;
    this.activeSync = null;
    this.pendingCaptureRequestId = null;
    this.currentSyncId = null;
    this.setConnectionStatus('disconnected', null, null);
  }

  private async performHandshake(): Promise<DeviceInfo> {
    const { requestId, promise: handshakePromise } = this.requestManager.sendRequest<
      { client: string; supportedProtocolVersions: number[] },
      HandshakeResponseResult
    >('device.handshake', {
      client: 'MITTEN_WEB',
      supportedProtocolVersions: [PROTOCOL_VERSION],
    }, { 
      timeout: this.requestManager.getTimeoutForCommand('device.handshake') 
    });

    // Set handshake timeout using the known requestId
    this.handshakeTimeoutHandle = setTimeout(() => {
      this.requestManager.cancelRequest(requestId, 'Handshake timeout');
    }, 5000);

    try {
      const result = await handshakePromise;
      this.clearHandshakeTimeout();

      // Validate handshake response
      const validation = validateHandshakeResponseResult(result);
      if (!validation.valid) {
        throw new Error(`Invalid handshake response: ${validation.errors.join(', ')}`);
      }

      // Check device identity
      if (result.device !== 'MITTEN') {
        throw new Error(`Device is not MITTEN: ${result.device}`);
      }

      // Check protocol version compatibility
      if (!isProtocolVersionCompatible(result.protocolVersion, [PROTOCOL_VERSION])) {
        throw new Error(
          `Protocol version incompatible: device=${result.protocolVersion}, supported=[${PROTOCOL_VERSION}]`
        );
      }

      // Update max message bytes in transport
      this.transport.updateMaxMessageBytes(result.capabilities.maxMessageBytes);

      return {
        device: result.device,
        firmwareVersion: result.firmwareVersion,
        protocolVersion: result.protocolVersion,
        state: result.state,
        capabilities: result.capabilities,
      };
    } catch (error) {
      this.clearHandshakeTimeout();
      throw error;
    }
  }

  private clearHandshakeTimeout(): void {
    if (this.handshakeTimeoutHandle) {
      clearTimeout(this.handshakeTimeoutHandle);
      this.handshakeTimeoutHandle = null;
    }
  }

  async getStatus(): Promise<DeviceStatusResult> {
    const { promise } = this.requestManager.sendRequest<{}, DeviceStatusResult>(
      'device.status',
      {}
    );

    const result = await promise;

    const validation = validateDeviceStatusResult(result);
    if (!validation.valid) {
      throw new Error(`Invalid device status response: ${validation.errors.join(', ')}`);
    }

    // Update internal state
    this.currentFirmwareState = result.state;
    this.activeProfile = result.activeProfile;
    this.activeSync = result.activeSync;
    this.handlers.onStateChange?.(this.currentFirmwareState);

    return result;
  }

  async startCapture(): Promise<{ requestId: string; operationTimeoutMs: number }> {
    const { requestId, promise } = this.requestManager.sendRequest<{}, CaptureStartResult>(
      'capture.start',
      {}
    );

    this.pendingCaptureRequestId = requestId;

    const result = await promise;

    const validation = validateCaptureStartResult(result);
    if (!validation.valid) {
      this.pendingCaptureRequestId = null;
      throw new Error(`Invalid capture start response: ${validation.errors.join(', ')}`);
    }

    // Start the operation timeout for the terminal event
    this.startCaptureOperationTimeout(result.operationTimeoutMs);

    return {
      requestId,
      operationTimeoutMs: result.operationTimeoutMs,
    };
  }

  async startSync(
    syncId: string,
    profileId: string,
    profileRevision: string,
    gestureCount: number
  ): Promise<SyncBeginResult> {
    const payload: SyncBeginPayload = {
      syncId,
      profileId,
      profileRevision,
      gestureCount,
    };

    const { promise } = this.requestManager.sendRequest<SyncBeginPayload, SyncBeginResult>(
      'sync.begin',
      payload
    );

    const result = await promise;

    const validation = validateSyncBeginResult(result);
    if (!validation.valid) {
      throw new Error(`Invalid sync begin response: ${validation.errors.join(', ')}`);
    }

    this.currentSyncId = syncId;
    this.activeSync = {
      syncId: result.syncId,
      profileId,
      profileRevision,
      expectedGestureCount: result.expectedGestureCount,
      receivedCount: result.receivedCount,
      nextIndex: result.nextIndex,
    };

    return result;
  }

  async sendGesture(
    syncId: string,
    index: number,
    gesture: Gesture
  ): Promise<SyncGestureResult> {
    const payload: SyncGesturePayload = {
      syncId,
      index,
      gesture,
    };

    const { promise } = this.requestManager.sendRequest<SyncGesturePayload, SyncGestureResult>(
      'sync.gesture',
      payload
    );

    const result = await promise;

    const validation = validateSyncGestureResult(result);
    if (!validation.valid) {
      throw new Error(`Invalid sync gesture response: ${validation.errors.join(', ')}`);
    }

    // Update active sync state
    if (this.activeSync && this.activeSync.syncId === syncId) {
      this.activeSync.receivedCount = result.receivedCount;
      this.activeSync.nextIndex = result.nextIndex;
    }

    this.handlers.onSyncProgress?.(result.receivedCount, this.activeSync?.expectedGestureCount || 0);

    return result;
  }

  async commitSync(syncId: string): Promise<SyncCommitResult> {
    const payload: SyncCommitPayload = { syncId };

    const { promise } = this.requestManager.sendRequest<SyncCommitPayload, SyncCommitResult>(
      'sync.commit',
      payload,
      { timeout: this.requestManager.getTimeoutForCommand('sync.commit') }
    );

    const result = await promise;

    const validation = validateSyncCommitResult(result);
    if (!validation.valid) {
      throw new Error(`Invalid sync commit response: ${validation.errors.join(', ')}`);
    }

    if (result.committed && result.activeProfile) {
      this.activeProfile = result.activeProfile;
      this.activeSync = null;
      this.currentSyncId = null;
      this.handlers.onSyncCompleted?.(result.activeProfile);
    }

    return result;
  }

  async abortSync(syncId: string): Promise<SyncAbortResult> {
    const payload: SyncAbortPayload = { syncId };

    const { promise } = this.requestManager.sendRequest<SyncAbortPayload, SyncAbortResult>(
      'sync.abort',
      payload
    );

    const result = await promise;

    const validation = validateSyncAbortResult(result);
    if (!validation.valid) {
      throw new Error(`Invalid sync abort response: ${validation.errors.join(', ')}`);
    }

    this.activeSync = null;
    this.currentSyncId = null;

    return result;
  }

  private handleIncomingMessage(envelope: ProtocolEnvelope): void {
    // First try to handle as response
    if (this.requestManager.handleResponse(envelope)) {
      return;
    }

    // Handle events - narrow type with type guard
    if (envelope.type === 'event') {
      this.handleEvent(envelope as ProtocolEnvelope & { type: 'event'; event: string; data: object });
    }
  }

  private handleEvent(envelope: ProtocolEnvelope & { type: 'event'; event: string; data: object }): void {
    switch (envelope.event) {
      case 'device.state': {
        const data = envelope.data as DeviceStateData;
        this.currentFirmwareState = data.state;
        this.handlers.onStateChange?.(data.state);
        break;
      }

      case 'capture.progress': {
        const data = envelope.data as CaptureProgressData;
        // Only process progress for the active capture
        if (this.pendingCaptureRequestId && data.requestId === this.pendingCaptureRequestId) {
          this.handlers.onCaptureProgress?.(data);
        }
        break;
      }

      case 'capture.completed': {
        const data = envelope.data as CaptureCompletedData;
        // Only process completed for the active capture
        if (this.pendingCaptureRequestId && data.requestId === this.pendingCaptureRequestId) {
          this.clearCaptureOperationTimeout();
          this.pendingCaptureRequestId = null;
          this.handlers.onCaptureCompleted?.(data);
        }
        break;
      }

      case 'capture.failed': {
        const data = envelope.data as CaptureFailedData;
        // Only process failed for the active capture
        if (this.pendingCaptureRequestId && data.requestId === this.pendingCaptureRequestId) {
          this.clearCaptureOperationTimeout();
          this.pendingCaptureRequestId = null;
          this.handlers.onCaptureFailed?.(data);
        }
        break;
      }

      case 'recognition.detected': {
        const data = envelope.data as RecognitionDetectedData;
        this.handlers.onRecognitionDetected?.(data);
        break;
      }

      case 'sync.failed': {
        const data = envelope.data as { syncId: string; error: { code: string; message: string } };
        // Only process sync.failed for the active sync
        if (this.currentSyncId && data.syncId === this.currentSyncId) {
          this.activeSync = null;
          this.currentSyncId = null;
          const error = new Error(data.error.message);
          (error as any).code = data.error.code;
          this.handlers.onSyncFailed?.(error);
        }
        break;
      }

      case 'protocol.error': {
        const data = envelope.data as { error: { code: ProtocolErrorCode; message: string; details?: Record<string, unknown> } };
        this.handlers.onDeviceError?.(data.error.code, data.error.message, data.error.details);
        break;
      }

      default:
        // Unknown event - ignore per protocol spec
        break;
    }
  }

  private captureOperationTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  private startCaptureOperationTimeout(operationTimeoutMs: number): void {
    this.clearCaptureOperationTimeout();
    // Add a small margin for transport/scheduling as per protocol.md
    const marginMs = 500;
    this.captureOperationTimeoutHandle = setTimeout(() => {
      if (this.pendingCaptureRequestId) {
        const requestId = this.pendingCaptureRequestId;
        this.pendingCaptureRequestId = null;
        this.handlers.onCaptureFailed?.({
          requestId,
          error: {
            code: 'OPERATION_TIMEOUT',
            message: `Capture operation timed out after ${operationTimeoutMs}ms`,
          },
        });
        this.handlers.onError?.(new Error(`Capture operation timed out after ${operationTimeoutMs}ms`));
      }
    }, operationTimeoutMs + marginMs);
    if (this.captureOperationTimeoutHandle && typeof this.captureOperationTimeoutHandle.unref === 'function') {
      this.captureOperationTimeoutHandle.unref();
    }
  }

  private clearCaptureOperationTimeout(): void {
    if (this.captureOperationTimeoutHandle) {
      clearTimeout(this.captureOperationTimeoutHandle);
      this.captureOperationTimeoutHandle = null;
    }
  }

  private handleTransportError(error: Error): void {
    this.handlers.onError?.(error);
    
    if (this.transport.getState() === 'error' || this.transport.getState() === 'closed') {
      this.handleDisconnect();
    }
  }

  private handleTransportStateChange(state: 'closed' | 'opening' | 'open' | 'closing' | 'error'): void {
    if (state === 'error' || state === 'closed') {
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    this.clearHandshakeTimeout();
    this.clearCaptureOperationTimeout();
    this.requestManager.cancelAllRequests('Serial disconnected');
    
    this.isHandshakeComplete = false;
    this.deviceInfo = null;
    this.currentFirmwareState = FirmwareState.INITIALIZING;
    this.activeProfile = null;
    this.activeSync = null;
    this.pendingCaptureRequestId = null;
    this.currentSyncId = null;

    this.setConnectionStatus('error', null, 'Serial port disconnected');
    this.handlers.onError?.(new Error('Serial port disconnected'));
  }

  private setConnectionStatus(
    status: 'disconnected' | 'connecting' | 'handshake' | 'connected' | 'error',
    deviceInfo: DeviceInfo | null,
    error: string | null
  ): void {
    this.handlers.onConnectionStatusChange?.(status, deviceInfo, error);
  }
}