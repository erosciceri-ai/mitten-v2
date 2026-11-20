import type { AudioUploadOptions } from '../serial/DeviceService';
import { mp3ToGloveWav } from './gloveWav';

export interface GloveAudioDeps {
  fetchMp3: (gestureId: number) => Promise<Blob>;
  upload: (audioTrack: number, wav: Uint8Array, options?: AudioUploadOptions) => Promise<{ sizeBytes: number }>;
  convert?: typeof mp3ToGloveWav;
}

export type GloveAudioPhase = 'converting' | 'uploading';

export interface GloveAudioHooks {
  onPhase?: (phase: GloveAudioPhase) => void;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface GestureAudioTarget {
  id: number;
  name: string;
  audioTrack: number;
}

/** Downloads the gesture MP3, converts it to the glove WAV format in the browser and uploads it. */
export async function uploadGestureAudio(
  gesture: GestureAudioTarget,
  deps: GloveAudioDeps,
  hooks: GloveAudioHooks = {},
): Promise<{ sizeBytes: number; durationMs: number }> {
  hooks.onPhase?.('converting');
  const mp3 = await deps.fetchMp3(gesture.id);
  if (mp3.size === 0) throw new Error(`El MP3 de «${gesture.name}» está vacío; generalo de nuevo.`);
  const converted = await (deps.convert ?? mp3ToGloveWav)(await mp3.arrayBuffer());
  if (hooks.signal?.aborted) throw new Error('Carga de audio cancelada');
  hooks.onPhase?.('uploading');
  const result = await deps.upload(gesture.audioTrack, converted.wav, { onProgress: hooks.onProgress, signal: hooks.signal });
  return { sizeBytes: result.sizeBytes, durationMs: converted.durationMs };
}

export interface BatchHooks {
  signal?: AbortSignal;
  onGestureStart?: (gesture: GestureAudioTarget, index: number, total: number) => void;
  onPhase?: (gesture: GestureAudioTarget, phase: GloveAudioPhase) => void;
  onProgress?: (gesture: GestureAudioTarget, sentBytes: number, totalBytes: number) => void;
  onGestureDone?: (gesture: GestureAudioTarget) => void;
}

export interface BatchResult {
  uploaded: number[];
  /** First failure; the batch stops there so the cause is not repeated for every gesture. */
  failed: { gesture: GestureAudioTarget; error: Error } | null;
}

export async function uploadAllGestureAudio(
  gestures: GestureAudioTarget[],
  deps: GloveAudioDeps,
  hooks: BatchHooks = {},
): Promise<BatchResult> {
  const uploaded: number[] = [];
  for (const [index, gesture] of gestures.entries()) {
    if (hooks.signal?.aborted) break;
    hooks.onGestureStart?.(gesture, index, gestures.length);
    try {
      await uploadGestureAudio(gesture, deps, {
        signal: hooks.signal,
        onPhase: phase => hooks.onPhase?.(gesture, phase),
        onProgress: (sent, total) => hooks.onProgress?.(gesture, sent, total),
      });
    } catch (error) {
      return { uploaded, failed: { gesture, error: error instanceof Error ? error : new Error(String(error)) } };
    }
    uploaded.push(gesture.id);
    hooks.onGestureDone?.(gesture);
  }
  return { uploaded, failed: null };
}
