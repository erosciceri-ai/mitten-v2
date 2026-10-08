import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fields = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        res.status(400).json({
          message: 'Validation failed',
          status: 400,
          fields,
        });
      } else {
        res.status(400).json({ message: 'Invalid request body', status: 400 });
      }
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fields = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        res.status(400).json({
          message: 'Invalid parameters',
          status: 400,
          fields,
        });
      } else {
        res.status(400).json({ message: 'Invalid parameters', status: 400 });
      }
    }
  };
}