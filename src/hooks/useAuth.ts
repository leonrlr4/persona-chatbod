"use client";
import { create } from "zustand";
import { fetchJSON } from "@/utils/api";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  csrfToken: string | null;
  lastError: string | null;
  fetchCsrf: () => Promise<void>;
  login: (identifier: string, password: string, remember?: boolean) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  csrfToken: null,
  lastError: null,
  
  fetchCsrf: async () => {
    const res = await fetchJSON<{ ok: boolean; token: string }>("/api/auth/csrf");
    set({ csrfToken: res.token });
  },

  login: async (identifier: string, password: string, remember = false) => {
    try {
      if (!get().csrfToken) await get().fetchCsrf();
      const res = await fetchJSON<{ ok: boolean; user?: User; error?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password, remember }),
        headers: { "x-csrf-token": get().csrfToken || "" },
      });
      if (res.ok && res.user) {
        set({ user: res.user, isAuthenticated: true, lastError: null });
        return true;
      }
      set({ lastError: res.error || "登入失敗" });
      return false;
    } catch (error: any) {
      set({ lastError: String(error?.message || error) });
      return false;
    }
  },

  register: async (name: string, email: string, password: string) => {
    try {
      if (!get().csrfToken) await get().fetchCsrf();
      const res = await fetchJSON<{ ok: boolean; user?: User; error?: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
        headers: { "x-csrf-token": get().csrfToken || "" },
      });
      if (res.ok && res.user) {
        set({ user: res.user, isAuthenticated: true, lastError: null });
        return true;
      }
      set({ lastError: res.error || "註冊失敗" });
      return false;
    } catch (error: any) {
      set({ lastError: String(error?.message || error) });
      return false;
    }
  },

  logout: async () => {
    try {
      if (!get().csrfToken) await get().fetchCsrf();
      await fetchJSON<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        headers: { "x-csrf-token": get().csrfToken || "" },
      });
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  refreshMe: async () => {
    try {
      const res = await fetchJSON<{ ok: boolean; user?: User }>("/api/auth/me");
      if (res.ok && res.user) set({ user: res.user, isAuthenticated: true });
    } catch {}
  }
}));