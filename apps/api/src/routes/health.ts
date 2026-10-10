import { Router } from 'express';
import { getDatabase } from '../db/index.js';
import { getTTSReadiness } from '../services/tts.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/ready', asyncHandler(async (_req, res) => {
  const db = await getDatabase();
  await db.get('SELECT 1 AS ready');
  const tts = await getTTSReadiness();
  res.json({
    status: tts.available ? 'ready' : 'degraded',
    services: { api: 'ok', sqlite: 'ok', tts },
    timestamp: new Date().toISOString(),
  });
}));

export default router;
