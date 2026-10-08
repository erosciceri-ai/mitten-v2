import { join } from 'node:path';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';

export interface TTSOptions { text: string; }
export interface TTSResult { audio: Buffer; provider: string; }

export function getAudioFilePath(userId: number, trackNumber: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isInteger(trackNumber) || trackNumber < 1 || trackNumber > 50) {
    throw new Error('Invalid audio owner or track');
  }
  return join(config.audioDir, String(userId), 'mp3', `${String(trackNumber).padStart(4, '0')}.mp3`);
}

export async function generateTTS({ text }: TTSOptions): Promise<TTSResult> {
  if (config.ttsProvider === 'mock') {
    throw new AppError('El proveedor mock no genera voz. Configura un proveedor TTS para preparar el MP3.', 503);
  }
  if (config.ttsProvider !== 'elevenlabs') throw new AppError('Unsupported TTS provider', 503);
  if (!config.elevenLabsApiKey || !config.elevenLabsVoiceId) throw new AppError('TTS credentials and voice are not configured', 503);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.elevenLabsVoiceId)}?output_format=mp3_44100_128`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': config.elevenLabsApiKey },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!response.ok) throw new AppError(`TTS provider returned HTTP ${response.status}`, 502);
  if (!response.headers.get('content-type')?.includes('audio/mpeg')) throw new AppError('TTS provider did not return MP3 audio', 502);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 128 || !(audio.subarray(0,3).toString() === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0))) {
    throw new AppError('TTS provider returned invalid audio', 502);
  }
  return { audio, provider: 'elevenlabs' };
}
