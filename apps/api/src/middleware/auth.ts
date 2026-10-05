import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { JWTPayload, AppError } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw AppError.unauthorized('Authorization header required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw AppError.unauthorized('Invalid authorization header format. Use: Bearer <token>');
    }

    const token = parts[1];
    const payload = authService.verifyToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      next();
      return;
    }

    const token = parts[1];
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    // Silently ignore invalid tokens for optional auth
    next();
  }
}