import { createHash } from 'node:crypto';
import { link, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { MAX_MP3_BYTES } from './tts.js';

export type AudioProvider = 'local' | 's3';
export const AUDIO_TYPE = 'audio/mpeg';
export const audioChecksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export interface AudioStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const objectKeyPattern = /^audio\/v1\/[1-9]\d*\/[1-9]\d*\/[a-f0-9-]{36}\.mp3$/;
function checkedKey(key: string): string {
  if (!objectKeyPattern.test(key)) throw new Error('Invalid stored audio object key');
  return key;
}

export async function readLocalAudio(path: string): Promise<Buffer | null> {
  const file = await open(path, 'r').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!file) return null;
  try {
    const stat = await file.stat();
    const { size } = stat;
    if (!stat.isFile() || size < 1 || size > MAX_MP3_BYTES) throw new AppError('Invalid stored audio size', 502);
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await file.read(bytes, offset, size - offset, offset);
      if (!bytesRead) throw new AppError('Audio changed during read', 409);
      offset += bytesRead;
    }
    return bytes;
  } finally { await file.close(); }
}

export class LocalAudioStorage implements AudioStorage {
  constructor(private readonly root: string) {}

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = join(this.root, checkedKey(key));
    const temporary = path + '.pending';
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, bytes, { flag: 'wx', flush: true });
    try { await link(temporary, path); }
    finally { await rm(temporary, { force: true }); }
  }

  read(key: string) { return readLocalAudio(join(this.root, checkedKey(key))); }

  async remove(key: string): Promise<void> {
    const path = join(this.root, checkedKey(key));
    await rm(path, { force: true });
    await rm(path + '.pending', { force: true });
  }
}

export class S3AudioStorage implements AudioStorage {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  async put(key: string, bytes: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: checkedKey(key), Body: bytes, ContentType: AUDIO_TYPE,
    }), { abortSignal: AbortSignal.timeout(15000) });
  }

  async read(key: string): Promise<Buffer | null> {
    const signal = AbortSignal.timeout(15000);
    try {
      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket, Key: checkedKey(key),
      }), { abortSignal: signal });
      const body = result.Body;
      if (!(body instanceof Readable)) throw new Error('Invalid audio response body');
      if (result.ContentType !== AUDIO_TYPE || !result.ContentLength ||
          result.ContentLength > MAX_MP3_BYTES) {
        body.destroy();
        throw new Error('Invalid audio response metadata');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      const abort = () => body.destroy(new Error('Audio download timed out'));
      if (signal.aborted) abort();
      signal.addEventListener('abort', abort, { once: true });
      try {
        for await (const chunk of body) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > result.ContentLength) throw new Error('Invalid audio response length');
          chunks.push(bytes);
        }
      } finally { signal.removeEventListener('abort', abort); }
      if (size !== result.ContentLength) throw new Error('Incomplete audio download');
      return Buffer.concat(chunks, size);
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket, Key: checkedKey(key),
    }), { abortSignal: AbortSignal.timeout(15000) });
  }
}

let s3: S3AudioStorage | undefined;
export function getAudioStorage(provider: string = config.audioStorageProvider): AudioStorage {
  if (provider === 'local') return new LocalAudioStorage(config.audioDir);
  if (provider !== 's3') throw new Error('Unsupported AUDIO_STORAGE_PROVIDER');
  if (!s3) {
    const { audioS3Endpoint: endpoint, audioS3Region: region, audioS3Bucket: bucket,
      audioS3AccessKeyId: accessKeyId, audioS3SecretAccessKey: secretAccessKey } = config;
    const url = new URL(endpoint);
    const local = config.nodeEnv !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === 'https:' || (local && url.protocol === 'http:')) ||
        !region || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error('Invalid S3 audio storage configuration');
    }
    s3 = new S3AudioStorage(new S3Client({
      endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    }), bucket);
  }
  return s3;
}
