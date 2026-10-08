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
  getGestureAudioFile,
} from '../models/Gesture.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// All gesture routes require authentication
router.use(authMiddleware);

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

router.post('/', validateBody(createGestureSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

router.put('/:id', validateParams(gestureIdParamSchema), validateBody(updateGestureSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/:id/audio', validateParams(gestureIdParamSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);

  const gesture = await findGestureById(userId, id);
  if (!gesture) {
    throw new AppError('Gesture not found', 404);
  }

  try {
    const result = await generateGestureAudio(userId, id);
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
  const file = await getGestureAudioFile(req.user!.userId, Number(req.params.id));
  if (!file) throw new AppError('Audio not found', 404);
  res.setHeader('Cache-Control', 'private, no-store');
  await new Promise<void>((resolve, reject) => res.sendFile(file, error => error ? reject(error) : resolve()));
}));

export default router;