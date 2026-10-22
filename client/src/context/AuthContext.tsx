import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as client from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Restore the session on page load from the HttpOnly refresh cookie.
  useEffect(() => {
    client.setSessionLostHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    client.refreshSession().then((s) => {
      setUser(s?.user ?? null);
      setLoading(false);
    });
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await client.login(email, password));
  }, []);

  const signOut = useCallback(async () => {
    await client.logout();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
