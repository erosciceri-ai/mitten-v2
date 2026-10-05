/**
 * MITTEN V2 - Shared Contracts
 * 
 * This package contains all TypeScript types and runtime validators
 * for the MITTEN V2 protocol and gesture format.
 * 
 * Protocol Version: 2
 * Gesture Format Version: 1
 */

// ============================================================================
// Gesture references
// ============================================================================

import type { GestureData, Gesture } from './gesture';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Protocol Version
// ============================================================================

export const PROTOCOL_VERSION = 2;

export const PROTOCOL_COMMANDS = [
  'device.handshake',
  'device.status',
  'capture.start',
  'sync.begin',
  'sync.gesture',
  'sync.commit',
  'sync.abort',
] as const;

export type ProtocolCommand = typeof PROTOCOL_COMMANDS[number];

export function isProtocolCommand(value: unknown): value is ProtocolCommand {
  return typeof value === 'string' && PROTOCOL_COMMANDS.includes(value as ProtocolCommand);
}

export const PROTOCOL_EVENTS = [
  'device.state',
  'capture.progress',
  'capture.completed',
  'capture.failed',
  'recognition.detected',
  'sync.failed',
  'protocol.error',
  'diagnostic.log',
] as const;

export type ProtocolEvent = typeof PROTOCOL_EVENTS[number];

export function isProtocolEvent(value: unknown): value is ProtocolEvent {
  return typeof value === 'string' && PROTOCOL_EVENTS.includes(value as ProtocolEvent);
}

// ============================================================================
// Firmware States (Protocol Version 2)
// ============================================================================

export enum FirmwareState {
  INITIALIZING = 'INITIALIZING',
  CALIBRATING = 'CALIBRATING',
  IDLE = 'IDLE',
  CAPTURING = 'CAPTURING',
  SYNCING = 'SYNCING',
  ERROR = 'ERROR',
}

export const FIRMWARE_STATES: readonly FirmwareState[] = [
  FirmwareState.INITIALIZING,
  FirmwareState.CALIBRATING,
  FirmwareState.IDLE,
  FirmwareState.CAPTURING,
  FirmwareState.SYNCING,
  FirmwareState.ERROR,
];

export function isValidFirmwareState(state: string): state is FirmwareState {
  return FIRMWARE_STATES.includes(state as FirmwareState);
}

// ============================================================================
// Capture Phases
// ============================================================================

export enum CapturePhase {
  PREPARING = 'PREPARING',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
}

export const CAPTURE_PHASES: readonly CapturePhase[] = [
  CapturePhase.PREPARING,
  CapturePhase.RECORDING,
  CapturePhase.PROCESSING,
];

export function isValidCapturePhase(phase: string): phase is CapturePhase {
  return CAPTURE_PHASES.includes(phase as CapturePhase);
}

// ============================================================================
// Device Capabilities
// ============================================================================

export interface DeviceCapabilities {
  maxGestures: number;
  maxMessageBytes: number;
  [key: string]: unknown;
}

export interface DeviceInfo {
  device: 'MITTEN';
  firmwareVersion: string;
  protocolVersion: number;
  state: FirmwareState;
  capabilities: DeviceCapabilities;
  [key: string]: unknown;
}

// ============================================================================
// Protocol Envelope Types
// ============================================================================

export type MessageType = 'request' | 'response' | 'event';

export interface BaseEnvelope<V extends number = number> {
  v: V; // Protocol version
  type: MessageType;
}

export interface RequestEnvelope<
  Command extends string = string,
  Payload extends object = Record<string, unknown>,
  Version extends number = number,
> extends BaseEnvelope<Version> {
  type: 'request';
  id: string;
  command: Command;
  payload: Payload;
}

export interface SuccessResponseEnvelope<
  Result extends object = Record<string, unknown>,
  Version extends number = number,
> extends BaseEnvelope<Version> {
  type: 'response';
  id: string;
  ok: true;
  result: Result;
  error?: never;
}

export interface ErrorResponseEnvelope<Version extends number = number> extends BaseEnvelope<Version> {
  type: 'response';
  id: string;
  ok: false;
  result?: never;
  error: ProtocolError;
}

export type ResponseEnvelope<
  Result extends object = Record<string, unknown>,
  Version extends number = number,
> = SuccessResponseEnvelope<Result, Version> | ErrorResponseEnvelope<Version>;

export interface EventEnvelope<
  Event extends string = string,
  Data extends object = Record<string, unknown>,
  Version extends number = number,
> extends BaseEnvelope<Version> {
  type: 'event';
  event: Event;
  data: Data;
}

export type ProtocolEnvelope =
  | RequestEnvelope<string, object>
  | ResponseEnvelope<object>
  | EventEnvelope<string, object>;

export interface ProtocolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Request ID validation
// ============================================================================

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function isValidRequestId(id: string): boolean {
  return REQUEST_ID_PATTERN.test(id);
}

// ============================================================================
// Handshake
// ============================================================================

export interface HandshakeRequestPayload {
  client: string; // e.g., 'MITTEN_WEB'
  supportedProtocolVersions: number[];
}

export interface HandshakeResponseResult {
  device: 'MITTEN';
  firmwareVersion: string;
  protocolVersion: number;
  state: FirmwareState;
  capabilities: DeviceCapabilities;
  [key: string]: unknown;
}

// ============================================================================
// Device Status
// ============================================================================

export interface ActiveProfileInfo {
  profileId: string;
  profileRevision: string;
  gestureCount: number;
  [key: string]: unknown;
}

export interface ActiveSyncInfo {
  syncId: string;
  profileId: string;
  profileRevision: string;
  expectedGestureCount: number;
  receivedCount: number;
  nextIndex: number;
  [key: string]: unknown;
}

export interface DeviceStatusResult {
  state: FirmwareState;
  activeProfile: ActiveProfileInfo | null;
  activeSync: ActiveSyncInfo | null;
  error: ProtocolError | null;
  [key: string]: unknown;
}

// ============================================================================
// Capture
// ============================================================================

export interface CaptureStartResult {
  accepted: boolean;
  operationTimeoutMs: number;
  [key: string]: unknown;
}

export interface CaptureProgressData {
  requestId: string;
  phase: CapturePhase;
  progress?: number; // 0-100
  [key: string]: unknown;
}

export interface CaptureCompletedData {
  requestId: string;
  data: GestureData;
  [key: string]: unknown;
}

export interface CaptureFailedData {
  requestId: string;
  error: ProtocolError;
  [key: string]: unknown;
}

// ============================================================================
// Recognition
// ============================================================================

export interface RecognitionDetectedData {
  gestureId: number;
  audioTrack: number;
  [key: string]: unknown;
}

// ============================================================================
// Synchronization
// ============================================================================

export interface SyncBeginPayload {
  syncId: string;
  profileId: string;
  profileRevision: string;
  gestureCount: number;
  [key: string]: unknown;
}

export interface SyncBeginResult {
  accepted: boolean;
  syncId: string;
  expectedGestureCount: number;
  receivedCount: number;
  nextIndex: number;
  idleTimeoutMs: number;
  [key: string]: unknown;
}

export interface SyncGesturePayload {
  syncId: string;
  index: number;
  gesture: Gesture;
  [key: string]: unknown;
}

export interface SyncGestureResult {
  syncId: string;
  receivedCount: number;
  nextIndex: number;
  [key: string]: unknown;
}

export interface SyncCommitPayload {
  syncId: string;
  [key: string]: unknown;
}

export interface SyncCommitResult {
  committed: boolean;
  syncId: string;
  activeProfile: ActiveProfileInfo;
  [key: string]: unknown;
}

export interface SyncAbortPayload {
  syncId: string;
  [key: string]: unknown;
}

export interface SyncAbortResult {
  aborted: boolean;
  syncId: string;
  [key: string]: unknown;
}

export interface SyncFailedData {
  syncId: string;
  error: ProtocolError;
  [key: string]: unknown;
}

export interface DeviceStateData {
  state: FirmwareState;
  [key: string]: unknown;
}

export interface ProtocolErrorData {
  error: ProtocolError;
  [key: string]: unknown;
}

// ============================================================================
// Protocol Error Codes
// ============================================================================

export enum ProtocolErrorCode {
  // Framing/parsing errors
  INVALID_JSON = 'INVALID_JSON',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  MESSAGE_TOO_LARGE = 'MESSAGE_TOO_LARGE',
  INCOMPLETE_MESSAGE = 'INCOMPLETE_MESSAGE',
  
  // Protocol errors
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
  DUPLICATE_REQUEST_ID = 'DUPLICATE_REQUEST_ID',
  HANDSHAKE_REQUIRED = 'HANDSHAKE_REQUIRED',
  PROTOCOL_INCOMPATIBLE = 'PROTOCOL_INCOMPATIBLE',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_STATE = 'INVALID_STATE',
  DEVICE_BUSY = 'DEVICE_BUSY',
  
  // Sync errors
  PROFILE_TOO_LARGE = 'PROFILE_TOO_LARGE',
  GESTURE_INVALID = 'GESTURE_INVALID',
  DUPLICATE_GESTURE_ID = 'DUPLICATE_GESTURE_ID',
  SYNC_NOT_ACTIVE = 'SYNC_NOT_ACTIVE',
  SYNC_ID_MISMATCH = 'SYNC_ID_MISMATCH',
  SYNC_SEQUENCE_INVALID = 'SYNC_SEQUENCE_INVALID',
  SYNC_INCOMPLETE = 'SYNC_INCOMPLETE',
  SYNC_TIMEOUT = 'SYNC_TIMEOUT',
  SYNC_FAILED = 'SYNC_FAILED',
  
  // Capture errors
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  
  // Hardware errors
  SENSOR_ERROR = 'SENSOR_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  
  // Internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const PROTOCOL_ERROR_CODES: readonly ProtocolErrorCode[] = [
  ProtocolErrorCode.INVALID_JSON,
  ProtocolErrorCode.INVALID_MESSAGE,
  ProtocolErrorCode.MESSAGE_TOO_LARGE,
  ProtocolErrorCode.INCOMPLETE_MESSAGE,
  ProtocolErrorCode.UNKNOWN_COMMAND,
  ProtocolErrorCode.DUPLICATE_REQUEST_ID,
  ProtocolErrorCode.HANDSHAKE_REQUIRED,
  ProtocolErrorCode.PROTOCOL_INCOMPATIBLE,
  ProtocolErrorCode.INVALID_PAYLOAD,
  ProtocolErrorCode.INVALID_STATE,
  ProtocolErrorCode.DEVICE_BUSY,
  ProtocolErrorCode.PROFILE_TOO_LARGE,
  ProtocolErrorCode.GESTURE_INVALID,
  ProtocolErrorCode.DUPLICATE_GESTURE_ID,
  ProtocolErrorCode.SYNC_NOT_ACTIVE,
  ProtocolErrorCode.SYNC_ID_MISMATCH,
  ProtocolErrorCode.SYNC_SEQUENCE_INVALID,
  ProtocolErrorCode.SYNC_INCOMPLETE,
  ProtocolErrorCode.SYNC_TIMEOUT,
  ProtocolErrorCode.SYNC_FAILED,
  ProtocolErrorCode.CAPTURE_FAILED,
  ProtocolErrorCode.SENSOR_ERROR,
  ProtocolErrorCode.STORAGE_ERROR,
  ProtocolErrorCode.INTERNAL_ERROR,
];

export function isProtocolErrorCode(code: string): code is ProtocolErrorCode {
  return PROTOCOL_ERROR_CODES.includes(code as ProtocolErrorCode);
}

// ============================================================================
// Frontend-local error codes (not sent by firmware)
// ============================================================================

export enum FrontendErrorCode {
  WEB_SERIAL_UNAVAILABLE = 'WEB_SERIAL_UNAVAILABLE',
  SERIAL_PERMISSION_DENIED = 'SERIAL_PERMISSION_DENIED',
  SERIAL_OPEN_FAILED = 'SERIAL_OPEN_FAILED',
  SERIAL_DISCONNECTED = 'SERIAL_DISCONNECTED',
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  DEVICE_NOT_MITTEN = 'DEVICE_NOT_MITTEN',
  PROTOCOL_INCOMPATIBLE = 'PROTOCOL_INCOMPATIBLE',
  INVALID_DEVICE_MESSAGE = 'INVALID_DEVICE_MESSAGE',
}

export const FRONTEND_ERROR_CODES: readonly FrontendErrorCode[] = [
  FrontendErrorCode.WEB_SERIAL_UNAVAILABLE,
  FrontendErrorCode.SERIAL_PERMISSION_DENIED,
  FrontendErrorCode.SERIAL_OPEN_FAILED,
  FrontendErrorCode.SERIAL_DISCONNECTED,
  FrontendErrorCode.REQUEST_TIMEOUT,
  FrontendErrorCode.DEVICE_NOT_MITTEN,
  FrontendErrorCode.PROTOCOL_INCOMPATIBLE,
  FrontendErrorCode.INVALID_DEVICE_MESSAGE,
];

// ============================================================================
// SyncId validation
// ============================================================================

export const SYNC_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function isValidSyncId(id: string): boolean {
  return SYNC_ID_PATTERN.test(id);
}

// ============================================================================
// Profile ID and Revision validation
// ============================================================================

export const PROFILE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
export const PROFILE_REVISION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function isValidProfileId(id: string): boolean {
  return PROFILE_ID_PATTERN.test(id);
}

export function isValidProfileRevision(revision: string): boolean {
  return PROFILE_REVISION_PATTERN.test(revision);
}

// ============================================================================
// Known Protocol V2 messages
// ============================================================================

export type HandshakeRequest = RequestEnvelope<'device.handshake', HandshakeRequestPayload, 2>;
export type DeviceStatusRequest = RequestEnvelope<'device.status', Record<string, never>, 2>;
export type CaptureStartRequest = RequestEnvelope<'capture.start', Record<string, never>, 2>;
export type SyncBeginRequest = RequestEnvelope<'sync.begin', SyncBeginPayload, 2>;
export type SyncGestureRequest = RequestEnvelope<'sync.gesture', SyncGesturePayload, 2>;
export type SyncCommitRequest = RequestEnvelope<'sync.commit', SyncCommitPayload, 2>;
export type SyncAbortRequest = RequestEnvelope<'sync.abort', SyncAbortPayload, 2>;

export type ProtocolV2Request =
  | HandshakeRequest
  | DeviceStatusRequest
  | CaptureStartRequest
  | SyncBeginRequest
  | SyncGestureRequest
  | SyncCommitRequest
  | SyncAbortRequest;

export type DeviceStateEvent = EventEnvelope<'device.state', DeviceStateData, 2>;
export type CaptureProgressEvent = EventEnvelope<'capture.progress', CaptureProgressData, 2>;
export type CaptureCompletedEvent = EventEnvelope<'capture.completed', CaptureCompletedData, 2>;
export type CaptureFailedEvent = EventEnvelope<'capture.failed', CaptureFailedData, 2>;
export type RecognitionDetectedEvent = EventEnvelope<'recognition.detected', RecognitionDetectedData, 2>;
export type SyncFailedEvent = EventEnvelope<'sync.failed', SyncFailedData, 2>;
export type ProtocolErrorEvent = EventEnvelope<'protocol.error', ProtocolErrorData, 2>;
export type DiagnosticLogEvent = EventEnvelope<'diagnostic.log', Record<string, unknown>, 2>;

export type ProtocolV2Event =
  | DeviceStateEvent
  | CaptureProgressEvent
  | CaptureCompletedEvent
  | CaptureFailedEvent
  | RecognitionDetectedEvent
  | SyncFailedEvent
  | ProtocolErrorEvent
  | DiagnosticLogEvent;

export type ProtocolV2Envelope = ProtocolV2Request | ResponseEnvelope<object, 2> | ProtocolV2Event;
