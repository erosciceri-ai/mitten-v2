import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { afterEach, test } from 'node:test';
import { selectAvailablePort } from './dev-ports.mjs';

const servers = new Set();

afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise(resolve => server.close(resolve))));
  servers.clear();
});

async function occupyPort() {
  const server = createServer();
  servers.add(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}

test('elige otro puerto cuando el predeterminado ya esta ocupado', async () => {
  const occupiedPort = await occupyPort();

  const selectedPort = await selectAvailablePort({
    preferred: occupiedPort,
    explicitlyRequested: false,
    label: 'API',
  });

  assert.notEqual(selectedPort, occupiedPort);
});

test('rechaza un puerto ocupado cuando fue solicitado explicitamente', async () => {
  const occupiedPort = await occupyPort();

  await assert.rejects(
    selectAvailablePort({
      preferred: occupiedPort,
      explicitlyRequested: true,
      label: 'API',
    }),
    /puerto API .* ya est[aá] en uso/i,
  );
});

test('no selecciona un puerto excluido aunque este libre', async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const availablePort = address.port;
  await new Promise(resolve => server.close(resolve));

  const selectedPort = await selectAvailablePort({
    preferred: availablePort,
    explicitlyRequested: false,
    label: 'web',
    excluded: new Set([availablePort]),
  });

  assert.notEqual(selectedPort, availablePort);
});
