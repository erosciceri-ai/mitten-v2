import { describe, expect, it } from 'vitest';
import { RelayTransport, relayUrlFromApiBase } from '../RelayTransport';
import type { ConnectionState } from '../SerialTransport';

class FakeSocket {
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  send(text: string) { this.sent.push(text); }
  close(code?: number) { this.closedWith = code ?? 1000; }
  open() { this.onopen?.(); }
  push(message: object | string) { this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) }); }
  drop(code: number) { this.onclose?.({ code }); }
}

function setup(overrides: { token?: string | null; deviceWaitMs?: number } = {}) {
  const socket = new FakeSocket();
  const frames: unknown[] = [];
  const errors: string[] = [];
  const states: ConnectionState[] = [];
  const transport = new RelayTransport(
    { onData: frame => frames.push(frame), onError: error => errors.push(error.message), onStateChange: state => states.push(state) },
    {
      url: 'wss://api.example/ws/web',
      getToken: () => (overrides.token === undefined ? 'JWT' : overrides.token),
      deviceWaitMs: overrides.deviceWaitMs ?? 40,
      createSocket: () => socket as unknown as WebSocket,
    },
  );
  return { socket, transport, frames, errors, states };
}

const response = { v: 2, type: 'response', id: 'r1', ok: true, result: {} };

describe('relayUrlFromApiBase', () => {
  it('convierte la URL del API en la del relay', () => {
    const page = { protocol: 'https:', host: 'mitten.pages.dev' };
    expect(relayUrlFromApiBase('https://mitten-api-staging.onrender.com/api', page)).toBe('wss://mitten-api-staging.onrender.com/ws/web');
    expect(relayUrlFromApiBase('/api', page)).toBe('wss://mitten.pages.dev/ws/web');
    expect(relayUrlFromApiBase('/api', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws/web');
  });
});

describe('RelayTransport', () => {
  it('autentica, abre cuando el guante está en línea y reenvía datos en ambos sentidos', async () => {
    const { socket, transport, frames } = setup();
    const connecting = transport.connect();
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'auth', token: 'JWT' });
    socket.push({ type: 'relay', event: 'ready', device: true });
    await connecting;
    expect(transport.getState()).toBe('open');
    socket.push(JSON.stringify(response));
    expect(frames).toEqual([response]);
    await transport.send({ v: 2, type: 'request', id: 'r2', command: 'device.status', payload: {} } as never);
    expect(socket.sent[1].endsWith('\n')).toBe(false);
    expect(JSON.parse(socket.sent[1]).id).toBe('r2');
  });

  it('espera al guante si todavía no está conectado y abre cuando aparece', async () => {
    const { socket, transport } = setup();
    const connecting = transport.connect();
    socket.open();
    socket.push({ type: 'relay', event: 'ready', device: false });
    setTimeout(() => socket.push({ type: 'relay', event: 'device_online' }), 10);
    await connecting;
    expect(transport.getState()).toBe('open');
  });

  it('falla con un mensaje claro si el guante no aparece', async () => {
    const { socket, transport } = setup({ deviceWaitMs: 20 });
    const connecting = transport.connect();
    socket.open();
    socket.push({ type: 'relay', event: 'ready', device: false });
    await expect(connecting).rejects.toThrow(/no está conectado/);
    expect(transport.getState()).toBe('error');
    expect(socket.closedWith).toBe(1000);
  });

  it('rechaza sesión inválida y falta de token sin abrir socket', async () => {
    const bad = setup();
    const connecting = bad.transport.connect();
    bad.socket.open();
    bad.socket.push({ type: 'relay', event: 'error', code: 'UNAUTHORIZED' });
    await expect(connecting).rejects.toThrow(/Sesión no autorizada/);
    const anonymous = setup({ token: null });
    await expect(anonymous.transport.connect()).rejects.toThrow(/Iniciá sesión/);
    expect(anonymous.states).toEqual([]);
  });

  it('informa cuando el guante se desconecta o cae la conexión', async () => {
    const first = setup();
    let connecting = first.transport.connect();
    first.socket.open();
    first.socket.push({ type: 'relay', event: 'ready', device: true });
    await connecting;
    first.socket.push({ type: 'relay', event: 'device_offline' });
    expect(first.errors).toEqual(['El guante se desconectó del servidor.']);
    expect(first.transport.getState()).toBe('error');

    const second = setup();
    connecting = second.transport.connect();
    second.socket.open();
    second.socket.push({ type: 'relay', event: 'ready', device: true });
    await connecting;
    second.socket.drop(4000);
    expect(second.errors).toEqual(['Otra sesión tomó el control del guante.']);
  });

  it('reporta líneas inválidas sin lanzar y rechaza mensajes demasiado grandes al enviar', async () => {
    const { socket, transport, errors, frames } = setup();
    const connecting = transport.connect();
    socket.open();
    socket.push({ type: 'relay', event: 'ready', device: true });
    await connecting;
    socket.push('esto no es json');
    expect(errors.length).toBe(1);
    expect(frames).toEqual([]);
    transport.updateMaxMessageBytes(10);
    await expect(transport.send({ v: 2, type: 'request', id: 'r3', command: 'device.status', payload: {} } as never)).rejects.toThrow(/MESSAGE_TOO_LARGE/);
  });

  it('disconnect cierra el socket y permite reconectar', async () => {
    const { socket, transport } = setup();
    const connecting = transport.connect();
    socket.open();
    socket.push({ type: 'relay', event: 'ready', device: true });
    await connecting;
    await transport.disconnect();
    expect(transport.getState()).toBe('closed');
    expect(socket.closedWith).toBe(1000);
    await expect(transport.send({ v: 2, type: 'request', id: 'r4', command: 'device.status', payload: {} } as never)).rejects.toThrow(/not open/);
  });
});
