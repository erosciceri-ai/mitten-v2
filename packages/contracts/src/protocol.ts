/** Browser- and Node-compatible NDJSON framing for MITTEN Protocol V2. */

import {
  PROTOCOL_VERSION,
  isProtocolCommand,
  isProtocolEvent,
  isValidRequestId,
} from './types';
import type {
  CaptureCompletedData,
  CaptureCompletedEvent,
  CaptureFailedData,
  CaptureFailedEvent,
  CaptureProgressData,
  CaptureProgressEvent,
  CaptureStartRequest,
  CaptureStartResult,
  DeviceInfo,
  DeviceStateData,
  DeviceStateEvent,
  DeviceStatusRequest,
  DeviceStatusResult,
  ErrorResponseEnvelope,
  EventEnvelope,
  HandshakeRequest,
  HandshakeResponseResult,
  ProtocolCommand,
  ProtocolEnvelope,
  ProtocolError,
  ProtocolErrorEvent,
  ProtocolEvent,
  RecognitionDetectedData,
  RecognitionDetectedEvent,
  RequestEnvelope,
  ResponseEnvelope,
  SuccessResponseEnvelope,
  SyncAbortPayload,
  SyncAbortRequest,
  SyncAbortResult,
  SyncBeginPayload,
  SyncBeginRequest,
  SyncBeginResult,
  SyncCommitPayload,
  SyncCommitRequest,
  SyncCommitResult,
  SyncFailedData,
  SyncFailedEvent,
  SyncGesturePayload,
  SyncGestureRequest,
  SyncGestureResult,
  ValidationResult,
} from './types';
import { validateEnvelope } from './validators';

export const FRAME_DELIMITER = '\n';
export const FRAME_DELIMITER_BYTE = 0x0a;
export const CR_BYTE = 0x0d;

/** Finite local limit used only before maxMessageBytes is known. */
export const BOOTSTRAP_MAX_MESSAGE_BYTES = 4096;

const textEncoder = new TextEncoder();

export type ParseErrorType =
  | 'INVALID_JSON'
  | 'INVALID_UTF8'
  | 'MESSAGE_TOO_LARGE'
  | 'INCOMPLETE_MESSAGE'
  | 'INVALID_MESSAGE';

export interface ParseError {
  type: ParseErrorType;
  message: string;
  rawData?: Uint8Array;
}

export interface ParseResult {
  frames: ProtocolEnvelope[];
  remaining: Uint8Array;
  errors: ParseError[];
}

export type EnvelopeValidator = (value: unknown) => ValidationResult;

export interface ParserOptions {
  maxMessageBytes?: number;
  validator?: EnvelopeValidator;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) return right.slice();
  if (right.length === 0) return left.slice();

  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
}

function preview(bytes: Uint8Array): Uint8Array {
  return bytes.slice(0, Math.min(bytes.length, 100));
}

/** Incremental byte parser. One instance represents one receive stream. */
export class NdjsonParser {
  private pending = new Uint8Array();
  private discardingOversizedFrame = false;
  private readonly maxMessageBytes: number;
  private readonly validator: EnvelopeValidator;

  constructor(options: ParserOptions = {}) {
    const maxMessageBytes = options.maxMessageBytes ?? BOOTSTRAP_MAX_MESSAGE_BYTES;
    if (!Number.isInteger(maxMessageBytes) || maxMessageBytes <= 0) {
      throw new RangeError('maxMessageBytes must be a positive integer');
    }

    this.maxMessageBytes = maxMessageBytes;
    this.validator = options.validator ?? validateEnvelope;
  }

  push(chunk: Uint8Array): ParseResult {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('NDJSON parser chunks must be Uint8Array values');
    }

    const frames: ProtocolEnvelope[] = [];
    const errors: ParseError[] = [];
    let incoming = chunk;

    if (this.discardingOversizedFrame) {
      const delimiterIndex = incoming.indexOf(FRAME_DELIMITER_BYTE);
      if (delimiterIndex === -1) {
        return { frames, errors, remaining: new Uint8Array() };
      }

      this.discardingOversizedFrame = false;
      incoming = incoming.slice(delimiterIndex + 1);
    }

    let buffer = concatBytes(this.pending, incoming);
    this.pending = new Uint8Array();

    while (buffer.length > 0) {
      const delimiterIndex = buffer.indexOf(FRAME_DELIMITER_BYTE);
      if (delimiterIndex === -1) {
        if (buffer.length > this.maxMessageBytes) {
          errors.push({
            type: 'MESSAGE_TOO_LARGE',
            message: `Frame exceeds maxMessageBytes (${buffer.length} > ${this.maxMessageBytes})`,
            rawData: preview(buffer),
          });
          this.discardingOversizedFrame = true;
        } else {
          this.pending = buffer.slice();
        }
        break;
      }

      let lineEnd = delimiterIndex;
      if (lineEnd > 0 && buffer[lineEnd - 1] === CR_BYTE) lineEnd -= 1;
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(delimiterIndex + 1);

      if (line.length > this.maxMessageBytes) {
        errors.push({
          type: 'MESSAGE_TOO_LARGE',
          message: `Frame exceeds maxMessageBytes (${line.length} > ${this.maxMessageBytes})`,
          rawData: preview(line),
        });
        continue;
      }

      let decoded: string;
      try {
        decoded = new TextDecoder('utf-8', { fatal: true }).decode(line);
      } catch (error) {
        errors.push({
          type: 'INVALID_UTF8',
          message: `Invalid UTF-8 frame: ${error instanceof Error ? error.message : String(error)}`,
          rawData: preview(line),
        });
        continue;
      }

      if (/^ *$/.test(decoded)) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(decoded);
      } catch (error) {
        errors.push({
          type: 'INVALID_JSON',
          message: `Invalid JSON frame: ${error instanceof Error ? error.message : String(error)}`,
          rawData: preview(line),
        });
        continue;
      }

      const validation = this.validator(parsed);
      if (!validation.valid) {
        errors.push({
          type: 'INVALID_MESSAGE',
          message: validation.errors.join('; '),
          rawData: preview(line),
        });
        continue;
      }

      frames.push(parsed as ProtocolEnvelope);
    }

    return { frames, errors, remaining: this.pending.slice() };
  }

  reset(): void {
    this.pending = new Uint8Array();
    this.discardingOversizedFrame = false;
  }
}

/** Convenience helper for parsing one accumulated byte buffer. */
export function parseFrames(buffer: Uint8Array, options: ParserOptions = {}): ParseResult {
  return new NdjsonParser(options).push(buffer);
}

export function encodeUtf8(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function decodeUtf8(value: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(value);
}

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}

export function serializeFrame(envelope: ProtocolEnvelope): string {
  return `${JSON.stringify(envelope)}${FRAME_DELIMITER}`;
}

export function serializeFrames(envelopes: readonly ProtocolEnvelope[]): string {
  return envelopes.map(serializeFrame).join('');
}

export function createRequest<Command extends ProtocolCommand, Payload extends object = Record<string, never>>(
  id: string,
  command: Command,
  payload: Payload = {} as Payload,
): RequestEnvelope<Command, Payload, 2> {
  if (!isValidRequestId(id)) throw new Error('Invalid request id');
  if (!isProtocolCommand(command)) throw new Error('Unknown Protocol V2 command');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Request payload must be an object');
  }

  return { v: PROTOCOL_VERSION, type: 'request', id, command, payload };
}

export function createResponse<Result extends object>(
  id: string,
  result: Result,
): SuccessResponseEnvelope<Result, 2> {
  if (!isValidRequestId(id)) throw new Error('Invalid response id');
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('Response result must be an object');
  }

  return { v: PROTOCOL_VERSION, type: 'response', id, ok: true, result };
}

export function createErrorResponse(
  id: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorResponseEnvelope<2> {
  if (!isValidRequestId(id)) throw new Error('Invalid response id');

  const error: ProtocolError = { code, message };
  if (details !== undefined) error.details = details;
  return { v: PROTOCOL_VERSION, type: 'response', id, ok: false, error };
}

export function createEvent<Event extends ProtocolEvent, Data extends object = Record<string, never>>(
  event: Event,
  data: Data = {} as Data,
): EventEnvelope<Event, Data, 2> {
  if (!isProtocolEvent(event)) throw new Error('Unknown Protocol V2 event');
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Event data must be an object');
  }

  return { v: PROTOCOL_VERSION, type: 'event', event, data };
}

export function createHandshakeRequest(
  id: string,
  client = 'MITTEN_WEB',
  supportedProtocolVersions: number[] = [PROTOCOL_VERSION],
): HandshakeRequest {
  return createRequest(id, 'device.handshake', { client, supportedProtocolVersions });
}

export function createHandshakeResponse(
  id: string,
  result: HandshakeResponseResult | DeviceInfo,
): ResponseEnvelope<HandshakeResponseResult, 2> {
  return createResponse(id, result);
}

export function createStatusRequest(id: string): DeviceStatusRequest {
  return createRequest(id, 'device.status', {});
}

export function createStatusResponse(id: string, result: DeviceStatusResult): ResponseEnvelope<DeviceStatusResult, 2> {
  return createResponse(id, result);
}

export function createCaptureStartRequest(id: string): CaptureStartRequest {
  return createRequest(id, 'capture.start', {});
}

export function createCaptureStartResponse(id: string, result: CaptureStartResult): ResponseEnvelope<CaptureStartResult, 2> {
  return createResponse(id, result);
}

export function createDeviceStateEvent(data: DeviceStateData): DeviceStateEvent {
  return createEvent('device.state', data);
}

export function createCaptureProgressEvent(data: CaptureProgressData): CaptureProgressEvent {
  return createEvent('capture.progress', data);
}

export function createCaptureCompletedEvent(data: CaptureCompletedData): CaptureCompletedEvent {
  return createEvent('capture.completed', data);
}

export function createCaptureFailedEvent(data: CaptureFailedData): CaptureFailedEvent {
  return createEvent('capture.failed', data);
}

export function createRecognitionDetectedEvent(data: RecognitionDetectedData): RecognitionDetectedEvent {
  return createEvent('recognition.detected', data);
}

export function createSyncBeginRequest(id: string, payload: SyncBeginPayload): SyncBeginRequest {
  return createRequest(id, 'sync.begin', payload);
}

export function createSyncBeginResponse(id: string, result: SyncBeginResult): ResponseEnvelope<SyncBeginResult, 2> {
  return createResponse(id, result);
}

export function createSyncGestureRequest(id: string, payload: SyncGesturePayload): SyncGestureRequest {
  return createRequest(id, 'sync.gesture', payload);
}

export function createSyncGestureResponse(id: string, result: SyncGestureResult): ResponseEnvelope<SyncGestureResult, 2> {
  return createResponse(id, result);
}

export function createSyncCommitRequest(id: string, payload: SyncCommitPayload): SyncCommitRequest {
  return createRequest(id, 'sync.commit', payload);
}

export function createSyncCommitResponse(id: string, result: SyncCommitResult): ResponseEnvelope<SyncCommitResult, 2> {
  return createResponse(id, result);
}

export function createSyncAbortRequest(id: string, payload: SyncAbortPayload): SyncAbortRequest {
  return createRequest(id, 'sync.abort', payload);
}

export function createSyncAbortResponse(id: string, result: SyncAbortResult): ResponseEnvelope<SyncAbortResult, 2> {
  return createResponse(id, result);
}

export function createSyncFailedEvent(data: SyncFailedData): SyncFailedEvent {
  return createEvent('sync.failed', data);
}

export function createProtocolErrorEvent(error: ProtocolError): ProtocolErrorEvent {
  return createEvent('protocol.error', { error });
}
