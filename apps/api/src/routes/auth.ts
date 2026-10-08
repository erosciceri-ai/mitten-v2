import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Router, Request, Response } from 'express';
import { validateBody } from '../middleware/validation.js';
import { loginSchema, registerSchema } from '../utils/schemas.js';
import { createUser, findUserByEmail, verifyPassword } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.post('/login', validateBody(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    throw new AppError('Invalid credentials', 401);
  }

  const token = generateToken({ userId: user.id, email: user.email });

  res.json({
    user: { id: user.id, email: user.email },
    token,
  });
}));

router.post('/register', validateBody(registerSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const user = await createUser({ email, password });
  const token = generateToken({ userId: user.id, email: user.email });

  res.status(201).json({
    user,
    token,
  });
}));

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ id: req.user!.userId, email: req.user!.email });
});

export default router;