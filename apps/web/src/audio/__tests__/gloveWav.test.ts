import { describe, expect, it } from 'vitest';
import {
  GLOVE_CHUNK_BYTES, MAX_GLOVE_WAV_BYTES, bytesToBase64, crc32, encodeWav, floatToPcm16, mixToMono,
  mp3ToGloveWav, resample, splitChunks,
} from '../gloveWav';

const sine = (hz: number, rate: number, seconds: number) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate) * 0.5);
const rms = (x: Float32Array) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);

describe('gloveWav', () => {
  it('genera una cabecera WAV PCM mono 16 kHz de 16 bits', () => {
    const wav = encodeWav(Int16Array.from([0, 1000, -1000]));
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect([view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true), view.getUint32(28, true), view.getUint16(32, true), view.getUint16(34, true)])
      .toEqual([1, 1, 16000, 32000, 2, 16]);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(48, true)).toBe(-1000);
  });

  it('calcula el mismo CRC-32 que zlib/binascii', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('mezcla estéreo a mono, recorta y redondea a PCM16', () => {
    expect(Array.from(mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])]))).toEqual([0.5, 0.5]);
    expect(Array.from(floatToPcm16(Float32Array.from([2, -2, 0, 0.5])))).toEqual([32767, -32768, 0, 16384]);
    expect(() => mixToMono([])).toThrow(/canales/);
  });

  it('remuestrea 48 kHz y 44,1 kHz a 16 kHz conservando el contenido de voz', () => {
    for (const rate of [48000, 44100, 8000]) {
      const out = resample(sine(500, rate, 1), rate);
      expect(Math.abs(out.length - 16000)).toBeLessThanOrEqual(1);
      expect(Math.abs(rms(out) - rms(sine(500, rate, 1)))).toBeLessThan(0.03);
    }
  });

  it('convierte un audio decodificado en un WAV válido con duración y CRC', async () => {
    const result = await mp3ToGloveWav(new ArrayBuffer(8), async () => ({ sampleRate: 48000, channels: [sine(440, 48000, 0.5), sine(440, 48000, 0.5)] }));
    expect(result.durationMs).toBe(500);
    expect(result.sizeBytes).toBe(44 + 8000 * 2);
    expect(result.crc32).toBe(crc32(result.wav));
  });

  it('rechaza audio vacío, demasiado largo o que no se puede decodificar', async () => {
    await expect(mp3ToGloveWav(new ArrayBuffer(1), async () => ({ sampleRate: 16000, channels: [new Float32Array(0)] }))).rejects.toThrow(/vacío/);
    await expect(mp3ToGloveWav(new ArrayBuffer(1), async () => ({ sampleRate: 16000, channels: [new Float32Array(MAX_GLOVE_WAV_BYTES / 2)] }))).rejects.toThrow(/máximo/);
    await expect(mp3ToGloveWav(new ArrayBuffer(1), async () => { throw new Error('formato desconocido'); })).rejects.toThrow(/No se pudo decodificar/);
  });

  it('parte en fragmentos del tamaño acordado y los codifica en base64', () => {
    const bytes = Uint8Array.from({ length: GLOVE_CHUNK_BYTES * 2 + 10 }, (_, i) => i % 251);
    const parts = [...splitChunks(bytes)];
    expect(parts.map(p => [p.offset, p.data.length])).toEqual([[0, GLOVE_CHUNK_BYTES], [GLOVE_CHUNK_BYTES, GLOVE_CHUNK_BYTES], [GLOVE_CHUNK_BYTES * 2, 10]]);
    expect(bytesToBase64(Uint8Array.from([77, 97, 110]))).toBe('TWFu');
    expect(bytesToBase64(Uint8Array.from([77, 97]))).toBe('TWE=');
    expect(Array.from(Uint8Array.from(atob(bytesToBase64(bytes)), char => char.charCodeAt(0)))).toEqual(Array.from(bytes));
  });
});
