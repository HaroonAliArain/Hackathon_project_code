import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { clearToken, getCurrentUser, getToken, login as loginRequest } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const expireSession = () => setUser(null);
    window.addEventListener('emergencylink:session-expired', expireSession);
    if (!getToken()) {
      setLoading(false);
      return () => window.removeEventListener('emergencylink:session-expired', expireSession);
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
    return () => window.removeEventListener('emergencylink:session-expired', expireSession);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    setUser(result.user);
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
