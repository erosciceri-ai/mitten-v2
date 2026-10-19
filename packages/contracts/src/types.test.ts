import {
  PROTOCOL_VERSION,
  FirmwareState,
  CapturePhase,
  DeviceCapabilities,
  DeviceInfo,
  RequestEnvelope,
  ResponseEnvelope,
  EventEnvelope,
  ProtocolError,
  ProtocolErrorCode,
  isValidFirmwareState,
  isValidCapturePhase,
  isValidRequestId,
  isValidSyncId,
  isValidProfileId,
  isValidProfileRevision,
  isProtocolErrorCode,
  HandshakeRequestPayload,
  HandshakeResponseResult,
  DeviceStatusResult,
  CaptureStartResult,
  CaptureProgressData,
  CaptureCompletedData,
  CaptureFailedData,
  RecognitionDetectedData,
  SyncBeginPayload,
  SyncBeginResult,
  SyncGesturePayload,
  SyncGestureResult,
  SyncCommitPayload,
  SyncCommitResult,
  SyncAbortPayload,
  SyncAbortResult,
  SyncFailedData,
  PROTOCOL_ERROR_CODES,
  FRONTEND_ERROR_CODES,
  SYNC_ID_PATTERN,
  PROFILE_ID_PATTERN,
  PROFILE_REVISION_PATTERN,
  REQUEST_ID_PATTERN,
  PROTOCOL_COMMANDS,
  PROTOCOL_EVENTS,
  isProtocolCommand,
  isProtocolEvent,
} from './types';

describe('types', () => {
  describe('constants', () => {
    it('should have PROTOCOL_VERSION = 2', () => {
      expect(PROTOCOL_VERSION).toBe(2);
    });

    it('should have all firmware states', () => {
      expect(FirmwareState.INITIALIZING).toBe('INITIALIZING');
      expect(FirmwareState.CALIBRATING).toBe('CALIBRATING');
      expect(FirmwareState.IDLE).toBe('IDLE');
      expect(FirmwareState.CAPTURING).toBe('CAPTURING');
      expect(FirmwareState.SYNCING).toBe('SYNCING');
      expect(FirmwareState.ERROR).toBe('ERROR');
    });

    it('should have all capture phases', () => {
      expect(CapturePhase.PREPARING).toBe('PREPARING');
      expect(CapturePhase.RECORDING).toBe('RECORDING');
      expect(CapturePhase.PROCESSING).toBe('PROCESSING');
    });

    it('should expose exactly the documented Protocol V2 commands', () => {
      expect(PROTOCOL_COMMANDS).toEqual([
        'device.handshake',
        'device.status',
        'capture.start',
        'sync.begin',
        'sync.gesture',
        'sync.commit',
        'sync.abort',
      ]);
    });

    it('should expose documented events without inventing sync.progress', () => {
      expect(PROTOCOL_EVENTS).toEqual([
        'device.state',
        'capture.progress',
        'capture.completed',
        'capture.failed',
        'recognition.detected',
        'sync.failed',
        'protocol.error',
        'diagnostic.log',
      ]);
      expect(PROTOCOL_EVENTS).not.toContain('sync.progress');
    });
  });

  describe('known command and event guards', () => {
    it('should distinguish known commands from unknown commands', () => {
      expect(isProtocolCommand('sync.commit')).toBe(true);
      expect(isProtocolCommand('device.fly')).toBe(false);
    });

    it('should distinguish known events from unknown events', () => {
      expect(isProtocolEvent('capture.completed')).toBe(true);
      expect(isProtocolEvent('sync.progress')).toBe(false);
      expect(isProtocolEvent('future.event')).toBe(false);
    });

  });

  describe('isValidFirmwareState', () => {
    it('should return true for valid states', () => {
      expect(isValidFirmwareState('INITIALIZING')).toBe(true);
      expect(isValidFirmwareState('CALIBRATING')).toBe(true);
      expect(isValidFirmwareState('IDLE')).toBe(true);
      expect(isValidFirmwareState('CAPTURING')).toBe(true);
      expect(isValidFirmwareState('SYNCING')).toBe(true);
      expect(isValidFirmwareState('ERROR')).toBe(true);
    });

    it('should return false for invalid states', () => {
      expect(isValidFirmwareState('RECOGNIZING')).toBe(false);
      expect(isValidFirmwareState('DISCONNECTED')).toBe(false);
      expect(isValidFirmwareState('UNKNOWN')).toBe(false);
      expect(isValidFirmwareState('')).toBe(false);
    });
  });

  describe('isValidCapturePhase', () => {
    it('should return true for valid phases', () => {
      expect(isValidCapturePhase('PREPARING')).toBe(true);
      expect(isValidCapturePhase('RECORDING')).toBe(true);
      expect(isValidCapturePhase('PROCESSING')).toBe(true);
    });

    it('should return false for invalid phases', () => {
      expect(isValidCapturePhase('IDLE')).toBe(false);
      expect(isValidCapturePhase('RECORDINGX')).toBe(false);
      expect(isValidCapturePhase('')).toBe(false);
    });
  });

  describe('isValidRequestId', () => {
    it('should return true for valid IDs', () => {
      expect(isValidRequestId('req-1')).toBe(true);
      expect(isValidRequestId('abc123')).toBe(true);
      expect(isValidRequestId('a.b_c-d:e')).toBe(true);
      expect(isValidRequestId('x')).toBe(true);
    });

    it('should return false for invalid IDs', () => {
      expect(isValidRequestId('')).toBe(false);
      expect(isValidRequestId('a@b')).toBe(false);
      expect(isValidRequestId('a b')).toBe(false);
      expect(isValidRequestId('a#b')).toBe(false);
      expect(isValidRequestId('a'.repeat(65))).toBe(false);
    });
  });

  describe('isValidSyncId', () => {
    it('should return true for valid sync IDs', () => {
      expect(isValidSyncId('sync-1')).toBe(true);
      expect(isValidSyncId('sync_abc')).toBe(true);
    });

    it('should return false for invalid sync IDs', () => {
      expect(isValidSyncId('')).toBe(false);
      expect(isValidSyncId('a@b')).toBe(false);
      expect(isValidSyncId('a'.repeat(65))).toBe(false);
    });
  });

  describe('isValidProfileId', () => {
    it('should return true for valid profile IDs', () => {
      expect(isValidProfileId('profile-1')).toBe(true);
      expect(isValidProfileId('profile_abc')).toBe(true);
    });

    it('should return false for invalid profile IDs', () => {
      expect(isValidProfileId('')).toBe(false);
      expect(isValidProfileId('a@b')).toBe(false);
      expect(isValidProfileId('a'.repeat(65))).toBe(false);
    });
  });

  describe('isValidProfileRevision', () => {
    it('should return true for valid revisions', () => {
      expect(isValidProfileRevision('rev-1')).toBe(true);
      expect(isValidProfileRevision('rev_abc')).toBe(true);
    });

    it('should return false for invalid revisions', () => {
      expect(isValidProfileRevision('')).toBe(false);
      expect(isValidProfileRevision('a@b')).toBe(false);
      expect(isValidProfileRevision('a'.repeat(129))).toBe(false);
    });
  });

  describe('isProtocolErrorCode', () => {
    it('should return true for valid error codes', () => {
      expect(isProtocolErrorCode('INVALID_JSON')).toBe(true);
      expect(isProtocolErrorCode('UNKNOWN_COMMAND')).toBe(true);
      expect(isProtocolErrorCode('INVALID_STATE')).toBe(true);
    });

    it('should return false for invalid error codes', () => {
      expect(isProtocolErrorCode('INVALID')).toBe(false);
      expect(isProtocolErrorCode('')).toBe(false);
    });
  });

  describe('PROTOCOL_ERROR_CODES', () => {
    it('should contain all expected error codes', () => {
      expect(PROTOCOL_ERROR_CODES).toContain('INVALID_JSON');
      expect(PROTOCOL_ERROR_CODES).toContain('UNKNOWN_COMMAND');
      expect(PROTOCOL_ERROR_CODES).toContain('SYNC_INCOMPLETE');
      expect(PROTOCOL_ERROR_CODES).toContain('STORAGE_ERROR');
    });
  });

  describe('FRONTEND_ERROR_CODES', () => {
    it('should contain all expected frontend error codes', () => {
      expect(FRONTEND_ERROR_CODES).toContain('WEB_SERIAL_UNAVAILABLE');
      expect(FRONTEND_ERROR_CODES).toContain('SERIAL_PERMISSION_DENIED');
      expect(FRONTEND_ERROR_CODES).toContain('DEVICE_NOT_MITTEN');
    });
  });

  describe('regex patterns', () => {
    it('REQUEST_ID_PATTERN should match valid IDs', () => {
      expect(REQUEST_ID_PATTERN.test('req-1')).toBe(true);
      expect(REQUEST_ID_PATTERN.test('abc123')).toBe(true);
    });

    it('SYNC_ID_PATTERN should match valid sync IDs', () => {
      expect(SYNC_ID_PATTERN.test('sync-1')).toBe(true);
    });

    it('PROFILE_ID_PATTERN should match valid profile IDs', () => {
      expect(PROFILE_ID_PATTERN.test('profile-1')).toBe(true);
    });

    it('PROFILE_REVISION_PATTERN should match valid revisions', () => {
      expect(PROFILE_REVISION_PATTERN.test('rev-1')).toBe(true);
    });
  });
});
