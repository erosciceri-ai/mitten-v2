import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User, AuthState, LoginCredentials, RegisterData, AuthResponse } from '../types';
import { login as apiLogin, register as apiRegister, getCurrentUser } from '../services/api';

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
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

  // Initialize auth from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const user = await getCurrentUser();
          setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Token invalid or expired
          localStorage.removeItem('auth_token');
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();
  }, []);

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
    if (!state.token) return;
    try {
      const user = await getCurrentUser();
      setState(prev => ({ ...prev, user }));
    } catch {
      logout();
    }
  }, [state.token, logout]);

  const clearError = useCallback(() => {
    // No error state in this simple implementation
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}