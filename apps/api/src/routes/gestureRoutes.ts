import { Router, Response, NextFunction } from 'express';
import { gestureController } from '../controllers/gestureController';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';
import { AppError } from '../types';

const router = Router();

// All gesture routes require authentication
router.use(authMiddleware);

// Validation schemas
const createGestureSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Gesture name is required').max(60, 'Gesture name must be at most 60 characters'),
    data: z.object({
      version: z.literal(1, { errorMap: () => ({ message: 'version must be 1' }) }),
      dimensions: z.literal(7, { errorMap: () => ({ message: 'dimensions must be 7' }) }),
      dimensionOrder: z.array(z.string()).length(7),
      units: z.object({
        flex: z.literal('adc12'),
        mpu: z.literal('degrees'),
      }),
      samples: z.array(z.array(z.number())).min(1, 'At least one sample is required'),
      summary: z.object({
        min: z.array(z.number()).length(7),
        max: z.array(z.number()).length(7),
        mean: z.array(z.number()).length(7),
      }),
      sampleCount: z.number().int().positive(),
      captureDurationMs: z.number().int().positive().max(10000),
      samplingPeriodMs: z.number().int().positive().max(1000),
    }),
  }),
});

const updateGestureSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Gesture name is required').max(60, 'Gesture name must be at most 60 characters').optional(),
    data: z.object({
      version: z.literal(1).optional(),
      dimensions: z.literal(7).optional(),
      dimensionOrder: z.array(z.string()).length(7).optional(),
      units: z.object({
        flex: z.literal('adc12'),
        mpu: z.literal('degrees'),
      }).optional(),
      samples: z.array(z.array(z.number())).min(1).optional(),
      summary: z.object({
        min: z.array(z.number()).length(7),
        max: z.array(z.number()).length(7),
        mean: z.array(z.number()).length(7),
      }).optional(),
      sampleCount: z.number().int().positive().optional(),
      captureDurationMs: z.number().int().positive().max(10000).optional(),
      samplingPeriodMs: z.number().int().positive().max(1000).optional(),
    }).optional(),
  }),
});

const gestureIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'Gesture ID must be a positive integer'),
  }),
});

// Validation middleware
function validate(schema: z.ZodSchema) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      schema.parse(req);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw AppError.validation('Validation failed', { fields: details });
      }
      next(error);
    }
  };
}

// Routes
router.post('/', validate(createGestureSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => gestureController.createGesture(req, res, next));
router.get('/', (req: AuthenticatedRequest, res: Response, next: NextFunction) => gestureController.getGestures(req, res, next));
router.get('/:id', validate(gestureIdParamSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => gestureController.getGestureById(req, res, next));
router.put('/:id', validate(gestureIdParamSchema), validate(updateGestureSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => gestureController.updateGesture(req, res, next));
router.delete('/:id', validate(gestureIdParamSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => gestureController.deleteGesture(req, res, next));

export default router;