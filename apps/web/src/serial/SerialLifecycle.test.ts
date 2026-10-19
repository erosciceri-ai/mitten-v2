import { afterEach, expect, it, vi } from 'vitest';
import { SerialTransport } from './SerialTransport';

const active: SerialTransport[] = [];
afterEach(async () => { for (const t of active.splice(0)) await t.disconnect(); vi.useRealTimers(); });

function device() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>;
  const write = vi.fn();
  const port = {
    get readable() { return readable; }, get writable() { return writable; },
    open: vi.fn(async () => {
      readable = new ReadableStream({ start(c) { controller = c; } });
      writable = new WritableStream({ write });
    }),
    close: vi.fn(async () => { expect(readable.locked).toBe(false); expect(writable.locked).toBe(false); }),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: vi.fn(async () => port) } });
  const onData = vi.fn(), onError = vi.fn();
  const transport = new SerialTransport({ onData, onError }); active.push(transport);
  return { port, write, transport, onData, onError, push: (bytes: Uint8Array) => controller.enqueue(new Uint8Array(bytes)) };
}

it('releases both stream locks before closing and reconnects cleanly', async () => {
  const d=device(); await d.transport.connect();
  await d.transport.disconnect(); await d.transport.connect();
  expect(d.port.open).toHaveBeenCalledTimes(2);
  await d.transport.disconnect(); expect(d.port.close).toHaveBeenCalledTimes(2);
});

it('enforces the outgoing limit excluding LF, including multibyte UTF-8', async () => {
  const d=device(); await d.transport.connect(); d.transport.updateMaxMessageBytes(100);
  const envelope = {v:2,type:'request' as const,id:'r',command:'device.status',payload:{text:'é'.repeat(60)}};
  await expect(d.transport.send(envelope)).rejects.toThrow('MESSAGE_TOO_LARGE');
  expect(d.write).not.toHaveBeenCalled();
});

it('parses split UTF-8/CRLF and drops incomplete fragments before resynchronizing', async () => {
  vi.useFakeTimers(); const d=device(); await d.transport.connect();
  const event={v:2,type:'event',event:'diagnostic.log',data:{text:'ñ'}};
  const bytes=new TextEncoder().encode(JSON.stringify(event)+'\r\n');
  const split=bytes.indexOf(0xc3)+1;
  d.push(bytes.slice(0,split)); await Promise.resolve();
  d.push(bytes.slice(split)); await Promise.resolve();
  expect(d.onData).toHaveBeenCalledWith(event);
  d.push(new TextEncoder().encode('{"v":')); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(5000);
  expect(d.onError).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('timed out')}));
  d.push(new TextEncoder().encode('2}\n'+JSON.stringify(event)+'\n')); await Promise.resolve();
  expect(d.onData).toHaveBeenCalledTimes(2);
});
