import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from './errorHandler.js';
import type { AuthenticatedRequest } from './auth.js';

export function jsonBody(limit: string, required = true): RequestHandler[] {
  return [
    (req, _res, next) => {
      const hasBody = Boolean(req.headers['transfer-encoding'] || Number(req.headers['content-length']));
      if ((required || hasBody) && !req.is('application/json')) {
        return next(new AppError('Content-Type must be application/json', 415));
      }
      next();
    },
    express.json({ limit, inflate: false }),
  ];
}

export const rejectBody: RequestHandler = (req, _res, next) => {
  if (req.headers['transfer-encoding'] || Number(req.headers['content-length'])) {
    return next(new AppError('This endpoint does not accept a request body', 400));
  }
  next();
};

export function limitRequests(limit: number, windowMs: number, key?: (req: AuthenticatedRequest) => string) {
  return rateLimit({
    limit,
    windowMs,
    keyGenerator: key,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Direct clients' forwarding headers are intentionally ignored by Express.
    validate: { xForwardedForHeader: false, forwardedHeader: false },
    message: { message: 'Too many requests. Try again later.', status: 429 },
  });
}

export const accountKey = (req: AuthenticatedRequest): string => String(req.user!.userId);

export function limitConcurrent(max: number) {
  let active = 0;
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= max) throw new AppError('Too many requests. Try again later.', 429);
    active++;
    try { return await work(); }
    finally { active--; }
  };
}
