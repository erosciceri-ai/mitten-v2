export interface User {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  id: number;
  email: string;
  createdAt: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserPublic;
  token: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  version: string;
}

// ============================================================================
// Gesture format types
//
// The canonical `data` format (data.version = 1) is owned by @mitten/contracts,
// per docs/gesture-format.md. These are imported and re-exported instead of being
// redeclared, so the API cannot drift from the contract shared with the web app
// and the ESP32 simulator. Do not redefine them here.
// ============================================================================
import type {
  GestureData,
  GestureMetadata,
  GestureSample,
  GestureSummary,
  GestureUnits,
} from '@mitten/contracts';

export type {
  GestureData,
  GestureMetadata,
  GestureSample,
  GestureSummary,
  GestureUnits,
};

// API-specific gesture shapes: persisted timestamps and request/response envelopes.
export interface Gesture {
  id: number;
  name: string;
  audioTrack: number;
  data: GestureData;
  createdAt: string;
  updatedAt: string;
}

export interface GestureCreateRequest {
  name: string;
  data: GestureData;
}

export interface GestureUpdateRequest {
  name?: string;
  data?: GestureData;
}

export interface GestureResponse {
  id: number;
  name: string;
  audioTrack: number;
  data: GestureData;
  createdAt: string;
  updatedAt: string;
}

export interface GestureListResponse {
  gestures: GestureResponse[];
  total: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('VALIDATION_ERROR', message, 400, details);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(message: string = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message, 404);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, 409, details);
  }

  static internal(message: string = 'Internal server error', details?: Record<string, unknown>): AppError {
    return new AppError('INTERNAL_ERROR', message, 500, details);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('BAD_REQUEST', message, 400, details);
  }
}