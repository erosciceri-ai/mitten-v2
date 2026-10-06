/** Public API for MITTEN shared contracts. */

export * from './types';
export * from './gesture';
export * from './validators';
export * from './protocol';

// Explicitly re-export protocol symbols for better static analysis
export {
  NdjsonParser,
  serializeFrame,
  parseFrames,
  FRAME_DELIMITER,
  FRAME_DELIMITER_BYTE,
  CR_BYTE,
  BOOTSTRAP_MAX_MESSAGE_BYTES,
  encodeUtf8,
  decodeUtf8,
  utf8ByteLength,
  serializeFrames,
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
  createDeviceStateEvent,
  createCaptureProgressEvent,
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
} from './protocol';
