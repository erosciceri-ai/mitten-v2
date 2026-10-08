import { Writable } from 'node:stream';
import {
  NdjsonParser,
  ProtocolEnvelope,
  serializeFrame,
  BOOTSTRAP_MAX_MESSAGE_BYTES,
} from '@mitten/contracts';
import { SimulatorDispatcher } from './dispatcher';

interface SimulatorOptions {
  stdin: NodeJS.ReadableStream;
  stdout: Writable;
  stderr: Writable;
  captureDelayMs?: number;
  captureOutcome?: 'success' | 'failure';
  gestureSeed?: number;
}

const defaultDelay = (milliseconds: number): Promise<void> =>
  milliseconds > 0
    ? new Promise((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();

export function runSimulator(options: SimulatorOptions): void {
  const { stdin, stdout, stderr, captureDelayMs = 25, captureOutcome = 'success', gestureSeed } = options;

  const parser = new NdjsonParser();
  const logDiagnostic = (message: string): void => {
    stderr.write(`[DIAG] ${message}\n`);
  };

  const dispatcher = new SimulatorDispatcher(
    (envelope) => {

      const frame = serializeFrame(envelope);
      if (Buffer.byteLength(frame, 'utf8') - 1 > BOOTSTRAP_MAX_MESSAGE_BYTES) throw new Error('MESSAGE_TOO_LARGE');
      stdout.write(frame);
    },
    {
      delay: defaultDelay,
      captureDelayMs,
      captureOutcome,
      gestureSeed,
    },
  );

  dispatcher.startup();

  let incompleteTimer: ReturnType<typeof setTimeout> | undefined;
  const processPart = (part: Uint8Array): void => {
    const result = parser.push(part);
    if (incompleteTimer) clearTimeout(incompleteTimer);
    for (const error of result.errors) {
      logDiagnostic(`${error.type}: ${error.message}`);
      dispatcher.handleParseError(error);
    }
    for (const frame of result.frames) {
      const pending = dispatcher.dispatch(frame);
      if (pending) void pending.catch(error => logDiagnostic(String(error)));
    }
    if (result.remaining.length) {
      incompleteTimer = setTimeout(() => {
        const error = parser.discardIncomplete();
        if (error) dispatcher.handleParseError(error);
      }, 5000);
      incompleteTimer.unref();
    }
  };
  const processInput = (chunk: string | Buffer): void => {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    // Process in wire order, including errors on either side of a handshake.
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 10) { processPart(bytes.subarray(start, i + 1)); start = i + 1; }
    }
    if (start < bytes.length) processPart(bytes.subarray(start));
  };
  stdin.on('data', processInput);
  stdin.on('end', () => { if (incompleteTimer) clearTimeout(incompleteTimer); parser.reset(); });

}

if (require.main === module) {
  runSimulator({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}