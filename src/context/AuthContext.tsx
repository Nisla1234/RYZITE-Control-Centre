import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, clearClientSessionToken, setClientSessionToken } from '../lib/api';
import type { AdminUser } from '../types/cms';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type: ToastMessage['type'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: AdminUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      clearClientSessionToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const onUnauthorized = () => {
      clearClientSessionToken();
      setUser(null);
      notify('error', 'Your session has expired. Please sign in again.');
    };
    window.addEventListener('ryzite:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ryzite:unauthorized', onUnauthorized);
  }, [refreshUser, notify]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiRequest<{ user: AdminUser; sessionToken?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.sessionToken) {
      setClientSessionToken(data.sessionToken);
    }
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network/401 errors on logout
    } finally {
      clearClientSessionToken();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, refreshUser, setUser, toasts, notify, dismissToast }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
