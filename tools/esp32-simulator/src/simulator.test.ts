import { PassThrough } from 'node:stream';

import {
  NdjsonParser,
  ProtocolEnvelope,
  createRequest,
  createStatusRequest,
  serializeFrame,
  validateProtocolV2Message,
} from '@mitten/contracts';

import { runSimulator } from './simulator';

const flushIo = () => new Promise<void>(resolve => setImmediate(resolve));

describe('simulator CLI transport', () => {
  test('malformed input does not crash and stdout contains only valid protocol frames', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let output = '';
    let diagnostics = '';
    stdout.on('data', chunk => { output += chunk.toString('utf8'); });
    stderr.on('data', chunk => { diagnostics += chunk.toString('utf8'); });

    runSimulator({ stdin, stdout, stderr, captureDelayMs: 0 });
    stdin.write(serializeFrame(createRequest('handshake-cli', 'device.handshake', {
      client: 'MITTEN_WEB',
      supportedProtocolVersions: [2],
    })));
    stdin.write('{not-json}\n');
    stdin.write(serializeFrame(createStatusRequest('status-cli')));
    await flushIo();

    const parsed = new NdjsonParser().push(Buffer.from(output, 'utf8'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.frames.length).toBeGreaterThanOrEqual(6);
    expect(parsed.frames.every(frame => validateProtocolV2Message(frame).valid)).toBe(true);
    expect(parsed.frames).toContainEqual(expect.objectContaining({
      type: 'event',
      event: 'protocol.error',
      data: expect.objectContaining({
        error: expect.objectContaining({ code: 'INVALID_JSON' }),
      }),
    }));
    expect(parsed.frames).toContainEqual(expect.objectContaining({
      type: 'response',
      id: 'status-cli',
      ok: true,
    }));

    for (const line of output.trim().split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(diagnostics).toContain('INVALID_JSON');
  });
});
