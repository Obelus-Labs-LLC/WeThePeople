import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getApiBaseUrl } from '../api/client';

interface AuthUser {
  id: number;
  email: string;
  role: string;
  display_name?: string;
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
  logout: () => void;
  /**
   * Drop-in replacement for fetch() that auto-attaches the access token,
   * transparently refreshes once on a 401, and forces re-login if the
   * refresh fails. Components don't need to thread tokens manually and
   * a single transient 401 won't silently log the user out.
   */
  authedFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

const API = getApiBaseUrl();
const ACCESS_KEY = 'wtp_access_token';
const REFRESH_KEY = 'wtp_refresh_token';

/**
 * Fetch a fresh access+refresh token pair using the stored refresh token.
 * Returns the new access token on success, null on any failure (caller
 * should treat null as "log the user out").
 */
async function tryRefreshTokens(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const r = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.access_token || !data.refresh_token) return null;
    localStorage.setItem(ACCESS_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
    return data.access_token;
  } catch (err) {
    console.warn('[AuthContext] refresh failed:', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Track an in-flight refresh so concurrent 401s don't fire N refresh calls.
  const refreshInflight = useRef<Promise<string | null> | null>(null);

  const clearTokens = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
  }, []);

  // Coalesce concurrent refreshes into a single network call.
  const refreshOnce = useCallback(async (): Promise<string | null> => {
    if (refreshInflight.current) return refreshInflight.current;
    const promise = tryRefreshTokens().finally(() => {
      refreshInflight.current = null;
    });
    refreshInflight.current = promise;
    return promise;
  }, []);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token) { setLoading(false); return; }

    const callMe = async (bearer: string): Promise<Response> =>
      fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${bearer}` } });

    try {
      let r = await callMe(token);

      // Only attempt refresh on a confirmed 401. Network errors and 5xx
      // responses are transient and should NOT clear tokens — that was
      // the bug behind silent logouts after a single hiccup.
      if (r.status === 401) {
        const fresh = await refreshOnce();
        if (fresh) {
          r = await callMe(fresh);
        } else {
          clearTokens();
          setLoading(false);
          return;
        }
      }

      if (r.ok) {
        const data = await r.json();
        setUser({ id: data.id, email: data.email, role: data.role, display_name: data.display_name });
      } else if (r.status === 401) {
        // Refresh succeeded yet still 401 — token is genuinely revoked.
        clearTokens();
      } else {
        // 5xx or unexpected — keep tokens, surface to console.
        console.warn('[AuthContext] /auth/me unexpected status:', r.status);
      }
    } catch (err) {
      // Network failure during fetchMe: keep tokens. The next request
      // will retry; we don't want a flaky connection to log the user out.
      console.warn('[AuthContext] fetchMe network error:', err);
    }
    setLoading(false);
  }, [clearTokens, refreshOnce]);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const authedFetch = useCallback(async (input: RequestInfo, init: RequestInit = {}): Promise<Response> => {
    const buildInit = (bearer: string | null): RequestInit => {
      const headers = new Headers(init.headers || {});
      if (bearer && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${bearer}`);
      }
      return { ...init, headers };
    };

    let token = localStorage.getItem(ACCESS_KEY);
    let response = await fetch(input, buildInit(token));

    if (response.status === 401 && token) {
      // Try one refresh and replay the request before giving up.
      const fresh = await refreshOnce();
      if (fresh) {
        response = await fetch(input, buildInit(fresh));
      } else {
        clearTokens();
      }
    }
    return response;
  }, [clearTokens, refreshOnce]);

  const login = async (email: string, password: string) => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const d = await r.json().catch((err) => {
        console.warn('[AuthContext] login error body parse failed:', err);
        return { detail: 'Login failed' };
      });
      throw new Error(d.detail || 'Login failed');
    }
    const data = await r.json();
    localStorage.setItem(ACCESS_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
    await fetchMe();
  };

  const register = async (email: string, password: string, options: RegisterOptions = {}) => {
    const body: Record<string, unknown> = {
      email,
      password,
      display_name: options.displayName,
    };
    if (options.zipCode) body.zip_code = options.zipCode;
    if (options.digestOptIn !== undefined) body.digest_opt_in = options.digestOptIn;
    if (options.alertOptIn !== undefined) body.alert_opt_in = options.alertOptIn;

    const r = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch((err) => {
        console.warn('[AuthContext] register error body parse failed:', err);
        return { detail: 'Registration failed' };
      });
      throw new Error(d.detail || 'Registration failed');
    }
    await login(email, password);
  };

  const logout = () => {
    clearTokens();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        register,
        logout,
        authedFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
