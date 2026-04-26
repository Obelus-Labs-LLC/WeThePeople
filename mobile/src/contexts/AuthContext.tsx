import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, ApiError } from '../api/client';

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

  // Single-flight refresh promise so concurrent fetchMe / authedFetch
  // calls don't all kick off independent /auth/refresh requests with
  // the same refresh token (which the new backend revokes on use).
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const purgeTokens = useCallback(async () => {
    apiClient.setAuthToken(null);
    setUser(null);
    try {
      await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
    } catch (storageErr) {
      console.warn('[AuthContext] token purge failed:', storageErr);
    }
  }, []);

  const tryRefresh = useCallback(async (): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const run = (async () => {
      try {
        const stored = await AsyncStorage.getItem(REFRESH_KEY);
        if (!stored) return null;
        const data = await apiClient.refreshToken(stored);
        apiClient.setAuthToken(data.access_token);
        await AsyncStorage.multiSet([
          [ACCESS_KEY, data.access_token],
          [REFRESH_KEY, data.refresh_token],
        ]);
        return data.access_token;
      } catch (e) {
        console.warn('[AuthContext] refresh failed:', e);
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = run;
    return run;
  }, []);

  const fetchMe = useCallback(async () => {
    // Don't blindly purge tokens on every error — only on a confirmed 401
    // *after* a refresh attempt has also failed. Network blips, server
    // 5xx, and DNS hiccups used to log the user out silently on cold
    // start over flaky wifi.
    try {
      const data = await apiClient.getMe();
      setUser({
        id: data.id,
        email: data.email,
        role: data.role,
        display_name: data.display_name,
      });
      return;
    } catch (e) {
      const status = (e as ApiError | undefined)?.status;
      if (status !== 401) {
        // Network / server failure — keep the existing tokens and just
        // leave `user` as it was. Next request retries.
        console.warn('[AuthContext] getMe transient failure:', e);
        return;
      }
    }

    // 401 path: try to refresh the access token and replay /auth/me.
    const fresh = await tryRefresh();
    if (!fresh) {
      await purgeTokens();
      return;
    }
    try {
      const data = await apiClient.getMe();
      setUser({
        id: data.id,
        email: data.email,
        role: data.role,
        display_name: data.display_name,
      });
    } catch (e) {
      const status = (e as ApiError | undefined)?.status;
      if (status === 401) {
        await purgeTokens();
      } else {
        console.warn('[AuthContext] getMe replay transient failure:', e);
      }
    }
  }, [purgeTokens, tryRefresh]);

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
