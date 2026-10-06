import type { ProtocolEnvelope, RequestEnvelope } from '@mitten/contracts';
import { PROTOCOL_VERSION, isValidRequestId } from '@mitten/contracts';

export interface PendingRequest<T = unknown> {
  id: string;
  command: string;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  startTime: number;
}

export interface RequestManagerOptions {
  defaultTimeout?: number;
  handshakeTimeout?: number;
  captureTimeout?: number;
  syncIdleTimeout?: number;
  syncCommitTimeout?: number;
}

export interface SendRequestOptions<RequestPayload extends Record<string, unknown> = Record<string, unknown>> {
  timeout?: number;
  expectedCommand?: string;
  requestId?: string;
  payload?: RequestPayload;
}

interface ResolvedTimeouts {
  default: number;
  handshake: number;
  capture: number;
  syncIdle: number;
  syncCommit: number;
}

const DEFAULT_TIMEOUTS: ResolvedTimeouts = {
  default: 5000,
  handshake: 5000,
  capture: 15000,
  syncIdle: 10000,
  syncCommit: 10000,
};

export class RequestManager {
  private pendingRequests = new Map<string, PendingRequest<unknown>>();
  private readonly sendFn: (envelope: ProtocolEnvelope) => Promise<void>;
  private readonly timeouts: ResolvedTimeouts;
  private requestCounter = 0;

  constructor(
    sendFn: (envelope: ProtocolEnvelope) => Promise<void>,
    options: RequestManagerOptions = {}
  ) {
    this.sendFn = sendFn;
    this.timeouts = {
      default: options.defaultTimeout ?? DEFAULT_TIMEOUTS.default,
      handshake: options.handshakeTimeout ?? DEFAULT_TIMEOUTS.handshake,
      capture: options.captureTimeout ?? DEFAULT_TIMEOUTS.capture,
      syncIdle: options.syncIdleTimeout ?? DEFAULT_TIMEOUTS.syncIdle,
      syncCommit: options.syncCommitTimeout ?? DEFAULT_TIMEOUTS.syncCommit,
    };
  }

  generateRequestId(prefix = 'req'): string {
    this.requestCounter++;
    return `${prefix}-${Date.now()}-${this.requestCounter}`;
  }

  sendRequest<RequestPayload extends Record<string, unknown>, ResponseResult extends object>(
    command: string,
    payload: RequestPayload,
    options: SendRequestOptions<RequestPayload> = {}
  ): { requestId: string; promise: Promise<ResponseResult> } {
    const id = options.requestId ?? this.generateRequestId(command.split('.')[0]);
    
    if (!isValidRequestId(id)) {
      throw new Error(`Generated invalid request ID: ${id}`);
    }

    const envelope: RequestEnvelope<string, RequestPayload, 2> = {
      v: PROTOCOL_VERSION,
      type: 'request',
      id,
      command,
      payload: options.payload ?? payload,
    };

    // Determine timeout based on command
    let timeout = options.timeout ?? this.timeouts.default;
    if (command === 'device.handshake') timeout = this.timeouts.handshake;
    else if (command === 'capture.start') timeout = this.timeouts.capture;
    else if (command === 'sync.commit') timeout = this.timeouts.syncCommit;

    const promise = new Promise<ResponseResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${command} (${timeout}ms)`));
      }, timeout);

      const pendingRequest: PendingRequest<unknown> = {
        id,
        command,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutHandle,
        startTime: Date.now(),
      };

      this.pendingRequests.set(id, pendingRequest);

      // Send the request
      this.sendFn(envelope).catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });

    return { requestId: id, promise };
  }

  handleResponse(envelope: ProtocolEnvelope): boolean {
    if (envelope.type !== 'response') {
      return false;
    }

    const pending = this.pendingRequests.get(envelope.id);
    if (!pending) {
      // No pending request for this response - could be late response
      console.warn(`Received response for unknown request ID: ${envelope.id}`);
      return false;
    }

    // Clear timeout
    clearTimeout(pending.timeoutHandle);
    this.pendingRequests.delete(envelope.id);

    if (envelope.ok) {
      pending.resolve(envelope.result as any);
    } else {
      const error = new Error(envelope.error.message);
      (error as any).code = envelope.error.code;
      (error as any).details = envelope.error.details;
      pending.reject(error);
    }

    return true;
  }

  handleEvent(envelope: ProtocolEnvelope): void {
    // Events are handled by the device service, not the request manager
    // This method exists for potential future use
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getPendingRequestIds(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  hasPendingRequest(id: string): boolean {
    return this.pendingRequests.has(id);
  }

  cancelRequest(id: string, reason = 'Cancelled'): boolean {
    const pending = this.pendingRequests.get(id);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timeoutHandle);
    pending.reject(new Error(reason));
    this.pendingRequests.delete(id);
    return true;
  }

  cancelAllRequests(reason = 'Disconnected'): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  getPendingRequest(id: string): PendingRequest | undefined {
    return this.pendingRequests.get(id);
  }

  // Get timeout for a specific command
  getTimeoutForCommand(command: string): number {
    switch (command) {
      case 'device.handshake':
        return this.timeouts.handshake;
      case 'capture.start':
        return this.timeouts.capture;
      case 'sync.commit':
        return this.timeouts.syncCommit;
      default:
        return this.timeouts.default;
    }
  }
}