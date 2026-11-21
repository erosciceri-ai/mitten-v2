import { describe, expect, it } from 'vitest';
import { uploadAllGestureAudio, uploadGestureAudio, type GloveAudioDeps } from '../uploadGestureAudio';

const convertTo = (bytes: number) => async () => ({ wav: new Uint8Array(bytes), crc32: 0, sizeBytes: bytes, durationMs: 250 });

function deps(overrides: Partial<GloveAudioDeps> = {}) {
  const uploads: Array<{ track: number; size: number }> = [];
  const value: GloveAudioDeps = {
    fetchMp3: async () => new Blob([new Uint8Array([1, 2, 3])]),
    upload: async (track, wav, options) => {
      uploads.push({ track, size: wav.length });
      options?.onProgress?.(wav.length, wav.length);
      return { sizeBytes: wav.length };
    },
    convert: convertTo(100),
    ...overrides,
  };
  return { value, uploads };
}

const gesture = (id: number, track = id) => ({ id, name: `Gesto ${id}`, audioTrack: track });

describe('uploadGestureAudio', () => {
  it('descarga, convierte y sube informando las fases y el progreso', async () => {
    const { value, uploads } = deps();
    const phases: string[] = [];
    const progress: number[] = [];
    const result = await uploadGestureAudio(gesture(4, 9), value, { onPhase: p => phases.push(p), onProgress: sent => progress.push(sent) });
    expect(result).toEqual({ sizeBytes: 100, durationMs: 250 });
    expect(phases).toEqual(['converting', 'uploading']);
    expect(uploads).toEqual([{ track: 9, size: 100 }]);
    expect(progress).toEqual([100]);
  });

  it('rechaza un MP3 vacío sin intentar subir nada', async () => {
    const { value, uploads } = deps({ fetchMp3: async () => new Blob([]) });
    await expect(uploadGestureAudio(gesture(1), value)).rejects.toThrow(/vacío/);
    expect(uploads).toEqual([]);
  });

  it('respeta la cancelación antes de subir', async () => {
    const controller = new AbortController();
    const { value, uploads } = deps({ convert: async () => { controller.abort(); return { wav: new Uint8Array(10), crc32: 0, sizeBytes: 10, durationMs: 1 }; } });
    await expect(uploadGestureAudio(gesture(1), value, { signal: controller.signal })).rejects.toThrow(/cancelada/);
    expect(uploads).toEqual([]);
  });

  it('propaga errores de descarga, conversión y subida', async () => {
    await expect(uploadGestureAudio(gesture(1), deps({ fetchMp3: async () => { throw new Error('sin red'); } }).value)).rejects.toThrow(/sin red/);
    await expect(uploadGestureAudio(gesture(1), deps({ convert: async () => { throw new Error('formato'); } }).value)).rejects.toThrow(/formato/);
    await expect(uploadGestureAudio(gesture(1), deps({ upload: async () => { throw new Error('guante ocupado'); } }).value)).rejects.toThrow(/ocupado/);
  });
});

describe('uploadAllGestureAudio', () => {
  it('sube todos en orden e informa cada gesto', async () => {
    const { value, uploads } = deps();
    const started: number[] = [];
    const done: number[] = [];
    const result = await uploadAllGestureAudio([gesture(1), gesture(2), gesture(3)], value, {
      onGestureStart: (g, index, total) => started.push(index * 10 + total),
      onGestureDone: g => done.push(g.id),
    });
    expect(result).toEqual({ uploaded: [1, 2, 3], failed: null });
    expect(uploads.map(u => u.track)).toEqual([1, 2, 3]);
    expect(started).toEqual([3, 13, 23]);
    expect(done).toEqual([1, 2, 3]);
  });

  it('informa fase y progreso de cada gesto por separado', async () => {
    const { value } = deps();
    const log: string[] = [];
    await uploadAllGestureAudio([gesture(1), gesture(2)], value, {
      onPhase: (g, phase) => log.push(`${g.id}:${phase}`),
      onProgress: (g, sent, total) => log.push(`${g.id}:${sent}/${total}`),
    });
    expect(log).toEqual(['1:converting', '1:uploading', '1:100/100', '2:converting', '2:uploading', '2:100/100']);
  });

  it('se detiene en el primer error y lo informa', async () => {
    let calls = 0;
    const { value, uploads } = deps({ upload: async (track, wav) => { calls++; if (calls === 2) throw new Error('DEVICE_BUSY'); return { sizeBytes: wav.length }; } });
    const result = await uploadAllGestureAudio([gesture(1), gesture(2), gesture(3)], value);
    expect(result.uploaded).toEqual([1]);
    expect(result.failed?.gesture.id).toBe(2);
    expect(result.failed?.error.message).toBe('DEVICE_BUSY');
  });

  it('no empieza si ya está cancelado', async () => {
    const controller = new AbortController();
    controller.abort();
    const { value, uploads } = deps();
    expect(await uploadAllGestureAudio([gesture(1)], value, { signal: controller.signal })).toEqual({ uploaded: [], failed: null });
    expect(uploads).toEqual([]);
  });
});
