import { Request, Response, NextFunction } from 'express';
import { HealthCheckResponse } from '../types';

const START_TIME = Date.now();
const VERSION = process.env.npm_package_version || '0.1.0';

export class HealthController {
  check(req: Request, res: Response, next: NextFunction): void {
    try {
      const response: HealthCheckResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - START_TIME) / 1000),
        version: VERSION,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const healthController = new HealthController();