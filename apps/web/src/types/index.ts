import {
  FirmwareState,
  CapturePhase,
  ProtocolErrorCode,
} from '@mitten/contracts';
import type {
  Gesture,
  GestureData,
  GestureMetadata,
  DeviceInfo,
  CaptureProgressData,
  CaptureCompletedData,
  CaptureFailedData,
  ActiveProfileInfo,
  ActiveSyncInfo,
  RecognitionDetectedData,
  HandshakeResponseResult,
  DeviceStatusResult,
  SyncBeginPayload,
  SyncBeginResult,
  SyncGesturePayload,
  SyncGestureResult,
  SyncCommitPayload,
  SyncCommitResult,
  ProtocolError,
  SyncFailedData,
} from '@mitten/contracts';

export {
  FirmwareState,
  CapturePhase,
  ProtocolErrorCode,
};
export type {
  Gesture,
  GestureData,
  GestureMetadata,
  DeviceInfo,
  CaptureProgressData,
  CaptureCompletedData,
  CaptureFailedData,
  ActiveProfileInfo,
  ActiveSyncInfo,
  RecognitionDetectedData,
  HandshakeResponseResult,
  DeviceStatusResult,
  SyncBeginPayload,
  SyncBeginResult,
  SyncGesturePayload,
  SyncGestureResult,
  SyncCommitPayload,
  SyncCommitResult,
  ProtocolError,
  SyncFailedData,
};

// Frontend-specific types
export interface User {
  id: number;
  email: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface GestureListResponse {
  gestures: Gesture[];
  total: number;
}

export interface CreateGestureRequest {
  name: string;
  data: GestureData;
}

export interface UpdateGestureRequest {
  name?: string;
  data?: GestureData;
}

export interface GestureResponse extends Gesture {
  createdAt: string;
  updatedAt: string;
}

// Device connection states (frontend local states)
export type ConnectionStatus = 'disconnected' | 'connecting' | 'handshake' | 'connected' | 'error';

export interface DeviceConnectionState {
  status: ConnectionStatus;
  deviceInfo: DeviceInfo | null;
  error: string | null;
  isHandshakeValid: boolean;
}

export interface CaptureState {
  isCapturing: boolean;
  phase: CapturePhase | null;
  progress: number;
  requestId: string | null;
  error: string | null;
  capturedData: GestureData | null;
}

export interface SyncState {
  isSyncing: boolean;
  syncId: string | null;
  profileId: string | null;
  profileRevision: string | null;
  totalGestures: number;
  sentGestures: number;
  currentIndex: number;
  error: string | null;
  isComplete: boolean;
}

export interface ApiError {
  message: string;
  status: number;
  fields?: Array<{ field: string; message: string }>;
}

export interface FormErrors {
  [key: string]: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}