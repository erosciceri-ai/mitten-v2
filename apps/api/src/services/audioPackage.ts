import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { findAllGestures, getGestureAudioFile } from '../models/Gesture.js';

export interface MissingAudioTrack { gestureId: number; name: string; audioTrack: number; file: string; }
export type AudioPackageResult = { ok: true; archive: Buffer } | { ok: false; missingTracks: MissingAudioTrack[] };

export async function createAudioPackage(userId: number): Promise<AudioPackageResult> {
  const gestures = await findAllGestures(userId);
  const entries = await Promise.all(gestures.map(async gesture => ({ gesture, path: await getGestureAudioFile(userId, gesture.id) })));
  const missingTracks = entries.filter(entry => !entry.path).map(({ gesture }) => ({
    gestureId: gesture.id, name: gesture.name, audioTrack: gesture.audioTrack,
    file: `mp3/${String(gesture.audioTrack).padStart(4, '0')}.mp3`,
  }));
  if (missingTracks.length) return { ok: false, missingTracks };

  const zip = new JSZip();
  for (const { gesture, path } of entries) {
    zip.file(`mp3/${String(gesture.audioTrack).padStart(4, '0')}.mp3`, await readFile(path!));
  }
  zip.file('manifest.json', JSON.stringify({
    format: 'mitten-microsd-package', version: 1, generatedAt: new Date().toISOString(),
    tracks: gestures.map(gesture => ({ gestureId: gesture.id, name: gesture.name, audioTrack: gesture.audioTrack, file: `mp3/${String(gesture.audioTrack).padStart(4, '0')}.mp3` })),
  }, null, 2));
  zip.file('COPIAR_A_MICROSD.txt', [
    'MITTEN V2 · paquete para microSD', '',
    '1. Extrae este ZIP.', '2. Copia la carpeta mp3 completa en la raíz de una microSD FAT32.',
    '3. Conserva los nombres 0001.mp3, 0002.mp3, etc.',
    '4. Expulsa la tarjeta de forma segura y colócala en el DFPlayer.', '',
    'Este paquete sólo comprueba software y archivos. No valida microSD, DFPlayer, ESP32, sensores ni parlante.',
  ].join('\r\n'));
  return { ok: true, archive: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }) };
}
