/**
 * authStore — JWT lifecycle + current user.
 * Persisted to localStorage so refresh keeps the session alive.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { auth, ApiError, type UserResponse } from '@/services/api';

// Module-level singleton so concurrent 401 retries share one refresh call
// instead of racing to invalidate each other's tokens.
let _refreshPromise: Promise<boolean> | null = null;

interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Convenience flag — true while a login/register request is in flight. */
  loading: boolean;
  /** Last error message from login/register; cleared on next attempt. */
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-issue the access token using the refresh token (called by 401 retry). */
  refresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      loading: false,
      error: null,

      login: async (email, password) => {
        set({ loading: true, error: null });
        try {
          const pair = await auth.login(email, password);
          set({
            user: pair.user,
            accessToken: pair.access_token,
            refreshToken: pair.refresh_token,
            loading: false,
          });
        } catch (e) {
          set({
            loading: false,
            error: e instanceof ApiError ? e.message : 'Login failed',
          });
          throw e;
        }
      },

      register: async (email, password, displayName) => {
        set({ loading: true, error: null });
        try {
          const pair = await auth.register(email, password, displayName);
          set({
            user: pair.user,
            accessToken: pair.access_token,
            refreshToken: pair.refresh_token,
            loading: false,
          });
        } catch (e) {
          set({
            loading: false,
            error: e instanceof ApiError ? e.message : 'Registration failed',
          });
          throw e;
        }
      },

      logout: async () => {
        const rt = get().refreshToken;
        if (rt) {
          try { await auth.logout(rt); } catch { /* best-effort */ }
        }
        set({ user: null, accessToken: null, refreshToken: null, error: null });
      },

      refresh: async () => {
        // Return the in-flight promise if one exists — prevents concurrent
        // 401 retries (e.g. React StrictMode double-effect) from each trying
        // to exchange the same refresh token, which invalidates the second call.
        if (_refreshPromise) return _refreshPromise;
        const rt = get().refreshToken;
        if (!rt) return false;
        _refreshPromise = (async () => {
          try {
            const r = await auth.refresh(rt);
            set({ accessToken: r.access_token });
            return true;
          } catch {
            set({ user: null, accessToken: null, refreshToken: null });
            return false;
          } finally {
            _refreshPromise = null;
          }
        })();
        return _refreshPromise;
      },
    }),
    {
      name: 'cloudcut.auth',
      // Don't persist transient loading/error flags.
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    },
  ),
);

export const selectIsAuthenticated = (s: AuthState) => Boolean(s.accessToken && s.user);
