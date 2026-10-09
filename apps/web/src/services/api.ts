import type {
  User,
  AuthResponse,
  LoginCredentials,
  RegisterData,
  Gesture,
  GestureData,
  GestureListResponse,
  CreateGestureRequest,
  UpdateGestureRequest,
  GestureResponse,
  ApiError,
  AccountExport,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiErrorClass extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getAuthToken(): Promise<string | null> {
  return localStorage.getItem('auth_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  binary = false
): Promise<T> {
  const token = await getAuthToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (response.ok && binary) return await response.blob() as T;
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    const errorMessage = data.message || `HTTP error ${response.status}`;
    throw new ApiErrorClass(errorMessage, response.status, data.fields);
  }
  
  return data as T;
}

// Auth endpoints
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function register(data: RegisterData): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export async function linkGoogleAccount(credential: string): Promise<{ user: User }> {
  return request<{ user: User }>('/auth/google/link', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/auth/me');
}

export async function exportAccountData(): Promise<AccountExport> {
  return request<AccountExport>('/auth/export');
}

// Gesture endpoints
export async function getGestures(): Promise<GestureListResponse> {
  return request<GestureListResponse>('/gestures');
}

export async function getGestureById(id: number): Promise<GestureResponse> {
  return request<GestureResponse>(`/gestures/${id}`);
}

export async function createGesture(data: CreateGestureRequest): Promise<GestureResponse> {
  return request<GestureResponse>('/gestures', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGesture(id: number, data: UpdateGestureRequest): Promise<GestureResponse> {
  return request<GestureResponse>(`/gestures/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGesture(id: number): Promise<void> {
  await request<void>(`/gestures/${id}`, {
    method: 'DELETE',
  });
}

// Audio generation
export async function generateGestureAudio(id: number): Promise<{ trackNumber: number; filePath: string }> {
  return request<{ trackNumber: number; filePath: string }>(`/gestures/${id}/audio`, {
    method: 'POST',
  });
}

export async function getGestureAudioInfo(id: number): Promise<{ filePath: string | null; trackNumber: number; generatedAt: string | null }> {
  return request<{ filePath: string | null; trackNumber: number; generatedAt: string | null }>(`/gestures/${id}/audio`);
}

export async function getGestureAudioBlob(id: number): Promise<Blob> {
  return request<Blob>(`/gestures/${id}/audio/file`, {}, true);
}

// Health check
export async function healthCheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}

export { ApiErrorClass as ApiError };
