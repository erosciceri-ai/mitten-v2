import { gestureRepository } from '../repositories/gestureRepository';
import { validateGestureData, validateGestureMetadata } from '@mitten/contracts';
import { 
  Gesture, 
  GestureData, 
  GestureCreateRequest, 
  GestureUpdateRequest, 
  GestureResponse, 
  GestureListResponse,
  AppError 
} from '../types';

const MAX_GESTURES_PER_USER = 50;

export class GestureService {
  async createGesture(userId: number, data: GestureCreateRequest): Promise<GestureResponse> {
    const { name, data: gestureData } = data;

    // Validate gesture name
    if (!name || typeof name !== 'string') {
      throw AppError.validation('Gesture name is required');
    }
    if (name.length < 1 || name.length > 60) {
      throw AppError.validation('Gesture name must be between 1 and 60 characters');
    }
    // Check for control characters
    if (/[\u0000-\u001F\u007F]/.test(name)) {
      throw AppError.validation('Gesture name must not contain control characters');
    }

    // Validate gesture data
    const dataValidation = validateGestureData(gestureData);
    if (!dataValidation.valid) {
      throw AppError.validation('Invalid gesture data', { fields: dataValidation.errors });
    }

    // Check user gesture limit
    const currentCount = gestureRepository.countByUserId(userId);
    if (currentCount >= 50) {
      throw AppError.conflict('Maximum 50 gestures per user reached');
    }

    // Create gesture
    const gesture = gestureRepository.create(userId, data.name, data.data);
    
    return gestureRepository.toResponse(gesture);
  }

  async getGestures(userId: number): Promise<GestureListResponse> {
    const gestures = gestureRepository.findAllByUserId(userId);
    return {
      gestures,
      total: gestures.length,
    };
  }

  async getGestureById(userId: number, gestureId: number): Promise<GestureResponse | null> {
    const gesture = gestureRepository.findByIdPublic(gestureId, userId);
    return gesture;
  }

  async updateGesture(userId: number, gestureId: number, updates: GestureUpdateRequest): Promise<GestureResponse | null> {
    const { name, data: gestureData } = updates;

    // Validate gesture name if provided
    if (name !== undefined) {
      if (!name || typeof name !== 'string') {
        throw AppError.validation('Gesture name is required');
      }
      if (name.length < 1 || name.length > 60) {
        throw AppError.validation('Gesture name must be between 1 and 60 characters');
      }
      if (/[\u0000-\u001F\u007F]/.test(name)) {
        throw AppError.validation('Gesture name must not contain control characters');
      }
    }

    // Validate gesture data if provided
    if (gestureData !== undefined) {
      const dataValidation = validateGestureData(gestureData);
      if (!dataValidation.valid) {
        throw AppError.validation('Invalid gesture data', { fields: dataValidation.errors });
      }
    }

    const gesture = gestureRepository.update(gestureId, userId, { name, data: gestureData });
    if (!gesture) {
      return null;
    }

    return gestureRepository.toResponse(gesture);
  }

  async deleteGesture(userId: number, gestureId: number): Promise<boolean> {
    return gestureRepository.delete(gestureId, userId);
  }
}

export const gestureService = new GestureService();