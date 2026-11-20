import { AppError } from '../middleware/errorHandler.js';

import JSZip from 'jszip';
import { findAudioRow, readGestureAudio } from './gestureAudio.js';
import { findAllGestures } from '../models/Gesture.js';

const MAX_ZIP_INPUT_BYTES = 24 * 1024 * 1024;

export interface MissingAudioTrack { gestureId: number; name: string; audioTrack: number; file: string; }
export type AudioPackageResult = { ok: true; archive: Buffer } | { ok: false; missingTracks: MissingAudioTrack[] };

export async function createAudioPackage(userId: number): Promise<AudioPackageResult> {
  const gestures = await findAllGestures(userId);
  const zip = new JSZip();
  let remaining = MAX_ZIP_INPUT_BYTES;
  const missingTracks: MissingAudioTrack[] = [];
  for (const gesture of gestures) {
    const file = 'mp3/' + String(gesture.audioTrack).padStart(4, '0') + '.mp3';
    const row = await findAudioRow(userId, gesture.id);
    if (row && (row.name !== gesture.name || row.track_number !== gesture.audioTrack)) {
      throw new AppError('Gesture changed during export; retry', 409);
    }
    const audio = row ? await readGestureAudio(row) : null;
    if (!audio) {
      missingTracks.push({ gestureId: gesture.id, name: gesture.name, audioTrack: gesture.audioTrack, file });
      continue;
    }
    remaining -= audio.length;
    if (remaining < 0) throw new AppError('Audio package exceeds the export size limit', 413);
    zip.file(file, audio);
  }
  if (missingTracks.length) return { ok: false, missingTracks };
  zip.file('manifest.json', JSON.stringify({
    format: 'mitten-microsd-package', version: 1, generatedAt: new Date().toISOString(),
    tracks: gestures.map(gesture => ({ gestureId: gesture.id, name: gesture.name, audioTrack: gesture.audioTrack, file: `mp3/${String(gesture.audioTrack).padStart(4, '0')}.mp3` })),
  }, null, 2));
  zip.file('COPIAR_A_MICROSD.txt', [
    'MITTEN V2 · respaldo de audios MP3', '',
    'Forma recomendada para cargar audios al guante:',
    '1. Conectá MITTEN (por USB o Wi-Fi) desde el Dashboard de la aplicación web.',
    '2. En el panel "Audio en el guante", usá "Enviar al guante" ("Enviar los que faltan" o "Enviar").',
    '   El navegador convierte cada MP3 a WAV PCM mono 16 kHz de 16 bits y lo guarda en /mitten_audio/audio/NNNN.wav.', '',
    'Este ZIP conserva los archivos MP3 generados por la API como respaldo manual.',
    'No valida microSD, ESP32, MAX98357A, sensores ni parlante.',
  ].join('\r\n'));
  return { ok: true, archive: await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }) };
}
