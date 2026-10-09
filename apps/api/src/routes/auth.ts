import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { Router, Request, Response } from 'express';
import { validateBody } from '../middleware/validation.js';
import { googleCredentialSchema, loginSchema, registerSchema } from '../utils/schemas.js';
import {
  createGoogleUser,
  createUser,
  findUserByEmail,
  findUserByGoogleSub,
  findUserById,
  linkGoogleIdentity,
  toPublicUser,
  verifyPassword,
} from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { verifyGoogleCredential } from '../services/googleIdentity.js';
import { exportAccountData } from '../services/accountExport.js';

const router = Router();

router.post('/login', validateBody(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    throw new AppError('Invalid credentials', 401);
  }

  const token = generateToken({ userId: user.id, email: user.email });

  res.json({
    user: toPublicUser(user),
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

router.post('/google', validateBody(googleCredentialSchema), asyncHandler(async (req: Request, res: Response) => {
  const identity = await verifyGoogleCredential(req.body.credential);
  let user = await findUserByGoogleSub(identity.subject);

  if (!user) {
    const existing = await findUserByEmail(identity.email);
    if (existing) {
      throw new AppError('Sign in with your password first to link this Google account', 409);
    }
    await createGoogleUser(identity.email, identity.subject);
    user = await findUserByGoogleSub(identity.subject);
  }

  if (!user) throw new AppError('Google account could not be created', 500);
  const token = generateToken({ userId: user.id, email: user.email });
  res.json({ user: toPublicUser(user), token });
}));

router.post('/google/link', authMiddleware, validateBody(googleCredentialSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const identity = await verifyGoogleCredential(req.body.credential);
  if (identity.email.toLocaleLowerCase() !== req.user!.email.toLocaleLowerCase()) {
    throw new AppError('Google account email must match your MITTEN account', 409);
  }

  const linkedUser = await findUserByGoogleSub(identity.subject);
  if (linkedUser && linkedUser.id !== req.user!.userId) {
    throw new AppError('This Google account is already linked to another MITTEN account', 409);
  }

  const current = await findUserById(req.user!.userId);
  if (!current) throw new AppError('User not found', 404);
  if (current.google_sub && current.google_sub !== identity.subject) {
    throw new AppError('A different Google account is already linked', 409);
  }
  if (!current.google_sub) await linkGoogleIdentity(current.id, identity.subject);

  const updated = await findUserById(current.id);
  if (!updated) throw new AppError('User not found', 404);
  res.json({ user: toPublicUser(updated) });
}));

router.get('/me', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await findUserById(req.user!.userId);
  if (!user) throw new AppError('User not found', 404);
  res.json(toPublicUser(user));
}));

router.get('/export', authMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const accountExport = await exportAccountData(req.user!.userId);
  if (!accountExport) throw new AppError('User not found', 404);
  res.set('Cache-Control', 'no-store').json(accountExport);
}));

export default router;
