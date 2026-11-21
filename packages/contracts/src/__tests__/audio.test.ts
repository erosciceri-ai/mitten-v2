import { describe, expect, it } from 'vitest';
import {
  AUDIO_CHUNK_MAX_BYTES,
  AUDIO_MAX_TRACK_BYTES,
  PROTOCOL_ERROR_CODES,
  createAudioAbortRequest,
  createAudioBeginRequest,
  createAudioChunkRequest,
  createAudioCommitRequest,
  createAudioStatusRequest,
  createErrorResponse,
  createResponse,
  isProtocolCommand,
  parseFrames,
  serializeFrame,
  validateProtocolV2Message,
  validateResponseForCommand,
} from '../index';

const base64 = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64');
const valid = (message: unknown) => validateProtocolV2Message(message).valid;

describe('audio.* requests', () => {
  it('reconoce los cinco comandos', () => {
    for (const command of ['audio.begin', 'audio.chunk', 'audio.commit', 'audio.abort', 'audio.status']) {
      expect(isProtocolCommand(command)).toBe(true);
    }
  });

  it('valida audio.begin', () => {
    const request = (payload: object) => createAudioBeginRequest('a1', payload as never);
    expect(valid(request({ audioTrack: 3, sizeBytes: 32044, crc32: 2553482130 }))).toBe(true);
    expect(valid(request({ audioTrack: 50, sizeBytes: AUDIO_MAX_TRACK_BYTES, crc32: 0 }))).toBe(true);
    for (const bad of [
      { audioTrack: 0, sizeBytes: 100, crc32: 0 },
      { audioTrack: 51, sizeBytes: 100, crc32: 0 },
      { audioTrack: 1.5, sizeBytes: 100, crc32: 0 },
      { audioTrack: 1, sizeBytes: 44, crc32: 0 },
      { audioTrack: 1, sizeBytes: AUDIO_MAX_TRACK_BYTES + 1, crc32: 0 },
      { audioTrack: 1, sizeBytes: 100, crc32: -1 },
      { audioTrack: 1, sizeBytes: 100, crc32: 2 ** 32 },
      { audioTrack: 1, sizeBytes: 100 },
    ]) expect(valid(request(bad))).toBe(false);
  });

  it('valida audio.chunk con base64 canónico de hasta 3072 bytes', () => {
    const request = (payload: object) => createAudioChunkRequest('a2', payload as never);
    expect(valid(request({ audioTrack: 1, offset: 0, data: base64(1) }))).toBe(true);
    expect(valid(request({ audioTrack: 1, offset: 3072, data: base64(AUDIO_CHUNK_MAX_BYTES) }))).toBe(true);
    for (const data of ['', 'abc', 'a b=', '!!!!', base64(AUDIO_CHUNK_MAX_BYTES + 1), 'QQ=', 12]) {
      expect(valid(request({ audioTrack: 1, offset: 0, data }))).toBe(false);
    }
    expect(valid(request({ audioTrack: 1, offset: -1, data: base64(4) }))).toBe(false);
  });

  it('valida commit, abort y status', () => {
    expect(valid(createAudioCommitRequest('a3', { audioTrack: 2 }))).toBe(true);
    expect(valid(createAudioCommitRequest('a3', { audioTrack: 99 }))).toBe(false);
    expect(valid(createAudioAbortRequest('a4', {}))).toBe(true);
    expect(valid(createAudioStatusRequest('a5', {}))).toBe(true);
    expect(valid(createAudioStatusRequest('a5', { audioTrack: 4 }))).toBe(true);
    expect(valid(createAudioStatusRequest('a5', { audioTrack: 0 }))).toBe(false);
  });

  it('un request de audio sobrevive a serialize/parse y cabe en el mensaje máximo', () => {
    const request = createAudioChunkRequest('r'.repeat(64), { audioTrack: 50, offset: 524288, data: base64(AUDIO_CHUNK_MAX_BYTES) });
    const frame = serializeFrame(request);
    expect(frame.length - 1).toBeLessThan(8192);
    expect(parseFrames(new TextEncoder().encode(frame)).frames[0]).toEqual(request);
  });
});

describe('audio.* responses', () => {
  const ok = (command: string, result: object) => validateResponseForCommand(command, createResponse('a1', result as never)).valid;

  it('valida los resultados exitosos', () => {
    expect(ok('audio.begin', { audioTrack: 1, offset: 0, chunkMaxBytes: 3072, idleTimeoutMs: 30000 })).toBe(true);
    expect(ok('audio.begin', { audioTrack: 1, offset: 0, chunkMaxBytes: 0, idleTimeoutMs: 30000 })).toBe(false);
    expect(ok('audio.chunk', { audioTrack: 1, offset: 3072 })).toBe(true);
    expect(ok('audio.chunk', { audioTrack: 1 })).toBe(false);
    expect(ok('audio.commit', { audioTrack: 1, sizeBytes: 32044 })).toBe(true);
    expect(ok('audio.commit', { audioTrack: 1, sizeBytes: 0 })).toBe(false);
    expect(ok('audio.abort', { aborted: true })).toBe(true);
    expect(ok('audio.abort', { aborted: false })).toBe(false);
    expect(ok('audio.status', { tracks: [] })).toBe(true);
    expect(ok('audio.status', { tracks: [{ audioTrack: 1, sizeBytes: 100 }, { audioTrack: 2, sizeBytes: 200, crc32: 5 }] })).toBe(true);
    expect(ok('audio.status', { tracks: [{ audioTrack: 1 }] })).toBe(false);
    expect(ok('audio.status', {})).toBe(false);
  });

  it('acepta los códigos de error de audio con details.offset', () => {
    const codes = PROTOCOL_ERROR_CODES.filter(code => code.startsWith('AUDIO_'));
    expect(codes.length).toBe(11);
    const error = createErrorResponse('a1', 'AUDIO_BAD_OFFSET', 'Desplazamiento inesperado', { offset: 500 });
    expect(validateResponseForCommand('audio.chunk', error).valid).toBe(true);
  });
});
