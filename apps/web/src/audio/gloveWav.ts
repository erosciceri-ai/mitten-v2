/**
 * Conversión de audio para el guante: el firmware solo reproduce WAV PCM mono, 16 kHz, 16 bits
 * (ver firmware/esp32/audio.py). Las pistas del API son MP3, así que se convierten en el
 * navegador, sin ffmpeg en el servidor.
 */

export const GLOVE_SAMPLE_RATE = 16_000;
export const WAV_HEADER_BYTES = 44;
/** Igual a MAX_TRACK_BYTES del firmware (16 s). */
export const MAX_GLOVE_WAV_BYTES = 524_288;
/** Bytes crudos por fragmento: en base64 caben en el mensaje máximo del protocolo. */
export const GLOVE_CHUNK_BYTES = 3072;

export interface DecodedAudio {
  sampleRate: number;
  channels: Float32Array[];
}
export type AudioDecoder = (encoded: ArrayBuffer) => Promise<DecodedAudio>;

export interface GloveWav {
  wav: Uint8Array;
  crc32: number;
  sizeBytes: number;
  durationMs: number;
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) throw new Error('El audio no tiene canales.');
  const length = channels[0].length;
  if (channels.some(channel => channel.length !== length)) throw new Error('Los canales tienen longitudes distintas.');
  if (channels.length === 1) return channels[0];
  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  return mono;
}

/** Remuestreo simple para voz: promedio por ventana al bajar de tasa, interpolación lineal al subir. */
export function resample(samples: Float32Array, fromRate: number, toRate = GLOVE_SAMPLE_RATE): Float32Array {
  if (!(fromRate > 0) || !(toRate > 0)) throw new Error('Frecuencia de muestreo inválida.');
  if (fromRate === toRate) return samples;
  const length = Math.max(1, Math.floor((samples.length * toRate) / fromRate));
  const out = new Float32Array(length);
  const ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    if (ratio > 1) {
      const start = Math.floor(i * ratio);
      const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) sum += samples[j];
      out[i] = sum / (end - start);
    } else {
      const position = i * ratio;
      const base = Math.floor(position);
      const next = Math.min(samples.length - 1, base + 1);
      out[i] = samples[base] + (samples[next] - samples[base]) * (position - base);
    }
  }
  return out;
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
  }
  return pcm;
}

export function encodeWav(pcm: Int16Array, sampleRate = GLOVE_SAMPLE_RATE): Uint8Array {
  const dataBytes = pcm.length * 2;
  const out = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(out.buffer);
  const tag = (offset: number, text: string) => { for (let i = 0; i < 4; i++) out[offset + i] = text.charCodeAt(i); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(WAV_HEADER_BYTES + i * 2, pcm[i], true);
  return out;
}

let crcTable: Uint32Array | null = null;
/** CRC-32 (zlib); coincide con binascii.crc32 del firmware. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** El contexto offline decodifica y remuestrea a 16 kHz por su cuenta. */
export const browserDecoder: AudioDecoder = async encoded => {
  const Offline = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!Offline) throw new Error('Este navegador no puede decodificar audio (falta OfflineAudioContext).');
  const buffer = await new Offline(1, 1, GLOVE_SAMPLE_RATE).decodeAudioData(encoded.slice(0));
  return {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice()),
  };
};

export async function mp3ToGloveWav(encoded: ArrayBuffer, decode: AudioDecoder = browserDecoder): Promise<GloveWav> {
  let decoded: DecodedAudio;
  try {
    decoded = await decode(encoded);
  } catch (error) {
    throw new Error(`No se pudo decodificar el audio: ${error instanceof Error ? error.message : String(error)}`);
  }
  const samples = resample(mixToMono(decoded.channels), decoded.sampleRate);
  if (samples.length === 0) throw new Error('El audio está vacío.');
  const wav = encodeWav(floatToPcm16(samples));
  if (wav.length > MAX_GLOVE_WAV_BYTES) {
    const seconds = (samples.length / GLOVE_SAMPLE_RATE).toFixed(1);
    throw new Error(`La pista dura ${seconds} s; el máximo para el guante es ${MAX_GLOVE_WAV_BYTES / 32_000} s.`);
  }
  return { wav, crc32: crc32(wav), sizeBytes: wav.length, durationMs: Math.round((samples.length * 1000) / GLOVE_SAMPLE_RATE) };
}

export function* splitChunks(bytes: Uint8Array, size = GLOVE_CHUNK_BYTES): Generator<{ offset: number; data: Uint8Array }> {
  for (let offset = 0; offset < bytes.length; offset += size) yield { offset, data: bytes.subarray(offset, offset + size) };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
