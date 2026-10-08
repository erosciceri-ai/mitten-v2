import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { config, validateConfig } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import gestureRoutes from './routes/gestures.js';
import healthRoutes from './routes/health.js';
import { getDatabase, closeDatabase } from './db/index.js';

const app = express();

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));



// Routes
app.use('/api/auth', authRoutes);
app.use('/api/gestures', gestureRoutes);
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
  validateConfig();
  await getDatabase();
  const server = app.listen(config.port, config.host, () => {
    const address = server.address();
    console.log(`MITTEN API listening on ${typeof address === 'object' && address ? address.port : config.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    server.close(() => { void closeDatabase().then(() => process.exit(0)); });
  });
}

export default app;
