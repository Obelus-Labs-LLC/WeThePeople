import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

const API = getApiBaseUrl();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('wtp_access_token');
    if (!token) { setLoading(false); return; }
    try {
      const r = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const data = await r.json();
        setUser({ id: data.id, email: data.email, role: data.role, display_name: data.display_name });
      } else {
        localStorage.removeItem('wtp_access_token');
        localStorage.removeItem('wtp_refresh_token');
      }
    } catch (err) {
      console.warn('[AuthContext] fetchMe failed:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

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
    localStorage.setItem('wtp_access_token', data.access_token);
    localStorage.setItem('wtp_refresh_token', data.refresh_token);
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
    localStorage.removeItem('wtp_access_token');
    localStorage.removeItem('wtp_refresh_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
