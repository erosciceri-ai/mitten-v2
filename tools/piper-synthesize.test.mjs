import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('Piper receives Spanish UTF-8 text even when Windows stdin uses cp1252', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'mitten-piper-encoding-'));
  const capture = join(workspace, 'text.json');
  const phrase = 'Hola, necesito ayuda. ¿Cómo estás? Mañana tomaré café.';
  try {
    // Replace only the external neural model and encoder; run MITTEN's actual helper.
    await writeFile(join(workspace, 'piper.py'), `
import json, os
from pathlib import Path
class SynthesisConfig:
    def __init__(self, length_scale): self.length_scale = length_scale
class PiperVoice:
    @classmethod
    def load(cls, model): return cls()
    def synthesize_wav(self, text, wav_file, syn_config=None):
        Path(os.environ['MITTEN_TEXT_CAPTURE']).write_text(json.dumps({'text': text, 'length_scale': syn_config.length_scale if syn_config else None}), encoding='utf-8')
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(22050)
        wav_file.writeframes(b'\\0' * 44100)
`, 'utf8');
    await writeFile(join(workspace, 'lameenc.py'), `
class Encoder:
    def set_bit_rate(self, value): pass
    def set_in_sample_rate(self, value): pass
    def set_channels(self, value): pass
    def set_quality(self, value): pass
    def encode(self, samples): return b'ID3' + b'\\0' * 200
    def flush(self): return b''
`, 'utf8');
    const command = process.env.PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
    const prefix = !process.env.PYTHON && process.platform === 'win32' ? ['-3'] : [];
    await new Promise((resolvePromise, reject) => {
      const child = spawn(command, [...prefix, resolve('apps/api/tools/piper_synthesize.py'), '--model', 'test.onnx', '--output', join(workspace, 'speech.mp3')], {
        env: { ...process.env, PYTHONPATH: workspace, PYTHONIOENCODING: 'cp1252', MITTEN_TEXT_CAPTURE: capture },
        stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true,
      });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolvePromise() : reject(new Error(stderr || `Python exited ${code}`)));
      child.stdin.end(phrase, 'utf8');
    });
    assert.deepEqual(JSON.parse(await readFile(capture, 'utf8')), { text: phrase, length_scale: 1.15 });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
