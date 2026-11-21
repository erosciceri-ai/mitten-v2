import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CHUNK_MAX_BYTES,
  FirmwareState,
  ProtocolEnvelope,
  ProtocolErrorCode,
  createAudioAbortRequest,
  createAudioBeginRequest,
  createAudioChunkRequest,
  createAudioCommitRequest,
  createAudioStatusRequest,
  createCaptureStartRequest,
  createHandshakeRequest,
  createSyncBeginRequest,
  validateEnvelope,
  validateResponseForCommand,
} from '@mitten/contracts';
import { SimulatorDispatcher } from './dispatcher';

function makeWav(samples = 1800, sampleRate = 16_000): Uint8Array {
  const out = new Uint8Array(44 + samples * 2);
  const view = new DataView(out.buffer);
  const tag = (offset: number, text: string) => { for (let i = 0; i < 4; i++) out[offset + i] = text.charCodeAt(i); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, ((i * 53) % 3000) - 1500, true);
  return out;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

function setup() {
  const out: ProtocolEnvelope[] = [];
  const device = new SimulatorDispatcher(envelope => out.push(envelope), { captureDelayMs: 0 });
  device.startup();
  let n = 0;
  const id = () => `t${++n}`;
  const send = async (build: (id: string) => ProtocolEnvelope): Promise<any> => {
    const request = build(id());
    out.length = 0;
    await device.dispatch(request);
    const response = out.find(e => e.type === 'response' && e.id === request.id) as any;
    expect(validateEnvelope(response).valid).toBe(true);
    return response;
  };
  device.dispatch(createHandshakeRequest('h1', 'MITTEN_WEB', [2]));
  const begin = (track: number, wav: Uint8Array, crc = crc32(wav)) =>
    send(i => createAudioBeginRequest(i, { audioTrack: track, sizeBytes: wav.length, crc32: crc }));
  const chunk = (track: number, offset: number, raw: Uint8Array) =>
    send(i => createAudioChunkRequest(i, { audioTrack: track, offset, data: b64(raw) }));
  const upload = async (track: number, wav: Uint8Array) => {
    await begin(track, wav);
    for (let offset = 0; offset < wav.length; offset += AUDIO_CHUNK_MAX_BYTES) {
      await chunk(track, offset, wav.subarray(offset, offset + AUDIO_CHUNK_MAX_BYTES));
    }
    return send(i => createAudioCommitRequest(i, { audioTrack: track }));
  };
  return { device, out, send, begin, chunk, upload };
}

afterEach(() => vi.useRealTimers());

describe('simulador: audio.*', () => {
  it('sube una pista completa y vuelve a IDLE', async () => {
    const { device, out, begin, chunk, send } = setup();
    const wav = makeWav();
    const started = await begin(4, wav);
    expect(started.result).toEqual({ audioTrack: 4, offset: 0, chunkMaxBytes: AUDIO_CHUNK_MAX_BYTES, idleTimeoutMs: 30_000 });
    expect(validateResponseForCommand('audio.begin', started).valid).toBe(true);
    expect(device.currentState).toBe(FirmwareState.SYNCING);
    expect(out.some(e => e.type === 'event' && e.event === 'device.state' && (e.data as any).state === 'SYNCING')).toBe(true);
    let offset = 0;
    for (; offset < wav.length; offset += AUDIO_CHUNK_MAX_BYTES) {
      const part = wav.subarray(offset, offset + AUDIO_CHUNK_MAX_BYTES);
      const response = await chunk(4, offset, part);
      expect(response.result).toEqual({ audioTrack: 4, offset: offset + part.length });
      expect(validateResponseForCommand('audio.chunk', response).valid).toBe(true);
    }
    const commit = await send(i => createAudioCommitRequest(i, { audioTrack: 4 }));
    expect(commit.result).toEqual({ audioTrack: 4, sizeBytes: wav.length });
    expect(validateResponseForCommand('audio.commit', commit).valid).toBe(true);
    expect(device.currentState).toBe(FirmwareState.IDLE);
  });

  it('audio.status lista tamaños y da el CRC32 de una pista', async () => {
    const { upload, send } = setup();
    const wav = makeWav();
    await upload(2, wav);
    await upload(9, makeWav(900));
    const list = await send(i => createAudioStatusRequest(i, {}));
    expect(list.result.tracks.map((t: any) => [t.audioTrack, 'crc32' in t])).toEqual([[2, false], [9, false]]);
    expect(validateResponseForCommand('audio.status', list).valid).toBe(true);
    const one = await send(i => createAudioStatusRequest(i, { audioTrack: 2 }));
    expect(one.result.tracks).toEqual([{ audioTrack: 2, sizeBytes: wav.length, crc32: crc32(wav) }]);
    expect((await send(i => createAudioStatusRequest(i, { audioTrack: 30 }))).result).toEqual({ tracks: [] });
  });

  it('rechaza payloads inválidos sin cambiar de estado', async () => {
    const { device, send, begin, chunk } = setup();
    const wav = makeWav();
    for (const payload of [{ audioTrack: 0, sizeBytes: 100, crc32: 0 }, { audioTrack: 1, sizeBytes: 44, crc32: 0 }, { audioTrack: 1, sizeBytes: 100, crc32: -1 }]) {
      const response = await send(i => createAudioBeginRequest(i, payload as never));
      expect(response.error.code).toBe(ProtocolErrorCode.INVALID_PAYLOAD);
    }
    expect(device.currentState).toBe(FirmwareState.IDLE);
    await begin(1, wav);
    const bad = await send(i => createAudioChunkRequest(i, { audioTrack: 1, offset: 0, data: 'abc' }));
    expect(bad.error.code).toBe(ProtocolErrorCode.INVALID_PAYLOAD);
    const big = await chunk(1, 0, new Uint8Array(AUDIO_CHUNK_MAX_BYTES + 1));
    expect(big.error.code).toBe(ProtocolErrorCode.INVALID_PAYLOAD);
  });

  it('informa desde dónde reanudar ante un offset inesperado', async () => {
    const { begin, chunk } = setup();
    const wav = makeWav();
    await begin(1, wav);
    await chunk(1, 0, wav.subarray(0, 1000));
    const error = (await chunk(1, 1500, wav.subarray(1500, 2000))).error;
    expect(error.code).toBe(ProtocolErrorCode.AUDIO_BAD_OFFSET);
    expect(error.details).toEqual({ offset: 1000 });
    expect((await chunk(1, 1000, wav.subarray(1000, 2000))).result.offset).toBe(2000);
  });

  it('descarta la carga si el CRC32 no coincide o el WAV es inválido', async () => {
    const { device, send, begin, chunk, upload } = setup();
    const wav = makeWav();
    await begin(3, wav, (crc32(wav) ^ 1) >>> 0);
    for (let offset = 0; offset < wav.length; offset += AUDIO_CHUNK_MAX_BYTES) await chunk(3, offset, wav.subarray(offset, offset + AUDIO_CHUNK_MAX_BYTES));
    expect((await send(i => createAudioCommitRequest(i, { audioTrack: 3 }))).error.code).toBe(ProtocolErrorCode.AUDIO_INTEGRITY);
    expect(device.currentState).toBe(FirmwareState.IDLE);
    const other = makeWav(1800, 44_100);
    const invalid = await upload(3, other);
    expect(invalid.error.code).toBe(ProtocolErrorCode.AUDIO_INVALID_WAV);
    expect(device.currentState).toBe(FirmwareState.IDLE);
    expect((await send(i => createAudioStatusRequest(i, {}))).result).toEqual({ tracks: [] });
  });

  it('sin carga activa responde AUDIO_NO_UPLOAD y el abort descarta lo recibido', async () => {
    const { device, send, begin, chunk } = setup();
    expect((await chunk(1, 0, new Uint8Array(1))).error.code).toBe(ProtocolErrorCode.AUDIO_NO_UPLOAD);
    expect((await send(i => createAudioCommitRequest(i, { audioTrack: 1 }))).error.code).toBe(ProtocolErrorCode.AUDIO_NO_UPLOAD);
    expect((await send(i => createAudioAbortRequest(i, {}))).error.code).toBe(ProtocolErrorCode.AUDIO_NO_UPLOAD);
    await begin(5, makeWav());
    const aborted = await send(i => createAudioAbortRequest(i, {}));
    expect(aborted.result).toEqual({ aborted: true });
    expect(validateResponseForCommand('audio.abort', aborted).valid).toBe(true);
    expect(device.currentState).toBe(FirmwareState.IDLE);
  });

  it('es excluyente con captura y sincronización', async () => {
    const { device, send, begin } = setup();
    const wav = makeWav();
    await begin(1, wav);
    expect((await begin(2, wav)).error.code).toBe(ProtocolErrorCode.DEVICE_BUSY);
    expect((await send(i => createCaptureStartRequest(i))).error.code).toBe(ProtocolErrorCode.DEVICE_BUSY);
    expect((await send(i => createSyncBeginRequest(i, { syncId: 'sync-1', profileId: 'profile-1', profileRevision: 'rev-1', gestureCount: 0 }))).error.code).toBe(ProtocolErrorCode.DEVICE_BUSY);
    await send(i => createAudioAbortRequest(i, {}));
    const capture = device.dispatch(createCaptureStartRequest('cap-1'));
    expect(device.currentState).toBe(FirmwareState.CAPTURING);
    expect((await begin(1, wav)).error.code).toBe(ProtocolErrorCode.DEVICE_BUSY);
    await capture;
  });

  it('vence una carga abandonada y las pistas sobreviven al reinicio', async () => {
    vi.useFakeTimers();
    const { device, send, begin, chunk, upload } = setup();
    const wav = makeWav();
    await upload(7, wav);
    await begin(1, wav);
    await chunk(1, 0, wav.subarray(0, 100));
    vi.advanceTimersByTime(30_001);
    expect(device.currentState).toBe(FirmwareState.IDLE);
    expect((await chunk(1, 100, wav.subarray(100, 200))).error.code).toBe(ProtocolErrorCode.AUDIO_NO_UPLOAD);
    device.restart();
    await device.dispatch(createHandshakeRequest('h2', 'MITTEN_WEB', [2]));
    expect((await send(i => createAudioStatusRequest(i, {}))).result.tracks).toEqual([{ audioTrack: 7, sizeBytes: wav.length }]);
  });
});
