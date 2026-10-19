import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config, validateConfig } from '../config/index.js';
import { executeProcess, generateTTS, PiperTTSProvider } from './tts.js';
const saved={...config};
afterEach(() => { Object.assign(config,saved); vi.unstubAllGlobals(); });
it('mock and unsupported providers never claim to generate MP3',async () => {
  await expect(generateTTS({text:'Hola'})).rejects.toMatchObject({status:503});
  for (const provider of ['google','azure','unknown']) {
    config.ttsProvider=provider;
    expect(validateConfig).toThrow('Unsupported TTS_PROVIDER');
    await expect(generateTTS({text:'Hola'})).rejects.toMatchObject({status:503});
  }
});

it('terminates a Piper subprocess that exceeds its configured timeout', async () => {
  await expect(executeProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdin: 'Hola', timeoutMs: 25 }))
    .rejects.toMatchObject({ status: 504, message: expect.stringContaining('timeout') });
});

it('validates Piper output and propagates its timeout without publishing partial bytes', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mitten-piper-test-'));
  const model = join(workspace, 'voice.onnx');
  await writeFile(model, 'model');
  await writeFile(`${model}.json`, '{}');
  try {
    const validMp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200)]);
    const successful = new PiperTTSProvider(process.execPath, model, 1000, async (_command, args, options) => {
      expect(args[args.indexOf('--length-scale') + 1]).toBe('1.25');
      expect(options.stdin).toBe('¿Cómo estás?');
      await writeFile(args[args.indexOf('--output') + 1], validMp3);
    }, 1.25);
    await expect(successful.synthesize({ text: '¿Cómo estás?' })).resolves.toMatchObject({ provider: 'piper', audio: validMp3 });

    const invalid = new PiperTTSProvider(process.execPath, model, 1000, async (_command, args) => {
      await writeFile(args[args.indexOf('--output') + 1], 'not mp3');
    });
    await expect(invalid.synthesize({ text: 'Hola' })).rejects.toMatchObject({ status: 502 });

    const timedOut = new PiperTTSProvider(process.execPath, model, 1000, async () => {
      throw Object.assign(new Error('Piper exceeded its timeout'), { status: 504 });
    });
    await expect(timedOut.synthesize({ text: 'Hola' })).rejects.toMatchObject({ status: 504 });
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
it('rejects invalid speaking speeds before starting the API', () => {
  for (const lengthScale of [NaN, Infinity, 0.49, 2.01]) {
    config.piperLengthScale = lengthScale;
    expect(validateConfig).toThrow('PIPER_LENGTH_SCALE');
  }
});
it('validates provider response before publishing bytes',async () => {
  config.ttsProvider='elevenlabs'; config.elevenLabsApiKey='test'; config.elevenLabsVoiceId='test';
  const fetcher=vi.fn().mockResolvedValue(new Response('not MP3',{headers:{'content-type':'audio/mpeg'}}));
  vi.stubGlobal('fetch',fetcher);
  await expect(generateTTS({text:'Hola'})).rejects.toMatchObject({status:502});
  expect(fetcher.mock.calls[0][0]).toContain('output_format=mp3_44100_128');
  fetcher.mockResolvedValue(new Response('failure',{status:500}));
  await expect(generateTTS({text:'Hola'})).rejects.toMatchObject({status:502});
});
