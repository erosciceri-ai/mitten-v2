import { describe, expect, it, vi } from 'vitest';
import { createHandshakeRequest, createStatusRequest, PROTOCOL_VERSION } from '@mitten/contracts';
import { DemoTransport } from '../DemoTransport';

describe('DemoTransport', () => {
  it('uses the official dispatcher and preserves the committed profile after restart', async () => {
    const onData = vi.fn();
    const transport = new DemoTransport({ onData, onError: vi.fn(), onStateChange: vi.fn() });
    await transport.connect();
    await transport.send(createHandshakeRequest('h1', 'MITTEN_WEB', [PROTOCOL_VERSION]));
    expect(onData).toHaveBeenCalledWith(expect.objectContaining({ type: 'response', id: 'h1', ok: true }));
    await transport.restart();
    await transport.send(createHandshakeRequest('h2', 'MITTEN_WEB', [PROTOCOL_VERSION]));
    await transport.send(createStatusRequest('s1'));
    expect(onData).toHaveBeenCalledWith(expect.objectContaining({ type: 'response', id: 's1', ok: true }));
  });

  it('reports simulator failures through the transport error callback', async () => {
    const onError = vi.fn();
    const transport = new DemoTransport({ onData: vi.fn(), onError, onStateChange: vi.fn() });
    await expect(transport.send(createStatusRequest('closed'))).rejects.toThrow('not connected');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not connected') }));
  });
});
