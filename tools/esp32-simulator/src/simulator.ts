import { Writable } from 'node:stream';
import {
  NdjsonParser,
  ProtocolEnvelope,
  serializeFrame,
  validateProtocolV2Message,
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
  const emittedFrames: ProtocolEnvelope[] = [];

  const logDiagnostic = (message: string): void => {
    stderr.write(`[DIAG] ${message}\n`);
  };

  const dispatcher = new SimulatorDispatcher(
    (envelope) => {
      emittedFrames.push(envelope);
      const frame = serializeFrame(envelope);
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

  let buffer = '';

  const processInput = (chunk: string | Buffer): void => {
    const data = chunk.toString('utf8');
    buffer += data;

    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        const validation = validateProtocolV2Message(parsed);
        if (!validation.valid) {
          logDiagnostic(`INVALID_MESSAGE: ${validation.errors.join('; ')}`);
          dispatcher.handleParseError({
            type: 'INVALID_MESSAGE',
            message: validation.errors.join('; '),
            rawData: new TextEncoder().encode(line),
          });
          continue;
        }
        if (parsed.type === 'request') {
          dispatcher.dispatch(parsed as ProtocolEnvelope);
        }
      } catch {
        logDiagnostic('INVALID_JSON: Invalid JSON frame');
        dispatcher.handleParseError({
          type: 'INVALID_JSON',
          message: 'Invalid JSON frame',
          rawData: new TextEncoder().encode(line),
        });
      }
    }
  };

  stdin.on('data', processInput);
}

if (require.main === module) {
  runSimulator({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}