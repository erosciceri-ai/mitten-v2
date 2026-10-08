import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public message: string,
    public status: number = 500,
    public fields?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.status).json({
      message: err.message,
      status: err.status,
      fields: err.fields,
    });
    return;
  }

  if (err instanceof ZodError) {
    const fields = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      message: 'Validation failed',
      status: 400,
      fields,
    });
    return;
  }

  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ message: 'Invalid token', status: 401 });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ message: 'Token expired', status: 401 });
    return;
  }

  res.status(500).json({ message: 'Internal server error', status: 500 });
}
