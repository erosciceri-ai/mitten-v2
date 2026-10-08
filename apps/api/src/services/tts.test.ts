import { afterEach, expect, it, vi } from 'vitest';
import { config, validateConfig } from '../config/index.js';
import { generateTTS } from './tts.js';
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
it('validates provider response before publishing bytes',async () => {
  config.ttsProvider='elevenlabs'; config.elevenLabsApiKey='test'; config.elevenLabsVoiceId='test';
  const fetcher=vi.fn().mockResolvedValue(new Response('not MP3',{headers:{'content-type':'audio/mpeg'}}));
  vi.stubGlobal('fetch',fetcher);
  await expect(generateTTS({text:'Hola'})).rejects.toMatchObject({status:502});
  expect(fetcher.mock.calls[0][0]).toContain('output_format=mp3_44100_128');
  fetcher.mockResolvedValue(new Response('failure',{status:500}));
  await expect(generateTTS({text:'Hola'})).rejects.toMatchObject({status:502});
});
