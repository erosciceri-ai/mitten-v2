/**
 * Runtime validators for MITTEN Protocol V2 envelopes and payloads.
 *
 * These validators check all fields documented in docs/protocol.md and
 * docs/gesture-format.md. They deliberately do not depend on any
 * Node.js runtime APIs and use only browser-compatible TextEncoder / TextDecoder
 * helpers from @mitten/contracts.
 *
 * All validators return a ValidationResult { valid: boolean; errors: string[] }
 * even when validation fails, so consumers can choose how to handle it.
 *
 * IMPORTANT: validateEnvelope accepts any positive integer protocol version
 * during bootstrap; the decision to reject future versions happens at a higher
 * layer (validateProtocolV2Message after handshake).
 */

import {
  CAPTURE_PHASES,
  CapturePhase,
  DeviceCapabilities,
  DeviceInfo,
  FIRMWARE_STATES,
  FirmwareState,
  PROTOCOL_COMMANDS,
  PROTOCOL_ERROR_CODES,
  PROTOCOL_EVENTS,
  PROTOCOL_VERSION,
  ProtocolCommand,
  ProtocolError,
  ProtocolErrorCode,
  ProtocolEvent,
  ValidationResult,
  isProtocolErrorCode,
  isValidCapturePhase,
  isValidFirmwareState,
  isValidProfileId,
  isValidProfileRevision,
  isValidRequestId,
  isValidSyncId,
} from './types';
import {
  GESTURE_CONSTRAINTS,
  validateGesture,
  validateGestureData,
} from './gesture';

/* ---------- Helpers ---------- */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isValidProtocolCommand(value: unknown): value is ProtocolCommand {
  return typeof value === 'string' && PROTOCOL_COMMANDS.includes(value as ProtocolCommand);
}

export function isValidProtocolEvent(value: unknown): value is ProtocolEvent {
  return typeof value === 'string' && PROTOCOL_EVENTS.includes(value as ProtocolEvent);
}

export function validateProtocolErrorValue(
  value: unknown,
  path: string = 'error'
): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return errors;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.code !== 'string' || obj.code.length === 0) {
    errors.push(`${path}.code must be a non-empty string`);
  } else if (!isProtocolErrorCode(obj.code)) {
    errors.push(`${path}.code must be a documented ProtocolErrorCode`);
  }

  if (typeof obj.message !== 'string' || obj.message.length === 0) {
    errors.push(`${path}.message must be a non-empty string`);
  }

  if ('details' in obj && !isRecord(obj.details)) {
    errors.push(`${path}.details must be an object`);
  }

  return errors;
}

/* ---------- Envelope Validation ---------- */

export function validateEnvelope(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ['Envelope must be an object'] };
  }

  const obj = value as Record<string, unknown>;

  // v: positive integer
  if (
    typeof obj.v !== 'number' ||
    !Number.isInteger(obj.v) ||
    obj.v < 1
  ) {
    errors.push(`Envelope v must be a positive integer`);
  }

  // type: request / response / event
  if (typeof obj.type !== 'string' || obj.type.length === 0) {
    errors.push('Envelope type must be a non-empty string');
  } else if (obj.type !== 'request' && obj.type !== 'response' && obj.type !== 'event') {
    errors.push('Envelope type must be "request", "response", or "event"');
  }

  // Validate per-type structure
  if (obj.type === 'request') {
    if (typeof obj.id !== 'string' || obj.id.length === 0) {
      errors.push('Request id must be a non-empty string');
    } else if (!isValidRequestId(obj.id)) {
      errors.push('Request id must match ^[A-Za-z0-9._:-]{1,64}$');
    }

    if (typeof obj.command !== 'string' || obj.command.length === 0) {
      errors.push('Request command must be a non-empty string');
    }

    if (!isRecord(obj.payload)) {
      errors.push('Request payload must be an object');
    }
  } else if (obj.type === 'response') {
    if (typeof obj.id !== 'string' || obj.id.length === 0) {
      errors.push('Response id must be a non-empty string');
    } else if (!isValidRequestId(obj.id)) {
      errors.push('Response id must match ^[A-Za-z0-9._:-]{1,64}$');
    }

    if (typeof obj.ok !== 'boolean') {
      errors.push('Response ok must be a boolean');
    } else if (obj.ok) {
      if (!isRecord(obj.result)) {
        errors.push('Successful response result must be an object');
      }
      if ('error' in obj) {
        errors.push('Successful response must not include error field');
        errors.push(...validateProtocolErrorValue(obj.error, 'error'));
      }
    } else {
      if (!obj.error) {
        errors.push('Error response must have error object');
      } else {
        errors.push(...validateProtocolErrorValue(obj.error, 'error'));
      }
      if ('result' in obj) {
        errors.push('Error response must not include result field');
      }
    }
  } else if (obj.type === 'event') {
    if (typeof obj.event !== 'string' || obj.event.length === 0) {
      errors.push('Event name must be a non-empty string');
    }

    if (!isRecord(obj.data)) {
      errors.push('Event data must be an object');
    }
  } else {
    errors.push('Envelope type must be "request", "response", or "event"');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Device State Data Validation ---------- */

export function validateDeviceStateData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  const obj = data as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof obj.state !== 'string' || !isValidFirmwareState(obj.state)) {
    errors.push('state must be a valid firmware state');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Protocol V2 Strict Validation ---------- */

export function validateProtocolV2Message(value: unknown): ValidationResult {
  const envelopeResult = validateEnvelope(value);
  if (!envelopeResult.valid) return envelopeResult;

  const obj = value as Record<string, unknown>;

  // Strict v = 2 check after handshake
  if (obj.v !== 2) {
    return {
      valid: false,
      errors: [`Envelope v must be 2 for strict Protocol V2 validation`],
    };
  }

  // Route based on type and command/event name
  if (obj.type === 'request') {
    switch (obj.command) {
      case 'device.handshake':
        return validateHandshakeRequestPayload(obj.payload);

      case 'device.status':
        // Structure already validated by validateEnvelope;
        // payload is typically {} for device.status
        return { valid: true, errors: [] };

      case 'capture.start':
        return { valid: true, errors: [] };

      case 'sync.begin':
        return validateSyncBeginPayload(obj.payload);

      case 'sync.gesture':
        return validateSyncGesturePayload(obj.payload);

      case 'sync.commit':
        return validateSyncCommitPayload(obj.payload);

      case 'sync.abort':
        return validateSyncAbortPayload(obj.payload);

      default:
        return {
          valid: false,
          errors: [`Unknown Protocol V2 command: ${String(obj.command)}`],
        };
    }
  }

  if (obj.type === 'event') {
    switch (obj.event) {
      case 'device.state':
        return validateDeviceStateData(obj.data);

      case 'capture.progress':
        return validateCaptureProgressData(obj.data);

      case 'capture.completed':
        return validateCaptureCompletedData(obj.data);

      case 'capture.failed':
        return validateCaptureFailedData(obj.data);

      case 'recognition.detected':
        return validateRecognitionDetectedData(obj.data);

      case 'sync.failed':
        return validateSyncFailedData(obj.data);

      case 'protocol.error':
        return validateProtocolErrorData(obj.data);

      case 'diagnostic.log':
        return { valid: true, errors: [] };

      default:
        // Unknown events are accepted structurally (receiver may ignore)
        return { valid: true, errors: [] };
    }
  }

  return { valid: true, errors: [] };
}

/* ---------- Handshake Payload Validation ---------- */

export function validateHandshakeRequestPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return { valid: false, errors: ['Handshake payload must be an object'] };
  }

  const errors: string[] = [];

  if (payload.client !== 'MITTEN_WEB') {
    errors.push('client must be "MITTEN_WEB"');
  }

  if (
    !Array.isArray(payload.supportedProtocolVersions) ||
    payload.supportedProtocolVersions.length === 0
  ) {
    errors.push('supportedProtocolVersions must be a non-empty array');
  } else {
    if (
      !payload.supportedProtocolVersions.every(
        (v: unknown) => isPositiveInteger(v)
      )
    ) {
      errors.push('supportedProtocolVersions must contain positive integers');
    }
    if (
      new Set(payload.supportedProtocolVersions as number[]).size !==
      payload.supportedProtocolVersions.length
    ) {
      errors.push('supportedProtocolVersions must not contain duplicates');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateHandshakeResponseResult(
  result: unknown
): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Handshake result must be an object'] };
  }

  const errors: string[] = [];

  if (result.device !== 'MITTEN') {
    errors.push('device must be "MITTEN"');
  }

  if (
    typeof result.firmwareVersion !== 'string' ||
    result.firmwareVersion.length === 0
  ) {
    errors.push('firmwareVersion must be a non-empty string');
  }

  if (!isPositiveInteger(result.protocolVersion)) {
    errors.push('protocolVersion must be a positive integer');
  }

  if (typeof result.state !== 'string' || result.state.length === 0) {
    errors.push('state must be a non-empty string');
  } else if (!isValidFirmwareState(result.state)) {
    errors.push('state must be a valid firmware state');
  }

  if (!isRecord(result.capabilities)) {
    errors.push('capabilities must be an object');
  } else {
    const caps = result.capabilities as Record<string, unknown>;

    if (!isNonNegativeInteger(caps.maxGestures)) {
      errors.push('capabilities.maxGestures must be a non-negative integer');
    }

    if (!isPositiveInteger(caps.maxMessageBytes)) {
      errors.push('capabilities.maxMessageBytes must be a positive integer');
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Active Profile Validation ---------- */

export function validateActiveProfileInfo(
  value: unknown,
  path: string = 'activeProfile'
): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.profileId !== 'string' || !isValidProfileId(obj.profileId)) {
    errors.push(`${path}.profileId must be a valid profileId string`);
  }

  if (
    typeof obj.profileRevision !== 'string' ||
    !isValidProfileRevision(obj.profileRevision)
  ) {
    errors.push(`${path}.profileRevision must be a valid profileRevision string`);
  }

  if (!isNonNegativeInteger(obj.gestureCount)) {
    errors.push(`${path}.gestureCount must be a non-negative integer`);
  }

  return errors;
}

/* ---------- Active Sync Validation ---------- */

export function validateActiveSyncInfo(
  value: unknown,
  path: string = 'activeSync'
): string[] {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return [`${path} must be an object`];
  }

  const obj = value as Record<string, unknown>;

  if (
    typeof obj.syncId !== 'string' ||
    !isValidSyncId(obj.syncId)
  ) {
    errors.push(`${path}.syncId must be a valid syncId string`);
  }

  if (typeof obj.profileId !== 'string' || !isValidProfileId(obj.profileId)) {
    errors.push(`${path}.profileId must be a valid profileId string`);
  }

  if (
    typeof obj.profileRevision !== 'string' ||
    !isValidProfileRevision(obj.profileRevision)
  ) {
    errors.push(`${path}.profileRevision must be a valid profileRevision string`);
  }

  if (!isNonNegativeInteger(obj.expectedGestureCount)) {
    errors.push(`${path}.expectedGestureCount must be a non-negative integer`);
  }

  if (!isNonNegativeInteger(obj.receivedCount)) {
    errors.push(`${path}.receivedCount must be a non-negative integer`);
  }

  if (!isNonNegativeInteger(obj.nextIndex)) {
    errors.push(`${path}.nextIndex must be a non-negative integer`);
  }

  return errors;
}

/* ---------- Device Status Result Validation ---------- */

export function validateDeviceStatusResult(result: unknown): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Result must be an object'] };
  }

  const errors: string[] = [];const obj = result as Record<string, unknown>;

  if (
    typeof obj.state !== 'string' ||
    !isValidFirmwareState(obj.state)
  ) {
    errors.push('state must be a valid firmware state');
  }

  if (obj.activeProfile !== null) {
    errors.push(...validateActiveProfileInfo(obj.activeProfile, 'activeProfile'));
  }

  if (obj.activeSync !== null) {
    errors.push(...validateActiveSyncInfo(obj.activeSync, 'activeSync'));
  }

  if (obj.error !== null) {
    errors.push(...validateProtocolErrorValue(obj.error, 'error'));
  }

  if (obj.state === FirmwareState.ERROR && obj.error === null) {
    errors.push('error must be provided when state is ERROR');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Capture Start Result Validation ---------- */

export function validateCaptureStartResult(result: unknown): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Result must be an object'] };
  }

  const errors: string[] = [];const obj = result as Record<string, unknown>;

  if (typeof obj.accepted !== 'boolean') {
    errors.push('accepted must be a boolean');
  }

  if (!isPositiveInteger(obj.operationTimeoutMs)) {
    errors.push('operationTimeoutMs must be a positive integer');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Begin Payload Validation ---------- */

export function validateSyncBeginPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const errors: string[] = [];const obj = payload as Record<string, unknown>;

  if (
    typeof obj.syncId !== 'string' ||
    !isValidSyncId(obj.syncId)
  ) {
    errors.push('syncId must be a valid syncId string');
  }

  if (
    typeof obj.profileId !== 'string' ||
    !isValidProfileId(obj.profileId)
  ) {
    errors.push('profileId must be a valid profileId string');
  }

  if (
    typeof obj.profileRevision !== 'string' ||
    !isValidProfileRevision(obj.profileRevision)
  ) {
    errors.push('profileRevision must be a valid profileRevision string');
  }

  if (!isNonNegativeInteger(obj.gestureCount)) {
    errors.push('gestureCount must be a non-negative integer');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Begin Result Validation ---------- */

export function validateSyncBeginResult(result: unknown): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Result must be an object'] };
  }

  const errors: string[] = [];const obj = result as Record<string, unknown>;

  if (typeof obj.accepted !== 'boolean') {
    errors.push('accepted must be a boolean');
  }

  if (typeof obj.syncId !== 'string' || !isValidSyncId(obj.syncId)) {
    errors.push('syncId must be a valid syncId string');
  }

  if (!isNonNegativeInteger(obj.expectedGestureCount)) {
    errors.push('expectedGestureCount must be a non-negative integer');
  }

  if (!isNonNegativeInteger(obj.receivedCount)) {
    errors.push('receivedCount must be a non-negative integer');
  }

  if (!isNonNegativeInteger(obj.nextIndex)) {
    errors.push('nextIndex must be a non-negative integer');
  }

  if (!isPositiveInteger(obj.idleTimeoutMs)) {
    errors.push('idleTimeoutMs must be a positive integer');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Gesture Payload Validation ---------- */

export function validateSyncGesturePayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const errors: string[] = [];const obj = payload as Record<string, unknown>;

  if (
    typeof obj.syncId !== 'string' ||
    !isValidSyncId(obj.syncId)
  ) {
    errors.push('syncId must be a valid syncId string');
  }

  if (!isNonNegativeInteger(obj.index)) {
    errors.push('index must be a non-negative integer');
  }

  // Validate gesture data (metadata + gesture data)
  if (!obj.gesture) {
    errors.push('gesture is required');
  } else {
    const gestureErrors = validateGesture(obj.gesture);
    errors.push(...gestureErrors.errors.map((e: string) => `gesture.${e}`));
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Gesture Result Validation ---------- */

export function validateSyncGestureResult(result: unknown): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Result must be an object'] };
  }

  const errors: string[] = [];const obj = result as Record<string, unknown>;

  if (typeof obj.syncId !== 'string' || !isValidSyncId(obj.syncId)) {
    errors.push('syncId must be a valid syncId string');
  }

  if (!isNonNegativeInteger(obj.receivedCount)) {
    errors.push('receivedCount must be a non-negative integer');
  }

  if (!isNonNegativeInteger(obj.nextIndex)) {
    errors.push('nextIndex must be a non-negative integer');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Commit Payload Validation ---------- */

export function validateSyncCommitPayload(payload: unknown): ValidationResult {
  if (!isRecord(payload)) {
    return { valid: false, errors: ['Payload must be an object'] };
  }

  const errors: string[] = [];const obj = payload as Record<string, unknown>;

  if (
    typeof obj.syncId !== 'string' ||
    !isValidSyncId(obj.syncId)
  ) {
    errors.push('syncId must be a valid syncId string');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Commit Result Validation ---------- */

export function validateSyncCommitResult(result: unknown): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Result must be an object'] };
  }

  const errors: string[] = [];const obj = result as Record<string, unknown>;

  if (obj.committed !== true) {
    errors.push('committed must be true');
  }

  if (typeof obj.syncId !== 'string' || !isValidSyncId(obj.syncId)) {
    errors.push('syncId must be a valid syncId string');
  }

  // When committed is true, activeProfile must be provided and valid
  if (obj.committed === true && !obj.activeProfile) {
    errors.push('activeProfile must be provided when committed is true');
  }

  // Validate active profile info when present
  if (obj.activeProfile) {
    errors.push(...validateActiveProfileInfo(obj.activeProfile, 'activeProfile'));
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Abort Payload Validation ---------- */

export function validateSyncAbortPayload(payload: unknown): ValidationResult {
  return validateSyncCommitPayload(payload);
}

/* ---------- Sync Abort Result Validation ---------- */

export function validateSyncAbortResult(result: unknown): ValidationResult {
  if (!isRecord(result)) {
    return { valid: false, errors: ['Result must be an object'] };
  }

  const errors: string[] = [];const obj = result as Record<string, unknown>;

  if (obj.aborted !== true) {
    errors.push('aborted must be true');
  }

  if (typeof obj.syncId !== 'string' || !isValidSyncId(obj.syncId)) {
    errors.push('syncId must be a valid syncId string');
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Capture Progress Data Validation ---------- */

export function validateCaptureProgressData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  const errors: string[] = [];const obj = data as Record<string, unknown>;

  if (
    typeof obj.requestId !== 'string' ||
    !isValidRequestId(obj.requestId)
  ) {
    errors.push('requestId must match ^[A-Za-z0-9._:-]{1,64}$');
  }

  if (typeof obj.phase !== 'string' || !isValidCapturePhase(obj.phase)) {
    errors.push('phase must be a valid capture phase');
  }

  if ('progress' in obj) {
    const progress = obj.progress as number;
    if (!isNonNegativeInteger(progress) || progress > 100) {
      errors.push('progress must be an integer between 0 and 100');
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Capture Completed Data Validation ---------- */

export function validateCaptureCompletedData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  const errors: string[] = [];const obj = data as Record<string, unknown>;

  if (
    typeof obj.requestId !== 'string' ||
    !isValidRequestId(obj.requestId)
  ) {
    errors.push('requestId must match ^[A-Za-z0-9._:-]{1,64}$');
  }

  // Validate gesture data structure
  if (!obj.data) {
    errors.push('data is required');
  } else {
    const gestureDataErrors = validateGestureData(obj.data);
    errors.push(...gestureDataErrors.errors.map((e: string) => `data.${e}`));
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Capture Failed Data Validation ---------- */

export function validateCaptureFailedData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  const errors: string[] = [];const obj = data as Record<string, unknown>;

  if (
    typeof obj.requestId !== 'string' ||
    !isValidRequestId(obj.requestId)
  ) {
    errors.push('requestId must match ^[A-Za-z0-9._:-]{1,64}$');
  }

  errors.push(...validateProtocolErrorValue(obj.error, 'error'));

  return { valid: errors.length === 0, errors };
}

/* ---------- Recognition Detected Data Validation ---------- */

export function validateRecognitionDetectedData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  const errors: string[] = [];const obj = data as Record<string, unknown>;

  if (
    !isPositiveInteger(obj.gestureId) ||
    obj.gestureId > GESTURE_CONSTRAINTS.GESTURE_ID_MAX
  ) {
    errors.push(
      `gestureId must be an integer between 1 and ${GESTURE_CONSTRAINTS.GESTURE_ID_MAX}`
    );
  }

  if (
    !isPositiveInteger(obj.audioTrack) ||
    obj.audioTrack > GESTURE_CONSTRAINTS.AUDIO_TRACK_MAX
  ) {
    errors.push(
      `audioTrack must be an integer between 1 and ${GESTURE_CONSTRAINTS.AUDIO_TRACK_MAX}`
    );
  }

  return { valid: errors.length === 0, errors };
}

/* ---------- Sync Failed Data Validation ---------- */

export function validateSyncFailedData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  const errors: string[] = [];const obj = data as Record<string, unknown>;

  if (
    typeof obj.syncId !== 'string' ||
    !isValidSyncId(obj.syncId)
  ) {
    errors.push('syncId must be a valid syncId string');
  }

  errors.push(...validateProtocolErrorValue(obj.error, 'error'));

  return { valid: errors.length === 0, errors };
}

/* ---------- Protocol Error Data Validation ---------- */

export function validateProtocolErrorData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  return { valid: validateProtocolErrorValue(data.error, 'error').length === 0, errors: validateProtocolErrorValue(data.error, 'error') };
}

/* ---------- Diagnostic Log Data Validation ---------- */

export function validateDiagnosticLogData(data: unknown): ValidationResult {
  if (!isRecord(data)) {
    return { valid: false, errors: ['data must be an object'] };
  }

  return { valid: true, errors: [] };
}

/* ---------- isProtocolVersionCompatible ---------- */

export function isProtocolVersionCompatible(
  protocolVersion: number,
  supportedProtocolVersions: readonly number[]
): boolean {
  return Number.isInteger(protocolVersion) && supportedProtocolVersions.includes(protocolVersion);
}

/* ---------- Response Validation for Command ---------- */

export function validateResponseForCommand(command: string, response: unknown): ValidationResult {
  // First validate the envelope structure
  const envelopeResult = validateEnvelope(response);
  if (!envelopeResult.valid) return envelopeResult;

  const obj = response as Record<string, unknown>;

  // If ok is false, validate the error field
  if (obj.ok === false) {
    if (!obj.error) {
      return { valid: false, errors: ['Error response must have error object'] };
    }
    return { valid: validateProtocolErrorValue(obj.error, 'error').length === 0, errors: validateProtocolErrorValue(obj.error, 'error') };
  }

  // If ok is true, validate result according to the command
  if (obj.ok === true) {
    // Validate result based on command
    switch (command) {
      case 'device.handshake':
        return validateHandshakeResponseResult(obj.result);

      case 'device.status':
        return validateDeviceStatusResult(obj.result);

      case 'capture.start':
        return validateCaptureStartResult(obj.result);

      case 'sync.begin':
        return validateSyncBeginResult(obj.result);

      case 'sync.gesture':
        return validateSyncGestureResult(obj.result);

      case 'sync.commit':
        return validateSyncCommitResult(obj.result);

      case 'sync.abort':
        return validateSyncAbortResult(obj.result);

      default:
        // For unknown commands, validate the result structurally (must be an object)
        if (!obj.result || typeof obj.result !== 'object' || Array.isArray(obj.result)) {
          return { valid: false, errors: ['Result must be an object for ok:true response'] };
        }
        return { valid: true, errors: [] };
    }
  }

  // ok is not boolean
  return { valid: false, errors: ['ok must be a boolean'] };
}
