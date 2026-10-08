import { z } from 'zod';
import { validateGestureData, validateGesture, createSyncGestureRequest, serializeFrame, type Gesture, type GestureData } from '@mitten/contracts';
import { AppError } from '../middleware/errorHandler.js';

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Count Unicode code points, not UTF-16 code units.
const gestureName = z.string().refine(value => value.trim().length > 0 && [...value].length <= 60, 'Name must contain 1–60 Unicode code points');
const gestureData = z.custom<GestureData>(value => validateGestureData(value).valid, 'Invalid GestureFormat V1 data');
export const createGestureSchema = z.object({ name: gestureName, data: gestureData }).strict();
export const updateGestureSchema = z.object({ name: gestureName.optional(), data: gestureData.optional() }).strict()
  .refine(value => value.name !== undefined || value.data !== undefined, 'At least one editable field is required');

export function assertTransportableGesture(gesture: Gesture): void {
  const validation = validateGesture(gesture);
  if (!validation.valid) throw new AppError(validation.errors.join('; '), 400);
  const frame = serializeFrame(createSyncGestureRequest('r'.repeat(64), { syncId: 's'.repeat(64), index: 49, gesture: {
    id: gesture.id, name: gesture.name, audioTrack: gesture.audioTrack, data: gesture.data,
  } }));
  if (Buffer.byteLength(frame, 'utf8') - 1 > 8192) throw new AppError('Gesture exceeds the Protocol V2 message limit', 400);
}

// Params schemas
export const gestureIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Gesture ID must be a positive integer'),
});

// Query schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Types
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateGestureInput = z.infer<typeof createGestureSchema>;
export type UpdateGestureInput = z.infer<typeof updateGestureSchema>;
export type GestureIdParam = z.infer<typeof gestureIdParamSchema>;
export type PaginationQuery = z.infer<typeof paginationSchema>;