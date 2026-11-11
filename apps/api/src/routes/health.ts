import { Router } from 'express';
import { config } from '../config/index.js';
import { getDatabase } from '../db/index.js';
import { getTTSReadiness } from '../services/tts.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/ready', asyncHandler(async (_req, res) => {
  try {
    const db = await getDatabase();
    await db.get('SELECT 1 AS ready');
  } catch {
    res.status(503).json({ status: 'unavailable' });
    return;
  }
  const { provider, available } = await getTTSReadiness();
  if (config.nodeEnv === 'production') {
    res.status(available ? 200 : 503).json({ status: available ? 'ready' : 'degraded' });
    return;
  }
  res.json({
    status: available ? 'ready' : 'degraded',
    services: { api: 'ok', sqlite: 'ok', tts: { provider, available } },
    timestamp: new Date().toISOString(),
  });
}));

export default router;
