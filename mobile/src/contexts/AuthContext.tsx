import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

// Keep keys namespaced so they don't collide with the onboarding flag etc.
const ACCESS_KEY = '@wtp_access_token';
const REFRESH_KEY = '@wtp_refresh_token';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  display_name?: string | null;
}

interface RegisterOptions {
  displayName?: string;
  zipCode?: string;
  digestOptIn?: boolean;
  alertOptIn?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, options?: RegisterOptions) => Promise<void>;
  logout: () => Promise<void>;
  // Forces a re-read of the current user from the server. Useful after
  // preferences edits or role changes so consumers can refresh UI.
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const data = await apiClient.getMe();
      setUser({
        id: data.id,
        email: data.email,
        role: data.role,
        display_name: data.display_name,
      });
    } catch (e) {
      // Stale/revoked token — clear it so we stop sending Bearer on future calls.
      console.warn('[AuthContext] getMe failed:', e);
      apiClient.setAuthToken(null);
      setUser(null);
      try {
        await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
      } catch (storageErr) {
        console.warn('[AuthContext] token purge failed:', storageErr);
      }
    }
  }, []);

  // Restore token from storage on app start.
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem(ACCESS_KEY);
        if (token) {
          apiClient.setAuthToken(token);
          await fetchMe();
        }
      } catch (e) {
        console.warn('[AuthContext] session restore failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.login({ email: email.trim().toLowerCase(), password });
    apiClient.setAuthToken(data.access_token);
    try {
      await AsyncStorage.multiSet([
        [ACCESS_KEY, data.access_token],
        [REFRESH_KEY, data.refresh_token],
      ]);
    } catch (e) {
      console.warn('[AuthContext] token persist failed:', e);
    }
    await fetchMe();
  }, [fetchMe]);

  const register = useCallback(async (
    email: string, password: string, options: RegisterOptions = {},
  ) => {
    await apiClient.register({
      email: email.trim().toLowerCase(),
      password,
      display_name: options.displayName,
      zip_code: options.zipCode,
      digest_opt_in: options.digestOptIn,
      alert_opt_in: options.alertOptIn,
    });
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    apiClient.setAuthToken(null);
    setUser(null);
    try {
      await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
    } catch (e) {
      console.warn('[AuthContext] logout token clear failed:', e);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!apiClient.getAuthToken()) return;
    await fetchMe();
  }, [fetchMe]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
