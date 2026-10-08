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
  function device() {
    const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
    const frames: ProtocolEnvelope[] = [];
    const parser = new NdjsonParser();
    stdout.on('data', chunk => frames.push(...parser.push(chunk).frames));
    runSimulator({ stdin, stdout, stderr, captureDelayMs: 0 });
    const handshake = serializeFrame(createRequest('hs', 'device.handshake', {client:'MITTEN_WEB',supportedProtocolVersions:[2]}));
    return {stdin,frames,handshake};
  }

  test('rejects oversized bootstrap frames and recovers at LF', async () => {
    const d=device();
    d.stdin.write(d.handshake.replace('"payload":{', '"payload":{"padding":"'+'x'.repeat(9000)+'",'));
    expect(d.frames.some(f=>f.type==='response' && f.id==='hs')).toBe(false);
    d.stdin.write(d.handshake);
    d.stdin.write('x'.repeat(9000)+'\n');
    d.stdin.write(serializeFrame(createStatusRequest('status')));
    await flushIo(); d.stdin.end();
    expect(d.frames).toContainEqual(expect.objectContaining({type:'event',event:'protocol.error',data:{error:expect.objectContaining({code:'MESSAGE_TOO_LARGE'})}}));
    expect(d.frames).toContainEqual(expect.objectContaining({type:'response',id:'status',ok:true}));
  });

  test('preserves split UTF-8 and applies dispatch error priority in wire order', async () => {
    const d=device();
    const unknown={v:2,type:'request',id:'unknown',command:'device.ñ',payload:{}};
    const bytes=Buffer.from(JSON.stringify(unknown)+'\r\n');
    const split=bytes.indexOf(0xc3)+1;
    d.stdin.write(bytes.subarray(0,split)); d.stdin.write(bytes.subarray(split));
    d.stdin.write(d.handshake+JSON.stringify({...unknown,id:'after'})+'\n');
    await flushIo(); d.stdin.end();
    expect(d.frames).toContainEqual(expect.objectContaining({type:'response',id:'unknown',error:expect.objectContaining({code:'HANDSHAKE_REQUIRED'})}));
    expect(d.frames).toContainEqual(expect.objectContaining({type:'response',id:'after',error:expect.objectContaining({code:'UNKNOWN_COMMAND'})}));
  });

  test('times out incomplete messages and resynchronizes', () => {
    jest.useFakeTimers();
    try {
      const d=device(); d.stdin.write(d.handshake); d.stdin.write('{"v":');
      jest.advanceTimersByTime(5000);
      d.stdin.write('2}\n'+serializeFrame(createStatusRequest('recovered'))); d.stdin.end();
      expect(d.frames).toContainEqual(expect.objectContaining({type:'event',event:'protocol.error',data:{error:expect.objectContaining({code:'INCOMPLETE_MESSAGE'})}}));
      expect(d.frames).toContainEqual(expect.objectContaining({type:'response',id:'recovered',ok:true}));
    } finally { jest.useRealTimers(); }
  });
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
