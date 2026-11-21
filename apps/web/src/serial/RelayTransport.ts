import type { ProtocolEnvelope, ParseError } from '@mitten/contracts';
import { NdjsonParser, serializeFrame } from '@mitten/contracts';
import type { ConnectionState } from './SerialTransport';
import type { DeviceTransport, DeviceTransportHandlers } from './DeviceTransport';

export interface RelayTransportOptions {
  url: string;
  getToken: () => string | null;
  maxMessageBytes?: number;
  /** Cuánto espera a que el guante se conecte al servidor si todavía está offline. */
  deviceWaitMs?: number;
  createSocket?: (url: string) => WebSocket;
}

/** Deriva la URL del relay (/ws/web) a partir de VITE_API_URL; en desarrollo usa el host de la página. */
export function relayUrlFromApiBase(apiBase: string, page: Pick<Location, 'protocol' | 'host'>): string {
  const absolute = /^https?:\/\//i.test(apiBase) ? new URL(apiBase) : null;
  const secure = (absolute ? absolute.protocol : page.protocol) === 'https:';
  return `${secure ? 'wss:' : 'ws:'}//${absolute ? absolute.host : page.host}/ws/web`;
}

const CLOSE_MESSAGES: Record<number, string> = {
  4000: 'Otra sesión tomó el control del guante.',
  4001: 'El servidor no recibió la autenticación a tiempo.',
  4003: 'Sesión no autorizada; volvé a iniciar sesión.',
};

/**
 * Transporte del guante por Wi-Fi: la web habla con el relay del backend (Render) y este
 * reenvía cada línea NDJSON al ESP32. Cada mensaje WebSocket de texto es una línea del protocolo.
 */
export class RelayTransport implements DeviceTransport {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'closed';
  private parser: NdjsonParser;
  private maxMessageBytes: number;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly encoder = new TextEncoder();

  constructor(private readonly handlers: DeviceTransportHandlers, private readonly options: RelayTransportOptions) {
    this.maxMessageBytes = options.maxMessageBytes ?? 8192;
    this.parser = new NdjsonParser({ maxMessageBytes: this.maxMessageBytes });
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.handlers.onStateChange(next);
  }

  async connect(): Promise<void> {
    if (this.state === 'error') this.setState('closed');
    if (this.state !== 'closed') throw new Error(`Cannot connect: relay is ${this.state}`);
    const token = this.options.getToken();
    if (!token) throw new Error('Iniciá sesión para conectar el guante por Wi-Fi.');
    this.setState('opening');
    this.parser.reset();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        this.clearWait();
        if (error) {
          this.setState('error');
          this.closeSocket();
          reject(error);
        } else {
          this.setState('open');
          resolve();
        }
      };
      const ws = (this.options.createSocket ?? (url => new WebSocket(url)))(this.options.url);
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
      ws.onerror = () => settle(new Error('No se pudo conectar con el servidor.'));
      ws.onclose = event => {
        if (!settled) return settle(new Error(CLOSE_MESSAGES[event.code] ?? 'No se pudo conectar con el servidor.'));
        if (this.state === 'open') this.lost(new Error(CLOSE_MESSAGES[event.code] ?? 'Se perdió la conexión con el servidor.'));
      };
      ws.onmessage = event => {
        const text = typeof event.data === 'string' ? event.data : '';
        const control = this.parseControl(text);
        if (control) return this.onControl(control, settled, settle);
        if (settled) this.receive(text);
      };
    });
  }

  private onControl(message: Record<string, unknown>, settled: boolean, settle: (error?: Error) => void): void {
    switch (message.event) {
      case 'ready':
        if (message.device === true) return settle();
        this.waitTimer = setTimeout(
          () => settle(new Error('El guante no está conectado al servidor. Verificá su Wi-Fi y que esté vinculado.')),
          this.options.deviceWaitMs ?? 15_000,
        );
        return;
      case 'device_online':
        if (!settled) settle();
        return;
      case 'device_offline':
        if (settled && this.state === 'open') this.lost(new Error('El guante se desconectó del servidor.'));
        return;
      case 'error':
        if (!settled) settle(new Error(message.code === 'UNAUTHORIZED' ? CLOSE_MESSAGES[4003] : 'El servidor rechazó la conexión.'));
        return;
    }
  }

  private parseControl(text: string): Record<string, unknown> | null {
    if (!text.startsWith('{')) return null;
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && value.type === 'relay' ? value : null;
    } catch {
      return null;
    }
  }

  private receive(text: string): void {
    const bytes = this.encoder.encode(text.endsWith('\n') ? text : `${text}\n`);
    const result = this.parser.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    for (const error of result.errors) this.handleParseError(error);
    for (const frame of result.frames) this.handlers.onData(frame);
  }

  private handleParseError(error: ParseError): void {
    this.handlers.onError(new Error(`Relay parse error: ${error.message}`));
  }

  private lost(error: Error): void {
    this.setState('error');
    this.handlers.onError(error);
    this.closeSocket();
  }

  async send(envelope: ProtocolEnvelope): Promise<void> {
    if (this.state !== 'open' || !this.ws) throw new Error('Relay is not open');
    const frame = serializeFrame(envelope);
    if (this.encoder.encode(frame).byteLength - 1 > this.maxMessageBytes) throw new Error('MESSAGE_TOO_LARGE');
    this.ws.send(frame.replace(/\n$/, ''));
  }

  async disconnect(): Promise<void> {
    if (this.state === 'closed' && !this.ws) return;
    this.setState('closing');
    this.clearWait();
    this.closeSocket();
    this.setState('closed');
  }

  updateMaxMessageBytes(maxMessageBytes: number): void {
    if (maxMessageBytes === this.maxMessageBytes) return;
    this.maxMessageBytes = maxMessageBytes;
    this.parser = new NdjsonParser({ maxMessageBytes });
  }

  private clearWait(): void {
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = null;
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(1000); } catch { /* ya cerrado */ }
  }
}
