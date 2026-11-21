import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User, AuthState, LoginCredentials, RegisterData, AuthResponse } from '../types';
import { login as apiLogin, loginWithGoogle as apiLoginWithGoogle, register as apiRegister, getCurrentUser, ApiError } from '../services/api';

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const response: AuthResponse = await apiLogin(credentials);
      localStorage.setItem('auth_token', response.token);
      setState({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const response = await apiLoginWithGoogle(credential);
      localStorage.setItem('auth_token', response.token);
      setState({ user: response.user, token: response.token, isAuthenticated: true, isLoading: false });
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const response: AuthResponse = await apiRegister(data);
      localStorage.setItem('auth_token', response.token);
      setState({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setState(prev => prev.token
        ? { user: null, token: null, isAuthenticated: false, isLoading: false }
        : { ...prev, isLoading: false });
      return;
    }
    try {
      const user = await getCurrentUser();
      if (localStorage.getItem('auth_token') !== token) return;
      setState({ user, token, isAuthenticated: true, isLoading: false });
    } catch (error) {
      if (localStorage.getItem('auth_token') !== token) return;
      if (error instanceof ApiError && error.status === 401) {
        logout();
        return;
      }
      // During a transient outage, keep the bearer and any verified account data.
      // Protected API requests still require a valid token on the server.
      setState(prev => ({
        user: prev.token === token ? prev.user : null,
        token,
        isAuthenticated: true,
        isLoading: false,
      }));
    }
  }, [logout]);

  useEffect(() => {
    let inFlight = false;
    const revalidate = async () => {
      if (inFlight) return;
      inFlight = true;
      try { await refreshUser(); }
      finally { inFlight = false; }
    };
    void revalidate();
    const interval = window.setInterval(revalidate, 60_000);
    window.addEventListener('online', revalidate);
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'auth_token' || event.key === null) void refreshUser();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', revalidate);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshUser]);

  const clearError = useCallback(() => {
    // No error state in this simple implementation
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithGoogle, register, logout, refreshUser, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
