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

const bodyErrors: Record<string, [number, string]> = {
  'entity.too.large': [413, 'Request body too large'],
  'entity.parse.failed': [400, 'Invalid JSON'],
  'request.size.invalid': [400, 'Invalid request body size'],
  'request.aborted': [400, 'Incomplete request body'],
  'encoding.unsupported': [415, 'Unsupported content encoding'],
  'charset.unsupported': [415, 'Unsupported charset'],
};

export function errorHandler(err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (err instanceof AppError && err.status >= 400 && err.status < 500) {
    if (err.status === 429) res.set('Retry-After', '5');
    res.status(err.status).json({ message: err.message, status: err.status, fields: err.fields });
    return;
  }
  if (err instanceof ZodError) {
    const fields = err.issues.map(e => ({ field: e.path.join('.'), message: e.message }));
    res.status(400).json({ message: 'Validation failed', status: 400, fields });
    return;
  }
  const bodyError = err.type && bodyErrors[err.type];
  if (bodyError) {
    const [status, message] = bodyError;
    res.status(status).json({ message, status });
    return;
  }
  const status = err instanceof AppError && [502, 503, 504].includes(err.status) ? err.status : 500;
  console.error('MITTEN API request failed', { status });
  const message = status === 500 ? 'Internal server error' : 'Service temporarily unavailable';
  res.status(status).json({ message, status });
}
