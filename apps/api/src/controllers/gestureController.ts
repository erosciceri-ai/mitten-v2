import { Request, Response, NextFunction } from 'express';
import { gestureService } from '../services/gestureService';
import { AuthenticatedRequest } from '../middleware/auth';
import { GestureCreateRequest, GestureUpdateRequest, AppError } from '../types';

export class GestureController {
  async createGesture(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }
      const data: GestureCreateRequest = req.body;
      const result = await gestureService.createGesture(req.user.userId, data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getGestures(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }
      const result = await gestureService.getGestures(req.user.userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getGestureById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }
      const gestureId = parseInt(req.params.id, 10);
      if (isNaN(gestureId)) {
        throw AppError.badRequest('Invalid gesture ID');
      }
      const result = await gestureService.getGestureById(req.user.userId, gestureId);
      if (!result) {
        throw AppError.notFound('Gesture not found');
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateGesture(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }
      const gestureId = parseInt(req.params.id, 10);
      if (isNaN(gestureId)) {
        throw AppError.badRequest('Invalid gesture ID');
      }
      const updates = req.body;
      const result = await gestureService.updateGesture(req.user.userId, gestureId, updates);
      if (!result) {
        throw AppError.notFound('Gesture not found');
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteGesture(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }
      const gestureId = parseInt(req.params.id, 10);
      if (isNaN(gestureId)) {
        throw AppError.badRequest('Invalid gesture ID');
      }
      const deleted = await gestureService.deleteGesture(req.user.userId, gestureId);
      if (!deleted) {
        throw AppError.notFound('Gesture not found');
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const gestureController = new GestureController();