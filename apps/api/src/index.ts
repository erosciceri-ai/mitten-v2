import { getAudioStorage } from './services/audioStorage.js';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { config, validateConfig } from './config/index.js';
import { limitRequests } from './middleware/httpSecurity.js';
import { AppError, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import gestureRoutes from './routes/gestures.js';
import healthRoutes from './routes/health.js';
import audioRoutes from './routes/audio.js';
import deviceRoutes from './routes/device.js';
import { attachRelay } from './ws/relay.js';
import { getDatabase, closeDatabase } from './db/index.js';
import { PostgresStartupError } from './db/postgres.js';

const app = express();

app.disable('x-powered-by');
app.set('query parser', 'simple');
app.set('trust proxy', config.trustedProxy === 1 || config.trustedProxy.length ? config.trustedProxy : false);

app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});
app.use((req, res, next) => {
  const origin = req.get('Origin');
  res.vary('Origin');
  if (origin !== undefined && origin !== config.corsOrigin) return next(new AppError('Origin not allowed', 403));
  if (config.nodeEnv === 'production' && !req.secure &&
      !(['GET', 'HEAD'].includes(req.method) && ['/api/health', '/api/ready'].includes(req.path))) {
    return next(new AppError('HTTPS required', 403));
  }
  next();
});
app.use(cors({
  origin: (origin, callback) => callback(null, origin === config.corsOrigin),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Range', 'If-Range', 'Idempotency-Key'],
  exposedHeaders: ['Retry-After', 'RateLimit', 'RateLimit-Policy', 'Content-Disposition'],
  maxAge: 600,
}));
app.use(limitRequests(900, 60_000));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/gestures', gestureRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api', healthRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found', status: 404 });
});

// Error handler
app.use(errorHandler);

export function isEntrypoint(moduleUrl: string, entry = process.argv[1]): boolean {
  return !!entry && moduleUrl === pathToFileURL(resolve(entry)).href;
}

if (isEntrypoint(import.meta.url)) {
  try {
    validateConfig();
  } catch {
    console.error('MITTEN API startup failed [APP_CONFIG]');
    process.exit(1);
  }
  try {
    getAudioStorage();
  } catch {
    console.error('MITTEN API startup failed [AUDIO_STORAGE_CONFIG]');
    process.exit(1);
  }
  try {
    await getDatabase();
  } catch (error) {
    const code = error instanceof PostgresStartupError ? error.code : 'DATABASE_INIT';
    console.error(`MITTEN API startup failed [${code}]`);
    process.exit(1);
  }
  const server = app.listen(config.port, config.host, () => {
    const address = server.address();
    console.log(`MITTEN API listening on ${typeof address === 'object' && address ? address.port : config.port}`);
  });
  const relay = attachRelay(server);
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.on('error', () => {
    console.error('MITTEN API could not start listening');
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    relay.close();
    server.close(() => { void closeDatabase().then(() => process.exit(0), () => process.exit(1)); });
  });
}

export default app;
