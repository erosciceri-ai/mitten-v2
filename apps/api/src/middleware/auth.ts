import { asyncHandler } from './asyncHandler.js';
import { Request, Response, NextFunction } from 'express';
import { authenticateRequest } from '../utils/jwt.js';

export interface AuthenticatedRequest extends Request {
  user?: { userId: number; email: string };
}

export const authMiddleware = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  const auth = await authenticateRequest(authHeader);
  if (!auth) {
    res.status(401).json({ message: 'Unauthorized', status: 401 });
    return;
  }

  req.user = auth;
  next();
});

export const optionalAuthMiddleware = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const auth = await authenticateRequest(authHeader);
    if (auth) {
      req.user = auth;
    }
  }

  next();
});