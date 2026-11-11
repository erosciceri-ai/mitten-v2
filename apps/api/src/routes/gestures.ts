import { audioChecksum } from '../services/audioStorage.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import { createGestureSchema, updateGestureSchema, gestureIdParamSchema, paginationSchema } from '../utils/schemas.js';
import {
  findAllGestures,
  findGestureById,
  createGesture,
  updateGesture,
  deleteGesture,
  getGestureCount,
  generateGestureAudio,
  getGestureAudioInfo,
  getGestureAudio,
} from '../models/Gesture.js';
import { accountKey, jsonBody, limitConcurrent, limitRequests } from '../middleware/httpSecurity.js';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const generateAudio = limitConcurrent(config.ttsConcurrency);

// All gesture routes require authentication
router.use(authMiddleware, limitRequests(180, 60_000, accountKey));

router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const gestures = await findAllGestures(userId);
  res.json({ gestures, total: gestures.length });
}));

router.get('/:id', validateParams(gestureIdParamSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);

  const gesture = await findGestureById(userId, id);
  if (!gesture) {
    throw new AppError('Gesture not found', 404);
  }

  res.json(gesture);
}));

router.post('/', ...jsonBody('32kb'), validateBody(createGestureSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const { name, data } = req.body;

  try {
    const gesture = await createGesture({ userId, name, data });
    res.status(201).json(gesture);
  } catch (error) {
    if (error instanceof Error && error.message.includes('audio tracks')) {
      throw new AppError('Maximum gestures reached (50 per user)', 400);
    }
    throw error;
  }
}));

router.put('/:id', validateParams(gestureIdParamSchema), ...jsonBody('32kb'), validateBody(updateGestureSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const { name, data } = req.body;

  const gesture = await updateGesture(userId, id, { name, data });
  if (!gesture) {
    throw new AppError('Gesture not found', 404);
  }

  res.json(gesture);
}));

router.delete('/:id', validateParams(gestureIdParamSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);

  const deleted = await deleteGesture(userId, id);
  if (!deleted) {
    throw new AppError('Gesture not found', 404);
  }

  res.status(204).send();
}));

// Audio generation endpoints
router.post('/:id/audio', limitRequests(10, 60_000, accountKey), limitRequests(60, 60_000), ...jsonBody('1kb', false), validateParams(gestureIdParamSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);

  const gesture = await findGestureById(userId, id);
  if (!gesture) {
    throw new AppError('Gesture not found', 404);
  }

  const requestKey = req.get('Idempotency-Key');
  if (requestKey !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(requestKey)) {
    throw new AppError('Invalid Idempotency-Key', 400);
  }

  try {
    const result = await generateAudio(() => generateGestureAudio(userId, id, requestKey));
    res.json({
      message: 'Audio generated successfully',
      trackNumber: result.trackNumber,
      filePath: result.filePath,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Gesture not found') {
      throw new AppError('Gesture not found', 404);
    }
    throw error;
  }
}));

router.get('/:id/audio', validateParams(gestureIdParamSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);

  const info = await getGestureAudioInfo(userId, id);
  if (!info) {
    throw new AppError('Gesture not found', 404);
  }

  res.json(info);
}));

router.get('/:id/audio/file', validateParams(gestureIdParamSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const file = await getGestureAudio(req.user!.userId, Number(req.params.id));
  if (!file) throw new AppError('Audio not found', 404);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  res.type('audio/mpeg');
  const etag = '"' + audioChecksum(file) + '"';
  res.setHeader('ETag', etag);
  const ifRange = req.get('If-Range');
  const range = !ifRange || ifRange === etag ? req.range(file.length, { combine: true }) : undefined;
  if (range === -1) {
    res.setHeader('Content-Range', 'bytes */' + file.length);
    res.status(416).end();
    return;
  }
  if (Array.isArray(range) && range.type === 'bytes' && range.length === 1) {
    const [{ start, end }] = range;
    res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + file.length);
    res.status(206).send(file.subarray(start, end + 1));
    return;
  }
  res.send(file);
}));

export default router;