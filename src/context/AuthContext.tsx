import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AuthSession, User } from '@/shared-types';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  isAdmin: boolean;
  requireToken: () => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await window.tracker.login(username, password);
    if ('error' in result) {
      return { error: result.error };
    }
    setSession(result);
    return {};
  }, []);

  const logout = useCallback(async () => {
    if (session?.token) {
      await window.tracker.logout(session.token);
    }
    setSession(null);
  }, [session]);

  const refreshSession = useCallback(async () => {
    if (!session?.token) return;
    const next = await window.tracker.getCurrentSession(session.token);
    if (next) setSession(next);
  }, [session]);

  const token = session?.token ?? null;

  const requireToken = useCallback((): string => {
    if (!session?.token) throw new Error('Not authenticated');
    return session.token;
  }, [session]);

  const value: AuthContextValue = {
    session,
    loading,
    user: session?.user ?? null,
    token,
    login,
    logout,
    refreshSession,
    isAdmin: session?.user?.role === 'admin',
    requireToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
