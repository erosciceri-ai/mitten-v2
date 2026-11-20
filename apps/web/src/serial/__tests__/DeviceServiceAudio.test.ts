import { describe, expect, it } from 'vitest';
import { FirmwareState, ProtocolErrorCode } from '@mitten/contracts';
import { DemoTransport } from '../DemoTransport';
import { DeviceService } from '../DeviceService';
import { crc32, encodeWav } from '../../audio/gloveWav';
import type { DeviceTransportFactory } from '../DeviceTransport';

const pcm = (samples: number) => Int16Array.from({ length: samples }, (_, i) => ((i * 53) % 3000) - 1500);
const wavOf = (samples = 4000, sampleRate = 16_000) => encodeWav(pcm(samples), sampleRate);

async function connected(factory?: DeviceTransportFactory) {
  const service = new DeviceService({}, factory ?? (handlers => new DemoTransport(handlers)));
  await service.connect();
  return service;
}

describe('DeviceService: carga de audio contra el simulador', () => {
  it('sube la pista con progreso, la publica y vuelve a IDLE', async () => {
    const service = await connected();
    const wav = wavOf();
    const progress: number[] = [];
    const result = await service.uploadAudio(5, wav, { onProgress: sent => progress.push(sent) });
    expect(result).toEqual({ audioTrack: 5, sizeBytes: wav.length });
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(wav.length);
    expect(progress.every((value, i) => i === 0 || value > progress[i - 1])).toBe(true);
    expect((await service.getAudioStatus(5)).tracks).toEqual([{ audioTrack: 5, sizeBytes: wav.length, crc32: crc32(wav) }]);
    expect((await service.getStatus()).state).toBe(FirmwareState.IDLE);
  });

  it('cancelar a mitad de camino aborta la carga y no deja la pista', async () => {
    const service = await connected();
    const controller = new AbortController();
    const wav = wavOf(6000);
    await expect(service.uploadAudio(3, wav, {
      signal: controller.signal,
      onProgress: sent => { if (sent > 0) controller.abort(); },
    })).rejects.toThrow(/cancelada/);
    expect((await service.getStatus()).state).toBe(FirmwareState.IDLE);
    expect((await service.getAudioStatus()).tracks).toEqual([]);
  });

  it('reanuda desde el offset que informa el guante tras un AUDIO_BAD_OFFSET', async () => {
    const factory: DeviceTransportFactory = handlers => {
      const demo = new DemoTransport(handlers);
      const send = demo.send.bind(demo);
      let injected = false;
      demo.send = async envelope => {
        const request = envelope as { type: string; command?: string; payload?: Record<string, unknown> };
        if (!injected && request.command === 'audio.chunk' && request.payload?.offset === 3072) {
          injected = true;
          // El mismo fragmento llega antes por otro camino: el guante lo aplica y el original queda desfasado.
          await send({ ...(envelope as object), id: 'dup-chunk-1' } as never);
        }
        return send(envelope);
      };
      return demo;
    };
    const service = await connected(factory);
    const wav = wavOf(5000);
    const offsets: number[] = [];
    const result = await service.uploadAudio(8, wav, { onProgress: sent => offsets.push(sent) });
    expect(result.sizeBytes).toBe(wav.length);
    expect(offsets).toContain(6144);
    expect((await service.getAudioStatus(8)).tracks[0].crc32).toBe(crc32(wav));
  });

  it('propaga el error del guante cuando el WAV no cumple el formato y lo deja en IDLE', async () => {
    const service = await connected();
    await expect(service.uploadAudio(2, wavOf(3000, 44_100))).rejects.toThrow(/16 kHz/);
    expect((await service.getStatus()).state).toBe(FirmwareState.IDLE);
    let code: unknown;
    try { await service.uploadAudio(2, wavOf(3000, 44_100)); } catch (error) { code = (error as { code?: string }).code; }
    expect(code).toBe(ProtocolErrorCode.AUDIO_INVALID_WAV);
  });

  it('valida el tamaño y la pista antes de enviar nada', async () => {
    const service = await connected();
    await expect(service.uploadAudio(2, new Uint8Array(10))).rejects.toThrow(/sizeBytes/);
    await expect(service.uploadAudio(0, wavOf())).rejects.toThrow(/audioTrack/);
    expect((await service.getStatus()).state).toBe(FirmwareState.IDLE);
  });
});
