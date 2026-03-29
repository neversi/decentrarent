import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from './types';
import { apiFetch } from '../../lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  verifyToken: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
      verifyToken: async () => {
        const { token } = get();
        if (!token) return false;
        try {
          // Assuming there's an endpoint to verify token, e.g., /auth/verify
          await apiFetch('/auth/verify', { method: 'GET' }, token);
          return true;
        } catch {
          // If verification fails, logout
          set({ token: null, user: null, isAuthenticated: false });
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          state.isAuthenticated = true;
        }
      },
    }
  )
);
