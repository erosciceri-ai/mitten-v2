import { createServer } from 'node:net';

const MIN_PORT = 1;
const MAX_PORT = 65_535;
const DEFAULT_SEARCH_LIMIT = 50;

function validatePort(port, label) {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(`El puerto ${label} debe ser un entero entre ${MIN_PORT} y ${MAX_PORT}.`);
  }
}

export function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

export async function selectAvailablePort({
  preferred,
  explicitlyRequested,
  label,
  excluded = new Set(),
  searchLimit = DEFAULT_SEARCH_LIMIT,
}) {
  validatePort(preferred, label);

  const preferredAvailable = !excluded.has(preferred) && await isPortAvailable(preferred);
  if (preferredAvailable) return preferred;

  if (explicitlyRequested) {
    throw new Error(`El puerto ${label} ${preferred} ya está en uso. Cierra el proceso que lo ocupa o elige otro puerto.`);
  }

  const lastCandidate = Math.min(preferred + searchLimit, MAX_PORT);
  for (let candidate = preferred + 1; candidate <= lastCandidate; candidate += 1) {
    if (!excluded.has(candidate) && await isPortAvailable(candidate)) return candidate;
  }

  throw new Error(`No se encontró un puerto libre para ${label} entre ${preferred} y ${lastCandidate}.`);
}
