import {
  ActiveProfileInfo,
  FirmwareState,
  Gesture,
  PROTOCOL_VERSION,
  ProtocolEnvelope,
  ProtocolErrorCode,
  RequestEnvelope,
  SyncAbortPayload,
  SyncBeginPayload,
  SyncCommitPayload,
  SyncGesturePayload,
  createCaptureCompletedEvent,
  createCaptureFailedEvent,
  createCaptureStartResponse,
  createDeviceStateEvent,
  createErrorResponse,
  createHandshakeResponse,
  createProtocolErrorEvent,
  createStatusResponse,
  createSyncAbortResponse,
  createSyncBeginResponse,
  createSyncCommitResponse,
  createSyncFailedEvent,
  createSyncGestureResponse,
  isNonNegativeInteger,
  isProtocolCommand,
  isProtocolVersionCompatible,
  isValidSyncId,
  validateGesture,
  validateGestureData,
  validateHandshakeRequestPayload,
  validateSyncAbortPayload,
  validateSyncBeginPayload,
  validateSyncCommitPayload,
  validateSyncGesturePayload,
  type ParseError,
} from '@mitten/contracts';

import { createCaptureProgressEvents, generateGestureData } from './capture';
import { DeviceStateMachine } from './device-state';

const FIRMWARE_VERSION = '2.0.0-simulator.1';
const MAX_GESTURES = 50;
const MAX_MESSAGE_BYTES = 8192;
const CAPTURE_OPERATION_TIMEOUT_MS = 15_000;
const SYNC_IDLE_TIMEOUT_MS = 10_000;

type EnvelopeEmitter = (envelope: ProtocolEnvelope) => void;
type Delay = (milliseconds: number) => Promise<void>;

export interface SimulatorDispatcherOptions {
  delay?: Delay;
  captureDelayMs?: number;
  captureOutcome?: 'success' | 'failure';
  gestureSeed?: number;
}

const defaultDelay: Delay = milliseconds =>
  milliseconds > 0
    ? new Promise(resolve => setTimeout(resolve, milliseconds))
    : Promise.resolve();

// Active profile stored in the simulator (persisted across sync transactions)
interface StoredProfile {
  profileId: string;
  profileRevision: string;
  gestures: Gesture[];
}

// Staging state during a sync transaction
interface SyncStagingState {
  syncId: string;
  profileId: string;
  profileRevision: string;
  expectedGestureCount: number;
  receivedCount: number;
  nextIndex: number;
  receivedIds: Set<number>;
  gestures: Gesture[];
}

export class SimulatorDispatcher {
  private readonly state: DeviceStateMachine;
  private readonly delay: Delay;
  private readonly captureDelayMs: number;
  private readonly captureOutcome: 'success' | 'failure';
  private readonly gestureSeed: number | undefined;
  private handshakeCompatible = false;
  private activeCaptureRequestId: string | null = null;
  private started = false;

  // Active profile (persisted)
  private activeProfile: StoredProfile | null = null;

  // Active sync transaction (staging)
  private activeSync: SyncStagingState | null = null;

  // Sync idle timeout timer
  private syncIdleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly emit: EnvelopeEmitter,
    options: SimulatorDispatcherOptions = {},
  ) {
    this.delay = options.delay ?? defaultDelay;
    this.captureDelayMs = options.captureDelayMs ?? 25;
    this.captureOutcome = options.captureOutcome ?? 'success';
    this.gestureSeed = options.gestureSeed;
    this.state = new DeviceStateMachine(current => {
      this.emit(createDeviceStateEvent({ state: current }));
    });
  }

  startup(): void {
    if (this.started) return;
    this.started = true;
    this.state.startup();
  }

  dispatch(envelope: ProtocolEnvelope): Promise<void> | undefined {
    if (envelope.type !== 'request') {
      this.emitUncorrelatedError(
        ProtocolErrorCode.INVALID_MESSAGE,
        'The device accepts request envelopes only',
      );
      return undefined;
    }

    if (envelope.command === 'device.handshake') {
      this.handleHandshake(envelope);
      return undefined;
    }

    if (!this.handshakeCompatible) {
      this.emit(createErrorResponse(
        envelope.id,
        ProtocolErrorCode.HANDSHAKE_REQUIRED,
        'A compatible device.handshake is required before this command',
      ));
      return undefined;
    }

    if (envelope.v !== PROTOCOL_VERSION) {
      this.emit(createErrorResponse(
        envelope.id,
        ProtocolErrorCode.PROTOCOL_INCOMPATIBLE,
        `Protocol version ${String(envelope.v)} is not supported`,
      ));
      return undefined;
    }

    if (!isProtocolCommand(envelope.command)) {
      this.emitUnknownCommand(envelope);
      return undefined;
    }

    switch (envelope.command) {
      case 'device.status':
        this.handleStatus(envelope);
        return undefined;
      case 'capture.start':
        return this.handleCaptureStart(envelope);
      case 'sync.begin':
        return this.handleSyncBegin(envelope);
      case 'sync.gesture':
        return this.handleSyncGesture(envelope);
      case 'sync.commit':
        return this.handleSyncCommit(envelope);
      case 'sync.abort':
        return this.handleSyncAbort(envelope);
      default:
        this.emitUnknownCommand(envelope);
        return undefined;
    }
  }

  handleParseError(error: ParseError): void {
    const code = this.parseErrorCode(error);
    this.emitUncorrelatedError(code, error.message);
  }

  get currentState(): FirmwareState {
    return this.state.current;
  }

  private handleHandshake(request: RequestEnvelope<string, object>): void {
    const payload = request.payload as { supportedProtocolVersions: number[]; client: string };
    const validation = validateHandshakeRequestPayload(payload);
    if (!validation.valid) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_PAYLOAD,
        'Invalid device.handshake payload',
        { errors: validation.errors },
      ));
      return;
    }

    const supportedVersions = payload.supportedProtocolVersions;
    this.handshakeCompatible = isProtocolVersionCompatible(PROTOCOL_VERSION, supportedVersions);
    this.emit(createHandshakeResponse(request.id, {
      device: 'MITTEN',
      firmwareVersion: FIRMWARE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      state: this.state.current,
      capabilities: {
        maxGestures: MAX_GESTURES,
        maxMessageBytes: MAX_MESSAGE_BYTES,
      },
    }));
  }

  private handleStatus(request: RequestEnvelope<string, object>): void {
    const activeProfileInfo: ActiveProfileInfo | null = this.activeProfile
      ? {
          profileId: this.activeProfile.profileId,
          profileRevision: this.activeProfile.profileRevision,
          gestureCount: this.activeProfile.gestures.length,
        }
      : null;

    const activeSyncInfo = this.activeSync
      ? {
          syncId: this.activeSync.syncId,
          profileId: this.activeSync.profileId,
          profileRevision: this.activeSync.profileRevision,
          expectedGestureCount: this.activeSync.expectedGestureCount,
          receivedCount: this.activeSync.receivedCount,
          nextIndex: this.activeSync.nextIndex,
        }
      : null;

    this.emit(createStatusResponse(request.id, {
      state: this.state.current,
      activeProfile: activeProfileInfo,
      activeSync: activeSyncInfo,
      error: null,
    }));
  }

  private handleCaptureStart(request: RequestEnvelope<string, object>): Promise<void> | undefined {
    if (request.id === this.activeCaptureRequestId) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.DUPLICATE_REQUEST_ID,
        'The request id is already associated with the active capture',
      ));
      return undefined;
    }

    if (this.state.current === FirmwareState.CAPTURING || this.state.current === FirmwareState.SYNCING) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.DEVICE_BUSY,
        'Another exclusive operation is in progress',
      ));
      return undefined;
    }

    if (this.state.current !== FirmwareState.IDLE) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_STATE,
        'capture.start is only allowed while the device is IDLE',
      ));
      return undefined;
    }

    this.activeCaptureRequestId = request.id;
    this.emit(createCaptureStartResponse(request.id, {
      accepted: true,
      operationTimeoutMs: CAPTURE_OPERATION_TIMEOUT_MS,
    }));

    this.state.startCapture();

    return this.runCapture(request.id);
  }

  private handleSyncBegin(request: RequestEnvelope<string, object>): Promise<void> | undefined {
    const payload = request.payload as SyncBeginPayload;
    const validation = validateSyncBeginPayload(payload);
    if (!validation.valid) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_PAYLOAD,
        'Invalid sync.begin payload',
        { errors: validation.errors },
      ));
      return;
    }

    // Must be in IDLE state
    if (this.state.current === FirmwareState.CAPTURING || this.state.current === FirmwareState.SYNCING) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.DEVICE_BUSY,
        'Another exclusive operation is in progress',
      ));
      return;
    }

    if (this.state.current !== FirmwareState.IDLE) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_STATE,
        'sync.begin is only allowed while the device is IDLE',
      ));
      return;
    }

    // Check gestureCount against capacity
    if (payload.gestureCount > MAX_GESTURES) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.PROFILE_TOO_LARGE,
        `gestureCount ${payload.gestureCount} exceeds maximum capacity ${MAX_GESTURES}`,
        { gestureCount: payload.gestureCount, maxGestures: MAX_GESTURES },
      ));
      return;
    }

    // Initialize staging state
    this.activeSync = {
      syncId: payload.syncId,
      profileId: payload.profileId,
      profileRevision: payload.profileRevision,
      expectedGestureCount: payload.gestureCount,
      receivedCount: 0,
      nextIndex: 0,
      receivedIds: new Set(),
      gestures: [],
    };

    // Emit response FIRST, then transition state (per protocol)
    this.emit(createSyncBeginResponse(request.id, {
      accepted: true,
      syncId: payload.syncId,
      expectedGestureCount: payload.gestureCount,
      receivedCount: 0,
      nextIndex: 0,
      idleTimeoutMs: SYNC_IDLE_TIMEOUT_MS,
    }));

    // Transition to SYNCING state
    this.state.startSync();

    // Start idle timeout timer
    this.startSyncIdleTimer();
  }

  private handleSyncGesture(request: RequestEnvelope<string, object>): Promise<void> | undefined {
    const payload = request.payload as SyncGesturePayload;

    // First validate structural fields only (syncId, index)
    const structuralValidation = this.validateSyncGestureStructure(payload);
    if (!structuralValidation.valid) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_PAYLOAD,
        'Invalid sync.gesture payload',
        { errors: structuralValidation.errors },
      ));
      return;
    }

    // Must have active sync transaction
    if (!this.activeSync) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_NOT_ACTIVE,
        'No active synchronization transaction',
      ));
      return;
    }

    // syncId must match
    if (payload.syncId !== this.activeSync.syncId) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_ID_MISMATCH,
        'syncId does not match active transaction',
        { expected: this.activeSync.syncId, received: payload.syncId },
      ));
      return;
    }

    // Index must match nextIndex
    if (payload.index !== this.activeSync.nextIndex) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_SEQUENCE_INVALID,
        `Invalid gesture index: expected ${this.activeSync.nextIndex}, got ${payload.index}`,
        { expectedIndex: this.activeSync.nextIndex, receivedIndex: payload.index },
      ));
      // Discard staging and return to IDLE
      this.abortSync();
      return;
    }

    const gesture = payload.gesture;

    // Check for duplicate gesture ID within this transaction
    if (this.activeSync.receivedIds.has(gesture.id)) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.DUPLICATE_GESTURE_ID,
        `Duplicate gesture ID ${gesture.id} in staging`,
        { gestureId: gesture.id },
      ));
      // Discard staging and return to IDLE
      this.abortSync();
      return;
    }

    // Validate gesture data (metadata + data) - return GESTURE_INVALID for data issues
    const gestureValidation = validateGesture(gesture);
    if (!gestureValidation.valid) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.GESTURE_INVALID,
        'Gesture data is invalid',
        { errors: gestureValidation.errors },
      ));
      // Discard staging and return to IDLE
      this.abortSync();
      return;
    }

    // Add to staging
    this.activeSync.receivedIds.add(gesture.id);
    this.activeSync.gestures.push(gesture);
    this.activeSync.receivedCount++;
    this.activeSync.nextIndex++;

    this.emit(createSyncGestureResponse(request.id, {
      syncId: this.activeSync.syncId,
      receivedCount: this.activeSync.receivedCount,
      nextIndex: this.activeSync.nextIndex,
    }));

    // Reset idle timeout timer on successful gesture
    this.startSyncIdleTimer();
  }

  // Validate only structural fields (syncId, index) without gesture data
  private validateSyncGestureStructure(payload: SyncGesturePayload): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (
      typeof payload.syncId !== 'string' ||
      !isValidSyncId(payload.syncId)
    ) {
      errors.push('syncId must be a valid syncId string');
    }

    if (!isNonNegativeInteger(payload.index)) {
      errors.push('index must be a non-negative integer');
    }

    if (!payload.gesture) {
      errors.push('gesture is required');
    }

    return { valid: errors.length === 0, errors };
  }

  private handleSyncCommit(request: RequestEnvelope<string, object>): Promise<void> | undefined {
    const payload = request.payload as SyncCommitPayload;
    const validation = validateSyncCommitPayload(payload);
    if (!validation.valid) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_PAYLOAD,
        'Invalid sync.commit payload',
        { errors: validation.errors },
      ));
      return;
    }

    // Must have active sync transaction
    if (!this.activeSync) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_NOT_ACTIVE,
        'No active synchronization transaction',
      ));
      return;
    }

    // syncId must match
    if (payload.syncId !== this.activeSync.syncId) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_ID_MISMATCH,
        'syncId does not match active transaction',
        { expected: this.activeSync.syncId, received: payload.syncId },
      ));
      return;
    }

    // Verify received all expected gestures
    if (this.activeSync.receivedCount !== this.activeSync.expectedGestureCount) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_INCOMPLETE,
        `Incomplete synchronization: received ${this.activeSync.receivedCount} of ${this.activeSync.expectedGestureCount} gestures`,
        { receivedCount: this.activeSync.receivedCount, expectedGestureCount: this.activeSync.expectedGestureCount },
      ));
      this.abortSync();
      return;
    }

    // Verify indices form complete sequence 0..gestureCount-1
    if (this.activeSync.nextIndex !== this.activeSync.expectedGestureCount) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_INCOMPLETE,
        'Gesture index sequence is incomplete',
      ));
      this.abortSync();
      return;
    }

    // Verify no duplicate IDs (already checked during staging, but double-check)
    if (this.activeSync.receivedIds.size !== this.activeSync.gestures.length) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.DUPLICATE_GESTURE_ID,
        'Duplicate gesture IDs detected in staging',
      ));
      this.abortSync();
      return;
    }

    // Commit: replace active profile with staged gestures
    this.activeProfile = {
      profileId: this.activeSync.profileId,
      profileRevision: this.activeSync.profileRevision,
      gestures: [...this.activeSync.gestures],
    };

    const syncId = this.activeSync.syncId;
    this.activeSync = null;
    this.clearSyncIdleTimer();

    // Emit response FIRST, then transition state (per protocol)
    this.emit(createSyncCommitResponse(request.id, {
      committed: true,
      syncId,
      activeProfile: {
        profileId: this.activeProfile.profileId,
        profileRevision: this.activeProfile.profileRevision,
        gestureCount: this.activeProfile.gestures.length,
      },
    }));

    this.state.finishSync();
  }

  private handleSyncAbort(request: RequestEnvelope<string, object>): Promise<void> | undefined {
    const payload = request.payload as SyncAbortPayload;
    const validation = validateSyncAbortPayload(payload);
    if (!validation.valid) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.INVALID_PAYLOAD,
        'Invalid sync.abort payload',
        { errors: validation.errors },
      ));
      return;
    }

    // Must have active sync transaction
    if (!this.activeSync) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_NOT_ACTIVE,
        'No active synchronization transaction',
      ));
      return;
    }

    // syncId must match
    if (payload.syncId !== this.activeSync.syncId) {
      this.emit(createErrorResponse(
        request.id,
        ProtocolErrorCode.SYNC_ID_MISMATCH,
        'syncId does not match active transaction',
        { expected: this.activeSync.syncId, received: payload.syncId },
      ));
      return;
    }

    // Emit response FIRST, then abort (per protocol)
    this.emit(createSyncAbortResponse(request.id, {
      aborted: true,
      syncId: payload.syncId,
    }));

    this.abortSync();
  }

  private abortSync(): void {
    this.clearSyncIdleTimer();
    this.activeSync = null;
    this.state.finishSync();
  }

  private startSyncIdleTimer(): void {
    this.clearSyncIdleTimer();
    this.syncIdleTimer = setTimeout(() => this.handleSyncIdleTimeout(), SYNC_IDLE_TIMEOUT_MS);
    if (this.syncIdleTimer && typeof this.syncIdleTimer.unref === 'function') {
      this.syncIdleTimer.unref();
    }
  }

  private clearSyncIdleTimer(): void {
    if (this.syncIdleTimer !== null) {
      clearTimeout(this.syncIdleTimer);
      this.syncIdleTimer = null;
    }
  }

  private handleSyncIdleTimeout(): void {
    if (!this.activeSync) return;

    const syncId = this.activeSync.syncId;

    // Emit sync.failed event with SYNC_TIMEOUT error
    this.emit(createSyncFailedEvent({
      syncId,
      error: {
        code: ProtocolErrorCode.SYNC_TIMEOUT,
        message: 'Synchronization timed out',
      },
    }));

    // Discard staging, preserve active profile, return to IDLE
    this.activeSync = null;
    this.state.finishSync();
  }

  private async runCapture(requestId: string): Promise<void> {
    try {
      for (const progressEvent of createCaptureProgressEvents(requestId)) {
        await this.delay(this.captureDelayMs);
        this.emit(progressEvent);
      }

      if (this.captureOutcome === 'failure') {
        this.emit(createCaptureFailedEvent({
          requestId,
          error: {
            code: ProtocolErrorCode.SENSOR_ERROR,
            message: 'Simulated sensor read failure',
          },
        }));
        return;
      }

      const data = generateGestureData(this.gestureSeed);
      const validation = validateGestureData(data);
      if (!validation.valid) {
        this.emit(createCaptureFailedEvent({
          requestId,
          error: {
            code: ProtocolErrorCode.INTERNAL_ERROR,
            message: 'Simulator generated invalid GestureData',
            details: { errors: validation.errors },
          },
        }));
        return;
      }

      this.emit(createCaptureCompletedEvent({ requestId, data }));
    } catch (error) {
      this.emit(createCaptureFailedEvent({
        requestId,
        error: {
          code: ProtocolErrorCode.INTERNAL_ERROR,
          message: 'Unexpected capture simulation failure',
          details: { reason: error instanceof Error ? error.message : String(error) },
        },
      }));
    } finally {
      this.activeCaptureRequestId = null;
      this.state.finishCapture();
    }
  }

  private emitUnknownCommand(request: RequestEnvelope<string, object>): void {
    this.emit(createErrorResponse(
      request.id,
      ProtocolErrorCode.UNKNOWN_COMMAND,
      'Unknown or unsupported simulator command',
      { command: request.command },
    ));
  }

  private emitUncorrelatedError(code: ProtocolErrorCode, message: string): void {
    if (!this.handshakeCompatible) return;
    this.emit(createProtocolErrorEvent({ code, message }));
  }

  private parseErrorCode(error: ParseError): ProtocolErrorCode {
    switch (error.type) {
      case 'INVALID_JSON':
        return ProtocolErrorCode.INVALID_JSON;
      case 'MESSAGE_TOO_LARGE':
        return ProtocolErrorCode.MESSAGE_TOO_LARGE;
      case 'INCOMPLETE_MESSAGE':
        return ProtocolErrorCode.INCOMPLETE_MESSAGE;
      case 'INVALID_UTF8':
      case 'INVALID_MESSAGE':
      default:
        return ProtocolErrorCode.INVALID_MESSAGE;
    }
  }
}