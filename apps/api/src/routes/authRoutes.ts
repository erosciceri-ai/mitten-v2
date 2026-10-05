import { Router, Response, NextFunction } from 'express';
import { authController } from '../controllers/authController';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';
import { AppError } from '../types';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
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
router.post('/register', validate(registerSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => authController.register(req, res, next));
router.post('/login', validate(loginSchema), (req: AuthenticatedRequest, res: Response, next: NextFunction) => authController.login(req, res, next));

// Protected route example - get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw AppError.unauthorized();
    }
    res.json({
      user: {
        id: req.user.userId,
        email: req.user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;